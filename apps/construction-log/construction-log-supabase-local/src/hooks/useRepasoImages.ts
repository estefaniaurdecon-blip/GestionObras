import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { compressBase64Image } from '@/utils/imageCompression';

interface UploadProgress {
  before: boolean;
  after: boolean;
}

export const useRepasoImages = () => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState<UploadProgress>({ before: false, after: false });

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Convert base64 to blob
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

  // Check if string is a data URL
  const isDataUrl = (str: string): boolean => {
    return str?.startsWith('data:image/') || false;
  };

  // Check if string is already a storage URL
  const isStorageUrl = (str: string): boolean => {
    return str?.includes('supabase.co/storage/') || false;
  };

  // Upload image to storage
  const uploadImage = useCallback(async (
    file: File | string,
    repasoId: string,
    type: 'before' | 'after'
  ): Promise<string | null> => {
    if (!user) {
      toast.error('Usuario no autenticado');
      return null;
    }

    try {
      setUploading(prev => ({ ...prev, [type]: true }));

      let base64: string;
      
      if (typeof file === 'string') {
        if (isStorageUrl(file)) {
          // Already uploaded, return as-is
          return file;
        }
        if (!isDataUrl(file)) {
          // Not a valid image format
          return null;
        }
        base64 = file;
      } else {
        base64 = await fileToBase64(file);
      }

      // Compress image for mobile performance
      const compressed = await compressBase64Image(base64, {
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.85,
        targetSizeKB: 500,
      });

      const blob = base64ToBlob(compressed);
      const ext = (blob.type?.split('/')?.[1] || 'jpeg').toLowerCase();
      const filePath = `${user.id}/repasos/${repasoId}/${type}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('work-report-images')
        .upload(filePath, blob, { 
          upsert: true, 
          contentType: blob.type || 'image/jpeg' 
        });

      if (uploadError) {
        console.error('Error uploading image:', uploadError);
        toast.error(`Error al subir imagen: ${uploadError.message}`);
        return null;
      }

      // Get public URL
      const { data } = supabase.storage
        .from('work-report-images')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error: any) {
      console.error('Error processing image:', error);
      toast.error('Error al procesar la imagen');
      return null;
    } finally {
      setUploading(prev => ({ ...prev, [type]: false }));
    }
  }, [user]);

  // Upload both images and return URLs
  const uploadBothImages = useCallback(async (
    beforeImage: string | undefined,
    afterImage: string | undefined,
    repasoId: string
  ): Promise<{ before_image?: string; after_image?: string }> => {
    const result: { before_image?: string; after_image?: string } = {};

    const uploads = await Promise.all([
      beforeImage ? uploadImage(beforeImage, repasoId, 'before') : Promise.resolve(null),
      afterImage ? uploadImage(afterImage, repasoId, 'after') : Promise.resolve(null),
    ]);

    if (uploads[0]) result.before_image = uploads[0];
    if (uploads[1]) result.after_image = uploads[1];

    return result;
  }, [uploadImage]);

  // Delete image from storage
  const deleteImage = useCallback(async (imageUrl: string): Promise<boolean> => {
    if (!imageUrl || !isStorageUrl(imageUrl)) return true;

    try {
      // Extract file path from URL
      const urlObj = new URL(imageUrl);
      const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/work-report-images\/(.+)/);
      
      if (!pathMatch) return true;

      const filePath = decodeURIComponent(pathMatch[1]);
      
      const { error } = await supabase.storage
        .from('work-report-images')
        .remove([filePath]);

      if (error) {
        console.error('Error deleting image:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting image:', error);
      return false;
    }
  }, []);

  return {
    uploading,
    uploadImage,
    uploadBothImages,
    deleteImage,
    isDataUrl,
    isStorageUrl,
  };
};
