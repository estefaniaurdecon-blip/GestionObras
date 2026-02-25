import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { uploadGenericImage } from '@/integrations/api/client';

const compressImage = async (base64: string, maxWidth = 1200, quality = 0.7): Promise<string> =>
  new Promise((resolve, reject) => {
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
      const compressed = await compressImage(base64Data);
      const blob = base64ToBlob(compressed);
      const uploaded = await uploadGenericImage({
        category: 'postventas',
        entity_id: postventaId,
        image_type: imageType,
        file: blob,
        filename: `${imageType}_${Date.now()}.jpg`,
      });
      return uploaded.url;
    } catch (error: unknown) {
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

  const isDataUrl = (url: string): boolean => url?.startsWith('data:') || false;
  const isStorageUrl = (url: string): boolean => url?.includes('/static/work-report-images/') || false;

  return {
    uploading,
    uploadImage,
    uploadBothImages,
    isDataUrl,
    isStorageUrl,
  };
};
