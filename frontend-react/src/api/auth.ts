import { apiClient } from "./client";

/**
 * Tipos y funciones relacionados con autenticación.
 */

export interface LoginResponse {
  access_token?: string;
  token_type?: string;
  mfa_required: boolean;
  message?: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  // El backend espera OAuth2 form: username/password.
  const form = new URLSearchParams();
  form.append("username", email);
  form.append("password", password);

  const response = await apiClient.post<LoginResponse>("/api/v1/auth/login", form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return response.data;
}

export interface MFAVerifyResponse {
  access_token: string;
  token_type: string;
  mfa_required: boolean;
}

export async function verifyMFA(username: string, mfaCode: string): Promise<MFAVerifyResponse> {
  const response = await apiClient.post<MFAVerifyResponse>("/api/v1/auth/mfa/verify", {
    username,
    mfa_code: mfaCode,
  });
  return response.data;
}

