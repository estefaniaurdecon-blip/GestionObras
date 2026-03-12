import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { checkAppUpdates, type CheckAppUpdatesResponse, type UpdatePlatform } from '@/integrations/api/client';
import { startupPerfEnd, startupPerfStart } from '@/utils/startupPerf';

interface UpdateInfo {
  updateAvailable: boolean;
  version?: string;
  downloadUrl?: string;
  fileSize?: number;
  releaseNotes?: string;
  isMandatory?: boolean;
}

const DISMISSED_VERSIONS_KEY = 'dismissed_update_versions';
const INSTALLED_VERSION_KEY = 'last_installed_version';
const SILENT_UPDATE_CHECK_COOLDOWN_MS = 120000;
const UPDATES_DEBUG_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_UPDATES_DEBUG === '1';

let silentUpdateCheckInFlight: Promise<UpdateInfo | null> | null = null;
let lastSilentUpdateCheckAt = 0;

interface RendererProcess {
  type?: string;
}

declare global {
  interface Window {
    Capacitor?: unknown;
    process?: RendererProcess;
  }
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown };
    if (typeof candidate.message === 'string') {
      return candidate.message;
    }
  }
  return fallback;
};

const isPromiseLike = <T>(value: unknown): value is Promise<T> => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { then?: unknown };
  return typeof candidate.then === 'function';
};

const formatDebugValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const logUpdatesDebug = (message: string, detail?: unknown) => {
  if (!UPDATES_DEBUG_ENABLED) return;
  console.log(detail === undefined ? message : `${message} | ${formatDebugValue(detail)}`);
};

export const useAppUpdates = () => {
  const INITIAL_UPDATE_CHECK_DELAY_MS = 15000;
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const getDismissedVersions = useCallback((): Set<string> => {
    const dismissed = localStorage.getItem(DISMISSED_VERSIONS_KEY);
    return new Set(dismissed ? JSON.parse(dismissed) : []);
  }, []);

  const dismissVersion = useCallback((version: string) => {
    const dismissed = getDismissedVersions();
    dismissed.add(version);
    localStorage.setItem(DISMISSED_VERSIONS_KEY, JSON.stringify([...dismissed]));
  }, [getDismissedVersions]);

  const markVersionAsInstalled = useCallback((version: string) => {
    localStorage.setItem(INSTALLED_VERSION_KEY, version);
    // Limpiar las versiones descartadas ya que instalamos una actualización
    const dismissed = getDismissedVersions();
    dismissed.delete(version);
    localStorage.setItem(DISMISSED_VERSIONS_KEY, JSON.stringify([...dismissed]));
  }, [getDismissedVersions]);

  const getInstalledVersion = useCallback((): string | null => {
    return localStorage.getItem(INSTALLED_VERSION_KEY);
  }, []);

  const getPlatform = useCallback((): 'windows' | 'android' | 'web' => {
    try {
      // Detectar Electron PRIMERO, antes de Capacitor
      const ua = window.navigator.userAgent || '';
      const isElectron = window.electronAPI !== undefined || 
                        ua.toLowerCase().includes('electron') ||
                        window.process?.type === 'renderer';
      
      if (isElectron) {
        logUpdatesDebug('[Updates] Electron detected via electronAPI or userAgent');
        return 'windows';
      }

      // Verificar si Capacitor está disponible y es plataforma nativa
      const isNative = Capacitor.isNativePlatform();
      const capPlatform = Capacitor.getPlatform();
      logUpdatesDebug('[Updates] Platform detection', {
        platform: capPlatform,
        isNative,
        userAgentPrefix: ua.substring(0, 50),
      });
      
      // Si es plataforma nativa Android
      if (capPlatform === 'android' && isNative) {
        console.log('[Updates] ✓ Native Android app detected');
        return 'android';
      }
      
      // Fallback por user agent si Capacitor no detecta correctamente
      if (isNative && ua.toLowerCase().includes('android')) {
        console.log('[Updates] ✓ Android detected via UA (native app)');
        return 'android';
      }
      
      // Si capPlatform es android pero no isNative, probablemente sea preview
      if (capPlatform === 'android') {
        console.log('[Updates] ⚠️ Android platform but not native - may be preview/browser');
        return 'android'; // Intentar con android de todos modos
      }
      
      // iOS también
      if (capPlatform === 'ios') return 'android';
    } catch (e) {
      console.error('[Updates] Error detecting platform:', e);
    }

    console.log('[Updates] ⚠️ Defaulting to web - app may not be installed or running in browser');
    return 'web';
  }, []);

  const getCurrentVersion = useCallback(async (): Promise<string> => {
    const platform = getPlatform();
    
    // Para Android, intentar obtener la versión nativa primero
    if (platform === 'android') {
      try {
        if (window.Capacitor && App?.getInfo) {
          const info = await App.getInfo();
          if (info?.version) {
            logUpdatesDebug('[Updates] Using native Android version', info.version);
            return info.version;
          }
        }
      } catch (e) {
        console.warn('No se pudo obtener la versión nativa:', e);
      }
    }
    
    // Fallback a la versión del entorno
    return import.meta.env.VITE_APP_VERSION || '2.0.1';
  }, [getPlatform]);

  const shouldIgnoreUpdate = useCallback((candidate: CheckAppUpdatesResponse): boolean => {
    if (!candidate.version) return false;
    if (candidate.isMandatory) return false;

    const dismissedVersions = getDismissedVersions();
    if (dismissedVersions.has(candidate.version)) {
      return true;
    }

    const installedVersion = getInstalledVersion();
    return installedVersion === candidate.version;
  }, [getDismissedVersions, getInstalledVersion]);

  const checkForUpdates = useCallback(async (silent: boolean = false, createNotification: boolean = false) => {
    startupPerfStart('hook:useAppUpdates.checkForUpdates');

    if (silent) {
      const now = Date.now();
      if (silentUpdateCheckInFlight) {
        startupPerfEnd('hook:useAppUpdates.checkForUpdates', 'skipped-in-flight');
        return silentUpdateCheckInFlight;
      }

      if (now - lastSilentUpdateCheckAt < SILENT_UPDATE_CHECK_COOLDOWN_MS) {
        startupPerfEnd('hook:useAppUpdates.checkForUpdates', 'skipped-cooldown');
        return updateInfo;
      }
    }

    const runCheck = async (): Promise<UpdateInfo | null> => {
      try {
        setChecking(true);

        const currentVersion = await getCurrentVersion();
        const platform = getPlatform() as UpdatePlatform;

        const result = await checkAppUpdates({
          currentVersion,
          platform,
        });

        if (result.updateAvailable && !shouldIgnoreUpdate(result)) {
          const normalizedUpdateInfo: UpdateInfo = {
            updateAvailable: true,
            version: result.version,
            downloadUrl: result.downloadUrl,
            fileSize: result.fileSize,
            releaseNotes: result.releaseNotes,
            isMandatory: Boolean(result.isMandatory),
          };

          setUpdateInfo(normalizedUpdateInfo);

          if (createNotification && !silent) {
            toast({
              title: 'Actualizacion disponible',
              description: `Version ${result.version || 'nueva'} lista para descargar`,
            });
          }

          return normalizedUpdateInfo;
        }

        setUpdateInfo(null);

        if (!silent) {
          toast({
            title: 'Sin actualizaciones',
            description: `Version actual: ${currentVersion}`,
          });
        }

        return null;
      } catch (error) {
        console.error('Error checking for updates:', error);
        if (!silent) {
          toast({
            title: 'Error',
            description: 'No se pudo verificar actualizaciones',
            variant: 'destructive',
          });
        }
        return null;
      } finally {
        if (silent) {
          lastSilentUpdateCheckAt = Date.now();
        }
        setChecking(false);
        startupPerfEnd(
          'hook:useAppUpdates.checkForUpdates',
          `silent=${silent},notification=${createNotification}`,
        );
      }
    };

    const checkPromise = runCheck();
    if (!silent) {
      return checkPromise;
    }

    silentUpdateCheckInFlight = checkPromise.finally(() => {
      if (silentUpdateCheckInFlight === checkPromise) {
        silentUpdateCheckInFlight = null;
      }
    });

    return silentUpdateCheckInFlight;
  }, [getCurrentVersion, getPlatform, shouldIgnoreUpdate, updateInfo]);

  const downloadAndInstallUpdate = async () => {
    if (!updateInfo || !updateInfo.downloadUrl) {
      console.error('[Updates] No update info or download URL available', updateInfo);
      return;
    }

    try {
      setDownloading(true);
      const platform = getPlatform();
      console.log('[Updates] Starting download for platform:', platform, 'URL:', updateInfo.downloadUrl);

      if (platform === 'android') {
        console.log('[Updates] Android update - downloading APK');
        
        toast({
          title: 'Descargando actualización...',
          description: 'Por favor espera mientras se descarga el archivo',
          duration: 10000,
        });

        try {
          // Descargar el archivo APK con manejo de errores mejorado
          console.log('[Updates] Fetching APK from:', updateInfo.downloadUrl);
          const response = await fetch(updateInfo.downloadUrl);
          
          if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
          }
          
          const blob = await response.blob();
          const fileSizeMB = (blob.size / 1024 / 1024).toFixed(2);
          console.log('[Updates] APK downloaded, size:', fileSizeMB, 'MB');
          
          // Verificar tamaño mínimo (APKs suelen ser >5MB)
          if (blob.size < 1000000) {
            throw new Error('El archivo descargado es demasiado pequeño');
          }
          
          const reader = new FileReader();
          
          reader.onloadend = async () => {
            try {
              const base64Data = (reader.result as string).split(',')[1];
              const fileName = `update-${updateInfo.version}.apk`;
              
              console.log('[Updates] Saving APK to filesystem...');
              
              // Guardar el APK - usar ExternalStorage para mejor compatibilidad con FileProvider
              let savedUri: string;
              const directoryAttempts = [
                { dir: Directory.External, name: 'External' },
                { dir: Directory.Documents, name: 'Documents' },
                { dir: Directory.Cache, name: 'Cache' },
              ];
              
              for (const attempt of directoryAttempts) {
                try {
                  console.log(`[Updates] Trying to save to ${attempt.name}...`);
                  const result = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: attempt.dir,
                    recursive: true,
                  });
                  savedUri = result.uri;
                  console.log(`[Updates] ✓ APK saved to ${attempt.name}:`, savedUri);
                  break;
                } catch (e) {
                  console.log(`[Updates] ✗ Could not save to ${attempt.name}:`, e);
                }
              }

              if (!savedUri!) {
                throw new Error('No se pudo guardar el APK en ningún directorio');
              }

              console.log('[Updates] Final saved URI:', savedUri);

              // Marcar como instalada para no volver a mostrar el prompt
              if (updateInfo.version) {
                markVersionAsInstalled(updateInfo.version);
              }
              setUpdateInfo(null);

              toast({
                title: '¡Descarga completada!',
                description: 'Abriendo instalador...',
                duration: 3000,
              });

              // Esperar un momento antes de abrir el instalador
              await new Promise(resolve => setTimeout(resolve, 500));

              // En Android, usar FileOpener para lanzar el instalador de APK
              let installerOpened = false;
              
              try {
                // Método principal: Usar FileOpener con el MIME type correcto para APK
                console.log('[Updates] Opening APK with FileOpener...');
                console.log('[Updates] FilePath:', savedUri);
                console.log('[Updates] ContentType: application/vnd.android.package-archive');
                
                await FileOpener.open({
                  filePath: savedUri,
                  contentType: 'application/vnd.android.package-archive',
                  openWithDefault: true,
                });
                
                console.log('[Updates] ✓ FileOpener.open() completed successfully');
                installerOpened = true;
              } catch (fileOpenerError: unknown) {
                console.error('[Updates] ✗ FileOpener failed:', fileOpenerError);
                const fileOpenerDetails = fileOpenerError as { message?: string; code?: string | number };
                console.error('[Updates] Error message:', fileOpenerDetails.message);
                console.error('[Updates] Error code:', fileOpenerDetails.code);
                
                // Mostrar error específico al usuario
                toast({
                  title: 'Error al abrir instalador',
                  description: `${fileOpenerDetails.message || 'Error desconocido'}. Abre el archivo manualmente desde Descargas.`,
                  variant: 'destructive',
                  duration: 10000,
                });
                
                // Método alternativo: Intentar con Browser como fallback
                try {
                  console.log('[Updates] Trying Browser.open fallback...');
                  await Browser.open({ 
                    url: savedUri,
                    presentationStyle: 'fullscreen'
                  });
                  console.log('[Updates] ✓ Opened APK with Browser fallback');
                  installerOpened = true;
                } catch (browserError) {
                  console.error('[Updates] ✗ Browser.open also failed:', browserError);
                  
                  // Último recurso: Mostrar mensaje para instalación manual
                  toast({
                    title: 'Instalación manual requerida',
                    description: `El archivo "${fileName}" se guardó. Ábrelo desde el gestor de archivos para instalar.`,
                    variant: 'default',
                    duration: 15000,
                  });
                }
              }
              
              // Solo cerrar la app si el instalador se abrió correctamente
              if (installerOpened) {
                console.log('[Updates] Waiting 4s before exiting app...');
                setTimeout(async () => {
                  try {
                    console.log('[Updates] Exiting app to allow installation');
                    await App.exitApp();
                  } catch (e) {
                    console.warn('[Updates] Could not exit app:', e);
                  }
                }, 4000);
              }

            } catch (e: unknown) {
              console.error('[Updates] Error saving APK:', e);
              toast({
                title: 'Error al guardar',
                description: getErrorMessage(e, 'No se pudo guardar el archivo. Descárgalo manualmente desde el navegador.'),
                variant: 'destructive',
              });
              // Fallback: abrir URL en navegador
              window.open(updateInfo.downloadUrl, '_blank');
            }
          };

          reader.onerror = () => {
            console.error('[Updates] Error reading blob');
            toast({
              title: 'Error',
              description: 'No se pudo procesar el archivo. Intenta de nuevo.',
              variant: 'destructive',
            });
          };

          reader.readAsDataURL(blob);
          
        } catch (e: unknown) {
          console.error('[Updates] Error downloading APK:', e);
          toast({
            title: 'Error de descarga',
            description: getErrorMessage(e, 'Descargando desde el navegador...'),
            variant: 'destructive',
          });
          // Fallback: abrir en navegador
          window.open(updateInfo.downloadUrl, '_blank');
        }
      } else if (platform === 'windows') {
        // Para Windows/Electron - actualización automática mejorada
        const electronAPI = window.electronAPI;
        console.log('[Updates] Windows platform detected, electronAPI available:', !!electronAPI);
        
        if (electronAPI?.downloadAndInstallFromUrl) {
          console.log('[Updates] Starting Windows automatic update');
          console.log('[Updates] Download URL:', updateInfo.downloadUrl);
          
          toast({
            title: 'Instalando actualización...',
            description: 'La aplicación se cerrará y actualizará automáticamente. Por favor espera.',
            duration: 10000,
          });

          try {
            // Marcar como instalada ANTES de iniciar (por si el proceso se interrumpe)
            if (updateInfo.version) {
              markVersionAsInstalled(updateInfo.version);
            }
            
            const res = await electronAPI.downloadAndInstallFromUrl(updateInfo.downloadUrl);
            console.log('[Updates] Download and install result:', res);
            
            if (!res?.success) {
              // Revertir el marcado si falla
              localStorage.removeItem(INSTALLED_VERSION_KEY);
              throw new Error(res?.error || 'Error al iniciar instalador');
            }
            
            console.log('[Updates] Update process initiated - app will close');
            // La app se cerrará automáticamente desde el main process
            
          } catch (err) {
            console.error('[Updates] Error during update:', err);
            
            // Fallback: abrir en navegador para descarga manual
            toast({
              title: 'Descarga alternativa',
              description: 'Se abrirá el navegador para descargar manualmente.',
              variant: 'default',
              duration: 5000,
            });
            
            window.open(updateInfo.downloadUrl, '_blank');
          }
        } else if (electronAPI?.downloadUpdate) {
          console.log('[Updates] Using electron-updater method');
          
          toast({
            title: 'Descargando actualización...',
            description: 'La actualización se instalará al cerrar la aplicación',
            duration: 5000,
          });
          
          const result = await electronAPI.downloadUpdate();
          if (result.success) {
            if (updateInfo.version) markVersionAsInstalled(updateInfo.version);
            
            toast({
              title: 'Actualización lista',
              description: 'Se instalará al cerrar la aplicación',
              duration: 5000,
            });
            
            // Instalar después de un breve delay
            setTimeout(() => {
              electronAPI?.installUpdate?.();
            }, 3000);
          } else {
            throw new Error(result.error || 'Error al descargar');
          }
        } else {
          console.log('[Updates] No electronAPI available - web fallback');
          
          toast({
            title: 'Descarga iniciada',
            description: 'Ejecuta el instalador descargado y cierra esta aplicación manualmente',
            duration: 8000,
          });
          
          // Abrir URL en navegador
          window.open(updateInfo.downloadUrl, '_blank');
          
          if (updateInfo.version) {
            markVersionAsInstalled(updateInfo.version);
          }
        }
      } else {
        // Para web, simplemente recargar
        toast({
          title: 'Actualización disponible',
          description: 'Recarga la página para obtener la última versión',
        });
      }
    } catch (error) {
      console.error('Error downloading update:', error);
      toast({
        title: 'Error',
        description: 'No se pudo descargar la actualización',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  // Verificar actualizaciones al montar y al reanudar la app (silenciosamente)
  useEffect(() => {
    startupPerfStart('hook:useAppUpdates.initialDelay');
    let timer: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    timer = globalThis.setTimeout(() => {
      const triggerCheck = () => {
        startupPerfEnd('hook:useAppUpdates.initialDelay');
        void checkForUpdates(true);
      };

      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(triggerCheck, { timeout: 4000 });
        return;
      }

      triggerCheck();
    }, INITIAL_UPDATE_CHECK_DELAY_MS);

    // Re-chequear al volver a primer plano en Android/iOS
    let removeListener: (() => void) | undefined;
    try {
      const p = App.addListener?.('appStateChange', ({ isActive }: { isActive: boolean }) => {
        if (isActive) {
          void checkForUpdates(true);
        }
      });
      // Manejo de handle async (Capacitor v7)
      if (isPromiseLike<{ remove: () => void }>(p)) {
        (p as Promise<{ remove: () => void }>).then((handle) => {
          removeListener = () => handle.remove();
        });
      }
    } catch (e) {
      console.warn('[Updates] Could not add appStateChange listener:', e);
    }

    return () => {
      if (timer !== null) {
        globalThis.clearTimeout(timer);
      }
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      startupPerfEnd('hook:useAppUpdates.initialDelay', 'cleanup');
      removeListener?.();
    };
  }, [INITIAL_UPDATE_CHECK_DELAY_MS, checkForUpdates]);
  
  const postponeUpdate = () => {
    if (updateInfo?.version && !updateInfo.isMandatory) {
      dismissVersion(updateInfo.version);
      setUpdateInfo(null);
    }
  };

  return {
    updateInfo,
    checking,
    downloading,
    checkForUpdates,
    downloadAndInstallUpdate,
    postponeUpdate,
  };
};








