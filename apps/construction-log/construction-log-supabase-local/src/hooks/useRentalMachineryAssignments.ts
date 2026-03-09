import { useState, useEffect } from 'react';
import {
  createRentalMachineryAssignment,
  deleteRentalMachineryAssignment,
  listRentalMachineryAssignments,
  updateRentalMachineryAssignment,
  type ApiRentalMachineryAssignment,
} from '@/integrations/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from './use-toast';

export interface RentalMachineryAssignment {
  id: string;
  rental_machinery_id: string;
  organization_id: string;
  work_id: string;
  assignment_date: string;
  end_date: string | null;
  operator_name: string;
  company_name: string;
  activity: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface UseRentalMachineryAssignmentsProps {
  rentalMachineryId?: string;
  date?: string;
  workId?: string;
}

function mapAssignment(apiAssignment: ApiRentalMachineryAssignment): RentalMachineryAssignment {
  return {
    id: String(apiAssignment.id),
    rental_machinery_id: apiAssignment.rental_machinery_id,
    organization_id: String(apiAssignment.tenant_id),
    work_id: apiAssignment.work_id,
    assignment_date: apiAssignment.assignment_date,
    end_date: apiAssignment.end_date ?? null,
    operator_name: apiAssignment.operator_name,
    company_name: apiAssignment.company_name,
    activity: apiAssignment.activity ?? null,
    created_by:
      apiAssignment.created_by_id !== undefined && apiAssignment.created_by_id !== null
        ? String(apiAssignment.created_by_id)
        : null,
    created_at: apiAssignment.created_at,
    updated_at: apiAssignment.updated_at,
  };
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const maybeStatus = (error as { status?: unknown }).status;
  return typeof maybeStatus === 'number' ? maybeStatus : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (!error || typeof error !== 'object') return '';
  const maybeMessage = (error as { message?: unknown }).message;
  return typeof maybeMessage === 'string' ? maybeMessage : '';
}

export const useRentalMachineryAssignments = ({
  rentalMachineryId,
  date,
  workId,
}: UseRentalMachineryAssignmentsProps) => {
  const [assignments, setAssignments] = useState<RentalMachineryAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchAssignments = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const data = await listRentalMachineryAssignments({
        rentalMachineryId,
        date,
        workId,
      });
      setAssignments((data || []).map(mapAssignment));
    } catch (error) {
      console.error('Error fetching rental machinery assignments:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las asignaciones de operadores',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const addAssignment = async (
    assignmentData: Omit<RentalMachineryAssignment, 'id' | 'created_at' | 'updated_at' | 'created_by'>
  ) => {
    if (!user?.id) return;

    try {
      const created = await createRentalMachineryAssignment({
        rental_machinery_id: assignmentData.rental_machinery_id,
        work_id: assignmentData.work_id,
        assignment_date: assignmentData.assignment_date,
        end_date: assignmentData.end_date,
        operator_name: assignmentData.operator_name,
        company_name: assignmentData.company_name,
        activity: assignmentData.activity,
      });

      toast({
        title: 'Exito',
        description: 'Asignacion de operador creada correctamente',
      });

      await fetchAssignments();
      return mapAssignment(created);
    } catch (error) {
      console.error('Error adding rental machinery assignment:', error);

      const status = getErrorStatus(error);
      const message = getErrorMessage(error).toLowerCase();
      if (status === 409 || message.includes('ya existe')) {
        toast({
          title: 'Error',
          description: 'Ya existe una asignacion para esta maquinaria en esta fecha',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: 'No se pudo crear la asignacion de operador',
          variant: 'destructive',
        });
      }
      throw error;
    }
  };

  const updateAssignment = async (id: string, updates: Partial<RentalMachineryAssignment>) => {
    try {
      const assignmentId = Number(id);
      if (!Number.isFinite(assignmentId)) {
        throw new Error('ID de asignacion invalido');
      }

      await updateRentalMachineryAssignment(assignmentId, {
        assignment_date: updates.assignment_date,
        end_date: updates.end_date,
        operator_name: updates.operator_name,
        company_name: updates.company_name,
        activity: updates.activity,
      });

      toast({
        title: 'Exito',
        description: 'Asignacion de operador actualizada correctamente',
      });

      await fetchAssignments();
    } catch (error) {
      console.error('Error updating rental machinery assignment:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la asignacion de operador',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const deleteAssignment = async (id: string) => {
    try {
      const assignmentId = Number(id);
      if (!Number.isFinite(assignmentId)) {
        throw new Error('ID de asignacion invalido');
      }

      await deleteRentalMachineryAssignment(assignmentId);

      toast({
        title: 'Exito',
        description: 'Asignacion de operador eliminada correctamente',
      });

      await fetchAssignments();
    } catch (error) {
      console.error('Error deleting rental machinery assignment:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la asignacion de operador',
        variant: 'destructive',
      });
      throw error;
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchAssignments();
    }
  }, [rentalMachineryId, date, workId, user?.id]);

  return {
    assignments,
    loading,
    addAssignment,
    updateAssignment,
    deleteAssignment,
    refetch: fetchAssignments,
  };
};
