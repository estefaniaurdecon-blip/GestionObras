import axios, { type AxiosRequestConfig } from "axios";

/**
 * Cliente HTTP centralizado usando Axios.
 *
 * Aquí se maneja:
 * - Base URL de la API.
 * - Inclusión automática del token JWT.
 * - Interceptores para errores globales.
 */

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL;

const resolveApiBaseUrl = () => {
  if (window?.location?.port === "5173") {
    if (
      rawBaseUrl &&
      (rawBaseUrl.includes("localhost") || rawBaseUrl.includes("127.0.0.1"))
    ) {
      return "";
    }
  }
  if (!rawBaseUrl || rawBaseUrl === "relative" || rawBaseUrl === "/") {
    // Usa mismo origen (Vite proxy) si se pide modo relativo.
    return "";
  }

  // Si estamos accediendo desde otra máquina y el base apunta a localhost,
  // sustituimos por el hostname actual para evitar errores de conexión.
  if (
    rawBaseUrl.includes("localhost") &&
    !["localhost", "127.0.0.1"].includes(window.location.hostname)
  ) {
    const protocol = window.location.protocol === "https:" ? "https" : "http";
    return `${protocol}://${window.location.hostname}:8000`;
  }

  if (
    rawBaseUrl.includes("backend-fastapi") &&
    window.location.hostname !== "backend-fastapi"
  ) {
    const protocol = window.location.protocol === "https:" ? "https" : "http";
    return `${protocol}://${window.location.hostname}:8000`;
  }

  return rawBaseUrl;
};

const API_BASE_URL = resolveApiBaseUrl();

export const buildTenantHeaders = (
  tenantId?: number | string | null,
): Record<string, string> => {
  if (tenantId === null || tenantId === undefined) {
    return {};
  }
  const normalized = String(tenantId).trim();
  return normalized ? { "X-Tenant-Id": normalized } : {};
};

export const withTenantHeaders = (
  tenantId?: number | string | null,
  config: AxiosRequestConfig = {},
): AxiosRequestConfig => {
  const tenantHeaders = buildTenantHeaders(tenantId);
  if (Object.keys(tenantHeaders).length === 0) {
    return config;
  }

  return {
    ...config,
    headers: {
      ...(config.headers ?? {}),
      ...tenantHeaders,
    },
  };
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Inyecta cabeceras comunes. Se evita depender de localStorage.
apiClient.interceptors.request.use((config) => {
  if (config.baseURL && config.baseURL.includes("backend-fastapi")) {
    const protocol = window.location.protocol === "https:" ? "https" : "http";
    config.baseURL = `${protocol}://${window.location.hostname}:8000`;
  }
  config.headers = {
    ...(config.headers ?? {}),
    "X-Source": "web",
  };
  return config;
});

// Las credenciales se envian via cookie httpOnly configurada en el backend.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("access_token");
      sessionStorage.removeItem("mfa_username");
      if (window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  }
);
