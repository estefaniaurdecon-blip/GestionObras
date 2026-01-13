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
  withCredentials: true,
});

// Las credenciales se envian via cookie httpOnly configurada en el backend.
