// Clean corrupted storage data in Electron
import { cleanCorruptedStorage } from './storage';

// Detectar si estamos en Electron
const isElectron = () => {
  const ua = window.navigator.userAgent || '';
  return (window as any).electronAPI !== undefined || 
         ua.toLowerCase().includes('electron') ||
         (window as any).process?.type === 'renderer';
};

// Sanitizar un valor JSON para eliminar caracteres problemáticos
function sanitizeJsonString(value: string): string {
  if (!value) return value;
  
  try {
    // Intentar parsear como JSON
    const parsed = JSON.parse(value);
    
    // Función recursiva para limpiar strings en el objeto
    const cleanObject = (obj: any): any => {
      if (typeof obj === 'string') {
        // Eliminar caracteres no válidos UTF-8
        return obj.replace(/[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F\s]/g, '');
      }
      if (Array.isArray(obj)) {
        return obj.map(cleanObject);
      }
      if (obj && typeof obj === 'object') {
        const cleaned: any = {};
        for (const [key, val] of Object.entries(obj)) {
          cleaned[key] = cleanObject(val);
        }
        return cleaned;
      }
      return obj;
    };
    
    const cleaned = cleanObject(parsed);
    return JSON.stringify(cleaned);
  } catch {
    // Si no es JSON válido, limpiar como string
    return value.replace(/[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F\s]/g, '');
  }
}

export const cleanElectronStorage = () => {
  if (!isElectron()) return;

  console.log('[Electron Storage] Starting comprehensive cleanup...');

  try {
    // Limpiar todas las claves relacionadas con Supabase
    const supabaseKeys = Object.keys(localStorage).filter(key => 
      key.includes('supabase.auth.token') || 
      key.includes('sb-') ||
      key.includes('supabase') ||
      key.includes('__chunk')
    );

    let cleanedCount = 0;
    let removedCount = 0;

    supabaseKeys.forEach(key => {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          // Intentar sanitizar el valor
          const sanitized = sanitizeJsonString(value);
          
          // Si el valor cambió, actualizarlo
          if (sanitized !== value) {
            console.log(`[Electron Storage] Sanitized key: ${key}`);
            localStorage.setItem(key, sanitized);
            cleanedCount++;
          }
          
          // Verificar que el JSON sea válido después de sanitizar
          try {
            JSON.parse(sanitized);
          } catch {
            // Si sigue siendo inválido, eliminar la clave
            console.warn(`[Electron Storage] Removing invalid JSON key: ${key}`);
            localStorage.removeItem(key);
            removedCount++;
          }
        }
      } catch (error) {
        console.warn(`[Electron Storage] Removing corrupted key: ${key}`);
        localStorage.removeItem(key);
        removedCount++;
      }
    });

    console.log(`[Electron Storage] Cleanup complete. Cleaned: ${cleanedCount}, Removed: ${removedCount}`);
    
    // También ejecutar la limpieza asíncrona del módulo storage
    cleanCorruptedStorage().catch(console.error);
    
  } catch (error) {
    console.error('[Electron Storage] Error during cleanup:', error);
    // En caso de error grave, limpiar todo el storage de Supabase
    try {
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.includes('supabase') || key.includes('sb-')
      );
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log('[Electron Storage] Performed emergency cleanup');
    } catch (e) {
      console.error('[Electron Storage] Emergency cleanup failed:', e);
    }
  }
};

// Función para limpiar completamente y forzar re-autenticación
export const forceCleanAndReauth = async () => {
  console.log('[Electron Storage] Force clean and re-auth...');
  
  try {
    // Si estamos en Electron, usar la API de Electron para limpiar
    if (isElectron() && (window as any).electronAPI?.clearSessionData) {
      console.log('[Electron Storage] Using Electron API to clear session data...');
      await (window as any).electronAPI.clearSessionData();
    }
    
    // Limpiar TODO el localStorage (no solo claves de Supabase)
    localStorage.clear();
    
    // También limpiar sessionStorage
    sessionStorage.clear();
    
    // Limpiar IndexedDB si existe
    try {
      const databases = await indexedDB.databases?.();
      if (databases) {
        for (const db of databases) {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
            console.log(`[Electron Storage] Deleted IndexedDB: ${db.name}`);
          }
        }
      }
    } catch (e) {
      // indexedDB.databases() no está disponible en todos los navegadores
      console.log('[Electron Storage] IndexedDB cleanup skipped');
    }
    
    console.log('[Electron Storage] Force clean complete');
  } catch (error) {
    console.error('[Electron Storage] Force clean failed:', error);
    // Último recurso: limpiar todo
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error('[Electron Storage] Emergency cleanup failed:', e);
    }
  }
};
