import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/api/legacySupabaseRemoved';
import { useOrganization } from './useOrganization';
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

export const useRentalMachineryAssignments = ({ 
  rentalMachineryId, 
  date,
  workId 
}: UseRentalMachineryAssignmentsProps) => {
  const [assignments, setAssignments] = useState<RentalMachineryAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const { organization } = useOrganization();
  const { toast } = useToast();

  const fetchAssignments = async () => {
    if (!organization?.id) return;

    try {
      setLoading(true);
      let query = supabase
        .from('work_rental_machinery_assignments')
        .select('*')
        .eq('organization_id', organization.id);

      if (rentalMachineryId) {
        query = query.eq('rental_machinery_id', rentalMachineryId);
      }

      if (date) {
        query = query.eq('assignment_date', date);
      }

      if (workId) {
        query = query.eq('work_id', workId);
      }

      const { data, error } = await query.order('assignment_date', { ascending: false });

      if (error) throw error;
      setAssignments(data || []);
    } catch (error) {
      console.error('Error fetching rental machinery assignments:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las asignaciones de operadores",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addAssignment = async (assignmentData: Omit<RentalMachineryAssignment, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
    if (!organization?.id) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('work_rental_machinery_assignments')
        .insert([{
          ...assignmentData,
          organization_id: organization.id,
          created_by: user?.id
        }])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Asignación de operador creada correctamente"
      });

      await fetchAssignments();
      return data;
    } catch (error: any) {
      console.error('Error adding rental machinery assignment:', error);
      
      if (error.code === '23505') {
        toast({
          title: "Error",
          description: "Ya existe una asignación para esta maquinaria en esta fecha",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: "No se pudo crear la asignación de operador",
          variant: "destructive"
        });
      }
      throw error;
    }
  };

  const updateAssignment = async (id: string, updates: Partial<RentalMachineryAssignment>) => {
    try {
      const { error } = await supabase
        .from('work_rental_machinery_assignments')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Asignación de operador actualizada correctamente"
      });

      await fetchAssignments();
    } catch (error) {
      console.error('Error updating rental machinery assignment:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la asignación de operador",
        variant: "destructive"
      });
      throw error;
    }
  };

  const deleteAssignment = async (id: string) => {
    try {
      const { error } = await supabase
        .from('work_rental_machinery_assignments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Asignación de operador eliminada correctamente"
      });

      await fetchAssignments();
    } catch (error) {
      console.error('Error deleting rental machinery assignment:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la asignación de operador",
        variant: "destructive"
      });
      throw error;
    }
  };

  useEffect(() => {
    if (organization?.id) {
      fetchAssignments();
    }
  }, [rentalMachineryId, date, workId, organization?.id]);

  return {
    assignments,
    loading,
    addAssignment,
    updateAssignment,
    deleteAssignment,
    refetch: fetchAssignments
  };
};

