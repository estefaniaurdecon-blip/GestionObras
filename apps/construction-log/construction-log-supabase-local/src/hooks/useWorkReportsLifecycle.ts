import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { toast } from '@/hooks/use-toast';
import type { ApiUser } from '@/integrations/api/client';
import {
  prepareOfflineTenantScope,
  isTenantResolutionError,
} from '@/offline-db/tenantScope';
import { workReportsRepo } from '@/offline-db/repositories/workReportsRepo';
import type { WorkReport } from '@/offline-db/types';
import { syncNow } from '@/sync/syncService';
import {
  AUTO_CLONE_CHECK_INTERVAL_MS,
  WORK_REPORT_HISTORY_LIMIT,
  WORK_REPORT_VISIBLE_DAYS,
  asRecord,
  filterRecentWorkReportsByCreationDay,
  generateUniqueReportIdentifier,
  getCloneDueTimestamp,
  getNextBusinessDate,
  getWorkReportIdentity,
  payloadBoolean,
  payloadText,
  sameWorkIdentity,
} from '@/pages/indexHelpers';

let autoCloneProcessRunning = false;

type UseWorkReportsLifecycleParams = {
  user: ApiUser | null;
  resolvedTenantId: string | null;
  tenantResolved: boolean;
  tenantUnavailable: boolean;
  tenantErrorMessage: string;
  workReportsLength: number;
  workReportsLoading: boolean;
  syncing: boolean;
  setWorkReports: Dispatch<SetStateAction<WorkReport[]>>;
  setAllWorkReports: Dispatch<SetStateAction<WorkReport[]>>;
  setWorkReportsLoading: Dispatch<SetStateAction<boolean>>;
  setSyncing: Dispatch<SetStateAction<boolean>>;
};

type UseWorkReportsLifecycleResult = {
  loadWorkReports: () => Promise<void>;
  handleSyncNow: () => Promise<void>;
  processScheduledAutoClones: (
    tenantId: string,
    options?: { notify?: boolean },
  ) => Promise<{ created: number; linkedExisting: number }>;
};

export const useWorkReportsLifecycle = ({
  user,
  resolvedTenantId,
  tenantResolved,
  tenantUnavailable,
  tenantErrorMessage,
  workReportsLength,
  workReportsLoading,
  syncing,
  setWorkReports,
  setAllWorkReports,
  setWorkReportsLoading,
  setSyncing,
}: UseWorkReportsLifecycleParams): UseWorkReportsLifecycleResult => {
  const bootstrapSyncAttemptedRef = useRef<Record<string, boolean>>({});

  const processScheduledAutoClones = useCallback(
    async (
      tenantId: string,
      options: { notify?: boolean } = {},
    ): Promise<{ created: number; linkedExisting: number }> => {
      if (autoCloneProcessRunning) {
        return { created: 0, linkedExisting: 0 };
      }

      autoCloneProcessRunning = true;
      try {
        await workReportsRepo.init();
        const reports = await workReportsRepo.list({ tenantId, limit: 500 });
        if (reports.length === 0) {
          return { created: 0, linkedExisting: 0 };
        }

        const now = Date.now();
        const nowIso = new Date(now).toISOString();
        const reportsInMemory = [...reports];
        const existingIdentifiers = new Set<string>();
        const existingCloneKeys = new Set<string>();

        for (const report of reportsInMemory) {
          const payload = asRecord(report.payload);
          const identifier = payloadText(payload, 'reportIdentifier');
          if (identifier) {
            existingIdentifiers.add(identifier);
          }

          const sourceReportId = payloadText(payload, 'autoClonedFromReportId');
          if (sourceReportId) {
            existingCloneKeys.add(`${sourceReportId}::${report.date}`);
          }
        }

        let created = 0;
        let linkedExisting = 0;

        for (const sourceReport of reports) {
          const sourcePayload = asRecord(sourceReport.payload);
          if ((payloadBoolean(sourcePayload, 'autoCloneNextDay') ?? false) !== true) {
            continue;
          }

          const sourceDate = payloadText(sourcePayload, 'date') ?? sourceReport.date;
          const targetDate = getNextBusinessDate(sourceDate);
          if (!targetDate) continue;

          const dueTimestamp = getCloneDueTimestamp(targetDate);
          if (!dueTimestamp || now < dueTimestamp) continue;

          const sourceCloneKey = `${sourceReport.id}::${targetDate}`;
          if (existingCloneKeys.has(sourceCloneKey)) {
            const completedForDate = payloadText(sourcePayload, 'autoCloneCompletedForDate');
            if (completedForDate !== targetDate) {
              await workReportsRepo.update(sourceReport.id, {
                payload: {
                  ...(sourcePayload ?? {}),
                  autoCloneCompletedForDate: targetDate,
                  autoCloneCompletedAt: nowIso,
                },
              });
              linkedExisting += 1;
            }
            continue;
          }

          const sourceIdentity = getWorkReportIdentity(sourceReport);
          const reportWithSameDateAndWork = reportsInMemory.find((candidate) => {
            if (candidate.id === sourceReport.id || candidate.date !== targetDate) return false;
            return sameWorkIdentity(sourceIdentity, getWorkReportIdentity(candidate));
          });

          if (reportWithSameDateAndWork) {
            existingCloneKeys.add(sourceCloneKey);
            await workReportsRepo.update(sourceReport.id, {
              payload: {
                ...(sourcePayload ?? {}),
                autoCloneCompletedForDate: targetDate,
                autoCloneCompletedAt: nowIso,
                autoCloneCreatedReportId: reportWithSameDateAndWork.id,
              },
            });
            linkedExisting += 1;
            continue;
          }

          const cloneIdentifier = generateUniqueReportIdentifier(targetDate, existingIdentifiers);
          existingIdentifiers.add(cloneIdentifier);

          const clonedPayload = {
            ...(sourcePayload ?? {}),
            reportIdentifier: cloneIdentifier,
            date: targetDate,
            isClosed: false,
            autoCloneNextDay: false,
            autoClonedFromReportId: sourceReport.id,
            autoClonedFromIdentifier:
              payloadText(sourcePayload, 'reportIdentifier') ?? sourceReport.id.slice(0, 8),
            autoClonedAt: nowIso,
            autoCloneCompletedForDate: undefined,
            autoCloneCompletedAt: undefined,
            autoCloneCreatedReportId: undefined,
            lastModifiedAt: nowIso,
          };

          const createdClone = await workReportsRepo.create({
            tenantId,
            projectId: sourceReport.projectId,
            title: payloadText(sourcePayload, 'workName') ?? sourceReport.title ?? `Parte ${targetDate}`,
            date: targetDate,
            status: 'draft',
            payload: clonedPayload,
          });

          await workReportsRepo.update(sourceReport.id, {
            payload: {
              ...(sourcePayload ?? {}),
              autoCloneCompletedForDate: targetDate,
              autoCloneCompletedAt: nowIso,
              autoCloneCreatedReportId: createdClone.id,
            },
          });

          reportsInMemory.push(createdClone);
          existingCloneKeys.add(sourceCloneKey);
          created += 1;
        }

        if (options.notify && created > 0) {
          toast({
            title: 'Clonación automática completada',
            description:
              created === 1
                ? 'Se creó 1 parte nuevo para el siguiente día laborable.'
                : `Se crearon ${created} partes nuevos para el siguiente día laborable.`,
          });
        }

        return { created, linkedExisting };
      } finally {
        autoCloneProcessRunning = false;
      }
    },
    [],
  );

  const loadWorkReports = useCallback(async () => {
    if (!user || !tenantResolved || !resolvedTenantId) {
      setWorkReports([]);
      setAllWorkReports([]);
      return;
    }

    setWorkReportsLoading(true);
    try {
      const preparedTenantId = await prepareOfflineTenantScope(user, { tenantId: resolvedTenantId });
      await workReportsRepo.init();
      await processScheduledAutoClones(preparedTenantId);
      const reports = await workReportsRepo.list({ tenantId: preparedTenantId, limit: WORK_REPORT_HISTORY_LIMIT });
      const orderedReports = [...reports].sort((left, right) => right.createdAt - left.createdAt);
      setAllWorkReports(orderedReports);
      setWorkReports(filterRecentWorkReportsByCreationDay(orderedReports, WORK_REPORT_VISIBLE_DAYS));
    } catch (error) {
      if (isTenantResolutionError(error)) {
        setWorkReports([]);
        setAllWorkReports([]);
        return;
      }
      console.error('[WorkReports] Error loading local work reports:', error);
      toast({
        title: 'Error cargando partes',
        description: 'No se pudieron cargar los partes locales (offline).',
        variant: 'destructive',
      });
    } finally {
      setWorkReportsLoading(false);
    }
  }, [
    processScheduledAutoClones,
    resolvedTenantId,
    setAllWorkReports,
    setWorkReports,
    setWorkReportsLoading,
    tenantResolved,
    user,
  ]);

  const handleSyncNow = useCallback(async () => {
    if (tenantUnavailable) {
      toast({
        title: 'Sincronización bloqueada',
        description: tenantErrorMessage,
        variant: 'destructive',
      });
      return;
    }

    try {
      setSyncing(true);
      await prepareOfflineTenantScope(user, { tenantId: resolvedTenantId });
      const result = await syncNow({ tenantId: resolvedTenantId });
      await loadWorkReports();

      if (result.synced > 0) {
        toast({
          title: result.failed > 0 ? 'Sincronización parcial' : 'Sincronización completada',
          description: `Sincronizados: ${result.synced}. Pendientes: ${result.pendingAfter}.`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Sin cambios sincronizados',
          description:
            result.failed > 0
              ? `${result.note} Pendientes: ${result.pendingAfter}.`
              : result.note,
          variant: result.failed > 0 ? 'destructive' : 'default',
        });
      }
    } catch (error) {
      if (isTenantResolutionError(error)) {
        toast({
          title: 'Sincronización bloqueada',
          description: tenantErrorMessage,
          variant: 'destructive',
        });
        return;
      }

      console.error('[Sync] Error running sync:', error);
      toast({
        title: 'Error sincronizando',
        description: 'No se pudo enviar los partes pendientes.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  }, [
    loadWorkReports,
    resolvedTenantId,
    setSyncing,
    tenantErrorMessage,
    tenantUnavailable,
    user,
  ]);

  useEffect(() => {
    void loadWorkReports();
  }, [loadWorkReports]);

  useEffect(() => {
    if (!tenantResolved || !resolvedTenantId) return;
    if (tenantUnavailable || workReportsLoading || syncing) return;
    if (workReportsLength > 0) return;
    if (bootstrapSyncAttemptedRef.current[resolvedTenantId]) return;

    bootstrapSyncAttemptedRef.current[resolvedTenantId] = true;
    void handleSyncNow();
  }, [
    handleSyncNow,
    resolvedTenantId,
    syncing,
    tenantResolved,
    tenantUnavailable,
    workReportsLength,
    workReportsLoading,
  ]);

  useEffect(() => {
    if (!user || !tenantResolved || !resolvedTenantId) return;

    let cancelled = false;

    const runAutoCloneTick = async () => {
      if (cancelled) return;
      try {
        const preparedTenantId = await prepareOfflineTenantScope(user, { tenantId: resolvedTenantId });
        const result = await processScheduledAutoClones(preparedTenantId, { notify: true });
        if (!cancelled && result.created > 0) {
          const refreshedReports = await workReportsRepo.list({
            tenantId: preparedTenantId,
            limit: WORK_REPORT_HISTORY_LIMIT,
          });
          const orderedReports = [...refreshedReports].sort((left, right) => right.createdAt - left.createdAt);
          setAllWorkReports(orderedReports);
          setWorkReports(filterRecentWorkReportsByCreationDay(orderedReports, WORK_REPORT_VISIBLE_DAYS));
        }
      } catch (error) {
        if (isTenantResolutionError(error)) return;
        console.error('[AutoClone] Error processing scheduled clones:', error);
      }
    };

    const intervalId = window.setInterval(() => {
      void runAutoCloneTick();
    }, AUTO_CLONE_CHECK_INTERVAL_MS);

    void runAutoCloneTick();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [processScheduledAutoClones, resolvedTenantId, setAllWorkReports, setWorkReports, tenantResolved, user]);

  return {
    loadWorkReports,
    handleSyncNow,
    processScheduledAutoClones,
  };
};
