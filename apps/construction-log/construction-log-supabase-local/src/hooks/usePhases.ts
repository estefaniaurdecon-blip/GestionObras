import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  checkPhaseHasChildren,
  createPhase as apiCreatePhase,
  deletePhase as apiDeletePhase,
  listPhases,
  updatePhase as apiUpdatePhase,
  type ApiPhase,
} from '@/integrations/api/client';
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

const parseNumericId = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('ID invalido');
  }
  return parsed;
};

const toProjectId = (workId?: string): number | null => {
  if (!workId) return null;
  const parsed = Number(workId);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapApiPhase = (phase: ApiPhase): Phase => ({
  id: String(phase.id),
  organization_id: String(phase.tenant_id),
  work_id: phase.project_id != null ? String(phase.project_id) : null,
  name: phase.name,
  description: phase.description ?? null,
  responsible: phase.responsible ?? null,
  start_date: phase.start_date,
  end_date: phase.end_date,
  status: phase.status,
  progress: phase.progress ?? 0,
  created_by: phase.created_by_id != null ? String(phase.created_by_id) : null,
  created_at: phase.created_at,
  updated_at: phase.updated_at,
  work_name: phase.work_name ?? null,
});

export const usePhases = () => {
  const queryClient = useQueryClient();

  // Fetch all phases for the organization
  const { data: phases = [], isLoading, error, refetch } = useQuery({
    queryKey: ['phases'],
    queryFn: async (): Promise<Phase[]> => {
      const data = await listPhases();
      return (data || []).map(mapApiPhase);
    },
  });

  // Update phase name only
  const updatePhaseNameMutation = useMutation({
    mutationFn: async ({ id, newName }: UpdatePhaseNameParams) => {
      const updated = await apiUpdatePhase(parseNumericId(id), { name: newName });
      return mapApiPhase(updated);
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
      const payload: {
        name?: string;
        start_date?: string;
        end_date?: string;
        status?: 'pending' | 'in_progress' | 'completed';
        progress?: number;
        description?: string | null;
        responsible?: string | null;
      } = {};

      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.start_date !== undefined) payload.start_date = updates.start_date;
      if (updates.end_date !== undefined) payload.end_date = updates.end_date;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.progress !== undefined) payload.progress = updates.progress;
      if (updates.description !== undefined) payload.description = updates.description ?? null;
      if (updates.responsible !== undefined) payload.responsible = updates.responsible ?? null;

      const updated = await apiUpdatePhase(parseNumericId(id), payload);
      return mapApiPhase(updated);
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

  const checkPhaseHasChildrenSafe = async (phaseId: string): Promise<boolean> => {
    try {
      return await checkPhaseHasChildren(parseNumericId(phaseId));
    } catch (phaseError) {
      console.error('Error fetching phase for child check:', phaseError);
      return false;
    }
  };

  // Delete phase
  const deletePhaseMutation = useMutation({
    mutationFn: async (id: string) => {
      // First check if phase has children
      const hasChildren = await checkPhaseHasChildrenSafe(id);

      if (hasChildren) {
        throw new Error('PHASE_HAS_CHILDREN');
      }

      await apiDeletePhase(parseNumericId(id));
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases'] });
      toast.success('Fase eliminada correctamente');
    },
    onError: (error: Error) => {
      console.error('Error deleting phase:', error);
      if (error.message === 'PHASE_HAS_CHILDREN') {
        toast.error('No puedes borrar una fase que ya tiene datos. Archivala o borra los datos primero.');
      } else {
        toast.error('No se pudo eliminar la fase');
      }
    },
  });

  // Create phase
  const createPhaseMutation = useMutation({
    mutationFn: async (params: CreatePhaseParams) => {
      const apiPhase = await apiCreatePhase({
        name: params.name,
        project_id: toProjectId(params.work_id),
        description: params.description ?? null,
        responsible: params.responsible ?? null,
        start_date: params.start_date,
        end_date: params.end_date,
        status: 'pending',
        progress: 0,
      });
      return mapApiPhase(apiPhase);
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

