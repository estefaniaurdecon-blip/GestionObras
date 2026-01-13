import axios from "axios";

/**
 * Cliente HTTP centralizado usando Axios.
 *
 * Aquí se maneja:
 * - Base URL de la API.
 * - Inclusión automática del token JWT.
 * - Interceptores para errores globales.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is required");
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Helper para obtener el token guardado de forma segura.
// En un sistema real se recomienda usar cookies httpOnly o secure storage.
function getAccessToken(): string | null {
  return localStorage.getItem("access_token");
}

// Interceptor para adjuntar el token JWT en cada petición.
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});
