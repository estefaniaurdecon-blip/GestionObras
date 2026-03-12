import { Capacitor } from "@capacitor/core";

const now = () => new Date().toISOString().replace("T", " ").replace("Z", "");

const appendBootLog = (line: string) => {
  try {
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

appendBootLog(`boot.ts cargado | platform=${Capacitor.getPlatform()} | isNative=${Capacitor.isNativePlatform()}`);
setBootStatus("Cargando aplicacion...");
appendBootLog("Importando main.tsx...");

import("./main")
  .then(() => {
    appendBootLog("main.tsx importado");
    setBootStatus("Iniciando UI...");
  })
  .catch((err) => {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    appendBootLog(`Fallo importando main.tsx: ${msg}`);

    // Forzar que el handler del index.html muestre el error
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: msg,
        filename: "src/boot.ts",
      }),
    );
  });
