import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { analyzeWorkImage as analyzeWorkImageApi } from '@/integrations/api/client';

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

// Helper to check if string is a data URL (base64)
const isDataUrl = (str: string): boolean => {
  return str?.startsWith('data:image/') || false;
};

// Helper to check if string is already a storage URL
const isStorageUrl = (str: string): boolean => {
  return str?.includes('supabase.co/storage/') || false;
};

// Convert base64 to blob for upload
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

export const useWorkReportImages = (workReportId: string | null) => {
  const [images, setImages] = useState<WorkReportImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchImages = async () => {
    if (!workReportId) {
      setImages([]);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('work_report_images')
        .select('*')
        .eq('work_report_id', workReportId)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setImages(data || []);
    } catch (error: any) {
      console.error('Error fetching work report images:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las imágenes',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, [workReportId]);

  // Upload image to Supabase Storage and return the public URL
  const uploadImageToStorage = useCallback(async (imageBase64: string): Promise<string | null> => {
    if (!user) {
      console.error('No user for image upload');
      return null;
    }

    // If already a storage URL, return as-is
    if (isStorageUrl(imageBase64)) {
      return imageBase64;
    }

    // If not a data URL, can't upload
    if (!isDataUrl(imageBase64)) {
      console.error('Invalid image format for upload');
      return null;
    }

    try {
      const blob = base64ToBlob(imageBase64);
      const ext = (blob.type?.split('/')?.[1] || 'jpeg').toLowerCase();
      const timestamp = Date.now();
      const filePath = `${user.id}/work-reports/${workReportId}/${timestamp}.${ext}`;

      console.log('Uploading image to storage:', filePath);

      const { error: uploadError } = await supabase.storage
        .from('work-report-images')
        .upload(filePath, blob, {
          upsert: true,
          contentType: blob.type || 'image/jpeg'
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data } = supabase.storage
        .from('work-report-images')
        .getPublicUrl(filePath);

      console.log('Image uploaded successfully:', data.publicUrl);
      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading image to storage:', error);
      return null;
    }
  }, [user, workReportId]);

  const addImage = async (imageUrl: string, description: string | null = null) => {
    if (!workReportId) {
      toast({
        title: 'Error',
        description: 'Debe guardar el parte antes de agregar imágenes',
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

    try {
      setIsUploading(true);

      // Upload to storage if it's a base64 image
      let finalImageUrl = imageUrl;
      if (isDataUrl(imageUrl)) {
        console.log('Uploading base64 image to storage...');
        const storageUrl = await uploadImageToStorage(imageUrl);
        if (!storageUrl) {
          throw new Error('Failed to upload image to storage');
        }
        finalImageUrl = storageUrl;
        console.log('Image uploaded, storage URL:', finalImageUrl);
      }

      const maxOrder = images.length > 0 ? Math.max(...images.map(img => img.display_order)) : -1;
      
      const { data, error } = await supabase
        .from('work_report_images')
        .insert({
          work_report_id: workReportId,
          image_url: finalImageUrl,
          description,
          display_order: maxOrder + 1,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Database insert error:', error);
        throw error;
      }

      setImages(prev => [...prev, data]);
      toast({
        title: 'Éxito',
        description: 'Imagen agregada correctamente',
      });
      return data;
    } catch (error: any) {
      console.error('Error adding image:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo agregar la imagen',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const updateDescription = async (imageId: string, description: string) => {
    try {
      const { error } = await supabase
        .from('work_report_images')
        .update({ description })
        .eq('id', imageId);

      if (error) throw error;

      setImages(prev =>
        prev.map(img => (img.id === imageId ? { ...img, description } : img))
      );
      
      toast({
        title: 'Éxito',
        description: 'Descripción actualizada',
      });
    } catch (error: any) {
      console.error('Error updating description:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la descripción',
        variant: 'destructive',
      });
    }
  };

  const deleteImage = async (imageId: string) => {
    try {
      // Get the image to delete from storage
      const imageToDelete = images.find(img => img.id === imageId);
      
      const { error } = await supabase
        .from('work_report_images')
        .delete()
        .eq('id', imageId);

      if (error) throw error;

      // Also delete from storage if it's a storage URL
      if (imageToDelete && isStorageUrl(imageToDelete.image_url)) {
        try {
          const urlObj = new URL(imageToDelete.image_url);
          const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/work-report-images\/(.+)/);
          
          if (pathMatch) {
            const filePath = decodeURIComponent(pathMatch[1]);
            await supabase.storage
              .from('work-report-images')
              .remove([filePath]);
          }
        } catch (storageError) {
          console.error('Error deleting image from storage:', storageError);
          // Don't throw, the DB record is already deleted
        }
      }

      setImages(prev => prev.filter(img => img.id !== imageId));
      
      toast({
        title: 'Éxito',
        description: 'Imagen eliminada',
      });
    } catch (error: any) {
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
    } catch (error: any) {
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
