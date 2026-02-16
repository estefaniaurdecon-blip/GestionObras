import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Compression function similar to useRepasoImages
const compressImage = async (base64: string, maxWidth = 1200, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = base64;
  });
};

export const usePostventaImages = () => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (
    base64Data: string,
    postventaId: string,
    imageType: 'before' | 'after'
  ): Promise<string | null> => {
    if (!user) {
      toast.error('Usuario no autenticado');
      return null;
    }

    try {
      // Compress image before upload
      const compressed = await compressImage(base64Data);
      
      // Convert base64 to blob
      const base64Response = await fetch(compressed);
      const blob = await base64Response.blob();
      
      // Generate unique filename
      const fileName = `${user.id}/postventas/${postventaId}/${imageType}_${Date.now()}.jpg`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('work-report-images')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('work-report-images')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error: any) {
      console.error('Error uploading postventa image:', error);
      toast.error('Error al subir imagen');
      return null;
    }
  };

  const uploadBothImages = async (
    beforeBase64: string | undefined,
    afterBase64: string | undefined,
    postventaId: string
  ): Promise<{ before_image?: string; after_image?: string }> => {
    setUploading(true);
    const result: { before_image?: string; after_image?: string } = {};

    try {
      if (beforeBase64) {
        const beforeUrl = await uploadImage(beforeBase64, postventaId, 'before');
        if (beforeUrl) result.before_image = beforeUrl;
      }

      if (afterBase64) {
        const afterUrl = await uploadImage(afterBase64, postventaId, 'after');
        if (afterUrl) result.after_image = afterUrl;
      }
    } finally {
      setUploading(false);
    }

    return result;
  };

  // Check if URL is a data URL (base64)
  const isDataUrl = (url: string): boolean => {
    return url?.startsWith('data:') || false;
  };

  // Check if URL is a storage URL
  const isStorageUrl = (url: string): boolean => {
    return url?.includes('supabase') || false;
  };

  return {
    uploading,
    uploadImage,
    uploadBothImages,
    isDataUrl,
    isStorageUrl,
  };
};
