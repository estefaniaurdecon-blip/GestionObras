import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";
import { registerServiceWorker, unregisterServiceWorker } from "./utils/serviceWorkerRegistration";
import { cleanElectronStorage } from "./utils/cleanElectronStorage";

// Log para diagnóstico en APK (visible también en el loader HTML)
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

const clearNativeBrowserCaches = async () => {
  if (!("caches" in window)) return;
  try {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    logDebug(`Cache Storage limpiado en nativo (${cacheKeys.length} entradas)`);
  } catch (error) {
    logDebug(`Error limpiando Cache Storage en nativo: ${String(error)}`);
  }
};

const unregisterAllNativeServiceWorkers = async () => {
  if (!("serviceWorker" in navigator)) return;
  try {
    if ("getRegistrations" in navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      logDebug(`Service Workers desregistrados en nativo (${registrations.length})`);
      return;
    }
    await unregisterServiceWorker();
  } catch (error) {
    logDebug(`Error desregistrando Service Workers en nativo: ${String(error)}`);
  }
};

logDebug("Script main.tsx iniciando...");
logDebug(`Plataforma: ${Capacitor.getPlatform()}, isNative: ${Capacitor.isNativePlatform()}`);

// Ocultar el loading fallback cuando React se monta
const hideLoading = () => {
  logDebug("hideLoading llamado");
  const loading = document.getElementById("app-loading");
  if (loading) {
    loading.style.opacity = "0";
    loading.style.transition = "opacity 0.3s";
    setTimeout(() => loading.remove(), 300);
  }
};

// Exponer helper para que la app decida cuándo ocultar el loader
(window as any).__hideAppLoading = hideLoading;

// Ocultar splash nativo de forma segura
const hideNativeSplashSafely = () => {
  if (!Capacitor.isNativePlatform()) return;
  logDebug("Intentando ocultar splash nativo...");
  SplashScreen.hide()
    .then(() => logDebug("Splash nativo ocultado OK"))
    .catch((e) => logDebug(`Splash hide error (ignorado): ${e}`));
};

// Función para mostrar error en pantalla
const showBootError = (title: string, detail: string) => {
  hideNativeSplashSafely();
  const loading = document.getElementById("app-loading");
  if (loading) {
    loading.innerHTML = `
      <div style="text-align:center;padding:20px;max-width:320px;">
        <div style="font-size:48px;margin-bottom:16px;">❌</div>
        <div style="font-size:18px;font-weight:600;">${title}</div>
        <div style="margin-top:12px;font-size:13px;opacity:0.85;word-break:break-word;">${detail}</div>
        <button onclick="location.reload()" style="margin-top:20px;padding:12px 24px;background:#F97316;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">Reintentar</button>
      </div>
    `;
  }
};

// Inicialización principal
const initApp = async () => {
  try {
    logDebug("initApp comenzando...");

    // Forzar ocultado temprano del splash nativo
    hideNativeSplashSafely();
    
    // Múltiples intentos de ocultar splash en caso de timing issues
    if (Capacitor.isNativePlatform()) {
      setTimeout(hideNativeSplashSafely, 100);
      setTimeout(hideNativeSplashSafely, 500);
      setTimeout(hideNativeSplashSafely, 1000);
      setTimeout(hideNativeSplashSafely, 2000);
    }

    // Clean any corrupted Electron storage before initializing
    logDebug("Limpiando storage de Electron...");
    cleanElectronStorage();

    // Evitar que WebView nativa conserve bundles antiguos.
    if (Capacitor.isNativePlatform()) {
      logDebug("Modo nativo: limpiando Service Worker y cache web legado...");
      await unregisterAllNativeServiceWorkers();
      await clearNativeBrowserCaches();
    }

    // La DB offline se inicializa de forma lazy con scope de tenant al cargar el usuario.
    logDebug("DB offline: inicialización diferida por tenant");

    // En desarrollo web, eliminamos SW previo para evitar servir bundles/caches obsoletos.
    if (import.meta.env.DEV && !Capacitor.isNativePlatform()) {
      logDebug("Modo desarrollo: desregistrando Service Worker legado...");
      await unregisterServiceWorker();
    }

    // Registrar Service Worker para funcionalidad offline (solo Web/PWA en producción)
    if (import.meta.env.PROD && !Capacitor.isNativePlatform()) {
      logDebug("Registrando Service Worker...");
      registerServiceWorker().then((registration) => {
        if (registration) {
          logDebug("Service Worker registrado OK");
        }
      });
    }

    logDebug("Montando React...");
    const rootElement = document.getElementById("root");
    
    if (!rootElement) {
      throw new Error("No se encontró el elemento #root");
    }

    const root = createRoot(rootElement);
    root.render(<App />);
    
    logDebug("React montado correctamente");
    
  } catch (error) {
    console.error("[App] Error crítico durante inicialización:", error);
    showBootError("Error crítico", String(error));
  }
};

// Ejecutar inicialización
initApp();
