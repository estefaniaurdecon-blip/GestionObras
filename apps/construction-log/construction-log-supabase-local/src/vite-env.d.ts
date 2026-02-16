/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_TENANT_ID?: string;
  readonly VITE_DESKTOP_ACCESS_URL?: string;
  readonly VITE_ADMIN_SUPPORT_EMAIL?: string;
  // Legacy Supabase env vars (deprecated)
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  electronAPI?: {
    downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
    installUpdate: () => void;
    downloadAndInstallFromUrl?: (url: string) => Promise<{ success: boolean; error?: string }>;
    clearSessionData?: () => Promise<{ success: boolean }>;
  };
}
