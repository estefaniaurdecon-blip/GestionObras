import { useState, useEffect } from 'react';
import { UserProfile, AppRole } from '@/types/user';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';
import {
  approveManagedUser,
  assignManagedUserToWork,
  deleteUserAndData,
  listAssignableForemen,
  listManagedUserAssignments,
  listManagedUserRoles,
  listManagedUsers,
  removeManagedUserFromWork,
  type ApiManagedUser,
} from '@/integrations/api/client';

const parseNumericId = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('ID invalido');
  }
  return parsed;
};

const mapManagedUser = (user: ApiManagedUser): UserProfile => ({
  id: String(user.id),
  full_name: user.full_name,
  email: user.email ?? undefined,
  approved: user.approved,
  created_at: user.created_at,
  updated_at: user.updated_at,
  organization_id: String(user.organization_id),
});

interface UseUsersOptions {
  autoLoad?: boolean;
}

export const useUsers = ({ autoLoad = true }: UseUsersOptions = {}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const loadUsers = async (): Promise<UserProfile[]> => {
    if (!user) {
      setUsers([]);
      setLoading(false);
      return [];
    }

    setLoading(true);
    try {
      const data = await listManagedUsers();
      const mapped = (data || []).map(mapManagedUser);
      setUsers(mapped);
      return mapped;
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast({
        title: 'Error al cargar usuarios',
        description: error.message,
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!autoLoad) {
      if (!user) {
        setUsers([]);
      }
      setLoading(false);
      return;
    }
    void loadUsers();
  }, [autoLoad, user]);

  const getUserRoles = async (userId: string): Promise<AppRole[]> => {
    try {
      const roles = await listManagedUserRoles(parseNumericId(userId));
      return (roles || []) as AppRole[];
    } catch (error: any) {
      console.error('Error loading user roles:', error);
      return [];
    }
  };

  const getUserAssignments = async (userId: string): Promise<string[]> => {
    try {
      const workIds = await listManagedUserAssignments(parseNumericId(userId));
      return (workIds || []).map((id) => String(id));
    } catch (error: any) {
      console.error('Error loading user assignments:', error);
      return [];
    }
  };

  const assignUserToWork = async (userId: string, workId: string) => {
    if (!user) return;

    try {
      await assignManagedUserToWork(parseNumericId(userId), parseNumericId(workId));

      toast({
        title: 'Usuario asignado',
        description: 'El usuario ha sido asignado a la obra correctamente.',
      });
    } catch (error: any) {
      console.error('Error assigning user:', error);
      toast({
        title: 'Error al asignar',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const removeUserFromWork = async (userId: string, workId: string) => {
    try {
      await removeManagedUserFromWork(parseNumericId(userId), parseNumericId(workId));

      toast({
        title: 'Asignacion eliminada',
        description: 'El usuario ha sido removido de la obra.',
      });
    } catch (error: any) {
      console.error('Error removing assignment:', error);
      toast({
        title: 'Error al eliminar',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const approveUser = async (userId: string, role: AppRole) => {
    try {
      await approveManagedUser(parseNumericId(userId), role);

      toast({
        title: 'Usuario aprobado',
        description: 'El usuario ha sido aprobado y se le ha asignado un rol.',
      });

      void loadUsers();
    } catch (error: any) {
      console.error('Error approving user:', error);
      toast({
        title: 'Error al aprobar',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      await deleteUserAndData(parseNumericId(userId));

      toast({
        title: 'Usuario eliminado',
        description: 'El usuario y todos sus datos han sido eliminados.',
      });

      void loadUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error al eliminar',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getAssignableForemenForSiteManager = async (organizationId: string): Promise<UserProfile[]> => {
    try {
      const data = await listAssignableForemen(organizationId);
      return (data || []).map(mapManagedUser);
    } catch (error: any) {
      console.error('Error loading assignable foremen:', error);
      toast({
        title: 'Error al cargar usuarios',
        description: error.message,
        variant: 'destructive',
      });
      return [];
    }
  };

  return {
    users,
    loading,
    loadUsers,
    getUserRoles,
    getUserAssignments,
    assignUserToWork,
    removeUserFromWork,
    approveUser,
    deleteUser,
    getAssignableForemenForSiteManager,
  };
};

