import { useEffect, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WifiOff, Wifi, CloudOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storage } from '@/utils/storage';

export const OfflineIndicator = () => {
  const { isOnline, isOffline, lastOnlineTime } = useNetworkStatus();
  const [showOnlineBanner, setShowOnlineBanner] = useState(false);
  const [hasPendingOperations, setHasPendingOperations] = useState(false);

  // Comprobar operaciones pendientes
  useEffect(() => {
    const checkPendingOperations = async () => {
      try {
        const pendingKeys = [
          'work_reports_pending_sync',
          'access_reports_pending_sync',
          'users_pending_sync'
        ];

        let hasPending = false;
        for (const key of pendingKeys) {
          const data = await storage.getItem(key);
          if (data) {
            const operations = JSON.parse(data);
            if (operations && operations.length > 0) {
              hasPending = true;
              break;
            }
          }
        }
        
        setHasPendingOperations(hasPending);
      } catch (error) {
        console.error('Error checking pending operations:', error);
      }
    };

    checkPendingOperations();
    
    // Revisar cada 5 segundos
    const interval = setInterval(checkPendingOperations, 5000);
    return () => clearInterval(interval);
  }, []);

  // Mostrar banner cuando vuelve conexión
  useEffect(() => {
    if (isOnline && lastOnlineTime) {
      setShowOnlineBanner(true);
      const timer = setTimeout(() => setShowOnlineBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, lastOnlineTime]);

  // Solicitar sincronización cuando vuelve conexión
  useEffect(() => {
    if (isOnline && hasPendingOperations) {
      // Disparar evento para que los hooks sincronicen
      window.dispatchEvent(new Event('online-sync-trigger'));
    }
  }, [isOnline, hasPendingOperations]);

  const handleManualSync = () => {
    window.dispatchEvent(new Event('online-sync-trigger'));
    window.location.reload();
  };

  // Banner offline persistente
  if (isOffline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground">
        <div className="container mx-auto px-4 py-2">
          <Alert variant="destructive" className="border-0 bg-transparent">
            <WifiOff className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between w-full">
              <span className="text-sm font-medium">
                Sin conexión - Los cambios se guardarán localmente
              </span>
              {hasPendingOperations && (
                <span className="text-xs bg-white/20 px-2 py-1 rounded">
                  Cambios pendientes de sincronizar
                </span>
              )}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  // Banner cuando vuelve conexión
  if (showOnlineBanner) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-green-600 text-white">
        <div className="container mx-auto px-4 py-2">
          <Alert className="border-0 bg-transparent">
            <Wifi className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between w-full">
              <span className="text-sm font-medium">
                Conexión restaurada
                {hasPendingOperations && ' - Sincronizando cambios pendientes...'}
              </span>
              {hasPendingOperations && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleManualSync}
                  className="h-7 text-xs"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Sincronizar ahora
                </Button>
              )}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  // Indicador discreto de operaciones pendientes cuando está online
  if (hasPendingOperations) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800">
          <CloudOff className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
          <AlertDescription className="flex items-center gap-2">
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              Sincronizando...
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleManualSync}
              className="h-6 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
};
