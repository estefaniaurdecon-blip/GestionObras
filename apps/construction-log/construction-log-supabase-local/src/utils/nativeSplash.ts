import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

type NativeSplashState = {
  hidden: boolean;
  inFlight: boolean;
};

type HideNativeSplashOptions = {
  log?: (message: string) => void;
};

declare global {
  interface Window {
    __nativeSplashState?: NativeSplashState;
  }
}

const getNativeSplashState = (): NativeSplashState => {
  if (!window.__nativeSplashState) {
    window.__nativeSplashState = {
      hidden: false,
      inFlight: false,
    };
  }

  return window.__nativeSplashState;
};

export const hideNativeSplashOnce = async (
  options: HideNativeSplashOptions = {},
): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;

  const state = getNativeSplashState();
  if (state.hidden || state.inFlight) return false;

  state.inFlight = true;
  options.log?.("Intentando ocultar splash nativo...");

  try {
    await SplashScreen.hide();
    state.hidden = true;
    options.log?.("Splash nativo ocultado OK");
    return true;
  } catch (error) {
    options.log?.(`Splash hide error (ignorado): ${String(error)}`);
    return false;
  } finally {
    state.inFlight = false;
  }
};

export const scheduleNativeSplashHideRetries = (
  delaysMs: number[],
  options: HideNativeSplashOptions = {},
): (() => void) => {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  const timeoutIds = delaysMs.map((delayMs) =>
    window.setTimeout(() => {
      void hideNativeSplashOnce(options);
    }, delayMs),
  );

  return () => {
    timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  };
};
