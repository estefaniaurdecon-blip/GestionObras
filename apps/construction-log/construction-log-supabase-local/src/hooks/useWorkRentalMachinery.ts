import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/hooks/useOrganization';
import { calculateWorkingDays } from '@/utils/workingDaysCalculator';
import { useCustomHolidays } from '@/hooks/useCustomHolidays';
import { supabase } from '@/integrations/api/legacySupabaseRemoved';

export interface WorkRentalMachinery {
  id: string;
  work_id: string;
  organization_id: string;
  type: string;
  provider: string;
  machine_number: string;
  delivery_date: string;
  removal_date: string | null;
  daily_rate: number;
  notes: string | null;
  image: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const useWorkRentalMachinery = (workId: string | null) => {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { holidays } = useCustomHolidays();
  const [machinery, setMachinery] = useState<WorkRentalMachinery[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMachinery = async () => {
    if (!workId || !organization?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('work_rental_machinery')
        .select('*')
        .eq('work_id', workId)
        .eq('organization_id', organization.id)
        .order('delivery_date', { ascending: false });

      if (error) throw error;
      setMachinery(data || []);
    } catch (error: any) {
      console.error('Error fetching rental machinery:', error);
      toast.error('Error al cargar la maquinaria de alquiler');
    } finally {
      setLoading(false);
    }
  };

  const addMachinery = async (machineryData: Omit<WorkRentalMachinery, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'organization_id'>) => {
    if (!user?.id || !organization?.id) {
      toast.error('Debe estar autenticado');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('work_rental_machinery')
        .insert({
          ...machineryData,
          organization_id: organization.id,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setMachinery(prev => [data, ...prev]);
      toast.success('Maquinaria añadida correctamente');
      return data;
    } catch (error: any) {
      console.error('Error adding rental machinery:', error);
      toast.error('Error al añadir la maquinaria');
      throw error;
    }
  };

  const updateMachinery = async (id: string, updates: Partial<WorkRentalMachinery>) => {
    try {
      const { data, error } = await supabase
        .from('work_rental_machinery')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setMachinery(prev => prev.map(m => m.id === id ? data : m));
      toast.success('Maquinaria actualizada correctamente');
      return data;
    } catch (error: any) {
      console.error('Error updating rental machinery:', error);
      toast.error('Error al actualizar la maquinaria');
      throw error;
    }
  };

  const deleteMachinery = async (id: string) => {
    try {
      const { error } = await supabase
        .from('work_rental_machinery')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setMachinery(prev => prev.filter(m => m.id !== id));
      toast.success('Maquinaria eliminada correctamente');
    } catch (error: any) {
      console.error('Error deleting rental machinery:', error);
      toast.error('Error al eliminar la maquinaria');
      throw error;
    }
  };

  const calculateDays = (deliveryDate: string, removalDate: string | null): number => {
    const start = new Date(deliveryDate);
    const end = removalDate ? new Date(removalDate) : new Date();
    const customHolidayDates = holidays.map(h => h.date);
    return calculateWorkingDays(start, end, customHolidayDates);
  };

  useEffect(() => {
    fetchMachinery();
  }, [workId, organization?.id]);

  return {
    machinery,
    loading,
    addMachinery,
    updateMachinery,
    deleteMachinery,
    calculateDays,
    refetch: fetchMachinery,
  };
};
