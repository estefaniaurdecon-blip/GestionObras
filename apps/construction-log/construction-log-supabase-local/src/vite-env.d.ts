/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_NATIVE_API_BASE_URL?: string;
  readonly VITE_DOCINT_BASE_URL?: string;
  readonly VITE_NATIVE_DOCINT_BASE_URL?: string;
  readonly VITE_DOCINT_PORT?: string;
  readonly VITE_TENANT_ID?: string;
  readonly VITE_DESKTOP_ACCESS_URL?: string;
  readonly VITE_ADMIN_SUPPORT_EMAIL?: string;
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
