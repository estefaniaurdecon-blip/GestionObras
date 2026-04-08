import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  listWorkMembers,
  listWorkMessageDirectory,
  type ApiWorkMember,
  type ApiWorkMessageDirectoryItem,
} from '@/integrations/api/client';
import {
  ACTIVE_TENANT_CHANGED_EVENT,
  getActiveTenantId,
  prepareOfflineTenantScope,
} from '@/offline-db/tenantScope';
import { workReportsRepo } from '@/offline-db/repositories/workReportsRepo';
import { toast } from './use-toast';

export interface WorkMessageDirectoryItem {
  id: number;
  name: string;
  code?: string | null;
  visible_member_count: number;
}

export interface WorkDirectoryMember {
  id: string;
  full_name: string;
  email?: string | null;
}

interface WorkDirectoryReportMetadata {
  code: string | null;
  name: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readPayloadText(payload: Record<string, unknown> | null, keys: string[]): string | null {
  if (!payload) return null;

  for (const key of keys) {
    const value = payload[key];
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }

  return null;
}

async function loadDirectoryFallbackMetadata(
  tenantId: string,
  workIds: number[],
): Promise<Map<number, WorkDirectoryReportMetadata>> {
  if (workIds.length === 0) return new Map();

  await workReportsRepo.init();
  const reports = await workReportsRepo.list({
    tenantId,
    limit: 5000,
  });
  const targetIds = new Set(workIds.map((workId) => String(workId)));
  const metadataByWorkId = new Map<number, WorkDirectoryReportMetadata>();

  for (const report of reports) {
    const projectId = report.projectId?.trim();
    if (!projectId || !targetIds.has(projectId)) continue;

    const workId = Number(projectId);
    if (!Number.isFinite(workId)) continue;

    const payload = asRecord(report.payload);
    const nextCode = readPayloadText(payload, ['workNumber', 'work_number', 'projectCode', 'project_code']);
    const nextName = readPayloadText(payload, ['workName', 'work_name']);
    const current = metadataByWorkId.get(workId) ?? { code: null, name: null };

    metadataByWorkId.set(workId, {
      code: current.code ?? nextCode,
      name: current.name ?? nextName,
    });
  }

  return metadataByWorkId;
}

export const useWorkMessageDirectory = () => {
  const { user } = useAuth();
  const [works, setWorks] = useState<WorkMessageDirectoryItem[]>([]);
  const [membersByWorkId, setMembersByWorkId] = useState<Record<number, WorkDirectoryMember[]>>({});
  const [loadingWorks, setLoadingWorks] = useState(true);
  const [loadingMembersByWorkId, setLoadingMembersByWorkId] = useState<Record<number, boolean>>({});

  const mapWork = (item: ApiWorkMessageDirectoryItem): WorkMessageDirectoryItem => ({
    id: item.id,
    name: item.name,
    code: item.code ?? null,
    visible_member_count: item.visible_member_count,
  });

  const mapMember = (item: ApiWorkMember): WorkDirectoryMember => ({
    id: String(item.id),
    full_name: item.full_name?.trim() || item.email || `Usuario ${item.id}`,
    email: item.email,
  });

  const loadWorks = useCallback(async () => {
    if (!user) {
      setWorks([]);
      setMembersByWorkId({});
      setLoadingWorks(false);
      return;
    }

    setLoadingWorks(true);
    try {
      const activeTenantId = await getActiveTenantId(user);
      if (!activeTenantId) {
        setWorks([]);
        setMembersByWorkId({});
        return;
      }

      const response = await listWorkMessageDirectory(activeTenantId);
      const mappedWorks = response.map(mapWork);

      const preparedTenantId = await prepareOfflineTenantScope(user, { tenantId: activeTenantId });
      const fallbackMetadataByWorkId = await loadDirectoryFallbackMetadata(
        preparedTenantId,
        mappedWorks.map((work) => work.id),
      );

      setWorks(
        mappedWorks.map((work) => {
          const fallback = fallbackMetadataByWorkId.get(work.id);
          return {
            ...work,
            name: fallback?.name ?? work.name,
            code: work.code ?? fallback?.code ?? null,
          };
        }),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      console.error('Error loading work message directory:', error);
      toast({
        title: 'Error al cargar obras',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoadingWorks(false);
    }
  }, [user]);

  const loadMembersForWork = useCallback(async (workId: number) => {
    if (!user) return [];

    if (membersByWorkId[workId]) {
      return membersByWorkId[workId];
    }

    setLoadingMembersByWorkId((prev) => ({ ...prev, [workId]: true }));
    try {
      const activeTenantId = await getActiveTenantId(user);
      if (!activeTenantId) {
        return [];
      }

      const response = await listWorkMembers(workId, activeTenantId);
      const mapped = response.map(mapMember);
      setMembersByWorkId((prev) => ({ ...prev, [workId]: mapped }));
      return mapped;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      console.error(`Error loading members for work ${workId}:`, error);
      toast({
        title: 'Error al cargar miembros de obra',
        description: message,
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoadingMembersByWorkId((prev) => ({ ...prev, [workId]: false }));
    }
  }, [membersByWorkId, user]);

  useEffect(() => {
    void loadWorks();
  }, [loadWorks]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleActiveTenantChange = () => {
      void loadWorks();
    };

    window.addEventListener(ACTIVE_TENANT_CHANGED_EVENT, handleActiveTenantChange as EventListener);
    return () => {
      window.removeEventListener(ACTIVE_TENANT_CHANGED_EVENT, handleActiveTenantChange as EventListener);
    };
  }, [loadWorks]);

  return {
    works,
    membersByWorkId,
    loadingWorks,
    loadingMembersByWorkId,
    loadWorks,
    loadMembersForWork,
  };
};
