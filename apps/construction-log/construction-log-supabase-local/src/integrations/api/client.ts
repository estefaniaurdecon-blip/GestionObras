/**
 * API Client for backend-fastapi
 * Replaces Supabase client with standard REST API calls
 */
import { Capacitor } from '@capacitor/core';
import { clearToken, getAuthHeader } from './storage';

// Re-export storage functions for convenience
export { clearToken, getAuthHeader, getToken, setToken, TokenData } from './storage';
export { decodeJwtExpiryMs, getTokenExpiryMs, isTokenExpired } from './storage';

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').trim();
const RAW_NATIVE_API_BASE_URL = (import.meta.env.VITE_NATIVE_API_BASE_URL || '').trim();

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
  data?: any;
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

async function fetchWithNativeFallback(path: string, init: RequestInit): Promise<Response> {
  const primaryUrl = buildApiUrl(path);

  try {
    return await fetch(primaryUrl, init);
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
        const response = await fetch(fallbackUrl, init);
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
export async function apiFetch(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
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
  
  const fetchOptions: RequestInit = {
    ...init,
    credentials: init?.credentials ?? 'include',
    headers,
  };
  
  // Remove custom options before fetch
  delete (fetchOptions as any).skipAuth;

  const response = await fetchWithNativeFallback(path, fetchOptions);
  
  // Handle 401 Unauthorized - clear token and throw error
  if (response.status === 401) {
    await clearToken();
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
  init?: RequestInit & { skipAuth?: boolean }
): Promise<T> {
  const response = await apiFetch(path, init);
  
  if (!response.ok) {
    const error: ApiError = new Error(`API Error: ${response.status} ${response.statusText}`);
    error.status = response.status;
    
    // Try to parse error details
    try {
      error.data = await response.json();
      if (error.data?.detail) {
        error.message = error.data.detail;
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

export interface ApiUser {
  id: number;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_super_admin?: boolean;
  tenant_id?: number;
  roles?: string[];
  role_name?: string | null;
  role_id?: number | null;
  permissions?: string[];
  language?: string | null;
  avatar_url?: string;
  created_at?: string;
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

export interface UserCreateRequest {
  email: string;
  full_name: string;
  password: string;
  tenant_id?: number | null;
  is_super_admin?: boolean;
  role_name?: string | null;
}

export interface UserUpdateRequest {
  email?: string;
  full_name?: string;
  role_name?: string | null;
}

export interface UserStatusUpdateRequest {
  is_active: boolean;
}

export interface UserProfileUpdateRequest {
  full_name: string;
  language?: string | null;
  avatar_url?: string | null;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
  new_password_confirm: string;
}

export interface ApiTool {
  id: number;
  name: string;
  slug: string;
  base_url: string;
  description?: string | null;
}

export interface ApiTenant {
  id: number;
  name: string;
  subdomain: string;
  is_active: boolean;
  created_at?: string;
}

export interface ToolLaunchResponse {
  launch_url: string;
  tool_id: number;
  tool_name: string;
}

function normalizeApiUser(user: ApiUser): ApiUser {
  if (!user) return user;

  const normalizedRoles = Array.isArray(user.roles)
    ? user.roles
    : user.role_name
      ? [String(user.role_name)]
      : [];

  return {
    ...user,
    roles: normalizedRoles,
  };
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
    } catch (error: any) {
      const detail = String(error?.data?.detail || '');
      const isInvalidCredentials =
        error?.status === 400 &&
        /credenciales incorrectas/i.test(detail);

      if (!isInvalidCredentials) {
        throw error;
      }

      lastError = error;
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
  
  return response.json();
}

/**
 * Verify MFA code
 */
export async function verifyMFA(request: MFAVerifyRequest): Promise<MFAVerifyResponse> {
  return apiFetchJson<MFAVerifyResponse>('/api/v1/auth/mfa/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    skipAuth: true,
  });
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
  }
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
  status?: string;
  budget?: number;
  tenant_id?: number;
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

/**
 * List all projects (Obras)
 */
export async function listProjects(): Promise<ApiProject[]> {
  return apiFetchJson<ApiProject[]>('/api/v1/erp/projects');
}

/**
 * Get a single project by ID
 */
export async function getProject(projectId: number): Promise<ApiProject> {
  return apiFetchJson<ApiProject>(`/api/v1/erp/projects/${projectId}`);
}

/**
 * Create a new project
 */
export async function createProject(data: ProjectCreate): Promise<ApiProject> {
  return apiFetchJson<ApiProject>('/api/v1/erp/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update a project
 */
export async function updateProject(projectId: number, data: ProjectUpdate): Promise<ApiProject> {
  return apiFetchJson<ApiProject>(`/api/v1/erp/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: number): Promise<void> {
  return apiFetchJson<void>(`/api/v1/erp/projects/${projectId}`, {
    method: 'DELETE',
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

export async function listProjectBudgets(projectId: number): Promise<ApiProjectBudgetLine[]> {
  return apiFetchJson<ApiProjectBudgetLine[]>(`/api/v1/erp/projects/${projectId}/budgets`);
}

export async function listProjectBudgetMilestones(
  projectId: number
): Promise<ApiProjectBudgetMilestone[]> {
  return apiFetchJson<ApiProjectBudgetMilestone[]>(
    `/api/v1/erp/projects/${projectId}/budget-milestones`
  );
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
  return apiFetchJson<YearlySummary>(`/api/v1/summary/summary/${year}`);
}

// ============================================================
// USERS API
// ============================================================

export async function listUsersByTenant(tenantId: number, excludeAssigned = false): Promise<ApiUser[]> {
  const users = await apiFetchJson<ApiUser[]>(
    `/api/v1/users/by-tenant/${tenantId}?exclude_assigned=${excludeAssigned ? 'true' : 'false'}`
  );
  return users.map(normalizeApiUser);
}

export async function listTenants(): Promise<ApiTenant[]> {
  return apiFetchJson<ApiTenant[]>('/api/v1/tenants/');
}

export async function createUser(request: UserCreateRequest): Promise<ApiUser> {
  const user = await apiFetchJson<ApiUser>('/api/v1/users/', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return normalizeApiUser(user);
}

export async function updateUser(userId: number, request: UserUpdateRequest): Promise<ApiUser> {
  const user = await apiFetchJson<ApiUser>(`/api/v1/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(request),
  });
  return normalizeApiUser(user);
}

export async function updateUserStatus(userId: number, isActive: boolean): Promise<ApiUser> {
  const user = await apiFetchJson<ApiUser>(`/api/v1/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive } satisfies UserStatusUpdateRequest),
  });
  return normalizeApiUser(user);
}

export async function deleteUser(userId: number): Promise<void> {
  return apiFetchJson<void>(`/api/v1/users/${userId}`, {
    method: 'DELETE',
  });
}

export async function updateCurrentUserProfile(request: UserProfileUpdateRequest): Promise<ApiUser> {
  const user = await apiFetchJson<ApiUser>('/api/v1/users/me', {
    method: 'PATCH',
    body: JSON.stringify(request),
  });
  return normalizeApiUser(user);
}

export async function changePassword(request: ChangePasswordRequest): Promise<void> {
  return apiFetchJson<void>('/api/v1/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// ============================================================
// TOOLS API
// ============================================================

export async function listToolCatalog(): Promise<ApiTool[]> {
  return apiFetchJson<ApiTool[]>('/api/v1/tools/catalog');
}

export async function listToolsByTenant(tenantId?: number | null): Promise<ApiTool[]> {
  const tenantQuery = tenantId ? `?tenant_id=${tenantId}` : '';
  return apiFetchJson<ApiTool[]>(`/api/v1/tools/by-tenant${tenantQuery}`);
}

export async function launchTool(toolId: number): Promise<ToolLaunchResponse> {
  return apiFetchJson<ToolLaunchResponse>(`/api/v1/tools/${toolId}/launch`, {
    method: 'POST',
  });
}

export async function setToolEnabledForTenant(
  toolId: number,
  tenantId: number,
  isEnabled: boolean
): Promise<void> {
  return apiFetchJson<void>(`/api/v1/tools/${toolId}/by-tenant/${tenantId}`, {
    method: 'PUT',
    body: JSON.stringify({ is_enabled: isEnabled }),
  });
}

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

export async function generateSummaryReport(
  payload: GenerateSummaryReportRequest
): Promise<GenerateSummaryReportResponse> {
  return apiFetchJson<GenerateSummaryReportResponse>('/api/v1/ai/generate-summary-report', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function analyzeWorkImage(
  payload: AnalyzeWorkImageRequest
): Promise<AnalyzeWorkImageResponse> {
  return apiFetchJson<AnalyzeWorkImageResponse>('/api/v1/ai/analyze-work-image', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function analyzeLogoColors(
  payload: AnalyzeLogoColorsRequest
): Promise<AnalyzeLogoColorsResponse> {
  return apiFetchJson<AnalyzeLogoColorsResponse>('/api/v1/ai/analyze-logo-colors', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

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
