import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET?.trim() || "http://127.0.0.1:8000";

  return {
    base: "./",
    server: {
      host: "::",
      port: 8080,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      // Evitar múltiples copias de React que causan ReactCurrentDispatcher undefined
      dedupe: ["react", "react-dom"],
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'radix-vendor': [
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
              '@radix-ui/react-toast',
            ],
            'query-vendor': ['@tanstack/react-query'],
            'pdf-vendor': ['jspdf', 'jspdf-autotable', 'html2canvas', 'pdfjs-dist'],
            'excel-vendor': ['xlsx-js-style'],
            'zip-vendor': ['jszip'],
            'icons-vendor': ['lucide-react'],
            'i18n-vendor': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
            'charts-vendor': ['recharts'],
            'capacitor-vendor': ['@capacitor/core', '@capacitor/camera', '@capacitor/filesystem'],
          },
        },
      },
    },
  };
});
