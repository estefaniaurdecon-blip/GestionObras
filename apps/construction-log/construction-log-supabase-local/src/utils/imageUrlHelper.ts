/**
 * Convierte una URL firmada de Supabase Storage a URL publica.
 * Mantiene compatibilidad para enlaces legacy ya persistidos.
 */
export const getPublicImageUrl = (originalUrl: string | undefined): string => {
  if (!originalUrl) return '';

  if (originalUrl.startsWith('data:')) {
    return originalUrl;
  }

  if (originalUrl.includes('/storage/v1/object/public/')) {
    return originalUrl;
  }

  if (originalUrl.includes('/storage/v1/object/sign/')) {
    try {
      const signedPathMatch = originalUrl.match(/\/storage\/v1\/object\/sign\/([^?]+)/);
      if (!signedPathMatch) return originalUrl;
      const signedPath = decodeURIComponent(signedPathMatch[1]);
      return `${window.location.origin}/storage/v1/object/public/${signedPath}`;
    } catch (error) {
      console.error('Error convirtiendo URL firmada a publica:', error);
    }
  }

  return originalUrl;
};

export const usePublicImageUrl = (originalUrl: string | undefined): string => {
  return getPublicImageUrl(originalUrl);
};
