import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { toast } from 'sonner';

// Types for subcontract groups with workers and machinery
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

// Helper to parse subcontract_groups from JSON
const parseSubcontractGroups = (data: any): RepasoSubcontractGroup[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data as RepasoSubcontractGroup[];
  return [];
};

// Helper to map DB row to WorkRepaso
const mapDbRowToRepaso = (row: any): WorkRepaso => ({
  ...row,
  subcontract_groups: parseSubcontractGroups(row.subcontract_groups),
});

export const useWorkRepasos = (workId: string) => {
  const { user } = useAuth();
  const { userProfile } = useUserPermissions();
  const organizationId = userProfile?.organization_id;
  const [repasos, setRepasos] = useState<WorkRepaso[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRepasos = useCallback(async () => {
    if (!workId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('work_repasos')
        .select('*')
        .eq('work_id', workId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRepasos((data || []).map(mapDbRowToRepaso));
    } catch (error: any) {
      console.error('Error fetching repasos:', error);
      toast.error('Error al cargar los repasos');
    } finally {
      setLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    fetchRepasos();
  }, [fetchRepasos]);

  const generateCode = useCallback(async () => {
    const { data } = await supabase
      .from('work_repasos')
      .select('code')
      .eq('work_id', workId)
      .order('code', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const lastCode = data[0].code;
      const match = lastCode.match(/REP-(\d+)/);
      if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        return `REP-${nextNum.toString().padStart(3, '0')}`;
      }
    }
    return 'REP-001';
  }, [workId]);

  const createRepaso = useCallback(async (data: CreateRepasoData) => {
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
      
      const { data: newRepaso, error } = await supabase
        .from('work_repasos')
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      
      const mappedRepaso = mapDbRowToRepaso(newRepaso);
      setRepasos(prev => [mappedRepaso, ...prev]);
      toast.success('Repaso creado correctamente');
      return mappedRepaso;
    } catch (error: any) {
      console.error('Error creating repaso:', error);
      toast.error('Error al crear el repaso');
      return null;
    }
  }, [workId, user, organizationId, generateCode]);

  const updateRepaso = useCallback(async (id: string, data: UpdateRepasoData) => {
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

      const { data: updatedRepaso, error } = await supabase
        .from('work_repasos')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      const mappedRepaso = mapDbRowToRepaso(updatedRepaso);
      setRepasos(prev => prev.map(r => r.id === id ? mappedRepaso : r));
      toast.success('Repaso actualizado correctamente');
      return mappedRepaso;
    } catch (error: any) {
      console.error('Error updating repaso:', error);
      toast.error('Error al actualizar el repaso');
      return null;
    }
  }, [user]);

  const deleteRepaso = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('work_repasos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setRepasos(prev => prev.filter(r => r.id !== id));
      toast.success('Repaso eliminado correctamente');
      return true;
    } catch (error: any) {
      console.error('Error deleting repaso:', error);
      toast.error('Error al eliminar el repaso');
      return false;
    }
  }, []);

  // Estadísticas calculadas
  const stats = {
    total: repasos.length,
    pending: repasos.filter(r => r.status === 'pending').length,
    inProgress: repasos.filter(r => r.status === 'in_progress').length,
    completed: repasos.filter(r => r.status === 'completed').length,
    totalEstimatedHours: repasos.reduce((sum, r) => sum + (r.estimated_hours || 0), 0),
    totalActualHours: repasos.reduce((sum, r) => sum + (r.actual_hours || 0), 0),
  };

  return {
    repasos,
    loading,
    stats,
    createRepaso,
    updateRepaso,
    deleteRepaso,
    refreshRepasos: fetchRepasos,
  };
};
