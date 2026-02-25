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
  
  const { skipAuth, ...restInit } = init ?? {};

  const fetchOptions: RequestInit = {
    ...restInit,
    credentials: init?.credentials ?? 'include',
    headers,
  };

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

export async function standardizeCompanies(
  payload: StandardizeCompaniesAnalyzeRequest
): Promise<StandardizeCompaniesAnalyzeResponse>;
export async function standardizeCompanies(
  payload: StandardizeCompaniesApplyRequest
): Promise<StandardizeCompaniesApplyResponse>;
export async function standardizeCompanies(
  payload: StandardizeCompaniesRequest
): Promise<StandardizeCompaniesAnalyzeResponse | StandardizeCompaniesApplyResponse> {
  return apiFetchJson<StandardizeCompaniesAnalyzeResponse | StandardizeCompaniesApplyResponse>(
    '/api/v1/ai/standardize-companies',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function analyzeInventory(
  payload: AnalyzeInventoryRequest
): Promise<AnalyzeInventoryResponse> {
  return apiFetchJson<AnalyzeInventoryResponse>('/api/v1/ai/analyze-inventory', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function populateInventoryFromReports(
  payload: PopulateInventoryRequest
): Promise<PopulateInventoryResponse> {
  return apiFetchJson<PopulateInventoryResponse>('/api/v1/ai/populate-inventory-from-reports', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function cleanInventory(
  payload: CleanInventoryRequest
): Promise<CleanInventoryResponse> {
  return apiFetchJson<CleanInventoryResponse>('/api/v1/ai/clean-inventory', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listInventoryItems(workId: string): Promise<InventoryItemApi[]> {
  const query = buildQueryParams({ work_id: workId });
  return apiFetchJson<InventoryItemApi[]>(`/api/v1/ai/inventory-items${query}`);
}

export async function updateInventoryItem(
  workId: string,
  itemId: string,
  payload: InventoryUpdatePayload
): Promise<InventoryItemApi> {
  const query = buildQueryParams({ work_id: workId });
  return apiFetchJson<InventoryItemApi>(`/api/v1/ai/inventory-items/${itemId}${query}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteInventoryItem(workId: string, itemId: string): Promise<void> {
  const query = buildQueryParams({ work_id: workId });
  return apiFetchJson<void>(`/api/v1/ai/inventory-items/${itemId}${query}`, {
    method: 'DELETE',
  });
}

export async function mergeInventorySuppliers(
  payload: MergeInventorySuppliersRequest
): Promise<MergeInventorySuppliersResponse> {
  return apiFetchJson<MergeInventorySuppliersResponse>('/api/v1/ai/inventory/merge-suppliers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function validateFixInventory(
  workId: string
): Promise<ValidateFixInventoryResponse> {
  return apiFetchJson<ValidateFixInventoryResponse>('/api/v1/ai/inventory/validate-fix', {
    method: 'POST',
    body: JSON.stringify({ work_id: workId }),
  });
}

export async function applyInventoryAnalysis(
  payload: ApplyInventoryAnalysisRequest
): Promise<ApplyInventoryAnalysisResponse> {
  return apiFetchJson<ApplyInventoryAnalysisResponse>('/api/v1/ai/inventory/apply-analysis', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

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

export interface WorkReportAttachmentApi {
  id: string;
  work_report_id: string;
  image_url: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface UploadGenericImagePayload {
  category: string;
  entity_id: string;
  image_type?: string;
  file: Blob | File;
  filename?: string;
}

export interface GenericImageUploadResponse {
  url: string;
  file_path: string;
  file_size: number;
  content_type: string;
}

export interface SharedFileApi {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  from_user_id: string;
  to_user_id: string;
  work_report_id?: string | null;
  message?: string | null;
  downloaded: boolean;
  created_at: string;
  from_user?: { full_name: string };
  to_user?: { full_name: string };
}

export type SharedFilesDirection = 'sent' | 'received' | 'all';

export interface SharedFileCreatePayload {
  file: File;
  to_user_id: string;
  message?: string;
  work_report_id?: string;
}

export async function listWorkReportAttachments(
  workReportId: string
): Promise<WorkReportAttachmentApi[]> {
  return apiFetchJson<WorkReportAttachmentApi[]>(
    `/api/v1/work-reports/${encodeURIComponent(workReportId)}/attachments`
  );
}

export async function createWorkReportAttachment(
  workReportId: string,
  payload: { file: Blob | File; description?: string | null; display_order?: number; filename?: string }
): Promise<WorkReportAttachmentApi> {
  const formData = new FormData();
  const fileName = payload.filename || `image-${Date.now()}.jpg`;
  formData.append('file', payload.file, fileName);
  if (payload.description !== undefined && payload.description !== null) {
    formData.append('description', payload.description);
  }
  if (payload.display_order !== undefined && payload.display_order !== null) {
    formData.append('display_order', String(payload.display_order));
  }
  return apiFetchJson<WorkReportAttachmentApi>(
    `/api/v1/work-reports/${encodeURIComponent(workReportId)}/attachments`,
    {
      method: 'POST',
      body: formData,
    }
  );
}

export async function updateWorkReportAttachment(
  workReportId: string,
  attachmentId: string,
  payload: { description?: string | null }
): Promise<WorkReportAttachmentApi> {
  return apiFetchJson<WorkReportAttachmentApi>(
    `/api/v1/work-reports/${encodeURIComponent(workReportId)}/attachments/${encodeURIComponent(
      attachmentId
    )}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteWorkReportAttachment(
  workReportId: string,
  attachmentId: string
): Promise<void> {
  return apiFetchJson<void>(
    `/api/v1/work-reports/${encodeURIComponent(workReportId)}/attachments/${encodeURIComponent(
      attachmentId
    )}`,
    {
      method: 'DELETE',
    }
  );
}

export async function uploadGenericImage(
  payload: UploadGenericImagePayload
): Promise<GenericImageUploadResponse> {
  const formData = new FormData();
  const fileName = payload.filename || `image-${Date.now()}.jpg`;
  formData.append('category', payload.category);
  formData.append('entity_id', payload.entity_id);
  if (payload.image_type) {
    formData.append('image_type', payload.image_type);
  }
  formData.append('file', payload.file, fileName);
  return apiFetchJson<GenericImageUploadResponse>('/api/v1/attachments/images', {
    method: 'POST',
    body: formData,
  });
}

export async function deleteGenericImageByUrl(url: string): Promise<{ success: boolean; deleted: boolean }> {
  return apiFetchJson<{ success: boolean; deleted: boolean }>('/api/v1/attachments/images/by-url', {
    method: 'DELETE',
    body: JSON.stringify({ url }),
  });
}

export async function listSharedFiles(
  direction: SharedFilesDirection = 'all'
): Promise<SharedFileApi[]> {
  const query = buildQueryParams({ direction });
  return apiFetchJson<SharedFileApi[]>(`/api/v1/shared-files${query}`);
}

export async function createSharedFile(
  payload: SharedFileCreatePayload
): Promise<SharedFileApi> {
  const formData = new FormData();
  formData.append('file', payload.file, payload.file.name || `file-${Date.now()}`);
  formData.append('to_user_id', payload.to_user_id);
  if (payload.message) {
    formData.append('message', payload.message);
  }
  if (payload.work_report_id) {
    formData.append('work_report_id', payload.work_report_id);
  }
  return apiFetchJson<SharedFileApi>('/api/v1/shared-files', {
    method: 'POST',
    body: formData,
  });
}

export async function downloadSharedFile(sharedFileId: string): Promise<Blob> {
  const response = await apiFetch(`/api/v1/shared-files/${encodeURIComponent(sharedFileId)}/download`, {
    method: 'GET',
  });
  if (!response.ok) {
    const error: ApiError = new Error(
      `API Error: ${response.status} ${response.statusText}`
    );
    error.status = response.status;
    throw error;
  }
  return response.blob();
}

export async function markSharedFileDownloaded(sharedFileId: string): Promise<void> {
  return apiFetchJson<void>(`/api/v1/shared-files/${encodeURIComponent(sharedFileId)}/mark-downloaded`, {
    method: 'POST',
  });
}

export async function deleteSharedFile(sharedFileId: string): Promise<void> {
  return apiFetchJson<void>(`/api/v1/shared-files/${encodeURIComponent(sharedFileId)}`, {
    method: 'DELETE',
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
