import type { Database } from '@/integrations/supabase/types';

type WorkRentalMachineryRow = Database['public']['Tables']['work_rental_machinery']['Row'];

export type RentalPriceUnit = 'día' | 'hora' | 'mes';

export type RentalMachineStatus = 'active' | 'inactive' | string;

export interface RentalMachine {
  id: string;
  obraId: string;
  isRental: boolean;
  name: string;
  description?: string;
  provider?: string;
  startDate: string;
  endDate: string | null;
  price: number | null;
  priceUnit: RentalPriceUnit;
  status: RentalMachineStatus;
}

export interface RentalMachinesResult {
  obraId: string;
  fechaParte: string;
  items: RentalMachine[];
}

const toIsoDate = (value: string | number | Date): string => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const normalizeDate = (date: string | number | Date): string => toIsoDate(date);

export const isActiveForDate = (machine: RentalMachine, fechaParte: string): boolean => {
  if (!machine.isRental) return false;
  if (machine.status !== 'active') return false;

  const target = normalizeDate(fechaParte);
  const start = normalizeDate(machine.startDate);
  if (!target || !start) return false;
  if (start > target) return false;

  if (!machine.endDate) return true;
  const end = normalizeDate(machine.endDate);
  if (!end) return true;
  return end >= target;
};

export const filterActiveMachines = (
  machines: RentalMachine[],
  obraId: string,
  fechaParte: string,
): RentalMachine[] => {
  return machines.filter((machine) => machine.obraId === obraId && isActiveForDate(machine, fechaParte));
};

const mapRowToRentalMachine = (row: WorkRentalMachineryRow): RentalMachine => ({
  id: row.id,
  obraId: row.work_id,
  isRental: true,
  name: row.type || row.machine_number || 'Maquinaria de alquiler',
  description: row.machine_number || undefined,
  provider: row.provider || undefined,
  startDate: row.delivery_date,
  endDate: row.removal_date,
  price: typeof row.daily_rate === 'number' ? row.daily_rate : null,
  priceUnit: 'día',
  status: (row as unknown as { status?: string }).status ?? 'active',
});

export const getRentalMachinesByWorksite = async (
  obraId: string,
  organizationId?: string | null,
): Promise<RentalMachine[]> => {
  if (!obraId) return [];

  let query = supabase
    .from('work_rental_machinery')
    .select('*')
    .eq('work_id', obraId)
    .order('delivery_date', { ascending: false });

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(mapRowToRentalMachine);
};
