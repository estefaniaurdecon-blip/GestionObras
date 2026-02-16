import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { storage } from '@/utils/storage';

/**
 * Componente de seguridad crítico: Limpia caché antiguo que podría contener
 * datos de otras organizaciones debido a bug de aislamiento de datos.
 * 
 * Este componente se ejecuta una sola vez por usuario y limpia:
 * - Caché de work_reports sin organization_id en la clave
 * - Operaciones pendientes de sincronización sin organization_id
 * - Timestamps de sincronización sin organization_id
 */
export const CacheCleaner = () => {
  const { user } = useAuth();

  useEffect(() => {
    const cleanLegacyCache = async () => {
      if (!user) return;

      const CLEANUP_FLAG_KEY = `cache_cleaned_v2:${user.id}`;
      
      try {
        // Verificar si ya se limpió el caché para este usuario
        const alreadyCleaned = await storage.getItem(CLEANUP_FLAG_KEY);
        if (alreadyCleaned === 'true') {
          console.log('[CacheCleaner] Caché ya limpiado para este usuario');
          return;
        }

        console.log('🧹 [CacheCleaner] INICIANDO LIMPIEZA DE SEGURIDAD...');

        // Limpiar todas las claves antiguas sin organization_id
        const legacyKeys = [
          `work_reports_cache:${user.id}`,
          `work_reports_pending_sync:${user.id}`,
          `work_reports_last_sync:${user.id}`,
          // También limpiar claves sin user.id (muy antiguas)
          'work_reports_cache',
          'work_reports_pending_sync',
          'work_reports_last_sync',
        ];

        for (const key of legacyKeys) {
          try {
            await storage.removeItem(key);
            console.log(`🧹 [CacheCleaner] Eliminado: ${key}`);
          } catch (e) {
            console.warn(`⚠️ [CacheCleaner] Error eliminando ${key}:`, e);
          }
        }

        // Marcar como limpiado
        await storage.setItem(CLEANUP_FLAG_KEY, 'true');
        
        console.log('✅ [CacheCleaner] LIMPIEZA COMPLETADA - Caché de seguridad reseteado');
        console.log('📊 [CacheCleaner] Los datos se volverán a cargar desde el servidor de forma segura');
      } catch (error) {
        console.error('❌ [CacheCleaner] Error durante limpieza:', error);
      }
    };

    cleanLegacyCache();
  }, [user?.id]);

  // Este componente no renderiza nada, solo ejecuta la limpieza
  return null;
};
