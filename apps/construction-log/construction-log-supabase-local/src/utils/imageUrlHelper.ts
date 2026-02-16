import { supabase } from '@/integrations/supabase/client';

/**
 * Convierte una URL firmada de Supabase Storage a URL pública
 * Esto es necesario porque las URLs firmadas expiran después de 1 hora
 */
export const getPublicImageUrl = (originalUrl: string | undefined): string => {
  if (!originalUrl) return '';
  
  // Si ya es base64, devolverlo directamente
  if (originalUrl.startsWith('data:')) {
    return originalUrl;
  }
  
  // Si ya es una URL pública, devolverla directamente
  if (originalUrl.includes('/storage/v1/object/public/')) {
    return originalUrl;
  }
  
  // Si es una URL firmada antigua, convertir a pública
  if (originalUrl.includes('/storage/v1/object/sign/')) {
    try {
      const urlObj = new URL(originalUrl);
      const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/sign\/([^?]+)/);
      if (pathMatch) {
        const bucketAndPath = decodeURIComponent(pathMatch[1]);
        const [bucket, ...pathParts] = bucketAndPath.split('/');
        const filePath = pathParts.join('/');
        
        const { data } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);
        
        return data.publicUrl;
      }
    } catch (error) {
      console.error('Error convirtiendo URL firmada a pública:', error);
    }
  }
  
  return originalUrl;
};

/**
 * Hook para usar en componentes de React
 */
export const usePublicImageUrl = (originalUrl: string | undefined): string => {
  return getPublicImageUrl(originalUrl);
};
