import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  listWorkMembers,
  listWorkMessageDirectory,
  type ApiWorkMember,
  type ApiWorkMessageDirectoryItem,
} from '@/integrations/api/client';
import { ACTIVE_TENANT_CHANGED_EVENT, getActiveTenantId } from '@/offline-db/tenantScope';
import { toast } from './use-toast';

export interface WorkMessageDirectoryItem {
  id: number;
  name: string;
  visible_member_count: number;
}

export interface WorkDirectoryMember {
  id: string;
  full_name: string;
  email?: string | null;
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
      setWorks(response.map(mapWork));
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
