// Registro y gestión del Service Worker

export const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    console.log('[SW] Service Workers not supported');
    return null;
  }

  try {
    // Registrar Service Worker (ruta relativa para evitar problemas en entornos no-HTTP)
    const registration = await navigator.serviceWorker.register('./sw.js', {
      scope: './',
    });

    console.log('[SW] Service Worker registered successfully:', registration.scope);

    // Escuchar actualizaciones del SW
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      console.log('[SW] New service worker found, installing...');

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('[SW] New service worker installed, update available');
          
          // Notificar al usuario que hay una actualización
          if (confirm('Nueva versión disponible. ¿Deseas actualizar ahora?')) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
            window.location.reload();
          }
        }
      });
    });

    // Escuchar cuando el nuevo SW toma control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        console.log('[SW] Controller changed, reloading...');
        window.location.reload();
      }
    });

    // Escuchar mensajes del SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      console.log('[SW] Message received:', event.data);
      
      if (event.data?.type === 'SYNC_PENDING_OPERATIONS') {
        // Disparar evento para que los hooks sincronicen
        window.dispatchEvent(new Event('sw-sync-request'));
      }
    });

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
  }
};

export const unregisterServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      const success = await registration.unregister();
      console.log('[SW] Service Worker unregistered:', success);
      return success;
    }
    return false;
  } catch (error) {
    console.error('[SW] Unregistration failed:', error);
    return false;
  }
};

export const clearServiceWorkerCache = async () => {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.active) {
      registration.active.postMessage({ type: 'CLEAR_CACHE' });
      console.log('[SW] Cache clear request sent');
      return true;
    }
    return false;
  } catch (error) {
    console.error('[SW] Cache clear failed:', error);
    return false;
  }
};

export const precacheUrls = async (urls: string[]) => {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.active) {
      registration.active.postMessage({
        type: 'PRECACHE_URLS',
        urls
      });
      console.log('[SW] Precache request sent for:', urls.length, 'URLs');
      return true;
    }
    return false;
  } catch (error) {
    console.error('[SW] Precache failed:', error);
    return false;
  }
};

// Hook para background sync (cuando vuelve conexión)
export const requestBackgroundSync = async (tag: string) => {
  if (!('serviceWorker' in navigator)) {
    console.log('[SW] Background Sync not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    // @ts-ignore - Background Sync API no está en todos los tipos de TS
    if ('sync' in registration) {
      // @ts-ignore
      await registration.sync.register(tag);
      console.log('[SW] Background sync registered:', tag);
      return true;
    } else {
      console.log('[SW] Background Sync not supported in this browser');
      return false;
    }
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
    return false;
  }
};
