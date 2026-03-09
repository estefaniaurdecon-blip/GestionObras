import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/api/legacySupabaseRemoved';
import { UserProfile, AppRole, WorkAssignment } from '@/types/user';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';

export const useUsers = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const loadUsers = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, approved, created_at, updated_at, organization_id')
        .order('full_name');

      if (error) throw error;
      if (data) setUsers(data);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast({
        title: "Error al cargar usuarios",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [user]);

  const getUserRoles = async (userId: string): Promise<AppRole[]> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error) throw error;
      return data?.map(r => r.role as AppRole) || [];
    } catch (error: any) {
      console.error('Error loading user roles:', error);
      return [];
    }
  };

  const getUserAssignments = async (userId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from('work_assignments')
        .select('work_id')
        .eq('user_id', userId);

      if (error) throw error;
      return data?.map(a => a.work_id) || [];
    } catch (error: any) {
      console.error('Error loading user assignments:', error);
      return [];
    }
  };

  const assignUserToWork = async (userId: string, workId: string) => {
    if (!user) return;

    try {
      // Get user's organization_id
      const { data: profileData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', userId)
        .single();

      const { error } = await supabase
        .from('work_assignments')
        .insert({
          user_id: userId,
          work_id: workId,
          created_by: user.id,
          organization_id: profileData?.organization_id
        });

      if (error) throw error;

      toast({
        title: "Usuario asignado",
        description: "El usuario ha sido asignado a la obra correctamente.",
      });
    } catch (error: any) {
      console.error('Error assigning user:', error);
      toast({
        title: "Error al asignar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const removeUserFromWork = async (userId: string, workId: string) => {
    try {
      const { error } = await supabase
        .from('work_assignments')
        .delete()
        .eq('user_id', userId)
        .eq('work_id', workId);

      if (error) throw error;

      toast({
        title: "Asignación eliminada",
        description: "El usuario ha sido removido de la obra.",
      });
    } catch (error: any) {
      console.error('Error removing assignment:', error);
      toast({
        title: "Error al eliminar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const approveUser = async (userId: string, role: AppRole) => {
    try {
      // Get user's organization_id
      const { data: profileData, error: fetchError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', userId)
        .single();

      if (fetchError) throw fetchError;

      // Update approved status
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ approved: true })
        .eq('id', userId);

      if (profileError) throw profileError;

      // Upsert role (update if exists, insert if not) to avoid duplicate key errors
      const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({ 
          user_id: userId, 
          role,
          organization_id: profileData.organization_id
        }, {
          onConflict: 'user_id,role'
        });

      if (roleError) throw roleError;

      toast({
        title: "Usuario aprobado",
        description: "El usuario ha sido aprobado y se le ha asignado un rol.",
      });

      loadUsers();
    } catch (error: any) {
      console.error('Error approving user:', error);
      toast({
        title: "Error al aprobar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('delete_user_and_data', {
        user_id_to_delete: userId,
      });

      if (error) throw error;

      toast({
        title: "Usuario eliminado",
        description: "El usuario y todos sus datos han sido eliminados.",
      });

      loadUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error al eliminar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getAssignableForemenForSiteManager = async (organizationId: string): Promise<UserProfile[]> => {
    try {
      const { data, error } = await supabase
        .rpc('get_assignable_users_for_site_manager', { org_id: organizationId });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('Error loading assignable foremen:', error);
      toast({
        title: "Error al cargar usuarios",
        description: error.message,
        variant: "destructive",
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

