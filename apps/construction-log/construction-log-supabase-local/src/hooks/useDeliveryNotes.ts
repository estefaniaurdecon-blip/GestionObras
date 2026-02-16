import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { Json } from '@/integrations/supabase/types';

export interface ProcessedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price?: number;
  total_price?: number;
  item_type: 'material' | 'tool' | 'machinery';
  category?: string;
  is_immediate_consumption: boolean;
  ai_confidence?: number;
  serial_number?: string;
  brand?: string;
  model?: string;
  user_corrected?: boolean;
}

export interface DeliveryNote {
  id: string;
  supplier: string;
  delivery_note_number?: string;
  delivery_date: string;
  status: 'pending' | 'validated' | 'rejected';
  processed_items: ProcessedItem[];
  raw_ocr_data?: Json;
  ai_confidence?: number;
  work_id: string;
  organization_id: string;
  created_at: string;
  notes?: string;
}

// Helper to safely parse processed items from JSON
const parseProcessedItems = (items: Json | null): ProcessedItem[] => {
  if (!items) return [];
  if (!Array.isArray(items)) return [];
  
  return items.map((item: any) => ({
    id: item.id || crypto.randomUUID(),
    name: item.name || '',
    quantity: Number(item.quantity) || 0,
    unit: item.unit || 'ud',
    unit_price: item.unit_price ? Number(item.unit_price) : undefined,
    total_price: item.total_price ? Number(item.total_price) : undefined,
    item_type: item.item_type || 'material',
    category: item.category,
    is_immediate_consumption: Boolean(item.is_immediate_consumption),
    ai_confidence: item.ai_confidence ? Number(item.ai_confidence) : undefined,
    serial_number: item.serial_number,
    brand: item.brand,
    model: item.model,
    user_corrected: Boolean(item.user_corrected),
  }));
};

export const useDeliveryNotes = (workId?: string) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { userProfile } = useUserPermissions();
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: pendingNotes, isLoading: isLoadingPending } = useQuery({
    queryKey: ['pending-delivery-notes', workId],
    queryFn: async () => {
      let query = supabase
        .from('pending_delivery_notes')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (workId) {
        query = query.eq('work_id', workId);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []).map(note => ({
        id: note.id,
        supplier: note.supplier,
        delivery_note_number: note.delivery_note_number,
        delivery_date: note.delivery_date,
        status: note.status as 'pending' | 'validated' | 'rejected',
        processed_items: parseProcessedItems(note.processed_items as Json),
        raw_ocr_data: note.raw_ocr_data,
        ai_confidence: note.ai_confidence,
        work_id: note.work_id,
        organization_id: note.organization_id,
        created_at: note.created_at,
        notes: note.notes,
      })) as DeliveryNote[];
    },
    enabled: !!userProfile?.organization_id,
  });

  const { data: validatedNotes, isLoading: isLoadingValidated } = useQuery({
    queryKey: ['validated-delivery-notes', workId],
    queryFn: async () => {
      let query = supabase
        .from('pending_delivery_notes')
        .select('*')
        .eq('status', 'validated')
        .order('validated_at', { ascending: false })
        .limit(50);

      if (workId) {
        query = query.eq('work_id', workId);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []).map(note => ({
        id: note.id,
        supplier: note.supplier,
        delivery_note_number: note.delivery_note_number,
        delivery_date: note.delivery_date,
        status: note.status as 'pending' | 'validated' | 'rejected',
        processed_items: parseProcessedItems(note.processed_items as Json),
        raw_ocr_data: note.raw_ocr_data,
        ai_confidence: note.ai_confidence,
        work_id: note.work_id,
        organization_id: note.organization_id,
        created_at: note.created_at,
        notes: note.notes,
      })) as DeliveryNote[];
    },
    enabled: !!userProfile?.organization_id,
  });

  const validateNoteMutation = useMutation({
    mutationFn: async ({ 
      noteId, 
      items, 
      workId 
    }: { 
      noteId: string; 
      items: ProcessedItem[]; 
      workId: string;
    }) => {
      setIsProcessing(true);
      const userId = user?.id;
      const organizationId = userProfile?.organization_id;

      if (!userId || !organizationId) {
        throw new Error('Usuario no autenticado');
      }

      // Get delivery note info
      const { data: noteData, error: noteError } = await supabase
        .from('pending_delivery_notes')
        .select('supplier, delivery_note_number')
        .eq('id', noteId)
        .single();

      if (noteError) throw noteError;

      // Process each item
      for (const item of items) {
        // 1. Create or update inventory item
        const inventoryData = {
          work_id: workId,
          organization_id: organizationId,
          name: item.name,
          item_type: item.item_type,
          category: item.category,
          quantity: item.is_immediate_consumption ? 0 : item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total_price: item.total_price,
          is_immediate_consumption: item.is_immediate_consumption,
          last_supplier: noteData.supplier,
          delivery_note_number: noteData.delivery_note_number,
          last_entry_date: new Date().toISOString().split('T')[0],
          source: 'ai',
          ai_confidence: item.ai_confidence,
          serial_number: item.serial_number,
          brand: item.brand,
          model: item.model,
        };

        const { data: inventoryItem, error: invError } = await supabase
          .from('work_inventory')
          .insert(inventoryData)
          .select('id')
          .single();

        if (invError) throw invError;

        // 2. Create entry movement
        const entryMovement = {
          organization_id: organizationId,
          work_id: workId,
          inventory_item_id: inventoryItem.id,
          item_name: item.name,
          item_type: item.item_type,
          item_category: item.category,
          movement_type: 'entry',
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total_price: item.total_price,
          source: 'ai',
          is_immediate_consumption: item.is_immediate_consumption,
          delivery_note_id: noteId,
          delivery_note_number: noteData.delivery_note_number,
          supplier: noteData.supplier,
          created_by: userId,
        };

        const { error: entryError } = await supabase
          .from('inventory_movements')
          .insert(entryMovement);

        if (entryError) throw entryError;

        // 3. If immediate consumption, create automatic exit movement
        if (item.is_immediate_consumption) {
          const exitMovement = {
            organization_id: organizationId,
            work_id: workId,
            inventory_item_id: inventoryItem.id,
            item_name: item.name,
            item_type: item.item_type,
            item_category: item.category,
            movement_type: 'exit',
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            total_price: item.total_price,
            source: 'auto_consumption',
            is_immediate_consumption: true,
            delivery_note_id: noteId,
            delivery_note_number: noteData.delivery_note_number,
            supplier: noteData.supplier,
            created_by: userId,
            notes: 'Consumo automático - Material de ejecución inmediata',
          };

          const { error: exitError } = await supabase
            .from('inventory_movements')
            .insert(exitMovement);

          if (exitError) throw exitError;
        }
      }

      // 4. Mark delivery note as validated - convert items to JSON-compatible format
      const jsonItems = items.map(item => ({
        ...item,
      })) as unknown as Json;

      const { error: updateError } = await supabase
        .from('pending_delivery_notes')
        .update({
          status: 'validated',
          validated_by: userId,
          validated_at: new Date().toISOString(),
          processed_items: jsonItems,
        })
        .eq('id', noteId);

      if (updateError) throw updateError;

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['validated-delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['work-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      toast({
        title: 'Albarán validado',
        description: 'Los items han sido añadidos al inventario correctamente.',
      });
      setIsProcessing(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error al validar albarán',
        description: error.message,
        variant: 'destructive',
      });
      setIsProcessing(false);
    },
  });

  const rejectNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const userId = user?.id;
      if (!userId) throw new Error('Usuario no autenticado');

      const { error } = await supabase
        .from('pending_delivery_notes')
        .update({
          status: 'rejected',
          validated_by: userId,
          validated_at: new Date().toISOString(),
        })
        .eq('id', noteId);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-delivery-notes'] });
      toast({
        title: 'Albarán rechazado',
        description: 'El albarán ha sido marcado como rechazado.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error al rechazar albarán',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    pendingNotes,
    validatedNotes,
    isLoading: isLoadingPending || isLoadingValidated,
    isProcessing,
    validateNote: validateNoteMutation.mutate,
    rejectNote: rejectNoteMutation.mutate,
  };
};
