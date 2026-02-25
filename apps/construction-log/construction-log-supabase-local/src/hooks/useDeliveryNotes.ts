import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  listDeliveryNotes,
  rejectDeliveryNote,
  type DeliveryNoteApi,
  type DeliveryNoteItemPayload,
  validateDeliveryNote,
} from '@/integrations/api/client';

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
  raw_ocr_data?: Record<string, unknown> | unknown[] | null;
  ai_confidence?: number;
  work_id: string;
  organization_id: string;
  created_at: string;
  notes?: string;
}

function parseProcessedItems(items: unknown): ProcessedItem[] {
  if (!Array.isArray(items)) return [];

  return items.map((rawItem) => {
    const item = (rawItem ?? {}) as Record<string, unknown>;
    const itemType = String(item.item_type || 'material');
    const normalizedItemType: ProcessedItem['item_type'] =
      itemType === 'tool' || itemType === 'machinery' ? itemType : 'material';

    return {
      id: String(item.id || crypto.randomUUID()),
      name: String(item.name || ''),
      quantity: Number(item.quantity) || 0,
      unit: String(item.unit || 'ud'),
      unit_price:
        item.unit_price === null || item.unit_price === undefined
          ? undefined
          : Number(item.unit_price),
      total_price:
        item.total_price === null || item.total_price === undefined
          ? undefined
          : Number(item.total_price),
      item_type: normalizedItemType,
      category: item.category ? String(item.category) : undefined,
      is_immediate_consumption: Boolean(item.is_immediate_consumption),
      ai_confidence:
        item.ai_confidence === null || item.ai_confidence === undefined
          ? undefined
          : Number(item.ai_confidence),
      serial_number: item.serial_number ? String(item.serial_number) : undefined,
      brand: item.brand ? String(item.brand) : undefined,
      model: item.model ? String(item.model) : undefined,
      user_corrected: Boolean(item.user_corrected),
    };
  });
}

function mapDeliveryNote(note: DeliveryNoteApi): DeliveryNote {
  return {
    id: note.id,
    supplier: note.supplier,
    delivery_note_number: note.delivery_note_number || undefined,
    delivery_date: note.delivery_date,
    status: note.status,
    processed_items: parseProcessedItems(note.processed_items),
    raw_ocr_data: note.raw_ocr_data,
    ai_confidence:
      note.ai_confidence === null || note.ai_confidence === undefined
        ? undefined
        : Number(note.ai_confidence),
    work_id: note.work_id,
    organization_id: note.organization_id,
    created_at: note.created_at,
    notes: note.notes || undefined,
  };
}

function toApiItems(items: ProcessedItem[]): DeliveryNoteItemPayload[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: Number(item.quantity) || 0,
    unit: item.unit || 'ud',
    unit_price: item.unit_price,
    total_price: item.total_price,
    item_type: item.item_type,
    category: item.category,
    is_immediate_consumption: Boolean(item.is_immediate_consumption),
    ai_confidence: item.ai_confidence,
    serial_number: item.serial_number,
    brand: item.brand,
    model: item.model,
    user_corrected: item.user_corrected,
  }));
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const maybeMessage = (error as { message?: unknown }).message;
  if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
  const maybeDetail = (error as { detail?: unknown }).detail;
  if (typeof maybeDetail === 'string' && maybeDetail.trim()) return maybeDetail;
  return fallback;
}

export const useDeliveryNotes = (workId?: string) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: pendingNotes, isLoading: isLoadingPending } = useQuery({
    queryKey: ['pending-delivery-notes', workId],
    queryFn: async () => {
      const data = await listDeliveryNotes({
        work_id: workId,
        status: 'pending',
      });
      return data.map(mapDeliveryNote) as DeliveryNote[];
    },
    enabled: Boolean(user),
  });

  const { data: validatedNotes, isLoading: isLoadingValidated } = useQuery({
    queryKey: ['validated-delivery-notes', workId],
    queryFn: async () => {
      const data = await listDeliveryNotes({
        work_id: workId,
        status: 'validated',
        limit: 50,
      });
      return data.map(mapDeliveryNote) as DeliveryNote[];
    },
    enabled: Boolean(user),
  });

  const validateNoteMutation = useMutation({
    mutationFn: async ({
      noteId,
      items,
      workId: mutationWorkId,
    }: {
      noteId: string;
      items: ProcessedItem[];
      workId: string;
    }) => {
      setIsProcessing(true);
      if (!mutationWorkId) {
        throw new Error('La obra es obligatoria para validar el albaran.');
      }

      return validateDeliveryNote(noteId, {
        work_id: mutationWorkId,
        items: toApiItems(items),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['validated-delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['work-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      toast({
        title: 'Albaran validado',
        description: 'Los items se anadieron al inventario correctamente.',
      });
      setIsProcessing(false);
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error al validar albaran',
        description: readErrorMessage(error, 'No se pudo validar el albaran.'),
        variant: 'destructive',
      });
      setIsProcessing(false);
    },
  });

  const rejectNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return rejectDeliveryNote(noteId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-delivery-notes'] });
      toast({
        title: 'Albaran rechazado',
        description: 'El albaran se marco como rechazado.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error al rechazar albaran',
        description: readErrorMessage(error, 'No se pudo rechazar el albaran.'),
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
