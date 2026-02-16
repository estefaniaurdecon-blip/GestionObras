import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

/**
 * Componente que asegura que el splash nativo se oculte cuando React está montado.
 * Ahora el splash nativo está desactivado (launchShowDuration: 0), pero mantenemos
 * esto como fallback por si acaso.
 */
export function NativeSplashHider() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    console.log("[NativeSplashHider] Componente montado, ocultando splash...");
    
    const hideSplash = () => {
      SplashScreen.hide().catch(() => {
        // Silencioso: si ya estaba oculto o no disponible
      });
    };

    // Múltiples intentos para máxima compatibilidad
    hideSplash();
    const t1 = window.setTimeout(hideSplash, 100);
    const t2 = window.setTimeout(hideSplash, 300);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return null;
}
