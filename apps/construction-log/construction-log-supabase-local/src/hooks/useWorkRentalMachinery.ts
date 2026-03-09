import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/hooks/useOrganization';
import { calculateWorkingDays } from '@/utils/workingDaysCalculator';
import { useCustomHolidays } from '@/hooks/useCustomHolidays';
import {
  createRentalMachinery,
  deleteRentalMachinery,
  listRentalMachinery,
  type ApiRentalMachinery,
  updateRentalMachinery,
} from '@/integrations/api/client';

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

const parseRentalPrice = (value: number | string | null | undefined): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toProjectId = (workId: string | null): number | null => {
  if (!workId) return null;
  const parsed = Number(workId);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapApiMachinery = (item: ApiRentalMachinery): WorkRentalMachinery => ({
  id: String(item.id),
  work_id: String(item.project_id),
  organization_id: String(item.tenant_id),
  type: item.name || '',
  provider: item.provider || '',
  machine_number: item.machine_number || String(item.id),
  delivery_date: item.start_date,
  removal_date: item.end_date || null,
  daily_rate: parseRentalPrice(item.price),
  notes: item.notes ?? item.description ?? null,
  image: item.image_url ?? null,
  created_by:
    item.created_by_id !== undefined && item.created_by_id !== null
      ? String(item.created_by_id)
      : null,
  created_at: item.created_at,
  updated_at: item.updated_at,
});

const resolveRentalStatus = (removalDate?: string | null): 'active' | 'inactive' => {
  if (!removalDate) return 'active';
  const normalizedRemovalDate = new Date(removalDate);
  const today = new Date();
  normalizedRemovalDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return normalizedRemovalDate < today ? 'inactive' : 'active';
};

export const useWorkRentalMachinery = (workId: string | null) => {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { holidays } = useCustomHolidays();
  const [machinery, setMachinery] = useState<WorkRentalMachinery[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMachinery = async () => {
    const projectId = toProjectId(workId);
    if (!organization?.id || projectId === null) {
      setMachinery([]);
      return;
    }

    setLoading(true);
    try {
      const data = await listRentalMachinery({
        tenantId: organization.id,
        projectId,
        limit: 500,
      });
      setMachinery((data || []).map(mapApiMachinery));
    } catch (error: unknown) {
      console.error('Error fetching rental machinery:', error);
      toast.error('Error al cargar la maquinaria de alquiler');
    } finally {
      setLoading(false);
    }
  };

  const addMachinery = async (
    machineryData: Omit<
      WorkRentalMachinery,
      'id' | 'created_at' | 'updated_at' | 'created_by' | 'organization_id'
    >,
  ) => {
    const projectId = toProjectId(machineryData.work_id);
    if (!user?.id || !organization?.id || projectId === null) {
      toast.error('Debe estar autenticado');
      return;
    }

    try {
      const created = await createRentalMachinery(
        {
          project_id: projectId,
          is_rental: true,
          name: machineryData.type,
          machine_number: machineryData.machine_number || null,
          description: machineryData.notes || null,
          notes: machineryData.notes || null,
          image_url: machineryData.image || null,
          provider: machineryData.provider || null,
          start_date: machineryData.delivery_date,
          end_date: machineryData.removal_date || null,
          price: machineryData.daily_rate || 0,
          price_unit: 'day',
          status: resolveRentalStatus(machineryData.removal_date),
        },
        organization.id,
      );

      const normalized = mapApiMachinery(created);
      setMachinery((prev) => [normalized, ...prev]);
      toast.success('Maquinaria anadida correctamente');
      return normalized;
    } catch (error: unknown) {
      console.error('Error adding rental machinery:', error);
      toast.error('Error al anadir la maquinaria');
      throw error;
    }
  };

  const updateMachinery = async (id: string, updates: Partial<WorkRentalMachinery>) => {
    const machineryId = Number(id);
    if (!Number.isFinite(machineryId)) {
      toast.error('ID de maquinaria invalido');
      return;
    }

    try {
      const payload: {
        project_id?: number;
        name?: string;
        machine_number?: string | null;
        provider?: string | null;
        start_date?: string;
        end_date?: string | null;
        price?: number;
        notes?: string | null;
        description?: string | null;
        image_url?: string | null;
        status?: 'active' | 'inactive' | 'archived';
      } = {};

      if (updates.work_id !== undefined) {
        const nextProjectId = toProjectId(updates.work_id);
        if (nextProjectId === null) {
          throw new Error('ID de obra invalido');
        }
        payload.project_id = nextProjectId;
      }
      if (updates.type !== undefined) payload.name = updates.type;
      if (updates.machine_number !== undefined) payload.machine_number = updates.machine_number || null;
      if (updates.provider !== undefined) payload.provider = updates.provider || null;
      if (updates.delivery_date !== undefined) payload.start_date = updates.delivery_date;
      if (updates.removal_date !== undefined) payload.end_date = updates.removal_date || null;
      if (updates.daily_rate !== undefined) payload.price = updates.daily_rate;
      if (updates.notes !== undefined) {
        payload.notes = updates.notes || null;
        payload.description = updates.notes || null;
      }
      if (updates.image !== undefined) payload.image_url = updates.image || null;
      if (updates.removal_date !== undefined) {
        payload.status = resolveRentalStatus(updates.removal_date);
      }

      const updated = await updateRentalMachinery(machineryId, payload, organization?.id);
      const normalized = mapApiMachinery(updated);
      setMachinery((prev) => prev.map((m) => (m.id === id ? normalized : m)));
      toast.success('Maquinaria actualizada correctamente');
      return normalized;
    } catch (error: unknown) {
      console.error('Error updating rental machinery:', error);
      toast.error('Error al actualizar la maquinaria');
      throw error;
    }
  };

  const deleteMachinery = async (id: string) => {
    const machineryId = Number(id);
    if (!Number.isFinite(machineryId)) {
      toast.error('ID de maquinaria invalido');
      return;
    }

    try {
      await deleteRentalMachinery(machineryId, organization?.id);
      setMachinery((prev) => prev.filter((m) => m.id !== id));
      toast.success('Maquinaria eliminada correctamente');
    } catch (error: unknown) {
      console.error('Error deleting rental machinery:', error);
      toast.error('Error al eliminar la maquinaria');
      throw error;
    }
  };

  const calculateDays = (deliveryDate: string, removalDate: string | null): number => {
    const start = new Date(deliveryDate);
    const end = removalDate ? new Date(removalDate) : new Date();
    const customHolidayDates = holidays.map((h) => h.date);
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
