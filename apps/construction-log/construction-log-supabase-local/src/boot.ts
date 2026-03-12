import { Capacitor } from "@capacitor/core";

const now = () => new Date().toISOString().replace("T", " ").replace("Z", "");

declare global {
  interface Window {
    __nativeConsoleUndefinedGuardInstalled__?: boolean;
    __suppressedUndefinedConsoleCount__?: number;
  }
}

const installNativeConsoleGuard = () => {
  if (!Capacitor.isNativePlatform()) return;
  if (typeof window === "undefined") return;
  if (window.__nativeConsoleUndefinedGuardInstalled__) return;

  const consoleMethods: Array<"log" | "info" | "debug" | "warn" | "error"> = [
    "log",
    "info",
    "debug",
    "warn",
    "error",
  ];

  for (const method of consoleMethods) {
    const original = console[method].bind(console);
    console[method] = ((...args: unknown[]) => {
      if (args.length === 1 && args[0] === undefined) {
        window.__suppressedUndefinedConsoleCount__ =
          (window.__suppressedUndefinedConsoleCount__ ?? 0) + 1;
        return;
      }

      original(...args);
    }) as typeof console[typeof method];
  }

  window.__nativeConsoleUndefinedGuardInstalled__ = true;
};

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

installNativeConsoleGuard();

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
