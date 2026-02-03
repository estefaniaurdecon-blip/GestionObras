import axios from "axios";

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
  if (!rawBaseUrl || rawBaseUrl === "relative" || rawBaseUrl === "/") {
    // Usa mismo origen (Vite proxy) si se pide modo relativo.
    return "";
  }

  // Si estamos accediendo desde otra mÃ¡quina y el base apunta a localhost,
  // sustituimos por el hostname actual para evitar errores de conexiÃ³n.
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

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Inyecta X-Tenant-Id si existe en localStorage (superadmin).
apiClient.interceptors.request.use((config) => {
  if (config.baseURL && config.baseURL.includes("backend-fastapi")) {
    const protocol = window.location.protocol === "https:" ? "https" : "http";
    config.baseURL = `${protocol}://${window.location.hostname}:8000`;
  }
  const existingTenantHeader =
    config.headers &&
    (config.headers["X-Tenant-Id"] ?? (config.headers as any)["x-tenant-id"]);
  const tenantId = localStorage.getItem("x_tenant_id");
  if (!existingTenantHeader && tenantId) {
    config.headers = {
      ...config.headers,
      "X-Tenant-Id": tenantId,
      "X-Source": "web",
    };
  } else {
    config.headers = {
      ...config.headers,
      "X-Source": "web",
    };
  }
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
