import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

const now = () => new Date().toISOString().replace("T", " ").replace("Z", "");

const appendBootLog = (line: string) => {
  try {
    // eslint-disable-next-line no-console
    console.log(`[Boot] ${line}`);
    const pre = document.getElementById("boot-log");
    if (pre) {
      pre.textContent = `${pre.textContent || ""}${now()}  ${line}\n`;
      pre.scrollTop = pre.scrollHeight;
    }
  } catch {
    // ignore
  }
};

const setBootStatus = (text: string) => {
  const el = document.getElementById("boot-status");
  if (el) el.textContent = text;
};

const hideNativeSplashSafely = () => {
  if (!Capacitor.isNativePlatform()) return;
  SplashScreen.hide().catch(() => {
    // ignore
  });
};

appendBootLog(`boot.ts cargado | platform=${Capacitor.getPlatform()} | isNative=${Capacitor.isNativePlatform()}`);
setBootStatus("Ocultando splash nativo…");

hideNativeSplashSafely();
if (Capacitor.isNativePlatform()) {
  window.setTimeout(hideNativeSplashSafely, 60);
  window.setTimeout(hideNativeSplashSafely, 200);
  window.setTimeout(hideNativeSplashSafely, 600);
  window.setTimeout(hideNativeSplashSafely, 1200);
}

setBootStatus("Cargando aplicación…");
appendBootLog("Importando main.tsx…");

import("./main")
  .then(() => {
    appendBootLog("main.tsx importado");
    setBootStatus("Iniciando UI…");
  })
  .catch((err) => {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    appendBootLog(`Fallo importando main.tsx: ${msg}`);

    // Forzar que el handler del index.html muestre el error
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: msg,
        filename: "src/boot.ts",
      })
    );
  });
