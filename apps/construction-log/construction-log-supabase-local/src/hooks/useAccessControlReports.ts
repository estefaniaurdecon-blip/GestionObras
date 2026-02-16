import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessEntry, AccessReport } from '@/types/accessControl';
import { toast } from '@/hooks/use-toast';
import { storage } from '@/utils/storage';
import {
  ApiAccessControlReport,
  createAccessControlReport,
  deleteAccessControlReport as deleteAccessControlReportApi,
  listAccessControlReports,
  updateAccessControlReport,
} from '@/integrations/api/client';

type SyncStatus = 'synced' | 'pending' | 'error';

type StoredAccessReport = AccessReport & {
  serverId?: number | null;
  syncStatus?: SyncStatus;
  lastSyncError?: string | null;
};

interface UseAccessControlReportsOptions {
  tenantId?: string | null;
}

const STORAGE_KEY_PREFIX = 'access_control_reports_local::v1::';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toOptionalString(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized : undefined;
}

function toIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toAccessEntries(value: unknown, fallbackType: AccessEntry['type']): AccessEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((rawEntry) => {
    const record = asRecord(rawEntry) ?? {};
    const sourceRaw = toStringValue(record.source);
    const source = sourceRaw === 'subcontract' || sourceRaw === 'rental' ? sourceRaw : undefined;
    const typeRaw = toStringValue(record.type);
    const type: AccessEntry['type'] = typeRaw === 'machinery' ? 'machinery' : fallbackType;

    return {
      id: toStringValue(record.id, crypto.randomUUID()),
      type,
      name: toStringValue(record.name),
      identifier: toStringValue(record.identifier),
      company: toStringValue(record.company),
      entryTime: toStringValue(record.entryTime, '08:00'),
      exitTime: toOptionalString(record.exitTime),
      activity: toStringValue(record.activity),
      operator: toOptionalString(record.operator),
      signature: toOptionalString(record.signature),
      source,
    };
  });
}

function normalizeStoredReport(raw: unknown): StoredAccessReport | null {
  const record = asRecord(raw);
  if (!record) return null;

  const id = toStringValue(record.id);
  if (!id) return null;

  const nowIso = new Date().toISOString();
  const syncStatusRaw = toStringValue(record.syncStatus, 'pending');
  const syncStatus: SyncStatus =
    syncStatusRaw === 'synced' || syncStatusRaw === 'error' ? syncStatusRaw : 'pending';

  return {
    id,
    date: toStringValue(record.date, toIsoDate(new Date())),
    siteName: toStringValue(record.siteName),
    workId: toOptionalString(record.workId),
    responsible: toStringValue(record.responsible),
    responsibleEntryTime: toOptionalString(record.responsibleEntryTime),
    responsibleExitTime: toOptionalString(record.responsibleExitTime),
    observations: toStringValue(record.observations),
    personalEntries: toAccessEntries(record.personalEntries, 'personal'),
    machineryEntries: toAccessEntries(record.machineryEntries, 'machinery'),
    additionalTasks: toOptionalString(record.additionalTasks),
    createdAt: toStringValue(record.createdAt, nowIso),
    updatedAt: toStringValue(record.updatedAt, nowIso),
    serverId: typeof record.serverId === 'number' ? record.serverId : null,
    syncStatus,
    lastSyncError: toOptionalString(record.lastSyncError) ?? null,
  };
}

function toApiStoredReport(report: ApiAccessControlReport): StoredAccessReport {
  const localId = (report.external_id || '').trim() || `server-${report.id}`;
  return {
    id: localId,
    date: report.date,
    siteName: report.site_name,
    workId: report.project_id != null ? String(report.project_id) : undefined,
    responsible: report.responsible || '',
    responsibleEntryTime: report.responsible_entry_time || undefined,
    responsibleExitTime: report.responsible_exit_time || undefined,
    observations: report.observations || '',
    personalEntries: toAccessEntries(report.personal_entries, 'personal'),
    machineryEntries: toAccessEntries(report.machinery_entries, 'machinery'),
    additionalTasks: report.additional_tasks || undefined,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    serverId: report.id,
    syncStatus: 'synced',
    lastSyncError: null,
  };
}

function toLocalKey(tenantId?: string | null): string {
  const normalized = (tenantId || '').trim() || 'default';
  return `${STORAGE_KEY_PREFIX}${normalized}`;
}

function sortStoredReports(reports: StoredAccessReport[]): StoredAccessReport[] {
  return [...reports].sort((left, right) => {
    if (left.date !== right.date) return right.date.localeCompare(left.date);
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function toAccessReport(report: StoredAccessReport): AccessReport {
  return {
    id: report.id,
    date: report.date,
    siteName: report.siteName,
    workId: report.workId,
    responsible: report.responsible,
    responsibleEntryTime: report.responsibleEntryTime,
    responsibleExitTime: report.responsibleExitTime,
    observations: report.observations,
    personalEntries: report.personalEntries,
    machineryEntries: report.machineryEntries,
    additionalTasks: report.additionalTasks,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

function resolveProjectId(workId?: string): number | null {
  if (!workId) return null;
  if (!/^\d+$/.test(workId.trim())) return null;
  const parsed = Number(workId);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export const useAccessControlReports = ({ tenantId }: UseAccessControlReportsOptions = {}) => {
  const [storedReports, setStoredReports] = useState<StoredAccessReport[]>([]);
  const [loading, setLoading] = useState(false);
  const storedReportsRef = useRef<StoredAccessReport[]>([]);
  const storageKey = useMemo(() => toLocalKey(tenantId), [tenantId]);

  useEffect(() => {
    storedReportsRef.current = storedReports;
  }, [storedReports]);

  const saveLocalReports = useCallback(
    async (nextReports: StoredAccessReport[]) => {
      const sorted = sortStoredReports(nextReports);
      storedReportsRef.current = sorted;
      setStoredReports(sorted);
      await storage.setItem(storageKey, JSON.stringify(sorted));
    },
    [storageKey]
  );

  const pushToApi = useCallback(
    async (report: StoredAccessReport): Promise<StoredAccessReport> => {
      if (!tenantId) return report;

      const projectId = resolveProjectId(report.workId);
      const createPayload = {
        date: report.date,
        site_name: report.siteName,
        responsible: report.responsible,
        project_id: projectId,
        external_id: report.id,
        responsible_entry_time: report.responsibleEntryTime || null,
        responsible_exit_time: report.responsibleExitTime || null,
        observations: report.observations || '',
        personal_entries: report.personalEntries as unknown as Record<string, unknown>[],
        machinery_entries: report.machineryEntries as unknown as Record<string, unknown>[],
        additional_tasks: report.additionalTasks || null,
      };

      try {
        const response = report.serverId
          ? await updateAccessControlReport(report.serverId, createPayload, tenantId)
          : await createAccessControlReport(createPayload, tenantId);
        const synced = toApiStoredReport(response);
        if (synced.id !== report.id) {
          synced.id = report.id;
        }
        return {
          ...synced,
          syncStatus: 'synced',
          lastSyncError: null,
        };
      } catch (error: any) {
        const message = error?.message || 'No se pudo sincronizar con API.';
        return {
          ...report,
          syncStatus: 'error',
          lastSyncError: String(message),
        };
      }
    },
    [tenantId]
  );

  const mergeRemoteWithLocal = useCallback((local: StoredAccessReport[], remote: StoredAccessReport[]) => {
    const merged = new Map<string, StoredAccessReport>();
    remote.forEach((report) => merged.set(report.id, report));

    local.forEach((localReport) => {
      const currentRemote = merged.get(localReport.id);
      const keepLocal =
        localReport.syncStatus === 'pending' ||
        localReport.syncStatus === 'error' ||
        !currentRemote;
      if (keepLocal) {
        merged.set(localReport.id, localReport);
      }
    });

    return sortStoredReports(Array.from(merged.values()));
  }, []);

  const syncPendingReports = useCallback(async () => {
    if (!tenantId) return;

    const current = storedReportsRef.current;
    const hasPending = current.some((report) => report.syncStatus !== 'synced');
    if (!hasPending) return;

    const updatedReports: StoredAccessReport[] = [];
    for (const report of current) {
      if (report.syncStatus === 'synced') {
        updatedReports.push(report);
        continue;
      }
      const synced = await pushToApi(report);
      updatedReports.push(synced);
    }

    await saveLocalReports(updatedReports);
  }, [pushToApi, saveLocalReports, tenantId]);

  const reloadReports = useCallback(async () => {
    setLoading(true);
    try {
      const rawLocal = await storage.getItem(storageKey);
      const parsedLocal = rawLocal ? JSON.parse(rawLocal) : [];
      const localReports = Array.isArray(parsedLocal)
        ? parsedLocal.map(normalizeStoredReport).filter((item): item is StoredAccessReport => Boolean(item))
        : [];

      if (!tenantId) {
        await saveLocalReports(localReports);
        return;
      }

      let mergedReports = localReports;
      try {
        const remote = await listAccessControlReports({
          tenantId,
          limit: 500,
          includeDeleted: false,
        });
        const remoteReports = remote.map(toApiStoredReport);
        mergedReports = mergeRemoteWithLocal(localReports, remoteReports);
      } catch (error) {
        console.warn('[AccessControl] No se pudieron cargar controles remotos, usando cache local.', error);
      }

      await saveLocalReports(mergedReports);
      await syncPendingReports();
    } catch (error) {
      console.error('[AccessControl] Error al recargar controles:', error);
      toast({
        title: 'Error de carga',
        description: 'No se pudieron cargar los controles de acceso locales.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [mergeRemoteWithLocal, saveLocalReports, storageKey, syncPendingReports, tenantId]);

  const saveReport = useCallback(
    async (report: AccessReport) => {
      const existing = storedReportsRef.current.find((item) => item.id === report.id);
      const nowIso = new Date().toISOString();
      const pendingReport: StoredAccessReport = {
        ...report,
        createdAt: existing?.createdAt || report.createdAt || nowIso,
        updatedAt: nowIso,
        serverId: existing?.serverId ?? null,
        syncStatus: 'pending',
        lastSyncError: null,
      };

      const nextLocal = sortStoredReports([
        pendingReport,
        ...storedReportsRef.current.filter((item) => item.id !== pendingReport.id),
      ]);
      await saveLocalReports(nextLocal);

      if (!tenantId) {
        return;
      }

      const synced = await pushToApi(pendingReport);
      const syncedList = sortStoredReports([
        synced,
        ...storedReportsRef.current.filter((item) => item.id !== synced.id),
      ]);
      await saveLocalReports(syncedList);

      if (synced.syncStatus === 'error') {
        toast({
          title: 'Guardado local completado',
          description: 'Se guardó en local, pero queda pendiente de sincronizar con API.',
          variant: 'default',
        });
      }
    },
    [pushToApi, saveLocalReports, tenantId]
  );

  const deleteReport = useCallback(
    async (reportId: string) => {
      const report = storedReportsRef.current.find((item) => item.id === reportId);
      if (!report) return;

      if (report.serverId && tenantId) {
        try {
          await deleteAccessControlReportApi(report.serverId, tenantId);
        } catch (error: any) {
          toast({
            title: 'No se pudo eliminar',
            description: error?.message || 'No se pudo eliminar en API.',
            variant: 'destructive',
          });
          return;
        }
      }

      const next = storedReportsRef.current.filter((item) => item.id !== reportId);
      await saveLocalReports(next);
    },
    [saveLocalReports, tenantId]
  );

  const bulkDeleteReports = useCallback(
    async (reportIds: string[]) => {
      for (const reportId of reportIds) {
        await deleteReport(reportId);
      }
    },
    [deleteReport]
  );

  useEffect(() => {
    void reloadReports();
  }, [reloadReports]);

  const reports = useMemo(
    () => storedReports.map(toAccessReport),
    [storedReports]
  );

  return {
    reports,
    loading,
    saveReport,
    deleteReport,
    bulkDeleteReports,
    reloadReports,
    syncPendingReports,
  };
};
