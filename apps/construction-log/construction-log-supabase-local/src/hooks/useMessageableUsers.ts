import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/api/legacySupabaseRemoved';
import { AppRole } from '@/types/user';
import { toast } from './use-toast';

export interface MessageableUser {
  id: string;
  full_name: string;
  roles: AppRole[];
  approved: boolean;
}

export const useMessageableUsers = () => {
  const [users, setUsers] = useState<MessageableUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase.rpc('get_messageable_users');

      if (error) throw error;
      
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error loading messageable users:', error);
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
  }, []);

  return {
    users,
    loading,
    reloadUsers: loadUsers,
  };
};

