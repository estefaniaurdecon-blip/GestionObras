import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

// Configuración de Vite para React + TS.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const devHost = env.VITE_DEV_HOST || "0.0.0.0";
  const proxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: devHost,
      // Permitimos acceso desde hosts externos (Cloudflare: dashboard.mavico.shop, etc.).
      // En producción real se puede restringir más.
      allowedHosts: true,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/static": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
