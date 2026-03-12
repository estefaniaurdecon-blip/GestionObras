import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { toast } from '@/hooks/use-toast';
import type { ApiUser } from '@/integrations/api/client';
import {
  prepareOfflineTenantScope,
  isTenantResolutionError,
} from '@/offline-db/tenantScope';
import { workReportsRepo } from '@/offline-db/repositories/workReportsRepo';
import type { WorkReport } from '@/offline-db/types';
import { isSyncAuthRequiredError, syncNow } from '@/sync/syncService';
import { startupPerfEnd, startupPerfStart } from '@/utils/startupPerf';
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
  allWorkReportsLoaded: boolean;
  workReportsLength: number;
  workReportsLoading: boolean;
  syncing: boolean;
  setWorkReports: Dispatch<SetStateAction<WorkReport[]>>;
  setAllWorkReports: Dispatch<SetStateAction<WorkReport[]>>;
  setAllWorkReportsLoaded: Dispatch<SetStateAction<boolean>>;
  setAllWorkReportsLoading: Dispatch<SetStateAction<boolean>>;
  setWorkReportsLoading: Dispatch<SetStateAction<boolean>>;
  setSyncing: Dispatch<SetStateAction<boolean>>;
};

type UseWorkReportsLifecycleResult = {
  loadWorkReports: (options?: { full?: boolean }) => Promise<void>;
  ensureAllWorkReportsLoaded: () => Promise<void>;
  handleSyncNow: (options?: { silent?: boolean }) => Promise<void>;
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
  allWorkReportsLoaded,
  workReportsLength,
  workReportsLoading,
  syncing,
  setWorkReports,
  setAllWorkReports,
  setAllWorkReportsLoaded,
  setAllWorkReportsLoading,
  setWorkReportsLoading,
  setSyncing,
}: UseWorkReportsLifecycleParams): UseWorkReportsLifecycleResult => {
  const BOOTSTRAP_SYNC_DELAY_MS = 12000;
  const AUTO_CLONE_INITIAL_DELAY_MS = 12000;
  const INITIAL_WORK_REPORTS_LIMIT = 120;
  const INITIAL_UNSYNCED_WORK_REPORTS_LIMIT = 80;
  const bootstrapSyncAttemptedRef = useRef<Record<string, boolean>>({});

  const processScheduledAutoClones = useCallback(
    async (
      tenantId: string,
      options: { notify?: boolean } = {},
    ): Promise<{ created: number; linkedExisting: number }> => {
      startupPerfStart('hook:useWorkReportsLifecycle.processScheduledAutoClones');
      if (autoCloneProcessRunning) {
        startupPerfEnd(
          'hook:useWorkReportsLifecycle.processScheduledAutoClones',
          'skipped-running',
        );
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

        startupPerfEnd(
          'hook:useWorkReportsLifecycle.processScheduledAutoClones',
          `created=${created},linked=${linkedExisting}`,
        );
        return { created, linkedExisting };
      } finally {
        autoCloneProcessRunning = false;
        startupPerfEnd('hook:useWorkReportsLifecycle.processScheduledAutoClones', 'finalize');
      }
    },
    [],
  );

  const buildVisibleWorkReports = useCallback((orderedReports: WorkReport[]): WorkReport[] => {
    const recentReports = filterRecentWorkReportsByCreationDay(orderedReports, WORK_REPORT_VISIBLE_DAYS);
    const recentIds = new Set(recentReports.map((report) => report.id));
    const unsyncedOutsideRecent = orderedReports
      .filter((report) => !recentIds.has(report.id) && report.syncStatus !== 'synced')
      .sort((left, right) => right.createdAt - left.createdAt);
    return [...unsyncedOutsideRecent, ...recentReports];
  }, []);

  const sortReportsByRecency = useCallback((reports: WorkReport[]): WorkReport[] => {
    return [...reports].sort((left, right) => right.createdAt - left.createdAt);
  }, []);

  const mergeUniqueReports = useCallback((reports: WorkReport[]): WorkReport[] => {
    const byId = new Map<string, WorkReport>();
    reports.forEach((report) => {
      byId.set(report.id, report);
    });
    return sortReportsByRecency(Array.from(byId.values()));
  }, [sortReportsByRecency]);

  const loadWorkReports = useCallback(async (options: { full?: boolean } = {}) => {
    startupPerfStart('hook:useWorkReportsLifecycle.loadWorkReports');
    const shouldLoadFull = options.full ?? allWorkReportsLoaded;
    if (!user || !tenantResolved || !resolvedTenantId) {
      setWorkReports([]);
      setAllWorkReports([]);
      setAllWorkReportsLoaded(false);
      setAllWorkReportsLoading(false);
      startupPerfEnd('hook:useWorkReportsLifecycle.loadWorkReports', 'missing-context');
      return;
    }

    setWorkReportsLoading(true);
    if (shouldLoadFull) {
      setAllWorkReportsLoading(true);
    }
    try {
      startupPerfStart('hook:useWorkReportsLifecycle.prepareOfflineTenantScope');
      const preparedTenantId = await prepareOfflineTenantScope(user, { tenantId: resolvedTenantId });
      startupPerfEnd('hook:useWorkReportsLifecycle.prepareOfflineTenantScope');

      if (shouldLoadFull) {
        startupPerfStart('hook:useWorkReportsLifecycle.listWorkReports');
        const reports = await workReportsRepo.list({
          tenantId: preparedTenantId,
          limit: WORK_REPORT_HISTORY_LIMIT,
        });
        startupPerfEnd('hook:useWorkReportsLifecycle.listWorkReports', `count=${reports.length},mode=full`);
        const orderedReports = sortReportsByRecency(reports);
        setAllWorkReports(orderedReports);
        setWorkReports(buildVisibleWorkReports(orderedReports));
        setAllWorkReportsLoaded(true);
        return;
      }

      startupPerfStart('hook:useWorkReportsLifecycle.listWorkReports');
      const [recentReports, unsyncedReports] = await Promise.all([
        workReportsRepo.list({ tenantId: preparedTenantId, limit: INITIAL_WORK_REPORTS_LIMIT }),
        workReportsRepo.listUnsynced({
          tenantId: preparedTenantId,
          limit: INITIAL_UNSYNCED_WORK_REPORTS_LIMIT,
        }),
      ]);
      startupPerfEnd(
        'hook:useWorkReportsLifecycle.listWorkReports',
        `count=${recentReports.length + unsyncedReports.length},mode=partial`,
      );

      const mergedReports = mergeUniqueReports([...recentReports, ...unsyncedReports]);
      setAllWorkReports(mergedReports);
      setWorkReports(buildVisibleWorkReports(mergedReports));
      setAllWorkReportsLoaded(false);
    } catch (error) {
      if (isTenantResolutionError(error)) {
        setWorkReports([]);
        setAllWorkReports([]);
        setAllWorkReportsLoaded(false);
        return;
      }
      console.error('[WorkReports] Error loading local work reports:', error);
      toast({
        title: 'Error cargando partes',
        description: 'No se pudieron cargar los partes locales (offline).',
        variant: 'destructive',
      });
    } finally {
      setAllWorkReportsLoading(false);
      setWorkReportsLoading(false);
      startupPerfEnd('hook:useWorkReportsLifecycle.loadWorkReports');
    }
  }, [
    INITIAL_UNSYNCED_WORK_REPORTS_LIMIT,
    INITIAL_WORK_REPORTS_LIMIT,
    allWorkReportsLoaded,
    resolvedTenantId,
    setAllWorkReports,
    setAllWorkReportsLoaded,
    setAllWorkReportsLoading,
    setWorkReports,
    setWorkReportsLoading,
    tenantResolved,
    user,
    buildVisibleWorkReports,
    mergeUniqueReports,
    sortReportsByRecency,
  ]);

  const ensureAllWorkReportsLoaded = useCallback(async () => {
    if (allWorkReportsLoaded || !user || !tenantResolved || !resolvedTenantId) {
      return;
    }
    await loadWorkReports({ full: true });
  }, [allWorkReportsLoaded, loadWorkReports, resolvedTenantId, tenantResolved, user]);

  const handleSyncNow = useCallback(async (options: { silent?: boolean } = {}) => {
    startupPerfStart('hook:useWorkReportsLifecycle.handleSyncNow');
    const silent = options.silent === true;
    if (tenantUnavailable) {
      if (silent) {
        startupPerfEnd('hook:useWorkReportsLifecycle.handleSyncNow', 'tenant-unavailable-silent');
        return;
      }
      toast({
        title: 'Sincronización bloqueada',
        description: tenantErrorMessage,
        variant: 'destructive',
      });
      startupPerfEnd('hook:useWorkReportsLifecycle.handleSyncNow', 'tenant-unavailable');
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
      if (isSyncAuthRequiredError(error)) {
        if (silent) return;
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (isOffline) {
          toast({
            title: 'Conexion requerida para sincronizar',
            description: 'Debes estar online para sincronizar.',
            variant: 'destructive',
          });
          return;
        }
        const description =
          error.reason === 'no_token'
            ? 'No hay sesion activa. Inicia sesion online con MFA antes de sincronizar.'
            : 'Necesitas volver a iniciar sesion (con MFA) para enviar los datos al servidor.';
        toast({
          title: 'Sesion requerida para sincronizar',
          description,
          variant: 'destructive',
        });
        return;
      }

      if (isTenantResolutionError(error)) {
        if (silent) return;
        toast({
          title: 'Sincronización bloqueada',
          description: tenantErrorMessage,
          variant: 'destructive',
        });
        return;
      }

      console.error('[Sync] Error running sync:', error);
      if (silent) return;
      toast({
        title: 'Error sincronizando',
        description: 'No se pudo enviar los partes pendientes.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
      startupPerfEnd('hook:useWorkReportsLifecycle.handleSyncNow');
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

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const runBootstrapSync = () => {
      if (cancelled) return;
      if (bootstrapSyncAttemptedRef.current[resolvedTenantId]) return;
      bootstrapSyncAttemptedRef.current[resolvedTenantId] = true;
      void handleSyncNow({ silent: true });
    };

    timeoutId = globalThis.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(runBootstrapSync, { timeout: 2000 });
        return;
      }

      runBootstrapSync();
    }, BOOTSTRAP_SYNC_DELAY_MS);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [
    BOOTSTRAP_SYNC_DELAY_MS,
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
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const runAutoCloneTick = async () => {
      if (cancelled) return;
      try {
        const preparedTenantId = await prepareOfflineTenantScope(user, { tenantId: resolvedTenantId });
        const result = await processScheduledAutoClones(preparedTenantId, { notify: true });
        if (!cancelled && result.created > 0) {
          await loadWorkReports({ full: allWorkReportsLoaded });
        }
      } catch (error) {
        if (isTenantResolutionError(error)) return;
        console.error('[AutoClone] Error processing scheduled clones:', error);
      }
    };

    const intervalId = window.setInterval(() => {
      void runAutoCloneTick();
    }, AUTO_CLONE_CHECK_INTERVAL_MS);

    timeoutId = globalThis.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => {
          void runAutoCloneTick();
        }, { timeout: 2000 });
        return;
      }

      void runAutoCloneTick();
    }, AUTO_CLONE_INITIAL_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [
    AUTO_CLONE_INITIAL_DELAY_MS,
    allWorkReportsLoaded,
    loadWorkReports,
    processScheduledAutoClones,
    resolvedTenantId,
    tenantResolved,
    user,
  ]);

  return {
    loadWorkReports,
    ensureAllWorkReportsLoaded,
    handleSyncNow,
    processScheduledAutoClones,
  };
};


