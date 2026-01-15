import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

// Configuraci?n de Vite para React + TS.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const devHost = env.VITE_DEV_HOST || "0.0.0.0";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: devHost,
      // Permitimos acceso desde hosts externos (Cloudflare: dashboard.mavico.shop, etc.).
      // En producci?n real se puede restringir m?s.
      allowedHosts: true,
    },
  };
});
