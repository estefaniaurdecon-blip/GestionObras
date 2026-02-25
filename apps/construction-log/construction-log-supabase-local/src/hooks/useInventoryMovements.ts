import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  getInventoryKpis,
  listInventoryMovements,
  type InventoryKpisApi,
  type InventoryMovementApi,
} from '@/integrations/api/client';

export interface InventoryMovement {
  id: string;
  item_name: string;
  item_type: string;
  item_category?: string;
  movement_type: 'entry' | 'exit' | 'transfer' | 'adjustment';
  quantity: number;
  unit: string;
  unit_price?: number;
  total_price?: number;
  source: 'ai' | 'manual' | 'auto_consumption';
  is_immediate_consumption: boolean;
  delivery_note_number?: string;
  supplier?: string;
  notes?: string;
  created_at: string;
  created_by?: string;
  work_id: string;
}

export interface InventoryKPIs {
  totalStockValue: number;
  directConsumptionValue: number;
  totalMaterialItems: number;
  totalToolItems: number;
  totalMachineryItems: number;
  pendingDeliveryNotes: number;
  recentMovements: InventoryMovement[];
}

function mapMovement(movement: InventoryMovementApi): InventoryMovement {
  const source = movement.source === 'ai' || movement.source === 'auto_consumption'
    ? movement.source
    : 'manual';

  return {
    id: movement.id,
    item_name: movement.item_name,
    item_type: movement.item_type,
    item_category: movement.item_category || undefined,
    movement_type: movement.movement_type,
    quantity: Number(movement.quantity) || 0,
    unit: movement.unit || 'ud',
    unit_price:
      movement.unit_price === null || movement.unit_price === undefined
        ? undefined
        : Number(movement.unit_price),
    total_price:
      movement.total_price === null || movement.total_price === undefined
        ? undefined
        : Number(movement.total_price),
    source,
    is_immediate_consumption: Boolean(movement.is_immediate_consumption),
    delivery_note_number: movement.delivery_note_number || undefined,
    supplier: movement.supplier || undefined,
    notes: movement.notes || undefined,
    created_at: movement.created_at,
    created_by: movement.created_by || undefined,
    work_id: movement.work_id,
  };
}

function mapKpis(kpis: InventoryKpisApi): InventoryKPIs {
  return {
    totalStockValue: Number(kpis.totalStockValue) || 0,
    directConsumptionValue: Number(kpis.directConsumptionValue) || 0,
    totalMaterialItems: Number(kpis.totalMaterialItems) || 0,
    totalToolItems: Number(kpis.totalToolItems) || 0,
    totalMachineryItems: Number(kpis.totalMachineryItems) || 0,
    pendingDeliveryNotes: Number(kpis.pendingDeliveryNotes) || 0,
    recentMovements: (kpis.recentMovements || []).map(mapMovement),
  };
}

export const useInventoryMovements = (workId?: string) => {
  const { user } = useAuth();

  const { data: movements, isLoading: isLoadingMovements } = useQuery({
    queryKey: ['inventory-movements', workId],
    queryFn: async () => {
      const data = await listInventoryMovements(workId);
      return data.map(mapMovement) as InventoryMovement[];
    },
    enabled: Boolean(user),
  });

  const { data: kpis, isLoading: isLoadingKPIs } = useQuery({
    queryKey: ['inventory-kpis', workId],
    queryFn: async () => {
      const data = await getInventoryKpis(workId);
      return mapKpis(data);
    },
    enabled: Boolean(user),
  });

  return {
    movements,
    kpis,
    isLoading: isLoadingMovements || isLoadingKPIs,
  };
};
