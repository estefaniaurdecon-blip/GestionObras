import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// Almacenamiento seguro con soporte para valores grandes (chunked)
// Evita QuotaExceededError en localStorage y límites de Preferences
const isNativePlatform = Capacitor.isNativePlatform();
const CHUNK_SIZE = 100_000; // ~100KB por chunk para ser conservador
const CHUNKED_FLAG = '__chunked';
const CHUNK_COUNT = '__chunk_count';
const CHUNK_PREFIX = '__chunk_';

// Detectar si estamos en Electron
const isElectron = () => {
  const ua = window.navigator.userAgent || '';
  return (window as any).electronAPI !== undefined || 
         ua.toLowerCase().includes('electron') ||
         (window as any).process?.type === 'renderer';
};

// Sanitizar strings para asegurar UTF-8 válido
// Elimina caracteres que causan problemas de encoding
function sanitizeForStorage(value: string): string {
  if (!value) return value;
  
  try {
    // Primero intentar decodificar como UTF-8 y re-encodificar
    // Esto elimina secuencias inválidas
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const encoded = encoder.encode(value);
    const decoded = decoder.decode(encoded);
    
    // También eliminar caracteres de control y no imprimibles problemáticos
    // Mantener caracteres españoles válidos (ñ, á, é, í, ó, ú, etc.)
    return decoded.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  } catch {
    // Si falla, hacer una limpieza más agresiva
    return value.replace(/[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F]/g, '');
  }
}

// Validar que un string es JSON válido y sanitizarlo
function sanitizeJsonValue(value: string): string {
  if (!value) return value;
  
  try {
    // Intentar parsear como JSON
    const parsed = JSON.parse(value);
    // Re-serializar para asegurar encoding correcto
    return JSON.stringify(parsed);
  } catch {
    // Si no es JSON válido, solo sanitizar el string
    return sanitizeForStorage(value);
  }
}

async function rawGet(key: string): Promise<string | null> {
  if (isNativePlatform) {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  }
  return localStorage.getItem(key);
}

async function rawSet(key: string, value: string): Promise<void> {
  // Sanitizar valor antes de guardar (especialmente importante en Electron)
  const sanitizedValue = isElectron() ? sanitizeJsonValue(value) : value;
  
  if (isNativePlatform) {
    await Preferences.set({ key, value: sanitizedValue });
  } else {
    localStorage.setItem(key, sanitizedValue);
  }
}

async function rawRemove(key: string): Promise<void> {
  if (isNativePlatform) {
    await Preferences.remove({ key });
  } else {
    localStorage.removeItem(key);
  }
}

async function setChunked(key: string, value: string) {
  // Primero limpiar restos previos
  await removeChunked(key);

  // Sanitizar el valor completo antes de chunkearlo
  const sanitizedValue = isElectron() ? sanitizeJsonValue(value) : value;

  const chunks: string[] = [];
  for (let i = 0; i < sanitizedValue.length; i += CHUNK_SIZE) {
    chunks.push(sanitizedValue.slice(i, i + CHUNK_SIZE));
  }

  await rawSet(key + CHUNKED_FLAG, '1');
  await rawSet(key + CHUNK_COUNT, String(chunks.length));
  for (let i = 0; i < chunks.length; i++) {
    await rawSet(key + CHUNK_PREFIX + i, chunks[i]);
  }
}

async function getChunked(key: string): Promise<string | null> {
  const isChunked = await rawGet(key + CHUNKED_FLAG);
  if (!isChunked) return null;
  const countStr = await rawGet(key + CHUNK_COUNT);
  const count = Number(countStr || 0);
  if (!count || Number.isNaN(count)) return null;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = await rawGet(key + CHUNK_PREFIX + i);
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join('');
}

async function removeChunked(key: string) {
  const countStr = await rawGet(key + CHUNK_COUNT);
  const count = Number(countStr || 0);
  if (count && !Number.isNaN(count)) {
    for (let i = 0; i < count; i++) {
      await rawRemove(key + CHUNK_PREFIX + i);
    }
  }
  await rawRemove(key + CHUNK_COUNT);
  await rawRemove(key + CHUNKED_FLAG);
}

export const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      // Si está guardado en chunks, reconstruir
      const chunkedValue = await getChunked(key);
      if (chunkedValue !== null) {
        // Sanitizar al leer en Electron
        const result = isElectron() ? sanitizeJsonValue(chunkedValue) : chunkedValue;
        console.log(`[Storage] Read chunked key: ${key}, length: ${result?.length || 0}`);
        return result;
      }

      // Si no, leer normalmente
      const value = await rawGet(key);
      // Sanitizar al leer en Electron
      const result = value && isElectron() ? sanitizeJsonValue(value) : value;
      if (key.includes('ai_plan')) {
        console.log(`[Storage] Read key: ${key}, length: ${result?.length || 0}, hasValue: ${!!result}`);
      }
      return result;
    } catch (error) {
      console.error(`[Storage] Error reading key ${key}:`, error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (key.includes('ai_plan')) {
        console.log(`[Storage] Writing key: ${key}, length: ${value?.length || 0}`);
      }
      
      // Prevenir tamaños grandes en una sola clave
      if (value.length > CHUNK_SIZE) {
        await setChunked(key, value);
        return;
      }
      await rawSet(key, value);
      
      if (key.includes('ai_plan')) {
        console.log(`[Storage] Successfully wrote key: ${key}`);
      }
    } catch (err: any) {
      console.error(`[Storage] Error writing key ${key}:`, err);
      // Fallback automático a chunked si hay QuotaExceededError u otro error de tamaño
      try {
        await setChunked(key, value);
      } catch (chunkErr) {
        // Como último recurso, limpiar clave principal para no dejar estado inconsistente
        await this.removeItem(key);
        throw err;
      }
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await removeChunked(key);
      await rawRemove(key);
    } catch (error) {
      console.error(`[Storage] Error removing key ${key}:`, error);
    }
  },

  async clear(): Promise<void> {
    if (isNativePlatform) {
      await Preferences.clear();
    } else {
      localStorage.clear();
    }
  }
};

// Función para limpiar todo el storage de datos corruptos (llamar en inicio de Electron)
export async function cleanCorruptedStorage(): Promise<void> {
  if (!isElectron()) return;
  
  console.log('[Storage] Cleaning corrupted data in Electron...');
  
  try {
    // Obtener todas las claves de localStorage
    const keysToCheck = Object.keys(localStorage).filter(key => 
      key.includes('supabase') || key.includes('sb-')
    );
    
    for (const key of keysToCheck) {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          // Intentar parsear y re-serializar para validar
          const sanitized = sanitizeJsonValue(value);
          if (sanitized !== value) {
            console.log(`[Storage] Sanitized key: ${key}`);
            localStorage.setItem(key, sanitized);
          }
        }
      } catch (error) {
        console.warn(`[Storage] Removing corrupted key: ${key}`);
        localStorage.removeItem(key);
      }
    }
    
    console.log('[Storage] Cleanup complete');
  } catch (error) {
    console.error('[Storage] Error during cleanup:', error);
  }
}
