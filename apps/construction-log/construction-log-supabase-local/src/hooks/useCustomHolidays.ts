import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOrganization } from '@/hooks/useOrganization';

export interface CustomHoliday {
  id: string;
  organization_id: string;
  date: string;
  name: string;
  region: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const useCustomHolidays = () => {
  const { organization } = useOrganization();
  const [holidays, setHolidays] = useState<CustomHoliday[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHolidays = async () => {
    if (!organization?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('custom_holidays')
        .select('*')
        .eq('organization_id', organization.id)
        .order('date', { ascending: true });

      if (error) throw error;
      setHolidays(data || []);
    } catch (error: any) {
      console.error('Error fetching custom holidays:', error);
      toast.error('Error al cargar los festivos');
    } finally {
      setLoading(false);
    }
  };

  const addHoliday = async (holidayData: { date: string; name: string; region?: string }) => {
    if (!organization?.id) {
      toast.error('Debe estar autenticado');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('custom_holidays')
        .insert({
          ...holidayData,
          organization_id: organization.id,
        })
        .select()
        .single();

      if (error) throw error;

      setHolidays(prev => [...prev, data].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      ));
      toast.success('Festivo añadido correctamente');
      return data;
    } catch (error: any) {
      console.error('Error adding holiday:', error);
      toast.error('Error al añadir el festivo');
      throw error;
    }
  };

  const updateHoliday = async (id: string, updates: Partial<CustomHoliday>) => {
    try {
      const { data, error } = await supabase
        .from('custom_holidays')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setHolidays(prev => prev.map(h => h.id === id ? data : h).sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      ));
      toast.success('Festivo actualizado correctamente');
      return data;
    } catch (error: any) {
      console.error('Error updating holiday:', error);
      toast.error('Error al actualizar el festivo');
      throw error;
    }
  };

  const deleteHoliday = async (id: string) => {
    try {
      const { error } = await supabase
        .from('custom_holidays')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setHolidays(prev => prev.filter(h => h.id !== id));
      toast.success('Festivo eliminado correctamente');
    } catch (error: any) {
      console.error('Error deleting holiday:', error);
      toast.error('Error al eliminar el festivo');
      throw error;
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, [organization?.id]);

  return {
    holidays,
    loading,
    addHoliday,
    updateHoliday,
    deleteHoliday,
    refetch: fetchHolidays,
  };
};
