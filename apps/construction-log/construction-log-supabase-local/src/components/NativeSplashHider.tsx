import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { hideNativeSplashOnce, scheduleNativeSplashHideRetries } from "@/utils/nativeSplash";

/**
 * Componente fallback por si React llega a montar antes de que el splash nativo
 * haya podido ocultarse en boot/main.
 */
export function NativeSplashHider() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    console.log("[NativeSplashHider] Componente montado, verificando splash...");
    void hideNativeSplashOnce();
    const cancelRetries = scheduleNativeSplashHideRetries([150, 400]);

    return () => {
      cancelRetries();
    };
  }, []);

  return null;
}

