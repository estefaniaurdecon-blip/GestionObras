import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { toast } from 'sonner';
import { supabase } from '@/integrations/api/legacySupabaseRemoved';

// Types for subcontract groups with workers and machinery (same as Repasos)
export interface PostventaWorker {
  name: string;
  hours: number;
}

export interface PostventaMachinery {
  type: string;
  hours: number;
}

export interface PostventaSubcontractGroup {
  company: string;
  workers: PostventaWorker[];
  machinery: PostventaMachinery[];
}

export interface WorkPostventa {
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
  subcontract_groups: PostventaSubcontractGroup[];
  created_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePostventaData {
  description: string;
  assigned_company?: string;
  estimated_hours?: number;
  actual_hours?: number;
  before_image?: string;
  after_image?: string;
  status?: 'pending' | 'in_progress' | 'completed';
  subcontract_groups?: PostventaSubcontractGroup[];
}

export interface UpdatePostventaData extends Partial<CreatePostventaData> {
  completed_at?: string | null;
  completed_by?: string | null;
}

// Helper to parse subcontract_groups from JSON
const parseSubcontractGroups = (data: any): PostventaSubcontractGroup[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data as PostventaSubcontractGroup[];
  return [];
};

// Helper to map DB row to WorkPostventa
const mapDbRowToPostventa = (row: any): WorkPostventa => ({
  ...row,
  subcontract_groups: parseSubcontractGroups(row.subcontract_groups),
});

export const useWorkPostventas = (workId: string) => {
  const { user } = useAuth();
  const { userProfile } = useUserPermissions();
  const organizationId = userProfile?.organization_id;
  const [postventas, setPostventas] = useState<WorkPostventa[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPostventas = useCallback(async () => {
    if (!workId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('work_postventas')
        .select('*')
        .eq('work_id', workId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPostventas((data || []).map(mapDbRowToPostventa));
    } catch (error: any) {
      console.error('Error fetching postventas:', error);
      toast.error('Error al cargar las post-ventas');
    } finally {
      setLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    fetchPostventas();
  }, [fetchPostventas]);

  const generateCode = useCallback(async () => {
    const { data } = await supabase
      .from('work_postventas')
      .select('code')
      .eq('work_id', workId)
      .order('code', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const lastCode = data[0].code;
      const match = lastCode.match(/PV-(\d+)/);
      if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        return `PV-${nextNum.toString().padStart(3, '0')}`;
      }
    }
    return 'PV-001';
  }, [workId]);

  const createPostventa = useCallback(async (data: CreatePostventaData) => {
    if (!user || !organizationId) {
      toast.error('No se pudo identificar el usuario u organización');
      return null;
    }

    try {
      const code = await generateCode();
      
      const insertData = {
        work_id: workId,
        organization_id: organizationId,
        code,
        description: data.description,
        assigned_company: data.assigned_company || null,
        estimated_hours: data.estimated_hours || 0,
        actual_hours: data.actual_hours || 0,
        before_image: data.before_image || null,
        after_image: data.after_image || null,
        status: data.status || 'pending',
        subcontract_groups: JSON.stringify(data.subcontract_groups || []),
        created_by: user.id,
      };
      
      const { data: newPostventa, error } = await supabase
        .from('work_postventas')
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      
      const mappedPostventa = mapDbRowToPostventa(newPostventa);
      setPostventas(prev => [mappedPostventa, ...prev]);
      toast.success('Post-venta creada correctamente');
      return mappedPostventa;
    } catch (error: any) {
      console.error('Error creating postventa:', error);
      toast.error('Error al crear la post-venta');
      return null;
    }
  }, [workId, user, organizationId, generateCode]);

  const updatePostventa = useCallback(async (id: string, data: UpdatePostventaData) => {
    try {
      const updateData: any = { ...data };
      
      // Si se marca como completado, registrar fecha y usuario
      if (data.status === 'completed' && user) {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = user.id;
      } else if (data.status !== 'completed') {
        updateData.completed_at = null;
        updateData.completed_by = null;
      }

      const { data: updatedPostventa, error } = await supabase
        .from('work_postventas')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      const mappedPostventa = mapDbRowToPostventa(updatedPostventa);
      setPostventas(prev => prev.map(p => p.id === id ? mappedPostventa : p));
      toast.success('Post-venta actualizada correctamente');
      return mappedPostventa;
    } catch (error: any) {
      console.error('Error updating postventa:', error);
      toast.error('Error al actualizar la post-venta');
      return null;
    }
  }, [user]);

  const deletePostventa = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('work_postventas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setPostventas(prev => prev.filter(p => p.id !== id));
      toast.success('Post-venta eliminada correctamente');
      return true;
    } catch (error: any) {
      console.error('Error deleting postventa:', error);
      toast.error('Error al eliminar la post-venta');
      return false;
    }
  }, []);

  // Estadísticas calculadas
  const stats = {
    total: postventas.length,
    pending: postventas.filter(p => p.status === 'pending').length,
    inProgress: postventas.filter(p => p.status === 'in_progress').length,
    completed: postventas.filter(p => p.status === 'completed').length,
    totalEstimatedHours: postventas.reduce((sum, p) => sum + (p.estimated_hours || 0), 0),
    totalActualHours: postventas.reduce((sum, p) => sum + (p.actual_hours || 0), 0),
  };

  return {
    postventas,
    loading,
    stats,
    createPostventa,
    updatePostventa,
    deletePostventa,
    refreshPostventas: fetchPostventas,
  };
};
