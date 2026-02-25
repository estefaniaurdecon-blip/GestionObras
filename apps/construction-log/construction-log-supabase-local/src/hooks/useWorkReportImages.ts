import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  analyzeWorkImage as analyzeWorkImageApi,
  createWorkReportAttachment,
  deleteWorkReportAttachment,
  listWorkReportAttachments,
  updateWorkReportAttachment,
} from '@/integrations/api/client';

export interface WorkReportImage {
  id: string;
  work_report_id: string;
  image_url: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const isDataUrl = (str: string): boolean => str?.startsWith('data:image/') || false;

const isStorageUrl = (str: string): boolean =>
  str?.includes('/static/work-report-images/') || false;

const base64ToBlob = (base64: string): Blob => {
  const [header, data] = base64.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(data || '');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

const extensionFromMime = (mime: string | undefined): string => {
  if (!mime) return 'jpg';
  const value = mime.split('/')[1]?.toLowerCase() || 'jpg';
  return value === 'jpeg' ? 'jpg' : value;
};

export const useWorkReportImages = (workReportId: string | null) => {
  const [images, setImages] = useState<WorkReportImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchImages = useCallback(async () => {
    if (!workReportId) {
      setImages([]);
      return;
    }

    try {
      setIsLoading(true);
      const data = await listWorkReportAttachments(workReportId);
      setImages(data);
    } catch (error: unknown) {
      console.error('Error fetching work report images:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las imagenes',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, workReportId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const addImage = async (imageUrl: string, description: string | null = null) => {
    if (!workReportId) {
      toast({
        title: 'Error',
        description: 'Debe guardar el parte antes de agregar imagenes',
        variant: 'destructive',
      });
      return null;
    }

    if (!user) {
      toast({
        title: 'Error',
        description: 'Usuario no autenticado',
        variant: 'destructive',
      });
      return null;
    }

    if (!isDataUrl(imageUrl) && !isStorageUrl(imageUrl)) {
      toast({
        title: 'Error',
        description: 'Formato de imagen no valido',
        variant: 'destructive',
      });
      return null;
    }

    if (isStorageUrl(imageUrl)) {
      toast({
        title: 'Aviso',
        description: 'La imagen ya esta subida',
      });
      return null;
    }

    try {
      setIsUploading(true);
      const blob = base64ToBlob(imageUrl);
      const ext = extensionFromMime(blob.type);
      const maxOrder = images.length > 0 ? Math.max(...images.map((img) => img.display_order)) : -1;
      const created = await createWorkReportAttachment(workReportId, {
        file: blob,
        description,
        display_order: maxOrder + 1,
        filename: `work-report-${Date.now()}.${ext}`,
      });
      setImages((prev) => [...prev, created]);
      toast({
        title: 'Exito',
        description: 'Imagen agregada correctamente',
      });
      return created;
    } catch (error: unknown) {
      console.error('Error adding image:', error);
      const message = error instanceof Error ? error.message : 'No se pudo agregar la imagen';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const updateDescription = async (imageId: string, description: string) => {
    if (!workReportId) return;
    try {
      const updated = await updateWorkReportAttachment(workReportId, imageId, {
        description,
      });
      setImages((prev) =>
        prev.map((img) => (img.id === imageId ? { ...img, description: updated.description } : img))
      );
      toast({
        title: 'Exito',
        description: 'Descripcion actualizada',
      });
    } catch (error: unknown) {
      console.error('Error updating description:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la descripcion',
        variant: 'destructive',
      });
    }
  };

  const deleteImage = async (imageId: string) => {
    if (!workReportId) return;
    try {
      await deleteWorkReportAttachment(workReportId, imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
      toast({
        title: 'Exito',
        description: 'Imagen eliminada',
      });
    } catch (error: unknown) {
      console.error('Error deleting image:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la imagen',
        variant: 'destructive',
      });
    }
  };

  const analyzeImage = async (imageBase64: string): Promise<string | null> => {
    try {
      const data = await analyzeWorkImageApi({ imageBase64 });
      return data?.description || null;
    } catch (error: unknown) {
      console.error('Error analyzing image:', error);
      toast({
        title: 'Error',
        description: 'No se pudo analizar la imagen con IA',
        variant: 'destructive',
      });
      return null;
    }
  };

  return {
    images,
    isLoading,
    isUploading,
    addImage,
    updateDescription,
    deleteImage,
    analyzeImage,
    refreshImages: fetchImages,
  };
};
