import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { listContactUsersByTenant, type ApiUser } from '@/integrations/api/client';
import { ACTIVE_TENANT_CHANGED_EVENT, getActiveTenantId } from '@/offline-db/tenantScope';
import { AppRole } from '@/types/user';
import { toast } from './use-toast';

export interface MessageableUser {
  id: string;
  full_name: string;
  roles: AppRole[];
  approved: boolean;
}

export const useMessageableUsers = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<MessageableUser[]>([]);
  const [loading, setLoading] = useState(true);

  const normalizeRoles = (candidate: ApiUser): AppRole[] => {
    const roleNames = Array.isArray(candidate.roles)
      ? candidate.roles
      : candidate.role_name
        ? [candidate.role_name]
        : [];

    const mapped = roleNames
      .map((role) => String(role).trim().toLowerCase())
      .map((role): AppRole | null => {
        if (role === 'master' || role === 'super_admin') return 'master';
        if (role === 'admin' || role === 'tenant_admin') return 'admin';
        if (role === 'site_manager') return 'site_manager';
        if (role === 'foreman') return 'foreman';
        if (role === 'reader' || role === 'user' || role === 'usuario') return 'reader';
        if (role === 'ofi' || role === 'office') return 'ofi';
        return null;
      })
      .filter((role): role is AppRole => role !== null);

    return Array.from(new Set(mapped));
  };

  const loadUsers = async () => {
    if (!user) {
      setUsers([]);
      setLoading(false);
      return;
    }

    try {
      const activeTenantId = await getActiveTenantId(user);
      if (!activeTenantId) {
        setUsers([]);
        return;
      }

      const apiUsers = await listContactUsersByTenant(Number(activeTenantId));
      const mappedUsers: MessageableUser[] = apiUsers
        .filter((candidate) => candidate.is_active)
        .filter((candidate) => String(candidate.id) !== String(user.id))
        .map((candidate) => ({
          id: String(candidate.id),
          full_name: candidate.full_name?.trim() || candidate.email,
          roles: normalizeRoles(candidate),
          approved: Boolean(candidate.is_active),
        }));

      setUsers(mappedUsers);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      console.error('Error loading messageable users:', error);
      toast({
        title: 'Error al cargar usuarios',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [user?.id, user?.tenant_id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleActiveTenantChange = () => {
      void loadUsers();
    };

    window.addEventListener(ACTIVE_TENANT_CHANGED_EVENT, handleActiveTenantChange as EventListener);
    return () => {
      window.removeEventListener(ACTIVE_TENANT_CHANGED_EVENT, handleActiveTenantChange as EventListener);
    };
  }, [loadUsers]);

  return {
    users,
    loading,
    reloadUsers: loadUsers,
  };
};

