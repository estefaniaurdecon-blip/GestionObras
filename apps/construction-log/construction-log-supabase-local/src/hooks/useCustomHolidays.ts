import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  createCustomHoliday,
  deleteCustomHoliday,
  listCustomHolidays,
  updateCustomHoliday,
  type ApiCustomHoliday,
} from '@/integrations/api/client';

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

const mapCustomHoliday = (holiday: ApiCustomHoliday): CustomHoliday => ({
  id: String(holiday.id),
  organization_id: String(holiday.tenant_id),
  date: holiday.date,
  name: holiday.name,
  region: holiday.region ?? null,
  created_by: holiday.created_by_id != null ? String(holiday.created_by_id) : null,
  created_at: holiday.created_at,
  updated_at: holiday.updated_at,
});

export const useCustomHolidays = () => {
  const { user } = useAuth();
  const [holidays, setHolidays] = useState<CustomHoliday[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHolidays = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const data = await listCustomHolidays();
      setHolidays((data || []).map(mapCustomHoliday));
    } catch (error: any) {
      console.error('Error fetching custom holidays:', error);
      toast.error('Error al cargar los festivos');
    } finally {
      setLoading(false);
    }
  };

  const addHoliday = async (holidayData: { date: string; name: string; region?: string }) => {
    if (!user?.id) {
      toast.error('Debe estar autenticado');
      return;
    }

    try {
      const apiHoliday = await createCustomHoliday({
        date: holidayData.date,
        name: holidayData.name,
        region: holidayData.region ?? null,
      });
      const holiday = mapCustomHoliday(apiHoliday);

      setHolidays((prev) =>
        [...prev, holiday].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      );
      toast.success('Festivo anadido correctamente');
      return holiday;
    } catch (error: any) {
      console.error('Error adding holiday:', error);
      toast.error('Error al anadir el festivo');
      throw error;
    }
  };

  const updateHoliday = async (id: string, updates: Partial<CustomHoliday>) => {
    try {
      const numericHolidayId = Number(id);
      if (!Number.isFinite(numericHolidayId)) {
        throw new Error('ID de festivo invalido');
      }

      const apiHoliday = await updateCustomHoliday(numericHolidayId, {
        date: updates.date,
        name: updates.name,
        region: updates.region,
      });
      const holiday = mapCustomHoliday(apiHoliday);

      setHolidays((prev) =>
        prev
          .map((h) => (h.id === id ? holiday : h))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      );
      toast.success('Festivo actualizado correctamente');
      return holiday;
    } catch (error: any) {
      console.error('Error updating holiday:', error);
      toast.error('Error al actualizar el festivo');
      throw error;
    }
  };

  const deleteHoliday = async (id: string) => {
    try {
      const numericHolidayId = Number(id);
      if (!Number.isFinite(numericHolidayId)) {
        throw new Error('ID de festivo invalido');
      }

      await deleteCustomHoliday(numericHolidayId);

      setHolidays((prev) => prev.filter((h) => h.id !== id));
      toast.success('Festivo eliminado correctamente');
    } catch (error: any) {
      console.error('Error deleting holiday:', error);
      toast.error('Error al eliminar el festivo');
      throw error;
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, [user?.id]);

  return {
    holidays,
    loading,
    addHoliday,
    updateHoliday,
    deleteHoliday,
    refetch: fetchHolidays,
  };
};
