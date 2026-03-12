import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// Almacenamiento seguro con soporte para valores grandes (chunked)
// Evita QuotaExceededError en localStorage y limites de Preferences
const isNativePlatform = Capacitor.isNativePlatform();
const CHUNK_SIZE = 100_000; // ~100KB por chunk para ser conservador
const CHUNKED_FLAG = '__chunked';
const CHUNK_COUNT = '__chunk_count';
const CHUNK_PREFIX = '__chunk_';
export const STORAGE_CHANGE_EVENT = 'app-storage-changed';

async function yieldNativeStorageWork(): Promise<void> {
  if (!isNativePlatform) return;

  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

type StorageChangeAction = 'set' | 'remove' | 'clear';

function emitStorageChange(key: string, action: StorageChangeAction) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(STORAGE_CHANGE_EVENT, {
      detail: { key, action },
    }),
  );
}

type WindowWithElectron = Window & {
  electronAPI?: unknown;
  process?: {
    type?: string;
  };
};

// Detectar si estamos en Electron
const isElectron = () => {
  const windowWithElectron = window as WindowWithElectron;
  const ua = window.navigator.userAgent || '';
  return windowWithElectron.electronAPI !== undefined ||
         ua.toLowerCase().includes('electron') ||
         windowWithElectron.process?.type === 'renderer';
};

// Sanitizar strings para asegurar UTF-8 valido
// Elimina caracteres que causan problemas de encoding
function sanitizeForStorage(value: string): string {
  if (!value) return value;

  try {
    // Primero intentar decodificar como UTF-8 y re-encodificar
    // Esto elimina secuencias invalidas
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const encoded = encoder.encode(value);
    const decoded = decoder.decode(encoded);

    // Tambien eliminar caracteres de control y no imprimibles problematicos
    // Mantener caracteres imprimibles y saltos de linea habituales
    return Array.from(decoded)
      .filter((char) => {
        const code = char.charCodeAt(0);
        return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
      })
      .join('');
  } catch {
    // Si falla, hacer una limpieza mas agresiva
    return value.replace(/[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F]/g, '');
  }
}

// Validar que un string es JSON valido y sanitizarlo
function sanitizeJsonValue(value: string): string {
  if (!value) return value;

  try {
    // Intentar parsear como JSON
    const parsed = JSON.parse(value);
    // Re-serializar para asegurar encoding correcto
    return JSON.stringify(parsed);
  } catch {
    // Si no es JSON valido, solo sanitizar el string
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
    if (i < chunks.length - 1) {
      await yieldNativeStorageWork();
    }
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
      if (i < count - 1) {
        await yieldNativeStorageWork();
      }
    }
  }
  await rawRemove(key + CHUNK_COUNT);
  await rawRemove(key + CHUNKED_FLAG);
}

async function hasStoredValue(key: string): Promise<boolean> {
  const directValue = await rawGet(key);
  if (directValue !== null) return true;

  const chunkedFlag = await rawGet(key + CHUNKED_FLAG);
  if (chunkedFlag !== null) return true;

  const chunkCount = await rawGet(key + CHUNK_COUNT);
  return chunkCount !== null;
}

export const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      // Intentar primero la clave directa para evitar varias lecturas nativas
      // por acceso cuando el valor no esta fragmentado.
      const value = await rawGet(key);
      if (value !== null) {
        const directResult = isElectron() ? sanitizeJsonValue(value) : value;
        if (key.includes('ai_plan')) {
          console.log(`[Storage] Read key: ${key}, length: ${directResult?.length || 0}, hasValue: ${!!directResult}`);
        }
        return directResult;
      }

      // Si esta guardado en chunks, reconstruirlo solo cuando no exista valor directo.
      const chunkedValue = await getChunked(key);
      if (chunkedValue !== null) {
        const chunkedResult = isElectron() ? sanitizeJsonValue(chunkedValue) : chunkedValue;
        console.log(`[Storage] Read chunked key: ${key}, length: ${chunkedResult?.length || 0}`);
        return chunkedResult;
      }

      return null;
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

      // Prevenir tamanos grandes en una sola clave
      if (value.length > CHUNK_SIZE) {
        await setChunked(key, value);
        emitStorageChange(key, 'set');
        return;
      }
      await rawSet(key, value);
      emitStorageChange(key, 'set');

      if (key.includes('ai_plan')) {
        console.log(`[Storage] Successfully wrote key: ${key}`);
      }
    } catch (err: unknown) {
      console.error(`[Storage] Error writing key ${key}:`, err);
      // Fallback automatico a chunked si hay QuotaExceededError u otro error de tamano
      try {
        await setChunked(key, value);
        emitStorageChange(key, 'set');
      } catch {
        // Como ultimo recurso, limpiar clave principal para no dejar estado inconsistente
        await this.removeItem(key);
        throw err;
      }
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const exists = await hasStoredValue(key);
      if (!exists) return;

      await removeChunked(key);
      await rawRemove(key);
      emitStorageChange(key, 'remove');
    } catch (error) {
      console.error(`[Storage] Error removing key ${key}:`, error);
    }
  },

  async keys(): Promise<string[]> {
    if (isNativePlatform) {
      const { keys } = await Preferences.keys();
      return keys;
    }

    return Object.keys(localStorage);
  },

  async clear(): Promise<void> {
    if (isNativePlatform) {
      await Preferences.clear();
    } else {
      localStorage.clear();
    }
    emitStorageChange('*', 'clear');
  }
};

// Funcion para limpiar todo el storage de datos corruptos (llamar en inicio de Electron)
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
      } catch {
        console.warn(`[Storage] Removing corrupted key: ${key}`);
        localStorage.removeItem(key);
      }
    }

    console.log('[Storage] Cleanup complete');
  } catch (error) {
    console.error('[Storage] Error during cleanup:', error);
  }
}
