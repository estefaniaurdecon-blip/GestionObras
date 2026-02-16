import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';

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

export const useInventoryMovements = (workId?: string) => {
  const { userProfile } = useUserPermissions();

  const { data: movements, isLoading: isLoadingMovements } = useQuery({
    queryKey: ['inventory-movements', workId],
    queryFn: async () => {
      let query = supabase
        .from('inventory_movements')
        .select('*')
        .order('created_at', { ascending: false });

      if (workId) {
        query = query.eq('work_id', workId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as InventoryMovement[];
    },
    enabled: !!userProfile?.organization_id,
  });

  const { data: kpis, isLoading: isLoadingKPIs } = useQuery({
    queryKey: ['inventory-kpis', workId],
    queryFn: async () => {
      // Get inventory items
      let inventoryQuery = supabase
        .from('work_inventory')
        .select('*');

      if (workId) {
        inventoryQuery = inventoryQuery.eq('work_id', workId);
      }

      const { data: inventoryData, error: invError } = await inventoryQuery;
      if (invError) throw invError;

      // Get pending delivery notes count
      let pendingQuery = supabase
        .from('pending_delivery_notes')
        .select('id', { count: 'exact' })
        .eq('status', 'pending');

      if (workId) {
        pendingQuery = pendingQuery.eq('work_id', workId);
      }

      const { count: pendingCount, error: pendingError } = await pendingQuery;
      if (pendingError) throw pendingError;

      // Get recent movements for direct consumption tracking
      let movementsQuery = supabase
        .from('inventory_movements')
        .select('*')
        .eq('is_immediate_consumption', true)
        .order('created_at', { ascending: false })
        .limit(100);

      if (workId) {
        movementsQuery = movementsQuery.eq('work_id', workId);
      }

      const { data: directConsumptionData, error: dcError } = await movementsQuery;
      if (dcError) throw dcError;

      // Calculate KPIs
      const stockItems = (inventoryData || []).filter(item => !item.is_immediate_consumption);
      const totalStockValue = stockItems.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);

      const directConsumptionValue = (directConsumptionData || [])
        .filter(m => m.movement_type === 'entry')
        .reduce((sum, m) => sum + (Number(m.total_price) || 0), 0);

      const materialItems = (inventoryData || []).filter(item => item.item_type === 'material');
      const toolItems = (inventoryData || []).filter(item => item.item_type === 'tool');
      const machineryItems = (inventoryData || []).filter(item => item.item_type === 'machinery');

      return {
        totalStockValue,
        directConsumptionValue,
        totalMaterialItems: materialItems.length,
        totalToolItems: toolItems.length,
        totalMachineryItems: machineryItems.length,
        pendingDeliveryNotes: pendingCount || 0,
        recentMovements: (directConsumptionData || []).slice(0, 10) as InventoryMovement[],
      } as InventoryKPIs;
    },
    enabled: !!userProfile?.organization_id,
  });

  return {
    movements,
    kpis,
    isLoading: isLoadingMovements || isLoadingKPIs,
  };
};
