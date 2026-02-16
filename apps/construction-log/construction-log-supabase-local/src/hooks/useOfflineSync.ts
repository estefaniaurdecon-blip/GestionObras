import { useEffect } from 'react';
import { useNetworkStatus } from './useNetworkStatus';
import { requestBackgroundSync } from '@/utils/serviceWorkerRegistration';

/**
 * Hook para gestionar sincronización automática cuando vuelve conexión
 * Escucha eventos de red y del Service Worker
 */
export const useOfflineSync = (syncCallback: () => Promise<void>) => {
  const { isOnline } = useNetworkStatus();

  useEffect(() => {
    if (!isOnline) return;

    // Sincronizar cuando vuelve conexión
    const handleOnlineSync = async () => {
      console.log('[OfflineSync] Connection restored, syncing...');
      try {
        await syncCallback();
        console.log('[OfflineSync] Sync completed successfully');
      } catch (error) {
        console.error('[OfflineSync] Sync failed:', error);
      }
    };

    // Escuchar evento personalizado de sincronización
    window.addEventListener('online-sync-trigger', handleOnlineSync);
    
    // Escuchar mensajes del Service Worker
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_PENDING_OPERATIONS') {
        console.log('[OfflineSync] SW requested sync');
        handleOnlineSync();
      }
    };
    
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    // Registrar background sync si está soportado
    requestBackgroundSync('sync-pending-operations').catch(err => {
      console.warn('[OfflineSync] Background sync not available:', err);
    });

    return () => {
      window.removeEventListener('online-sync-trigger', handleOnlineSync);
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
    };
  }, [isOnline, syncCallback]);
};
