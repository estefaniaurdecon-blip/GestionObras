import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { compressBase64Image } from '@/utils/imageCompression';
import { deleteGenericImageByUrl, uploadGenericImage } from '@/integrations/api/client';

interface UploadProgress {
  before: boolean;
  after: boolean;
}

export const useRepasoImages = () => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState<UploadProgress>({ before: false, after: false });

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
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

  const isDataUrl = (str: string): boolean => str?.startsWith('data:image/') || false;
  const isStorageUrl = (str: string): boolean => str?.includes('/static/work-report-images/') || false;

  const uploadImage = useCallback(
    async (file: File | string, repasoId: string, type: 'before' | 'after'): Promise<string | null> => {
      if (!user) {
        toast.error('Usuario no autenticado');
        return null;
      }

      try {
        setUploading((prev) => ({ ...prev, [type]: true }));
        let base64: string;

        if (typeof file === 'string') {
          if (isStorageUrl(file)) return file;
          if (!isDataUrl(file)) return null;
          base64 = file;
        } else {
          base64 = await fileToBase64(file);
        }

        const compressed = await compressBase64Image(base64, {
          maxWidth: 1920,
          maxHeight: 1920,
          quality: 0.85,
          targetSizeKB: 500,
        });

        const blob = base64ToBlob(compressed);
        const ext = (blob.type?.split('/')?.[1] || 'jpg').toLowerCase();
        const uploaded = await uploadGenericImage({
          category: 'repasos',
          entity_id: repasoId,
          image_type: type,
          file: blob,
          filename: `${type}_${Date.now()}.${ext}`,
        });
        return uploaded.url;
      } catch (error: unknown) {
        console.error('Error processing image:', error);
        toast.error('Error al procesar la imagen');
        return null;
      } finally {
        setUploading((prev) => ({ ...prev, [type]: false }));
      }
    },
    [user]
  );

  const uploadBothImages = useCallback(
    async (
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
    },
    [uploadImage]
  );

  const deleteImage = useCallback(async (imageUrl: string): Promise<boolean> => {
    if (!imageUrl || !isStorageUrl(imageUrl)) return true;
    try {
      const result = await deleteGenericImageByUrl(imageUrl);
      return result.success;
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
