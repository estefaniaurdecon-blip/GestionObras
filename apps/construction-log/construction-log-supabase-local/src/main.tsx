import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";
import { hideNativeSplashOnce, scheduleNativeSplashHideRetries } from "./utils/nativeSplash";
import { registerServiceWorker, unregisterServiceWorker } from "./utils/serviceWorkerRegistration";
import { startupPerfEnd, startupPerfPoint, startupPerfStart } from "./utils/startupPerf";

declare global {
  interface Window {
    __hideAppLoading?: () => void;
  }
}

// Log para diagnostico en APK (visible tambien en el loader HTML)
const appendBootLog = (line: string) => {
  try {
    const pre = document.getElementById("boot-log");
    if (!pre) return;
    const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
    pre.textContent = `${pre.textContent || ""}${ts}  ${line}\n`;
    pre.scrollTop = pre.scrollHeight;
  } catch {
    // ignore
  }
};

const logDebug = (msg: string) => {
  console.log(`[AppBoot] ${msg}`);
  appendBootLog(`[AppBoot] ${msg}`);
};

const isElectronRuntime = (): boolean => {
  if (typeof window === "undefined") return false;
  const windowWithElectron = window as Window & {
    electronAPI?: unknown;
    process?: { type?: string };
  };
  const ua = window.navigator.userAgent || "";
  return (
    windowWithElectron.electronAPI !== undefined ||
    ua.toLowerCase().includes("electron") ||
    windowWithElectron.process?.type === "renderer"
  );
};

const clearNativeBrowserCaches = async (): Promise<number> => {
  if (!("caches" in window)) return 0;
  try {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    logDebug(`Cache Storage limpiado en nativo (${cacheKeys.length} entradas)`);
    return cacheKeys.length;
  } catch (error) {
    logDebug(`Error limpiando Cache Storage en nativo: ${String(error)}`);
    return 0;
  }
};

const unregisterAllNativeServiceWorkers = async (): Promise<number> => {
  if (!("serviceWorker" in navigator)) return 0;
  try {
    if ("getRegistrations" in navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      logDebug(`Service Workers desregistrados en nativo (${registrations.length})`);
      return registrations.length;
    }
    const unregistered = await unregisterServiceWorker();
    return unregistered ? 1 : 0;
  } catch (error) {
    logDebug(`Error desregistrando Service Workers en nativo: ${String(error)}`);
    return 0;
  }
};

const APP_BUILD_MARKER = import.meta.env.VITE_APP_VERSION || "native-dev";
const NATIVE_ASSET_REFRESH_SESSION_KEY = "__native_assets_refresh_v3__";
const NATIVE_ASSET_REFRESH_VERSION_KEY = "__native_assets_refresh_version_v3__";

const readNativeAssetRefreshVersion = (): string | null => {
  try {
    return window.localStorage.getItem(NATIVE_ASSET_REFRESH_VERSION_KEY);
  } catch {
    return null;
  }
};

const markNativeAssetsChecked = (): void => {
  try {
    window.sessionStorage.setItem(NATIVE_ASSET_REFRESH_SESSION_KEY, APP_BUILD_MARKER);
  } catch {
    // ignore sessionStorage errors
  }

  try {
    window.localStorage.setItem(NATIVE_ASSET_REFRESH_VERSION_KEY, APP_BUILD_MARKER);
  } catch {
    // ignore localStorage errors
  }
};

const ensureFreshNativeAssets = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    if (window.sessionStorage.getItem(NATIVE_ASSET_REFRESH_SESSION_KEY) === APP_BUILD_MARKER) {
      return false;
    }
  } catch {
    // ignore sessionStorage errors
  }

  if (readNativeAssetRefreshVersion() === APP_BUILD_MARKER) {
    markNativeAssetsChecked();
    logDebug("Assets nativos ya verificados para esta version. Omitiendo limpieza.");
    return false;
  }

  logDebug("Modo nativo: limpiando Service Worker/cache antes de montar React...");
  const serviceWorkersRemoved = await unregisterAllNativeServiceWorkers();
  const cachesRemoved = await clearNativeBrowserCaches();
  markNativeAssetsChecked();

  if (serviceWorkersRemoved > 0 || cachesRemoved > 0) {
    logDebug("Se detectaron assets cacheados. Recargando WebView para aplicar la version actual...");
    window.location.reload();
    return true;
  }

  return false;
};

logDebug("Script main.tsx iniciando...");
logDebug(`Plataforma: ${Capacitor.getPlatform()}, isNative: ${Capacitor.isNativePlatform()}`);
startupPerfPoint("main.tsx evaluado");

// Ocultar el loading fallback cuando React se monta
const hideLoading = () => {
  logDebug("hideLoading llamado");
  requestNativeSplashHide();
  const loading = document.getElementById("app-loading");
  if (loading) {
    loading.style.opacity = "0";
    loading.style.transition = "opacity 0.3s";
    setTimeout(() => loading.remove(), 300);
  }
};

// Exponer helper para que la app decida cuando ocultar el loader
window.__hideAppLoading = hideLoading;

const requestNativeSplashHide = () => {
  void hideNativeSplashOnce({ log: logDebug });
};

const scheduleOfflineDbWarmup = () => {
  if (!Capacitor.isNativePlatform()) return;

  const runWarmup = () => {
    startupPerfStart("main:offline-db-warmup");
    void import("./offline-db/db")
      .then(({ preloadOfflineDbEngine }) => preloadOfflineDbEngine())
      .then(() => {
        startupPerfEnd("main:offline-db-warmup");
        logDebug("offline-db/sql.js prewarm completado");
      })
      .catch((error) => {
        startupPerfEnd("main:offline-db-warmup", "error");
        logDebug(`offline-db/sql.js prewarm omitido por error: ${String(error)}`);
      });
  };

  const triggerWarmup = () => {
    globalThis.setTimeout(runWarmup, 250);
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(triggerWarmup, { timeout: 2500 });
    return;
  }

  globalThis.setTimeout(triggerWarmup, 1200);
};

// Funcion para mostrar error en pantalla
const showBootError = (title: string, detail: string) => {
  requestNativeSplashHide();
  const loading = document.getElementById("app-loading");
  if (loading) {
    loading.innerHTML = `
      <div style="text-align:center;padding:20px;max-width:320px;">
        <div style="font-size:48px;margin-bottom:16px;">X</div>
        <div style="font-size:18px;font-weight:600;">${title}</div>
        <div style="margin-top:12px;font-size:13px;opacity:0.85;word-break:break-word;">${detail}</div>
        <button onclick="location.reload()" style="margin-top:20px;padding:12px 24px;background:#F97316;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">Reintentar</button>
      </div>
    `;
  }
};

// Inicializacion principal
const initApp = async () => {
  startupPerfStart("main:initApp");
  try {
    logDebug("initApp comenzando...");
    startupPerfPoint("initApp start");

    if (await ensureFreshNativeAssets()) {
      return;
    }

    if (isElectronRuntime()) {
      logDebug("Limpiando storage de Electron...");
      void import("./utils/cleanElectronStorage")
        .then(({ cleanElectronStorage }) => {
          cleanElectronStorage();
        })
        .catch((error) => {
          logDebug(`Error cargando limpieza de storage Electron: ${String(error)}`);
        });
    }

    // La DB offline se inicializa de forma lazy con scope de tenant al cargar el usuario.
    logDebug("DB offline: inicializacion diferida por tenant");

    // En desarrollo web, eliminamos SW previo para evitar servir bundles/caches obsoletos.
    if (import.meta.env.DEV && !Capacitor.isNativePlatform()) {
      logDebug("Modo desarrollo: desregistrando Service Worker legado...");
      await unregisterServiceWorker();
    }

    // Registrar Service Worker para funcionalidad offline (solo Web/PWA en produccion)
    if (import.meta.env.PROD && !Capacitor.isNativePlatform()) {
      logDebug("Registrando Service Worker...");
      registerServiceWorker().then((registration) => {
        if (registration) {
          logDebug("Service Worker registrado OK");
        }
      });
    }

    logDebug("Montando React...");
    startupPerfStart("main:react-mount");
    startupPerfStart("main:root-render-to-app-mounted");
    const rootElement = document.getElementById("root");

    if (!rootElement) {
      throw new Error("No se encontro el elemento #root");
    }

    const root = createRoot(rootElement);
    root.render(<App />);
    scheduleOfflineDbWarmup();
    if (Capacitor.isNativePlatform()) {
      scheduleNativeSplashHideRetries([150, 400, 900, 1600], { log: logDebug });
    }
    startupPerfEnd("main:react-mount");

    logDebug("React montado correctamente");
    startupPerfEnd("main:initApp");
  } catch (error) {
    console.error("[App] Error critico durante inicializacion:", error);
    startupPerfEnd("main:initApp");
    showBootError("Error critico", String(error));
  }
};

// Ejecutar inicializacion
initApp();

