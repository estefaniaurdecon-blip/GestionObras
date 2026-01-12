import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// Configuración de Vite para React + TS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    // Permitimos acceso desde hosts externos (Cloudflare: dashboard.mavico.shop, etc.).
    // En producción real se puede restringir más.
    allowedHosts: true,
  },
});
