import { useCallback, useEffect, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WifiOff, Wifi, CloudOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storage, STORAGE_CHANGE_EVENT } from '@/utils/storage';

type StorageChangeDetail = {
  key: string;
  action: 'set' | 'remove' | 'clear';
};

const PENDING_KEY_PREFIXES = [
  'work_reports_pending_sync',
  'access_reports_pending_sync',
  'users_pending_sync',
] as const;

const CHUNK_SUFFIXES = ['__chunked', '__chunk_count'] as const;

function normalizePendingStorageKey(key: string): string | null {
  for (const prefix of PENDING_KEY_PREFIXES) {
    if (!key.startsWith(prefix)) continue;

    for (const suffix of CHUNK_SUFFIXES) {
      if (key.endsWith(suffix)) {
        return key.slice(0, -suffix.length);
      }
    }

    const chunkIndex = key.lastIndexOf('__chunk_');
    if (chunkIndex >= 0) {
      return key.slice(0, chunkIndex);
    }

    return key;
  }

  return null;
}

function hasStoredPendingOperations(value: string | null): boolean {
  if (!value) return false;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.length > 0;
    }

    if (parsed && typeof parsed === 'object') {
      return Object.keys(parsed).length > 0;
    }

    return Boolean(parsed);
  } catch (error) {
    console.warn('[OfflineIndicator] Ignoring invalid pending sync payload', error);
    return false;
  }
}

export const OfflineIndicator = () => {
  const { isOnline, isOffline, lastOnlineTime } = useNetworkStatus();
  const [showOnlineBanner, setShowOnlineBanner] = useState(false);
  const [hasPendingOperations, setHasPendingOperations] = useState(false);

  const checkPendingOperations = useCallback(async () => {
    try {
      const keys = await storage.keys();
      const pendingKeys = Array.from(
        new Set(
          keys
            .map((key) => normalizePendingStorageKey(key))
            .filter((key): key is string => Boolean(key)),
        ),
      );

      for (const key of pendingKeys) {
        const data = await storage.getItem(key);
        if (hasStoredPendingOperations(data)) {
          setHasPendingOperations(true);
          return;
        }
      }

      setHasPendingOperations(false);
    } catch (error) {
      console.error('Error checking pending operations:', error);
    }
  }, []);

  useEffect(() => {
    void checkPendingOperations();

    const handleStorageChange = (event: Event) => {
      const detail = (event as CustomEvent<StorageChangeDetail>).detail;
      if (!detail) return;
      if (detail.action === 'clear' || normalizePendingStorageKey(detail.key)) {
        void checkPendingOperations();
      }
    };

    const handleWindowFocus = () => {
      void checkPendingOperations();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void checkPendingOperations();
      }
    };

    window.addEventListener(STORAGE_CHANGE_EVENT, handleStorageChange as EventListener);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, handleStorageChange as EventListener);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkPendingOperations]);

  useEffect(() => {
    void checkPendingOperations();
  }, [checkPendingOperations, isOnline]);

  // Mostrar banner cuando vuelve conexion
  useEffect(() => {
    if (isOnline && lastOnlineTime) {
      setShowOnlineBanner(true);
      const timer = setTimeout(() => setShowOnlineBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, lastOnlineTime]);

  // Solicitar sincronizacion cuando vuelve conexion
  useEffect(() => {
    if (isOnline && hasPendingOperations) {
      window.dispatchEvent(new Event('online-sync-trigger'));
    }
  }, [isOnline, hasPendingOperations]);

  const handleManualSync = () => {
    window.dispatchEvent(new Event('online-sync-trigger'));
    window.location.reload();
  };

  if (isOffline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground">
        <div className="container mx-auto px-4 py-2">
          <Alert variant="destructive" className="border-0 bg-transparent">
            <WifiOff className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between w-full">
              <span className="text-sm font-medium">
                Sin conexion - Los cambios se guardaran localmente
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

  if (showOnlineBanner) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-green-600 text-white">
        <div className="container mx-auto px-4 py-2">
          <Alert className="border-0 bg-transparent">
            <Wifi className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between w-full">
              <span className="text-sm font-medium">
                Conexion restaurada
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
