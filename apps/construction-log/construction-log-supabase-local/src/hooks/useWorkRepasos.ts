import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useOrganization } from '@/hooks/useOrganization';
import { storage } from '@/utils/storage';
import {
  createWorkRepaso as createWorkRepasoApi,
  deleteWorkRepaso as deleteWorkRepasoApi,
  listWorkRepasos,
  type ApiWorkRepaso,
  updateWorkRepaso as updateWorkRepasoApi,
} from '@/integrations/api/client';

type SyncStatus = 'synced' | 'pending' | 'error' | 'pending_delete';

export interface RepasoWorker {
  name: string;
  hours: number;
}

export interface RepasoMachinery {
  type: string;
  hours: number;
}

export interface RepasoSubcontractGroup {
  company: string;
  workers: RepasoWorker[];
  machinery: RepasoMachinery[];
}

export interface WorkRepaso {
  id: string;
  work_id: string;
  organization_id: string;
  code: string;
  status: 'pending' | 'in_progress' | 'completed';
  description: string;
  assigned_company: string | null;
  estimated_hours: number;
  actual_hours: number;
  before_image: string | null;
  after_image: string | null;
  subcontract_groups: RepasoSubcontractGroup[];
  created_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRepasoData {
  description: string;
  assigned_company?: string;
  estimated_hours?: number;
  actual_hours?: number;
  before_image?: string;
  after_image?: string;
  status?: 'pending' | 'in_progress' | 'completed';
  subcontract_groups?: RepasoSubcontractGroup[];
}

export interface UpdateRepasoData extends Partial<CreateRepasoData> {
  completed_at?: string | null;
  completed_by?: string | null;
}

type StoredRepaso = WorkRepaso & {
  serverId?: number | null;
  syncStatus?: SyncStatus;
  lastSyncError?: string | null;
};

const STORAGE_KEY_PREFIX = 'work_repasos_local::v1::';

function toStorageKey(tenantId?: string | null, workId?: string | null): string {
  const tenant = (tenantId || '').trim() || 'default';
  const work = (workId || '').trim() || 'all';
  return `${STORAGE_KEY_PREFIX}${tenant}::${work}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toOptionalString(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
}

function toNumberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSubcontractGroups(value: unknown): RepasoSubcontractGroup[] {
  if (!Array.isArray(value)) return [];
  return value.map((groupRaw) => {
    const group = asRecord(groupRaw) ?? {};
    const workersRaw = Array.isArray(group.workers) ? group.workers : [];
    const machineryRaw = Array.isArray(group.machinery) ? group.machinery : [];

    return {
      company: toStringValue(group.company),
      workers: workersRaw.map((workerRaw) => {
        const worker = asRecord(workerRaw) ?? {};
        return {
          name: toStringValue(worker.name),
          hours: toNumberValue(worker.hours),
        };
      }),
      machinery: machineryRaw.map((machineryItemRaw) => {
        const machineryItem = asRecord(machineryItemRaw) ?? {};
        return {
          type: toStringValue(machineryItem.type),
          hours: toNumberValue(machineryItem.hours),
        };
      }),
    };
  });
}

function normalizeStoredRepaso(raw: unknown): StoredRepaso | null {
  const record = asRecord(raw);
  if (!record) return null;

  const id = toStringValue(record.id);
  if (!id) return null;

  const statusRaw = toStringValue(record.status, 'pending');
  const normalizedStatus: WorkRepaso['status'] =
    statusRaw === 'in_progress' || statusRaw === 'completed' ? statusRaw : 'pending';

  const syncStatusRaw = toStringValue(record.syncStatus, 'pending');
  const syncStatus: SyncStatus =
    syncStatusRaw === 'synced' || syncStatusRaw === 'error' || syncStatusRaw === 'pending_delete'
      ? syncStatusRaw
      : 'pending';

  return {
    id,
    work_id: toStringValue(record.work_id),
    organization_id: toStringValue(record.organization_id),
    code: toStringValue(record.code, ''),
    status: normalizedStatus,
    description: toStringValue(record.description),
    assigned_company: toOptionalString(record.assigned_company),
    estimated_hours: toNumberValue(record.estimated_hours),
    actual_hours: toNumberValue(record.actual_hours),
    before_image: toOptionalString(record.before_image),
    after_image: toOptionalString(record.after_image),
    subcontract_groups: toSubcontractGroups(record.subcontract_groups),
    created_by: toOptionalString(record.created_by),
    completed_at: toOptionalString(record.completed_at),
    completed_by: toOptionalString(record.completed_by),
    created_at: toStringValue(record.created_at, new Date().toISOString()),
    updated_at: toStringValue(record.updated_at, new Date().toISOString()),
    serverId: typeof record.serverId === 'number' ? record.serverId : null,
    syncStatus,
    lastSyncError: toOptionalString(record.lastSyncError),
  };
}

function mapApiRepaso(item: ApiWorkRepaso): StoredRepaso {
  const localId = (item.external_id || '').trim() || `server-${item.id}`;
  return {
    id: localId,
    work_id: String(item.project_id),
    organization_id: String(item.tenant_id),
    code: item.code,
    status: item.status,
    description: item.description || '',
    assigned_company: item.assigned_company || null,
    estimated_hours: toNumberValue(item.estimated_hours),
    actual_hours: toNumberValue(item.actual_hours),
    before_image: item.before_image || null,
    after_image: item.after_image || null,
    subcontract_groups: toSubcontractGroups(item.subcontract_groups),
    created_by: item.created_by_id !== null && item.created_by_id !== undefined ? String(item.created_by_id) : null,
    completed_at: null,
    completed_by: null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    serverId: item.id,
    syncStatus: 'synced',
    lastSyncError: null,
  };
}

function sortItems(items: StoredRepaso[]): StoredRepaso[] {
  return [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

function resolveProjectId(workId: string): number | null {
  const parsed = Number(workId);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export const useWorkRepasos = (workId: string) => {
  const { organization } = useOrganization();
  const storageKey = useMemo(() => toStorageKey(organization?.id, workId), [organization?.id, workId]);
  const [repasosStored, setRepasosStored] = useState<StoredRepaso[]>([]);
  const [loading, setLoading] = useState(true);
  const storedRef = useRef<StoredRepaso[]>([]);

  useEffect(() => {
    storedRef.current = repasosStored;
  }, [repasosStored]);

  const saveLocal = useCallback(async (next: StoredRepaso[]) => {
    const sorted = sortItems(next);
    storedRef.current = sorted;
    setRepasosStored(sorted);
    await storage.setItem(storageKey, JSON.stringify(sorted));
  }, [storageKey]);

  const pushOne = useCallback(async (item: StoredRepaso): Promise<StoredRepaso | null> => {
    const tenantId = organization?.id;
    const projectId = resolveProjectId(workId);

    if (!tenantId || projectId === null) return { ...item, syncStatus: 'error', lastSyncError: 'Falta tenant u obra valida.' };

    if (item.syncStatus === 'pending_delete') {
      if (!item.serverId) return null;
      try {
        await deleteWorkRepasoApi(item.serverId, tenantId);
        return null;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo eliminar en API.';
        return { ...item, syncStatus: 'error', lastSyncError: message };
      }
    }

    const payload = {
      project_id: projectId,
      external_id: item.id,
      status: item.status,
      description: item.description,
      assigned_company: item.assigned_company,
      estimated_hours: item.estimated_hours,
      actual_hours: item.actual_hours,
      before_image: item.before_image,
      after_image: item.after_image,
      subcontract_groups: item.subcontract_groups,
    };

    try {
      const response = item.serverId
        ? await updateWorkRepasoApi(item.serverId, payload, tenantId)
        : await createWorkRepasoApi(payload, tenantId);
      const synced = mapApiRepaso(response);
      synced.id = item.id;
      return { ...synced, syncStatus: 'synced', lastSyncError: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo sincronizar con API.';
      return { ...item, syncStatus: 'error', lastSyncError: message };
    }
  }, [organization?.id, workId]);

  const syncPending = useCallback(async () => {
    const hasPending = storedRef.current.some((item) => item.syncStatus !== 'synced');
    if (!hasPending) return;

    const syncedItems: StoredRepaso[] = [];
    for (const item of storedRef.current) {
      if (item.syncStatus === 'synced') {
        syncedItems.push(item);
        continue;
      }
      const result = await pushOne(item);
      if (result) syncedItems.push(result);
    }

    await saveLocal(syncedItems);
  }, [pushOne, saveLocal]);

  const refreshRepasos = useCallback(async () => {
    setLoading(true);
    try {
      const rawLocal = await storage.getItem(storageKey);
      const parsed = rawLocal ? JSON.parse(rawLocal) : [];
      const localItems = Array.isArray(parsed)
        ? parsed.map(normalizeStoredRepaso).filter((item): item is StoredRepaso => Boolean(item))
        : [];

      const tenantId = organization?.id;
      const projectId = resolveProjectId(workId);

      if (!tenantId || projectId === null) {
        await saveLocal(localItems);
        return localItems;
      }

      let merged = localItems;
      try {
        const remote = await listWorkRepasos({
          tenantId,
          projectId,
          includeDeleted: false,
          limit: 500,
        });
        const remoteItems = remote.map(mapApiRepaso);
        const map = new Map<string, StoredRepaso>();
        remoteItems.forEach((item) => map.set(item.id, item));
        localItems.forEach((item) => {
          if (item.syncStatus !== 'synced' || !map.has(item.id)) {
            map.set(item.id, item);
          }
        });
        merged = Array.from(map.values());
      } catch {
        // fallback local
      }

      await saveLocal(merged);
      await syncPending();
      return merged;
    } finally {
      setLoading(false);
    }
  }, [organization?.id, saveLocal, storageKey, syncPending, workId]);

  useEffect(() => {
    void refreshRepasos();
  }, [refreshRepasos]);

  useEffect(() => {
    const onOnline = () => {
      void syncPending();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [syncPending]);

  const createRepaso = useCallback(async (data: CreateRepasoData) => {
    const now = new Date().toISOString();
    const localId = crypto.randomUUID();

    const pending: StoredRepaso = {
      id: localId,
      work_id: workId,
      organization_id: String(organization?.id || ''),
      code: `REP-LOCAL-${new Date().getTime().toString().slice(-5)}`,
      status: data.status || 'pending',
      description: (data.description || '').trim(),
      assigned_company: data.assigned_company || null,
      estimated_hours: Number(data.estimated_hours || 0),
      actual_hours: Number(data.actual_hours || 0),
      before_image: data.before_image || null,
      after_image: data.after_image || null,
      subcontract_groups: data.subcontract_groups || [],
      created_by: null,
      completed_at: null,
      completed_by: null,
      created_at: now,
      updated_at: now,
      serverId: null,
      syncStatus: 'pending',
      lastSyncError: null,
    };

    await saveLocal([pending, ...storedRef.current.filter((item) => item.id !== pending.id)]);
    const synced = await pushOne(pending);
    if (synced) {
      await saveLocal([synced, ...storedRef.current.filter((item) => item.id !== synced.id)]);
      if (synced.syncStatus === 'error') {
        toast.warning('Repaso guardado en local. Pendiente de sincronizar.');
      }
      return synced;
    }
    return pending;
  }, [organization?.id, pushOne, saveLocal, workId]);

  const updateRepaso = useCallback(async (id: string, data: UpdateRepasoData) => {
    const existing = storedRef.current.find((item) => item.id === id);
    if (!existing) return null;

    const patched: StoredRepaso = {
      ...existing,
      ...data,
      description: data.description !== undefined ? data.description : existing.description,
      assigned_company: data.assigned_company !== undefined ? data.assigned_company || null : existing.assigned_company,
      estimated_hours: data.estimated_hours !== undefined ? Number(data.estimated_hours || 0) : existing.estimated_hours,
      actual_hours: data.actual_hours !== undefined ? Number(data.actual_hours || 0) : existing.actual_hours,
      before_image: data.before_image !== undefined ? data.before_image || null : existing.before_image,
      after_image: data.after_image !== undefined ? data.after_image || null : existing.after_image,
      subcontract_groups: data.subcontract_groups !== undefined ? data.subcontract_groups : existing.subcontract_groups,
      updated_at: new Date().toISOString(),
      syncStatus: 'pending',
      lastSyncError: null,
    };

    await saveLocal([patched, ...storedRef.current.filter((item) => item.id !== id)]);
    const synced = await pushOne(patched);
    if (synced) {
      await saveLocal([synced, ...storedRef.current.filter((item) => item.id !== id)]);
      if (synced.syncStatus === 'error') {
        toast.warning('Cambios guardados en local. Pendientes de sincronizar.');
      }
      return synced;
    }
    return patched;
  }, [pushOne, saveLocal]);

  const deleteRepaso = useCallback(async (id: string) => {
    const existing = storedRef.current.find((item) => item.id === id);
    if (!existing) return false;

    if (!existing.serverId) {
      await saveLocal(storedRef.current.filter((item) => item.id !== id));
      return true;
    }

    const marked: StoredRepaso = {
      ...existing,
      syncStatus: 'pending_delete',
      updated_at: new Date().toISOString(),
      lastSyncError: null,
    };
    await saveLocal([marked, ...storedRef.current.filter((item) => item.id !== id)]);
    const result = await pushOne(marked);
    if (result === null) {
      await saveLocal(storedRef.current.filter((item) => item.id !== id));
      return true;
    }

    await saveLocal([result, ...storedRef.current.filter((item) => item.id !== id)]);
    toast.warning('Eliminacion pendiente de sincronizar.');
    return false;
  }, [pushOne, saveLocal]);

  const visibleRepasos = useMemo(
    () => repasosStored.filter((item) => item.syncStatus !== 'pending_delete').map((item) => ({
      ...item,
      organization_id: item.organization_id || String(organization?.id || ''),
    })),
    [organization?.id, repasosStored]
  );

  const stats = useMemo(() => ({
    total: visibleRepasos.length,
    pending: visibleRepasos.filter((r) => r.status === 'pending').length,
    inProgress: visibleRepasos.filter((r) => r.status === 'in_progress').length,
    completed: visibleRepasos.filter((r) => r.status === 'completed').length,
    totalEstimatedHours: visibleRepasos.reduce((sum, r) => sum + Number(r.estimated_hours || 0), 0),
    totalActualHours: visibleRepasos.reduce((sum, r) => sum + Number(r.actual_hours || 0), 0),
  }), [visibleRepasos]);

  return {
    repasos: visibleRepasos as WorkRepaso[],
    loading,
    stats,
    createRepaso,
    updateRepaso,
    deleteRepaso,
    refreshRepasos,
  };
};
