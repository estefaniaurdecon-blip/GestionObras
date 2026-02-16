import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding, WriteFileResult } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const isNative = () => Capacitor.isNativePlatform?.() === true;

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function textToBase64(text: string): Promise<string> {
  // UTF-8 safe base64
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

export async function saveBase64File(fileName: string, base64Data: string, mime?: string): Promise<WriteFileResult> {
  try {
    // Sanitizar el nombre del archivo para evitar problemas en Android
    const sanitizedFileName = fileName.replace(/[^a-z0-9._-]/gi, '_');
    
    console.log('Intentando guardar archivo:', sanitizedFileName);
    
    const result = await Filesystem.writeFile({
      path: sanitizedFileName,
      data: base64Data,
      directory: Directory.Documents, // Cambiar a Documents que es más confiable en Android
      recursive: true,
    });
    
    console.log('Archivo guardado exitosamente en:', result.uri);
    
    // Mostrar diálogo para compartir/abrir el archivo
    try {
      // Obtener URI compatible con compartir (content://)
      let shareUri = result.uri;
      try {
        const content = await Filesystem.getUri({
          path: sanitizedFileName,
          directory: Directory.Documents,
        });
        if (content?.uri) shareUri = content.uri;
      } catch (getUriErr) {
        console.log('No se pudo obtener content URI, usando file URI:', getUriErr);
      }

      await Share.share({
        title: 'Archivo guardado',
        text: `El archivo ${sanitizedFileName} se ha guardado correctamente`,
        // En Android/iOS recientes es más fiable usar "files" que "url"
        files: [shareUri],
        dialogTitle: 'Abrir o compartir archivo',
      });
    } catch (shareError) {
      console.log('Share cancelled or failed:', shareError);
      // No lanzar error si falla compartir, el archivo ya está guardado
    }
    
    return result;
  } catch (error) {
    console.error('Error detallado al guardar archivo:', error);
    throw new Error(`No se pudo guardar el archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`);
  }
}

export async function saveBlobFile(fileName: string, blob: Blob): Promise<WriteFileResult> {
  const base64 = await blobToBase64(blob);
  return saveBase64File(fileName, base64);
}
