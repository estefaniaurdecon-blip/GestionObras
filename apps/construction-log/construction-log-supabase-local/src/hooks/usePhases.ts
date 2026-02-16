import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Phase {
  id: string;
  organization_id: string;
  work_id: string | null;
  name: string;
  description: string | null;
  responsible: string | null;
  start_date: string;
  end_date: string;
  status: 'pending' | 'in_progress' | 'completed';
  progress: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined work name
  work_name?: string;
}

interface UpdatePhaseNameParams {
  id: string;
  newName: string;
}

interface UpdatePhaseParams {
  id: string;
  name?: string;
  start_date?: string;
  end_date?: string;
  status?: 'pending' | 'in_progress' | 'completed';
  progress?: number;
  description?: string;
  responsible?: string;
}

interface CreatePhaseParams {
  name: string;
  start_date: string;
  end_date: string;
  work_id?: string;
  description?: string;
  responsible?: string;
}

export const usePhases = () => {
  const queryClient = useQueryClient();

  // Fetch all phases for the organization
  const { data: phases = [], isLoading, error, refetch } = useQuery({
    queryKey: ['phases'],
    queryFn: async (): Promise<Phase[]> => {
      const { data, error } = await supabase
        .from('phases')
        .select(`
          *,
          works:work_id (name)
        `)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching phases:', error);
        throw error;
      }

      // Map work name from joined table
      return (data || []).map((phase: any) => ({
        ...phase,
        work_name: phase.works?.name || null,
      }));
    },
  });

  // Update phase name only
  const updatePhaseNameMutation = useMutation({
    mutationFn: async ({ id, newName }: UpdatePhaseNameParams) => {
      const { data, error } = await supabase
        .from('phases')
        .update({ name: newName })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases'] });
      toast.success('Nombre de fase actualizado');
    },
    onError: (error) => {
      console.error('Error updating phase name:', error);
      toast.error('No se pudo actualizar la fase');
    },
  });

  // Update phase (full update)
  const updatePhaseMutation = useMutation({
    mutationFn: async ({ id, ...updates }: UpdatePhaseParams) => {
      const { data, error } = await supabase
        .from('phases')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases'] });
      toast.success('Fase actualizada correctamente');
    },
    onError: (error) => {
      console.error('Error updating phase:', error);
      toast.error('No se pudo actualizar la fase');
    },
  });

  // Check if phase has children (work reports within its date range and work)
  const checkPhaseHasChildren = async (phaseId: string): Promise<boolean> => {
    // First get the phase details
    const { data: phase, error: phaseError } = await supabase
      .from('phases')
      .select('work_id, start_date, end_date')
      .eq('id', phaseId)
      .single();

    if (phaseError || !phase) {
      console.error('Error fetching phase for child check:', phaseError);
      return false;
    }

    // If no work_id, the phase has no associated work reports
    if (!phase.work_id) {
      return false;
    }

    // Check for work reports within the phase's date range and work
    const { count, error: reportsError } = await supabase
      .from('work_reports')
      .select('id', { count: 'exact', head: true })
      .eq('work_id', phase.work_id)
      .gte('date', phase.start_date)
      .lte('date', phase.end_date);

    if (reportsError) {
      console.error('Error checking work reports:', reportsError);
      return false;
    }

    return (count ?? 0) > 0;
  };

  // Delete phase
  const deletePhaseMutation = useMutation({
    mutationFn: async (id: string) => {
      // First check if phase has children
      const hasChildren = await checkPhaseHasChildren(id);
      
      if (hasChildren) {
        throw new Error('PHASE_HAS_CHILDREN');
      }

      const { error } = await supabase
        .from('phases')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases'] });
      toast.success('Fase eliminada correctamente');
    },
    onError: (error: Error) => {
      console.error('Error deleting phase:', error);
      if (error.message === 'PHASE_HAS_CHILDREN') {
        toast.error('No puedes borrar una fase que ya tiene datos. Archívala o borra los datos primero.');
      } else {
        toast.error('No se pudo eliminar la fase');
      }
    },
  });

  // Create phase
  const createPhaseMutation = useMutation({
    mutationFn: async (params: CreatePhaseParams) => {
      // Get organization_id from the current user's session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile?.organization_id) throw new Error('No organization found');

      const { data, error } = await supabase
        .from('phases')
        .insert({
          ...params,
          organization_id: profile.organization_id,
          created_by: user.id,
          status: 'pending',
          progress: 0,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases'] });
      toast.success('Fase creada correctamente');
    },
    onError: (error) => {
      console.error('Error creating phase:', error);
      toast.error('No se pudo crear la fase');
    },
  });

  // Helper functions
  const updatePhaseName = (id: string, newName: string) => {
    return updatePhaseNameMutation.mutateAsync({ id, newName });
  };

  const updatePhase = (params: UpdatePhaseParams) => {
    return updatePhaseMutation.mutateAsync(params);
  };

  const deletePhase = (id: string) => {
    return deletePhaseMutation.mutateAsync(id);
  };

  const createPhase = (params: CreatePhaseParams) => {
    return createPhaseMutation.mutateAsync(params);
  };

  return {
    phases,
    isLoading,
    error,
    refetch,
    updatePhaseName,
    updatePhase,
    deletePhase,
    createPhase,
    isUpdating: updatePhaseNameMutation.isPending || updatePhaseMutation.isPending,
    isDeleting: deletePhaseMutation.isPending,
    isSaving: updatePhaseMutation.isPending,
    isCreating: createPhaseMutation.isPending,
  };
};
