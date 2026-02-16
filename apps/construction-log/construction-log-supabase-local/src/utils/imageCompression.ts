/**
 * Utilidades para comprimir y optimizar imágenes en dispositivos móviles Android
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  targetSizeKB?: number;
}

/**
 * Comprime una imagen en formato base64 para optimizar su envío
 * Especialmente útil en dispositivos Android con conexiones lentas
 */
export async function compressBase64Image(
  base64: string,
  options: CompressionOptions = {}
): Promise<string> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.85,
    targetSizeKB = 500
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      try {
        // Calcular nuevas dimensiones manteniendo aspect ratio
        let { width, height } = img;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }

        // Crear canvas para redimensionar
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo crear contexto de canvas'));
          return;
        }

        // Mejorar calidad de renderizado
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Dibujar imagen redimensionada
        ctx.drawImage(img, 0, 0, width, height);

        // Comprimir iterativamente hasta alcanzar tamaño objetivo
        let currentQuality = quality;
        let result = canvas.toDataURL('image/jpeg', currentQuality);
        
        // Estimar tamaño en KB (aproximado)
        const estimatedSizeKB = (result.length * 0.75) / 1024;
        
        // Si es muy grande, reducir calidad iterativamente
        if (estimatedSizeKB > targetSizeKB && currentQuality > 0.3) {
          const compressionRatio = targetSizeKB / estimatedSizeKB;
          currentQuality = Math.max(0.3, quality * compressionRatio * 0.9);
          result = canvas.toDataURL('image/jpeg', currentQuality);
        }

        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Error al cargar la imagen'));
    };

    img.src = base64;
  });
}

/**
 * Valida que una cadena base64 sea una imagen válida
 */
export function isValidBase64Image(base64: string): boolean {
  if (!base64) return false;
  
  // Verificar que sea un data URL válido
  const dataUrlPattern = /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i;
  return dataUrlPattern.test(base64);
}

/**
 * Extrae el tipo MIME de una imagen base64
 */
export function getBase64MimeType(base64: string): string | null {
  const match = base64.match(/^data:(image\/[a-z]+);base64,/i);
  return match ? match[1] : null;
}

/**
 * Calcula el tamaño aproximado en KB de una imagen base64
 */
export function estimateBase64SizeKB(base64: string): number {
  // Remover el prefijo data URL
  const base64Data = base64.split(',')[1] || base64;
  // Cada carácter base64 representa 6 bits, y base64 añade ~33% overhead
  return (base64Data.length * 0.75) / 1024;
}

/**
 * Optimiza imagen específicamente para análisis con IA
 * Aumenta contraste y nitidez para mejorar OCR
 */
export async function optimizeForOCR(base64: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo crear contexto'));
          return;
        }

        // Dibujar imagen original
        ctx.drawImage(img, 0, 0);

        // Obtener datos de píxeles
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Aumentar contraste y nitidez
        for (let i = 0; i < data.length; i += 4) {
          // Aumentar contraste
          const factor = 1.3;
          data[i] = Math.min(255, Math.max(0, (data[i] - 128) * factor + 148));
          data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * factor + 148));
          data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * factor + 148));
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Error al cargar imagen'));
    img.src = base64;
  });
}
