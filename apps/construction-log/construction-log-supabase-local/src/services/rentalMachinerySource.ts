import { listRentalMachinery, type ApiRentalMachinery } from '@/integrations/api/client';

export type RentalPriceUnit = 'dia' | 'hora' | 'mes';

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
  fechaParte: string
): RentalMachine[] => {
  return machines.filter((machine) => machine.obraId === obraId && isActiveForDate(machine, fechaParte));
};

const parsePositiveInt = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parsePriceUnit = (value: string | null | undefined): RentalPriceUnit => {
  switch ((value || '').toLowerCase()) {
    case 'hour':
    case 'hora':
      return 'hora';
    case 'month':
    case 'mes':
      return 'mes';
    default:
      return 'dia';
  }
};

const parsePrice = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const mapApiToRentalMachine = (row: ApiRentalMachinery): RentalMachine => ({
  id: String(row.id),
  obraId: String(row.project_id),
  isRental: Boolean(row.is_rental),
  name: row.name || 'Maquinaria de alquiler',
  description: row.description || undefined,
  provider: row.provider || undefined,
  startDate: row.start_date,
  endDate: row.end_date || null,
  price: parsePrice(row.price),
  priceUnit: parsePriceUnit(row.price_unit),
  status: row.status || 'active',
});

export const getRentalMachinesByWorksite = async (
  obraId: string,
  organizationId?: string | null
): Promise<RentalMachine[]> => {
  const projectId = parsePositiveInt(obraId);
  if (!projectId) return [];

  const tenantId = parsePositiveInt(organizationId ?? null);
  const rows = await listRentalMachinery({
    tenantId: tenantId ?? undefined,
    projectId,
    limit: 500,
  });

  return rows.map(mapApiToRentalMachine);
};
