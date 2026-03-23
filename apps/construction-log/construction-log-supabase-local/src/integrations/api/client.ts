/**
 * API Client for backend-fastapi
 * Replaces Supabase client with standard REST API calls
 */
import { Capacitor } from '@capacitor/core';
import { clearToken, getAuthHeader, setToken } from './storage';
import { createNotificationsApi } from './modules/notifications';
import { createMessagesApi } from './modules/messages';
import { createAttachmentsApi } from './modules/attachments';
import { createUsersApi, normalizeApiUser } from './modules/users';
import { createUserManagementApi } from './modules/userManagement';
import { createOrganizationApi } from './modules/organization';
import { createToolsApi } from './modules/tools';
import { createAiRuntimeApi } from './modules/aiRuntime';
import { createCustomHolidaysApi } from './modules/customHolidays';
import { createCompanyPortfolioApi } from './modules/companyPortfolio';
import { createPhasesApi } from './modules/phases';
import { createRentalMachineryApi } from './modules/rentalMachinery';
import { createRentalMachineryAssignmentsApi } from './modules/rentalMachineryAssignments';
import { createWorkRepasosApi } from './modules/workRepasos';
import { createWorkPostventasApi } from './modules/workPostventas';
import { createWorkReportCommentsApi } from './modules/workReportComments';
import { createSavedEconomicReportsApi } from './modules/savedEconomicReports';
import type {
  ApiErpWorkReport,
  CreateErpWorkReportPayload,
  ListErpWorkReportsParams,
  UpdateErpWorkReportPayload,
} from '@/services/workReportContract';
import type { ApiUser } from './modules/users';

// Re-export storage functions for convenience
export { clearToken, getAuthHeader, getToken, setToken, TokenData } from './storage';
export { decodeJwtExpiryMs, getTokenExpiryMs, isTokenExpired } from './storage';

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').trim();
const RAW_NATIVE_API_BASE_URL = (import.meta.env.VITE_NATIVE_API_BASE_URL || '').trim();
const RAW_API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 2000);
const API_REQUEST_TIMEOUT_MS =
  Number.isFinite(RAW_API_TIMEOUT_MS) && RAW_API_TIMEOUT_MS > 0 ? RAW_API_TIMEOUT_MS : 2000;
export const AUTH_SESSION_EXPIRED_EVENT = 'app-auth-session-expired';
let authSessionExpiredNotified = false;

function normalizeBaseUrl(url: string): string {
  if (url.length > 1 && url.endsWith('/')) return url.slice(0, -1);
  return url;
}

function resolveApiBaseUrl(): string {
  const webBaseUrl = normalizeBaseUrl(RAW_API_BASE_URL);
  const isNative = Capacitor.isNativePlatform?.() === true;

  if (!isNative) return webBaseUrl;

  if (RAW_NATIVE_API_BASE_URL) {
    return normalizeBaseUrl(RAW_NATIVE_API_BASE_URL);
  }

  if (webBaseUrl.startsWith('/')) {
    const fallbackBaseUrl = 'http://10.0.2.2:8000';
    console.warn(
      `[api] Native platform + VITE_API_BASE_URL relativo (${webBaseUrl}). ` +
        `Usando fallback ${fallbackBaseUrl}. Define VITE_NATIVE_API_BASE_URL para fijarlo.`
    );
    return fallbackBaseUrl;
  }

  return webBaseUrl;
}

let activeApiBaseUrl = resolveApiBaseUrl();
const TENANT_ID = import.meta.env.VITE_TENANT_ID;

export interface ApiError extends Error {
  status?: number;
  data?: unknown;
}

function normalizeApiPath(path: string, baseUrl = activeApiBaseUrl): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // When using Vite proxy with base "/api", avoid generating "/api/api/v1/*".
  if (
    (baseUrl === '/api' || baseUrl.endsWith('/api')) &&
    normalizedPath.startsWith('/api/')
  ) {
    return normalizedPath.slice(4);
  }

  return normalizedPath;
}

function buildApiUrl(path: string, baseUrl = activeApiBaseUrl): string {
  return `${baseUrl}${normalizeApiPath(path, baseUrl)}`;
}

export function getApiBaseUrl(): string {
  return activeApiBaseUrl;
}

function resolveNativeLoopbackFallback(baseUrl: string): string | null {
  if (Capacitor.isNativePlatform?.() !== true) return null;
  if (!baseUrl || baseUrl.startsWith('/')) return null;

  try {
    const parsed = new URL(baseUrl);
    if (parsed.hostname === '10.0.2.2') {
      parsed.hostname = '127.0.0.1';
      return normalizeBaseUrl(parsed.toString());
    }
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
      parsed.hostname = '10.0.2.2';
      return normalizeBaseUrl(parsed.toString());
    }
  } catch {
    return null;
  }

  return null;
}

function resolveNativeApiFallbackCandidates(baseUrl: string): string[] {
  if (Capacitor.isNativePlatform?.() !== true) return [];
  if (!baseUrl || baseUrl.startsWith('/')) return [];

  try {
    const parsed = new URL(baseUrl);
    const scheme = parsed.protocol;
    const port = parsed.port;
    const path = parsed.pathname;
    const query = parsed.search;
    const hash = parsed.hash;
    const userInfo = parsed.username
      ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}@`
      : '';
    const originalHost = parsed.hostname;
    const hosts = [originalHost, '10.0.2.2', '127.0.0.1', 'localhost'];
    const uniqueHosts = [...new Set(hosts.filter(Boolean))];

    return uniqueHosts
      .map((host) => `${scheme}//${userInfo}${host}${port ? `:${port}` : ''}${path}${query}${hash}`)
      .map(normalizeBaseUrl)
      .filter((candidate) => candidate && candidate !== baseUrl);
  } catch {
    return [];
  }
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function notifyAuthSessionExpired(): void {
  if (typeof window === 'undefined' || authSessionExpiredNotified) return;
  authSessionExpiredNotified = true;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
}

export function resetAuthSessionExpiredNotification(): void {
  authSessionExpiredNotified = false;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const timeoutMs = API_REQUEST_TIMEOUT_MS;
  const upstreamSignal = init.signal;

  if (timeoutMs <= 0 && !upstreamSignal) {
    return fetch(url, init);
  }

  const controller = new AbortController();
  let timeoutTriggered = false;

  const onUpstreamAbort = () => controller.abort();
  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort();
    } else {
      upstreamSignal.addEventListener('abort', onUpstreamAbort, { once: true });
    }
  }

  const timeoutId =
    timeoutMs > 0
      ? setTimeout(() => {
          timeoutTriggered = true;
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timeoutTriggered) {
      throw new TypeError(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    if (upstreamSignal) {
      upstreamSignal.removeEventListener('abort', onUpstreamAbort);
    }
  }
}

async function fetchWithNativeFallback(path: string, init: RequestInit): Promise<Response> {
  const primaryUrl = buildApiUrl(path);

  try {
    return await fetchWithTimeout(primaryUrl, init);
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    const candidates = [
      resolveNativeLoopbackFallback(activeApiBaseUrl),
      ...resolveNativeApiFallbackCandidates(activeApiBaseUrl),
    ].filter((candidate): candidate is string => Boolean(candidate));

    let lastError: unknown = error;
    for (const fallbackBaseUrl of [...new Set(candidates)]) {
      if (fallbackBaseUrl === activeApiBaseUrl) continue;
      try {
        const fallbackUrl = buildApiUrl(path, fallbackBaseUrl);
        const response = await fetchWithTimeout(fallbackUrl, init);
        activeApiBaseUrl = fallbackBaseUrl;
        console.warn(`[api] Fallback nativo aplicado. Nueva base URL: ${activeApiBaseUrl}`);
        return response;
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }

    throw lastError;
  }
}

/**
 * Main API fetch function
 * Handles authentication, headers, and error handling
 */
type ApiFetchOptions = RequestInit & {
  skipAuth?: boolean;
  skipSessionRecovery?: boolean;
};

async function tryRefreshSession(): Promise<boolean> {
  const response = await fetchWithNativeFallback('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...(TENANT_ID ? { 'X-Tenant-Id': TENANT_ID } : {}),
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      return false;
    }

    const error: ApiError = new Error('No se pudo renovar la sesión');
    error.status = response.status;

    try {
      const data = await response.json();
      error.data = data;
      if (data?.detail) {
        error.message = data.detail;
      }
    } catch {
      // Ignore parsing errors
    }

    throw error;
  }

  const refreshResponse = (await response.json()) as MFAVerifyResponse;
  if (refreshResponse.access_token) {
    await setToken({
      access_token: refreshResponse.access_token,
      token_type: refreshResponse.token_type || 'Bearer',
    });
  }
  resetAuthSessionExpiredNotification();
  return Boolean(refreshResponse.access_token);
}

export async function refreshSessionIfPossible(): Promise<boolean> {
  try {
    return await tryRefreshSession();
  } catch (error) {
    if (isNetworkError(error)) {
      return false;
    }
    throw error;
  }
}

export async function apiFetch(
  path: string,
  init?: ApiFetchOptions
): Promise<Response> {
  // Build headers
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  
  // Add content-type if not present and not FormData
  if (!headers['Content-Type'] && !(init?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  // Add auth token if available and not skipped
  if (!init?.skipAuth) {
    Object.assign(headers, await getAuthHeader());
  }
  
  // Add tenant ID header if configured and caller didn't provide one explicitly
  if (TENANT_ID && !headers['X-Tenant-Id'] && !headers['x-tenant-id']) {
    headers['X-Tenant-Id'] = TENANT_ID;
  }
  
  const { skipAuth, skipSessionRecovery, ...restInit } = init ?? {};

  const fetchOptions: RequestInit = {
    ...restInit,
    credentials: init?.credentials ?? 'include',
    headers,
  };

  const response = await fetchWithNativeFallback(path, fetchOptions);
  
  // Handle 401 Unauthorized - clear token and throw error
  if (response.status === 401) {
    if (!skipAuth && !skipSessionRecovery) {
      const sessionRecovered = await refreshSessionIfPossible();
      if (sessionRecovered) {
        return apiFetch(path, {
          ...init,
          skipSessionRecovery: true,
        });
      }
    }
    await clearToken();
    notifyAuthSessionExpired();
    const error: ApiError = new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
    error.status = 401;
    throw error;
  }
  
  return response;
}

/**
 * Typed API response wrapper
 */
export async function apiFetchJson<T>(
  path: string,
  init?: ApiFetchOptions
): Promise<T> {
  const response = await apiFetch(path, init);
  
  if (!response.ok) {
    const error: ApiError = new Error(`API Error: ${response.status} ${response.statusText}`);
    error.status = response.status;
    
    // Try to parse error details
    try {
      const parsedErrorData: unknown = await response.json();
      error.data = parsedErrorData;
      if (typeof parsedErrorData === 'object' && parsedErrorData !== null && 'detail' in parsedErrorData) {
        const detail = (parsedErrorData as { detail?: unknown }).detail;
        if (typeof detail === 'string' && detail.trim()) {
          error.message = detail;
        } else if (detail !== undefined && detail !== null) {
          error.message = String(detail);
        }
      }
    } catch {
      // Ignore parsing errors
    }
    
    throw error;
  }
  
  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    const bodyPreview = (await response.text()).slice(0, 120);
    const error: ApiError = new Error(
      'Respuesta no JSON desde API. Revisa VITE_API_BASE_URL/VITE_NATIVE_API_BASE_URL.'
    );
    error.status = response.status;
    error.data = { contentType, bodyPreview };
    throw error;
  }

  return response.json() as Promise<T>;
}

// ============================================================
// AUTHENTICATION API
// ============================================================

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token?: string;
  token_type?: string;
  mfa_required?: boolean;
  temp_token?: string;
  user?: ApiUser;
}

export interface MFAVerifyRequest {
  username: string;
  mfa_code: string;
}

export interface MFAVerifyResponse {
  access_token?: string;
  token_type?: string;
  user?: ApiUser;
  mfa_required?: boolean;
}

export interface DashboardSummary {
  tenants_activos: number;
  usuarios_activos: number;
  herramientas_activas: number;
  horas_hoy: number;
  horas_ultima_semana: number;
  tickets_abiertos: number;
  tickets_en_progreso: number;
  tickets_resueltos_hoy: number;
  tickets_cerrados_ultima_semana: number;
}

export interface SummaryMilestone {
  label: string;
  hours: number;
}

export interface YearlySummary {
  projectJustify: Record<string, number>;
  projectJustified: Record<string, number>;
  summaryMilestones: Record<string, SummaryMilestone[]>;
}

/**
 * Login with username and password
 * Uses form-urlencoded format as expected by OAuth2
 */
export async function login(request: LoginRequest): Promise<LoginResponse> {
  const normalizedUsername = request.username.trim();
  const trimmedPassword = request.password.trim();

  const loginAttempts: LoginRequest[] = [{ username: normalizedUsername, password: request.password }];

  // Backend auth compares email with case-sensitive equality.
  // Retry once with lowercase email to tolerate common input mistakes.
  if (normalizedUsername.includes('@')) {
    const lowercaseUsername = normalizedUsername.toLowerCase();
    if (lowercaseUsername !== normalizedUsername) {
      loginAttempts.push({ username: lowercaseUsername, password: request.password });
      if (trimmedPassword !== request.password) {
        loginAttempts.push({ username: lowercaseUsername, password: trimmedPassword });
      }
    }
  }

  if (trimmedPassword !== request.password) {
    loginAttempts.push({ username: normalizedUsername, password: trimmedPassword });
  }

  const uniqueAttempts: LoginRequest[] = [];
  const seenAttempts = new Set<string>();
  for (const attempt of loginAttempts) {
    const key = `${attempt.username}\u0000${attempt.password}`;
    if (seenAttempts.has(key)) continue;
    seenAttempts.add(key);
    uniqueAttempts.push(attempt);
  }

  let lastError: ApiError | null = null;

  for (const attempt of uniqueAttempts) {
    try {
      return await performLoginRequest(attempt);
    } catch (error: unknown) {
      const apiError = error as ApiError & { data?: { detail?: unknown } };
      const detail = String(apiError.data?.detail || '');
      const isInvalidCredentials =
        apiError.status === 400 &&
        /credenciales incorrectas/i.test(detail);

      if (!isInvalidCredentials) {
        throw apiError;
      }

      lastError = apiError;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('Error al iniciar sesion');
}

async function performLoginRequest(request: LoginRequest): Promise<LoginResponse> {
  const formData = new URLSearchParams();
  formData.append('username', request.username);
  formData.append('password', request.password);
  
  const response = await fetchWithNativeFallback('/api/v1/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(TENANT_ID ? { 'X-Tenant-Id': TENANT_ID } : {}),
    },
    body: formData.toString(),
  });
  
  if (!response.ok) {
    const error: ApiError = new Error('Error al iniciar sesión');
    error.status = response.status;
    
    try {
      const data = await response.json();
      error.data = data;
      if (data?.detail) {
        error.message = data.detail;
      }
    } catch {
      // Ignore parsing errors
    }
    
    throw error;
  }
  
  resetAuthSessionExpiredNotification();
  return response.json();
}

/**
 * Verify MFA code
 */
export async function verifyMFA(request: MFAVerifyRequest): Promise<MFAVerifyResponse> {
  const result = await apiFetchJson<MFAVerifyResponse>('/api/v1/auth/mfa/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    skipAuth: true,
  });
  resetAuthSessionExpiredNotification();
  return result;
}

/**
 * Get current user info
 */
export async function getCurrentUser(): Promise<ApiUser> {
  const user = await apiFetchJson<ApiUser>('/api/v1/users/me');
  return normalizeApiUser(user);
}

/**
 * Logout - clear token on backend (optional) and locally
 */
export async function logout(): Promise<void> {
  try {
    // Try to notify backend (optional, may fail if token expired)
    await apiFetch('/api/v1/auth/logout', {
      method: 'POST',
    });
  } catch {
    // Ignore errors during logout
  } finally {
    await clearToken();
    resetAuthSessionExpiredNotification();
  }
}

export async function forgotPassword(email: string): Promise<void> {
  await apiFetch('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
    skipAuth: true,
  });
}

export async function resetPassword(
  token: string,
  newPassword: string,
  newPasswordConfirm: string,
): Promise<{ email: string }> {
  return apiFetchJson<{ email: string }>('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      token,
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm,
    }),
    skipAuth: true,
  });
}

// ============================================================
// PROJECTS/WORKS API (Obras)
// ============================================================

export interface ApiProject {
  id: number;
  name: string;
  code?: string;
  description?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  start_date?: string;
  end_date?: string;
  duration_months?: number;
  loan_percent?: number;
  subsidy_percent?: number;
  is_active?: boolean;
  status?: string;
  budget?: number;
  tenant_id?: number;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectCreate {
  name: string;
  code?: string;
  description?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  start_date?: string;
  end_date?: string;
  budget?: number;
}

export interface ProjectUpdate {
  name?: string;
  code?: string;
  description?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  budget?: number;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ApiBudgetLineMilestone {
  id: number;
  milestone_id: number;
  amount: number | string;
  justified: number | string;
  created_at: string;
}

export interface ApiProjectBudgetLine {
  id: number;
  project_id: number;
  concept: string;
  hito1_budget: number | string;
  justified_hito1: number | string;
  hito2_budget: number | string;
  justified_hito2: number | string;
  approved_budget: number | string;
  percent_spent: number | string;
  forecasted_spent: number | string;
  created_at: string;
  milestones?: ApiBudgetLineMilestone[];
}

export interface ApiProjectBudgetMilestone {
  id: number;
  project_id: number;
  name: string;
  order_index: number;
  created_at: string;
}

export interface ApiProjectBudgetLinePayload {
  concept: string;
  hito1_budget: number;
  justified_hito1: number;
  hito2_budget: number;
  justified_hito2: number;
  approved_budget: number;
  percent_spent: number;
  forecasted_spent: number;
}

export interface ApiProjectBudgetLineUpdatePayload
  extends Partial<
    ApiProjectBudgetLinePayload & {
      milestones: Array<{
        milestone_id: number;
        amount?: number | null;
        justified?: number | null;
      }>;
    }
  > {}

export interface ApiProjectBudgetMilestonePayload {
  name: string;
  order_index?: number;
}

export interface ApiExternalCollaboration {
  id: number;
  collaboration_type: string;
  name: string;
  legal_name: string;
  cif: string;
  contact_email: string;
  created_at: string;
  updated_at: string;
}

export interface ApiErpMilestone {
  id: number;
  project_id: number;
  activity_id?: number | null;
  title: string;
  description?: string | null;
  due_date?: string | null;
  allow_late_submission?: boolean;
  created_at: string;
}

/**
 * List all projects (Obras)
 */
export async function listProjects(tenantId?: string | number | null): Promise<ApiProject[]> {
  return apiFetchJson<ApiProject[]>('/api/v1/erp/projects', {
    headers: tenantHeader(tenantId),
  });
}

/**
 * Get a single project by ID
 */
export async function getProject(
  projectId: number,
  tenantId?: string | number | null
): Promise<ApiProject> {
  return apiFetchJson<ApiProject>(`/api/v1/erp/projects/${projectId}`, {
    headers: tenantHeader(tenantId),
  });
}

/**
 * Create a new project
 */
export async function createProject(
  data: ProjectCreate,
  tenantId?: string | number | null
): Promise<ApiProject> {
  return apiFetchJson<ApiProject>('/api/v1/erp/projects', {
    method: 'POST',
    headers: tenantHeader(tenantId),
    body: JSON.stringify(data),
  });
}

/**
 * Update a project
 */
export async function updateProject(
  projectId: number,
  data: ProjectUpdate,
  tenantId?: string | number | null
): Promise<ApiProject> {
  return apiFetchJson<ApiProject>(`/api/v1/erp/projects/${projectId}`, {
    method: 'PATCH',
    headers: tenantHeader(tenantId),
    body: JSON.stringify(data),
  });
}

/**
 * Delete a project
 */
export async function deleteProject(
  projectId: number,
  tenantId?: string | number | null
): Promise<void> {
  return apiFetchJson<void>(`/api/v1/erp/projects/${projectId}`, {
    method: 'DELETE',
    headers: tenantHeader(tenantId),
  });
}

export async function deleteErpWorkReport(
  reportId: number,
  tenantId?: string | number | null
): Promise<void> {
  return apiFetchJson<void>(`/api/v1/erp/work-reports/${reportId}`, {
    method: 'DELETE',
    headers: tenantHeader(tenantId),
  });
}

export type {
  ApiErpWorkReport,
  CreateErpWorkReportPayload,
  ListErpWorkReportsParams,
  UpdateErpWorkReportPayload,
} from '@/services/workReportContract';

export async function listErpWorkReports(
  params: ListErpWorkReportsParams = {}
): Promise<ApiErpWorkReport[]> {
  const query = buildQueryParams({
    project_id: params.projectId,
    external_id: params.externalId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    status: params.status,
    updated_since: params.updatedSince,
    include_deleted: params.includeDeleted,
    limit: params.limit,
    offset: params.offset,
  });

  return apiFetchJson<ApiErpWorkReport[]>(`/api/v1/erp/work-reports${query}`, {
    headers: tenantHeader(params.tenantId),
  });
}

export async function createErpWorkReport(
  data: CreateErpWorkReportPayload,
  tenantId?: string | number | null
): Promise<ApiErpWorkReport> {
  return apiFetchJson<ApiErpWorkReport>('/api/v1/erp/work-reports', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: tenantHeader(tenantId),
  });
}

export async function updateErpWorkReport(
  reportId: number,
  data: UpdateErpWorkReportPayload,
  tenantId?: string | number | null
): Promise<ApiErpWorkReport> {
  return apiFetchJson<ApiErpWorkReport>(`/api/v1/erp/work-reports/${reportId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
    headers: tenantHeader(tenantId),
  });
}

export async function getErpWorkReport(
  reportId: number,
  tenantId?: string | number | null
): Promise<ApiErpWorkReport> {
  return apiFetchJson<ApiErpWorkReport>(`/api/v1/erp/work-reports/${reportId}`, {
    headers: tenantHeader(tenantId),
  });
}

function buildQueryParams(params: Record<string, string | number | boolean | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

function tenantHeader(tenantId?: string | number | null): Record<string, string> | undefined {
  if (tenantId === null || tenantId === undefined) return undefined;
  const normalized = String(tenantId).trim();
  if (!normalized) return undefined;
  return { 'X-Tenant-Id': normalized };
}

export async function listProjectBudgets(
  projectId: number,
  tenantId?: string | number | null
): Promise<ApiProjectBudgetLine[]> {
  return apiFetchJson<ApiProjectBudgetLine[]>(`/api/v1/erp/projects/${projectId}/budgets`, {
    headers: tenantHeader(tenantId),
  });
}

export async function listProjectBudgetMilestones(
  projectId: number,
  tenantId?: string | number | null
): Promise<ApiProjectBudgetMilestone[]> {
  return apiFetchJson<ApiProjectBudgetMilestone[]>(
    `/api/v1/erp/projects/${projectId}/budget-milestones`,
    {
      headers: tenantHeader(tenantId),
    }
  );
}

export async function createProjectBudgetLine(
  projectId: number,
  payload: ApiProjectBudgetLinePayload,
  tenantId?: string | number | null
): Promise<ApiProjectBudgetLine> {
  return apiFetchJson<ApiProjectBudgetLine>(`/api/v1/erp/projects/${projectId}/budgets`, {
    method: 'POST',
    headers: tenantHeader(tenantId),
    body: JSON.stringify(payload),
  });
}

export async function updateProjectBudgetLine(
  projectId: number,
  budgetId: number,
  payload: ApiProjectBudgetLineUpdatePayload,
  tenantId?: string | number | null
): Promise<ApiProjectBudgetLine> {
  return apiFetchJson<ApiProjectBudgetLine>(`/api/v1/erp/projects/${projectId}/budgets/${budgetId}`, {
    method: 'PATCH',
    headers: tenantHeader(tenantId),
    body: JSON.stringify(payload),
  });
}

export async function deleteProjectBudgetLine(
  projectId: number,
  budgetId: number,
  tenantId?: string | number | null
): Promise<void> {
  return apiFetchJson<void>(`/api/v1/erp/projects/${projectId}/budgets/${budgetId}`, {
    method: 'DELETE',
    headers: tenantHeader(tenantId),
  });
}

export async function createProjectBudgetMilestone(
  projectId: number,
  payload: ApiProjectBudgetMilestonePayload,
  tenantId?: string | number | null
): Promise<ApiProjectBudgetMilestone> {
  return apiFetchJson<ApiProjectBudgetMilestone>(`/api/v1/erp/projects/${projectId}/budget-milestones`, {
    method: 'POST',
    headers: tenantHeader(tenantId),
    body: JSON.stringify(payload),
  });
}

export async function updateProjectBudgetMilestone(
  projectId: number,
  milestoneId: number,
  payload: Partial<ApiProjectBudgetMilestonePayload>,
  tenantId?: string | number | null
): Promise<ApiProjectBudgetMilestone> {
  return apiFetchJson<ApiProjectBudgetMilestone>(
    `/api/v1/erp/projects/${projectId}/budget-milestones/${milestoneId}`,
    {
      method: 'PATCH',
      headers: tenantHeader(tenantId),
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteProjectBudgetMilestone(
  projectId: number,
  milestoneId: number,
  tenantId?: string | number | null
): Promise<void> {
  return apiFetchJson<void>(`/api/v1/erp/projects/${projectId}/budget-milestones/${milestoneId}`, {
    method: 'DELETE',
    headers: tenantHeader(tenantId),
  });
}

export async function listExternalCollaborations(
  tenantId?: string | number | null
): Promise<ApiExternalCollaboration[]> {
  return apiFetchJson<ApiExternalCollaboration[]>('/api/v1/erp/external-collaborations', {
    headers: tenantHeader(tenantId),
  });
}

export async function listErpMilestones(
  projectId: number,
  tenantId?: string | number | null
): Promise<ApiErpMilestone[]> {
  const query = buildQueryParams({
    project_id: projectId,
  });
  return apiFetchJson<ApiErpMilestone[]>(`/api/v1/erp/milestones${query}`, {
    headers: tenantHeader(tenantId),
  });
}

// ============================================================
// ACCESS CONTROL REPORTS API
// ============================================================

export interface ApiAccessControlReport {
  id: number;
  tenant_id: number;
  project_id?: number | null;
  external_id?: string | null;
  date: string;
  site_name: string;
  responsible: string;
  responsible_entry_time?: string | null;
  responsible_exit_time?: string | null;
  observations: string;
  personal_entries: Record<string, unknown>[];
  machinery_entries: Record<string, unknown>[];
  additional_tasks?: string | null;
  created_by_id?: number | null;
  updated_by_id?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface AccessControlReportCreatePayload {
  date: string;
  site_name: string;
  responsible: string;
  project_id?: number | null;
  external_id?: string | null;
  responsible_entry_time?: string | null;
  responsible_exit_time?: string | null;
  observations?: string;
  personal_entries?: Record<string, unknown>[];
  machinery_entries?: Record<string, unknown>[];
  additional_tasks?: string | null;
}

export interface AccessControlReportUpdatePayload {
  date?: string;
  site_name?: string;
  responsible?: string;
  project_id?: number | null;
  external_id?: string | null;
  responsible_entry_time?: string | null;
  responsible_exit_time?: string | null;
  observations?: string;
  personal_entries?: Record<string, unknown>[];
  machinery_entries?: Record<string, unknown>[];
  additional_tasks?: string | null;
  expected_updated_at?: string;
}

export interface ListAccessControlReportsParams {
  tenantId?: string | number | null;
  projectId?: number;
  dateFrom?: string;
  dateTo?: string;
  updatedSince?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export async function listAccessControlReports(
  params: ListAccessControlReportsParams = {}
): Promise<ApiAccessControlReport[]> {
  const query = buildQueryParams({
    project_id: params.projectId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    updated_since: params.updatedSince,
    include_deleted: params.includeDeleted,
    limit: params.limit,
    offset: params.offset,
  });
  return apiFetchJson<ApiAccessControlReport[]>(`/api/v1/erp/access-control-reports${query}`, {
    headers: tenantHeader(params.tenantId),
  });
}

export async function createAccessControlReport(
  payload: AccessControlReportCreatePayload,
  tenantId?: string | number | null
): Promise<ApiAccessControlReport> {
  return apiFetchJson<ApiAccessControlReport>('/api/v1/erp/access-control-reports', {
    method: 'POST',
    headers: tenantHeader(tenantId),
    body: JSON.stringify(payload),
  });
}

export async function updateAccessControlReport(
  reportId: number,
  payload: AccessControlReportUpdatePayload,
  tenantId?: string | number | null
): Promise<ApiAccessControlReport> {
  return apiFetchJson<ApiAccessControlReport>(`/api/v1/erp/access-control-reports/${reportId}`, {
    method: 'PATCH',
    headers: tenantHeader(tenantId),
    body: JSON.stringify(payload),
  });
}

export async function deleteAccessControlReport(
  reportId: number,
  tenantId?: string | number | null
): Promise<void> {
  return apiFetchJson<void>(`/api/v1/erp/access-control-reports/${reportId}`, {
    method: 'DELETE',
    headers: tenantHeader(tenantId),
  });
}

// ============================================================
// APP UPDATES API
// ============================================================

export type UpdatePlatform = 'windows' | 'android' | 'web';

export interface CheckAppUpdatesRequest {
  currentVersion: string;
  platform: UpdatePlatform;
}

export interface CheckAppUpdatesResponse {
  updateAvailable: boolean;
  version?: string;
  downloadUrl?: string;
  fileSize?: number;
  releaseNotes?: string;
  isMandatory?: boolean;
  message?: string;
}

export async function checkAppUpdates(
  payload: CheckAppUpdatesRequest
): Promise<CheckAppUpdatesResponse> {
  return apiFetchJson<CheckAppUpdatesResponse>('/api/v1/updates/check', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipAuth: true,
  });
}

// ============================================================
// DASHBOARD API
// ============================================================

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetchJson<DashboardSummary>('/api/v1/dashboard/summary');
}

export async function getYearlySummary(year: number): Promise<YearlySummary> {
  return apiFetchJson<YearlySummary>(`/api/v1/erp/summary/${year}`);
}

// ============================================================
// NOTIFICATIONS API
// ============================================================

export type {
  ApiNotificationListResponse,
  ApiNotificationRead,
  ApiNotificationType,
  ListNotificationsParams,
} from './modules/notifications';

const notificationsApi = createNotificationsApi({
  apiFetchJson,
  buildQueryParams,
});

export const listNotifications = notificationsApi.listNotifications;
export const markNotificationAsRead = notificationsApi.markNotificationAsRead;
export const markAllNotificationsAsRead = notificationsApi.markAllNotificationsAsRead;
export const deleteNotification = notificationsApi.deleteNotification;
export const createNotification = notificationsApi.createNotification;

// ============================================================
// MESSAGES API
// ============================================================

export type {
  ApiMessageListResponse,
  ApiMessageRead,
  ApiMessageUserRead,
  ListMessagesParams,
  MessageCreatePayload,
} from './modules/messages';

const messagesApi = createMessagesApi({
  apiFetchJson,
  buildQueryParams,
  tenantHeader,
});

export const listMessages = messagesApi.listMessages;
export const createMessage = messagesApi.createMessage;
export const markMessageAsRead = messagesApi.markMessageAsRead;
export const deleteMessage = messagesApi.deleteMessage;
export const deleteConversationMessages = messagesApi.deleteConversationMessages;
export const clearAllMessages = messagesApi.clearAllMessages;

// ============================================================
// USERS API
// ============================================================

export type {
  ApiTenant,
  ApiUser,
  ChangePasswordRequest,
  UserCreateRequest,
  UserProfileUpdateRequest,
  UserStatusUpdateRequest,
  UserUpdateRequest,
} from './modules/users';

const usersApi = createUsersApi({
  apiFetchJson,
});

export const listUsersByTenant = usersApi.listUsersByTenant;
export const listContactUsersByTenant = usersApi.listContactUsersByTenant;
export const listTenants = usersApi.listTenants;
export const createUser = usersApi.createUser;
export const updateUser = usersApi.updateUser;
export const updateUserStatus = usersApi.updateUserStatus;
export const deleteUser = usersApi.deleteUser;
export const updateCurrentUserProfile = usersApi.updateCurrentUserProfile;
export const changePassword = usersApi.changePassword;

// ============================================================
// USER MANAGEMENT API (construction-log compatibility)
// ============================================================

export type {
  ApiAppRole,
  ApiManagedUser,
  ApiUserAssignments,
  ApiUserRoles,
} from './modules/userManagement';

const userManagementApi = createUserManagementApi({
  apiFetchJson,
  buildQueryParams,
});

export const listManagedUsers = userManagementApi.listManagedUsers;
export const listManagedUsersByRole = userManagementApi.listUsersByRole;
export const listManagedUserRoles = userManagementApi.listUserRoles;
export const addManagedUserRole = userManagementApi.addUserRole;
export const removeManagedUserRole = userManagementApi.removeUserRole;
export const approveManagedUser = userManagementApi.approveManagedUser;
export const listManagedUserAssignments = userManagementApi.listUserAssignments;
export const assignManagedUserToWork = userManagementApi.assignUserToWork;
export const removeManagedUserFromWork = userManagementApi.removeUserFromWork;
export const listAssignableForemen = userManagementApi.listAssignableForemen;
export const deleteUserAndData = userManagementApi.deleteUserAndData;

export type {
  ApiOrganization,
  BrandingTenantApi,
  UpdateOrganizationPayload,
  UserPlatformPreference,
  UserPreferencesApi,
} from './modules/organization';

const organizationApi = createOrganizationApi({
  apiFetchJson,
});

export const getMyOrganization = organizationApi.getMyOrganization;
export const updateMyOrganization = organizationApi.updateMyOrganization;
export const uploadMyOrganizationLogo = organizationApi.uploadMyOrganizationLogo;
export const removeMyOrganizationLogo = organizationApi.removeMyOrganizationLogo;
export const getBrandingByTenant = organizationApi.getBrandingByTenant;
export const getMyUserPreferences = organizationApi.getMyUserPreferences;
export const updateMyUserPreferences = organizationApi.updateMyUserPreferences;

// ============================================================
// CUSTOM HOLIDAYS API
// ============================================================

export type {
  ApiCustomHoliday,
  CreateCustomHolidayPayload,
  ListCustomHolidaysParams,
  UpdateCustomHolidayPayload,
} from './modules/customHolidays';

const customHolidaysApi = createCustomHolidaysApi({
  apiFetchJson,
  buildQueryParams,
});

export const listCustomHolidays = customHolidaysApi.listCustomHolidays;
export const createCustomHoliday = customHolidaysApi.createCustomHoliday;
export const updateCustomHoliday = customHolidaysApi.updateCustomHoliday;
export const deleteCustomHoliday = customHolidaysApi.deleteCustomHoliday;

// ============================================================
// COMPANY PORTFOLIO API
// ============================================================

export type {
  ApiCompanyPortfolioItem,
  ApiCompanyType,
  CreateCompanyPortfolioPayload,
  UpdateCompanyPortfolioPayload,
} from './modules/companyPortfolio';

const companyPortfolioApi = createCompanyPortfolioApi({
  apiFetchJson,
});

export const listCompanyTypes = companyPortfolioApi.listCompanyTypes;
export const createCompanyType = companyPortfolioApi.createCompanyType;
export const renameCompanyType = companyPortfolioApi.renameCompanyType;
export const deleteCompanyType = companyPortfolioApi.deleteCompanyType;
export const listCompanyPortfolio = companyPortfolioApi.listCompanyPortfolio;
export const createCompanyPortfolioItem = companyPortfolioApi.createCompanyPortfolioItem;
export const updateCompanyPortfolioItem = companyPortfolioApi.updateCompanyPortfolioItem;
export const deleteCompanyPortfolioItem = companyPortfolioApi.deleteCompanyPortfolioItem;

// ============================================================
// PHASES API
// ============================================================

export type {
  ApiPhase,
  ApiPhaseStatus,
  CreatePhasePayload,
  UpdatePhasePayload,
} from './modules/phases';

const phasesApi = createPhasesApi({
  apiFetchJson,
});

export const listPhases = phasesApi.listPhases;
export const createPhase = phasesApi.createPhase;
export const updatePhase = phasesApi.updatePhase;
export const deletePhase = phasesApi.deletePhase;
export const checkPhaseHasChildren = phasesApi.checkPhaseHasChildren;

// ============================================================
// RENTAL MACHINERY API
// ============================================================

export type {
  ApiRentalMachinery,
  CreateRentalMachineryPayload,
  ListRentalMachineryParams,
  UpdateRentalMachineryPayload,
} from './modules/rentalMachinery';

const rentalMachineryApi = createRentalMachineryApi({
  apiFetchJson,
  buildQueryParams,
  tenantHeader,
});

export const listRentalMachinery = rentalMachineryApi.listRentalMachinery;
export const createRentalMachinery = rentalMachineryApi.createRentalMachinery;
export const updateRentalMachinery = rentalMachineryApi.updateRentalMachinery;
export const deleteRentalMachinery = rentalMachineryApi.deleteRentalMachinery;

// ============================================================
// RENTAL MACHINERY ASSIGNMENTS API
// ============================================================

export type {
  ApiRentalMachineryAssignment,
  CreateRentalMachineryAssignmentPayload,
  ListRentalMachineryAssignmentsParams,
  UpdateRentalMachineryAssignmentPayload,
} from './modules/rentalMachineryAssignments';

const rentalMachineryAssignmentsApi = createRentalMachineryAssignmentsApi({
  apiFetchJson,
  buildQueryParams,
});

export const listRentalMachineryAssignments =
  rentalMachineryAssignmentsApi.listRentalMachineryAssignments;
export const createRentalMachineryAssignment =
  rentalMachineryAssignmentsApi.createRentalMachineryAssignment;
export const updateRentalMachineryAssignment =
  rentalMachineryAssignmentsApi.updateRentalMachineryAssignment;
export const deleteRentalMachineryAssignment =
  rentalMachineryAssignmentsApi.deleteRentalMachineryAssignment;

// ============================================================
// WORK REPASOS API
// ============================================================

export type {
  ApiWorkRepaso,
  CreateWorkRepasoPayload,
  ListWorkRepasosParams,
  UpdateWorkRepasoPayload,
} from './modules/workRepasos';

const workRepasosApi = createWorkRepasosApi({
  apiFetchJson,
  buildQueryParams,
  tenantHeader,
});

export const listWorkRepasos = workRepasosApi.listWorkRepasos;
export const createWorkRepaso = workRepasosApi.createWorkRepaso;
export const updateWorkRepaso = workRepasosApi.updateWorkRepaso;
export const deleteWorkRepaso = workRepasosApi.deleteWorkRepaso;

// ============================================================
// WORK POSTVENTAS API
// ============================================================

export type {
  ApiWorkPostventa,
  CreateWorkPostventaPayload,
  ListWorkPostventasParams,
  UpdateWorkPostventaPayload,
} from './modules/workPostventas';

const workPostventasApi = createWorkPostventasApi({
  apiFetchJson,
  buildQueryParams,
  tenantHeader,
});

export const listWorkPostventas = workPostventasApi.listWorkPostventas;
export const createWorkPostventa = workPostventasApi.createWorkPostventa;
export const updateWorkPostventa = workPostventasApi.updateWorkPostventa;
export const deleteWorkPostventa = workPostventasApi.deleteWorkPostventa;

// ============================================================
// WORK REPORT COMMENTS API
// ============================================================

export type {
  ApiWorkReportComment,
  ApiWorkReportCommentUser,
  CreateWorkReportCommentPayload,
} from './modules/workReportComments';

const workReportCommentsApi = createWorkReportCommentsApi({
  apiFetchJson,
});

export const listWorkReportComments = workReportCommentsApi.listWorkReportComments;
export const createWorkReportComment = workReportCommentsApi.createWorkReportComment;

// ============================================================
// TOOLS API
// ============================================================

export type { ApiTool, ToolLaunchResponse } from './modules/tools';

const toolsApi = createToolsApi({
  apiFetchJson,
});

export const listToolCatalog = toolsApi.listToolCatalog;
export const listToolsByTenant = toolsApi.listToolsByTenant;
export const launchTool = toolsApi.launchTool;
export const setToolEnabledForTenant = toolsApi.setToolEnabledForTenant;

// ============================================================
// AI RUNTIME API
// ============================================================

export interface GenerateSummaryReportRequest {
  workReports: Record<string, unknown>[];
  filters?: {
    period?: string;
    work?: string;
  };
  organizationId?: string | number | null;
}

export interface GenerateSummaryReportResponse {
  success: boolean;
  statistics: Record<string, unknown>;
  anomalies: Array<Record<string, unknown>>;
  aiAnalysis: string;
  chartData: Record<string, unknown>;
  periodDescription: string;
  error?: string;
}

export interface AnalyzeWorkImageRequest {
  imageBase64: string;
}

export interface AnalyzeWorkImageResponse {
  description: string;
}

export interface BrandColor {
  hex: string;
  name: string;
}

export interface AnalyzeLogoColorsRequest {
  imageDataUrl: string;
}

export interface AnalyzeLogoColorsResponse {
  colors: BrandColor[];
  brandColor: string;
}

export interface CompanyOccurrenceApi {
  name: string;
  sources: string[];
  count: number;
  normalizedName: string;
}

export interface SimilarGroupApi {
  canonicalName: string;
  variations: CompanyOccurrenceApi[];
  totalCount: number;
}

export interface StandardizeCompaniesAnalyzeRequest {
  action: 'analyze';
  threshold?: number;
}

export interface StandardizeCompaniesApplyRequest {
  action: 'apply';
  updates: Array<{
    oldName: string;
    newName: string;
  }>;
}

export type StandardizeCompaniesRequest =
  | StandardizeCompaniesAnalyzeRequest
  | StandardizeCompaniesApplyRequest;

export interface StandardizeCompaniesAnalyzeResponse {
  success: boolean;
  totalCompanies: number;
  duplicateGroups: number;
  groups: SimilarGroupApi[];
}

export interface StandardizeCompaniesApplyResponse {
  success: boolean;
  message: string;
  updatedCount: number;
}

export interface AnalyzeInventoryRequest {
  work_id: string;
}

export interface InventoryAnalysisResult {
  item_id: string;
  original_name: string;
  action: 'delete' | 'update' | 'keep';
  reason: string;
  suggested_changes?: {
    item_type?: string;
    category?: string;
    unit?: string;
    name?: string;
  };
}

export interface DuplicateSupplier {
  suppliers: string[];
  item_count: number;
  reason: string;
  normalized_name: string;
}

export interface AnalyzeInventoryResponse {
  success: boolean;
  message?: string;
  results: InventoryAnalysisResult[];
  duplicate_suppliers: DuplicateSupplier[];
  total_analyzed: number;
}

export interface InventoryItemApi {
  id: string;
  work_id: string;
  item_type: 'material' | 'herramienta';
  category: string | null;
  name: string;
  quantity: number;
  unit: string;
  last_entry_date: string | null;
  last_supplier: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product_code?: string | null;
  unit_price?: number | null;
  total_price?: number | null;
  delivery_note_number?: string | null;
  batch_number?: string | null;
  brand?: string | null;
  model?: string | null;
  condition?: string | null;
  location?: string | null;
  exit_date?: string | null;
  delivery_note_image?: string | null;
  observations?: string | null;
}

export interface InventoryUpdatePayload {
  name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  last_supplier?: string | null;
  last_entry_date?: string | null;
  notes?: string | null;
  product_code?: string | null;
  unit_price?: number | null;
  total_price?: number | null;
  delivery_note_number?: string | null;
  batch_number?: string | null;
  brand?: string | null;
  model?: string | null;
  condition?: string | null;
  location?: string | null;
  exit_date?: string | null;
  observations?: string | null;
}

export interface InventoryMovementApi {
  id: string;
  item_name: string;
  item_type: string;
  item_category?: string | null;
  movement_type: 'entry' | 'exit' | 'transfer' | 'adjustment';
  quantity: number;
  unit: string;
  unit_price?: number | null;
  total_price?: number | null;
  source: 'ai' | 'manual' | 'auto_consumption' | string;
  is_immediate_consumption: boolean;
  delivery_note_number?: string | null;
  supplier?: string | null;
  notes?: string | null;
  created_at: string;
  created_by?: string | null;
  work_id: string;
}

export interface InventoryKpisApi {
  totalStockValue: number;
  directConsumptionValue: number;
  totalMaterialItems: number;
  totalToolItems: number;
  totalMachineryItems: number;
  pendingDeliveryNotes: number;
  recentMovements: InventoryMovementApi[];
}

export interface InventoryMovementCreatePayload {
  work_id: string;
  inventory_item_id: string;
  movement_type: 'entry' | 'exit' | 'transfer' | 'adjustment';
  quantity: number;
  unit?: string;
  unit_price?: number | null;
  total_price?: number | null;
  source?: string | null;
  is_immediate_consumption?: boolean;
  delivery_note_number?: string | null;
  supplier?: string | null;
  notes?: string | null;
}

export interface InventoryMovementUpdatePayload {
  movement_type?: 'entry' | 'exit' | 'transfer' | 'adjustment';
  quantity?: number;
  unit?: string;
  unit_price?: number | null;
  total_price?: number | null;
  source?: string | null;
  is_immediate_consumption?: boolean;
  delivery_note_number?: string | null;
  supplier?: string | null;
  notes?: string | null;
}

export interface MergeInventorySuppliersRequest {
  work_id: string;
  target_supplier: string;
  suppliers_to_merge: string[];
  update_report_material_groups?: boolean;
}

export interface MergeInventorySuppliersResponse {
  success: boolean;
  inventoryUpdated: number;
  reportGroupsUpdated: number;
}

export interface ValidateFixInventoryResponse {
  success: boolean;
  fixedCount: number;
  deletedCount: number;
}

export interface ApplyInventoryAnalysisRequest {
  work_id: string;
  results: Array<{
    item_id: string;
    action: 'delete' | 'update' | 'keep';
    suggested_changes?: Record<string, unknown>;
  }>;
}

export interface ApplyInventoryAnalysisResponse {
  success: boolean;
  deletedCount: number;
  updatedCount: number;
  errorCount: number;
  errors: string[];
}

export type DeliveryNoteStatus = 'pending' | 'validated' | 'rejected';

export interface DeliveryNoteItemPayload {
  id?: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price?: number;
  total_price?: number;
  item_type: 'material' | 'tool' | 'machinery';
  category?: string;
  is_immediate_consumption: boolean;
  ai_confidence?: number;
  serial_number?: string;
  brand?: string;
  model?: string;
  user_corrected?: boolean;
}

export interface DeliveryNoteApi {
  id: string;
  supplier: string;
  delivery_note_number?: string | null;
  delivery_date: string;
  status: DeliveryNoteStatus;
  processed_items: DeliveryNoteItemPayload[];
  raw_ocr_data?: Record<string, unknown> | unknown[] | null;
  ai_confidence?: number | null;
  work_id: string;
  organization_id: string;
  created_at: string;
  notes?: string | null;
  validated_at?: string | null;
  validated_by?: number | null;
}

export interface ListDeliveryNotesParams {
  work_id?: string;
  status?: DeliveryNoteStatus;
  limit?: number;
}

export interface CreateDeliveryNotePayload {
  work_id: string;
  supplier: string;
  delivery_note_number?: string | null;
  delivery_date: string;
  status?: DeliveryNoteStatus;
  processed_items?: DeliveryNoteItemPayload[];
  raw_ocr_data?: Record<string, unknown> | unknown[] | null;
  ai_confidence?: number | null;
  notes?: string | null;
}

export interface UpdateDeliveryNotePayload {
  supplier?: string;
  delivery_note_number?: string | null;
  delivery_date?: string;
  status?: DeliveryNoteStatus;
  processed_items?: DeliveryNoteItemPayload[];
  raw_ocr_data?: Record<string, unknown> | unknown[] | null;
  ai_confidence?: number | null;
  notes?: string | null;
}

export interface ValidateDeliveryNotePayload {
  work_id: string;
  items: DeliveryNoteItemPayload[];
}

export interface DeliveryNoteMutationResponse {
  success: boolean;
  note: DeliveryNoteApi;
}

export interface PopulateInventoryRequest {
  work_id: string;
  force?: boolean;
}

export interface PopulateInventoryResponse {
  message: string;
  itemsInserted: number;
  itemsUpdated: number;
  immediateConsumptionItems: number;
  errors: number;
  reportsAnalyzed: number;
  newReports: number;
  alreadySynced: number;
  itemsProcessed: number;
}

export interface CleanInventoryRequest {
  work_id: string;
  organization_id?: string;
}

export interface CleanInventoryResponse {
  success: boolean;
  message: string;
  deletedCount: number;
  totalScanned: number;
  remaining: number;
}

const aiRuntimeApi = createAiRuntimeApi({
  apiFetchJson,
  buildQueryParams,
});

export const generateSummaryReport = aiRuntimeApi.generateSummaryReport;
export const analyzeWorkImage = aiRuntimeApi.analyzeWorkImage;
export const analyzeLogoColors = aiRuntimeApi.analyzeLogoColors;
export const standardizeCompanies = aiRuntimeApi.standardizeCompanies;
export const analyzeInventory = aiRuntimeApi.analyzeInventory;
export const populateInventoryFromReports = aiRuntimeApi.populateInventoryFromReports;
export const cleanInventory = aiRuntimeApi.cleanInventory;
export const listInventoryItems = aiRuntimeApi.listInventoryItems;
export const updateInventoryItem = aiRuntimeApi.updateInventoryItem;
export const deleteInventoryItem = aiRuntimeApi.deleteInventoryItem;
export const mergeInventorySuppliers = aiRuntimeApi.mergeInventorySuppliers;
export const validateFixInventory = aiRuntimeApi.validateFixInventory;
export const applyInventoryAnalysis = aiRuntimeApi.applyInventoryAnalysis;

export async function listInventoryMovements(
  workId?: string,
  limit = 200
): Promise<InventoryMovementApi[]> {
  const query = buildQueryParams({
    work_id: workId,
    limit,
  });
  return apiFetchJson<InventoryMovementApi[]>(`/api/v1/inventory-movements${query}`);
}

export async function getInventoryKpis(workId?: string): Promise<InventoryKpisApi> {
  const query = buildQueryParams({ work_id: workId });
  return apiFetchJson<InventoryKpisApi>(`/api/v1/inventory-movements/kpis${query}`);
}

export async function createInventoryMovement(
  payload: InventoryMovementCreatePayload
): Promise<InventoryMovementApi> {
  return apiFetchJson<InventoryMovementApi>('/api/v1/inventory-movements', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateInventoryMovement(
  movementId: string | number,
  payload: InventoryMovementUpdatePayload
): Promise<InventoryMovementApi> {
  return apiFetchJson<InventoryMovementApi>(`/api/v1/inventory-movements/${movementId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteInventoryMovement(movementId: string | number): Promise<void> {
  return apiFetchJson<void>(`/api/v1/inventory-movements/${movementId}`, {
    method: 'DELETE',
  });
}

export async function listDeliveryNotes(
  params: ListDeliveryNotesParams
): Promise<DeliveryNoteApi[]> {
  const query = buildQueryParams({
    work_id: params.work_id,
    status: params.status,
    limit: params.limit,
  });
  return apiFetchJson<DeliveryNoteApi[]>(`/api/v1/delivery-notes${query}`);
}

export async function createDeliveryNote(
  payload: CreateDeliveryNotePayload
): Promise<DeliveryNoteApi> {
  return apiFetchJson<DeliveryNoteApi>('/api/v1/delivery-notes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateDeliveryNote(
  noteId: string,
  payload: UpdateDeliveryNotePayload
): Promise<DeliveryNoteApi> {
  return apiFetchJson<DeliveryNoteApi>(`/api/v1/delivery-notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteDeliveryNote(noteId: string): Promise<void> {
  return apiFetchJson<void>(`/api/v1/delivery-notes/${noteId}`, {
    method: 'DELETE',
  });
}

export async function validateDeliveryNote(
  noteId: string,
  payload: ValidateDeliveryNotePayload
): Promise<DeliveryNoteMutationResponse> {
  return apiFetchJson<DeliveryNoteMutationResponse>(`/api/v1/delivery-notes/${noteId}/validate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function rejectDeliveryNote(
  noteId: string,
  reason?: string
): Promise<DeliveryNoteMutationResponse> {
  return apiFetchJson<DeliveryNoteMutationResponse>(`/api/v1/delivery-notes/${noteId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export type {
  GenericImageUploadResponse,
  SharedFileApi,
  SharedFileCreatePayload,
  SharedFilesDirection,
  UploadGenericImagePayload,
  WorkReportAttachmentApi,
} from './modules/attachments';

const attachmentsApi = createAttachmentsApi({
  apiFetchJson,
  apiFetch,
  buildQueryParams,
  tenantHeader,
});

export const listWorkReportAttachments = attachmentsApi.listWorkReportAttachments;
export const createWorkReportAttachment = attachmentsApi.createWorkReportAttachment;
export const updateWorkReportAttachment = attachmentsApi.updateWorkReportAttachment;
export const deleteWorkReportAttachment = attachmentsApi.deleteWorkReportAttachment;
export const uploadGenericImage = attachmentsApi.uploadGenericImage;
export const deleteGenericImageByUrl = attachmentsApi.deleteGenericImageByUrl;
export const listSharedFiles = attachmentsApi.listSharedFiles;
export const createSharedFile = attachmentsApi.createSharedFile;
export const downloadSharedFile = attachmentsApi.downloadSharedFile;
export const markSharedFileDownloaded = attachmentsApi.markSharedFileDownloaded;
export const deleteSharedFile = attachmentsApi.deleteSharedFile;

// ============================================================
// SAVED ECONOMIC REPORTS API
// ============================================================

export type {
  ApiSavedEconomicReport,
  SavedEconomicReportCreatePayload,
} from './modules/savedEconomicReports';

const savedEconomicReportsApi = createSavedEconomicReportsApi({
  apiFetchJson,
  tenantHeader,
});

export const listSavedEconomicReports = savedEconomicReportsApi.listSavedEconomicReports;
export const upsertSavedEconomicReport = savedEconomicReportsApi.upsertSavedEconomicReport;
export const deleteSavedEconomicReport = savedEconomicReportsApi.deleteSavedEconomicReport;

// ============================================================
// PLACEHOLDER - For unimplemented features
// ============================================================

export const PENDING_MIGRATION_MESSAGE = 'Pendiente de migración a API';

/**
 * Returns a placeholder indicating the feature is pending migration
 */
export function createPendingMigration<T>(featureName: string): () => Promise<T> {
  return async () => {
    console.warn(`[Migración Pendiente] ${featureName} no está disponible aún`);
    throw new Error(`${featureName}: ${PENDING_MIGRATION_MESSAGE}`);
  };
}
