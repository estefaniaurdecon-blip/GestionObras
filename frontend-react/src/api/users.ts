// Cliente HTTP configurado (axios) con baseURL, cookies, etc.
import { apiClient } from "./client";
import { withTenantHeaders } from "./client";

/**
 * Información del usuario autenticado actual
 */
export interface CurrentUser {
  id: number; // ID del usuario
  email: string; // Email
  full_name: string | null; // Nombre completo
  is_active: boolean; // Usuario activo o desactivado
  is_super_admin: boolean; // Indica si es super admin
  tenant_id: number | null; // Tenant al que pertenece
  role_id: number | null; // Rol asignado
  role_name?: string | null; // Nombre del rol (tenant_admin, user, etc.)
  permissions?: string[]; // Permisos asociados al rol
  language?: string | null; // Idioma preferido
  avatar_url?: string | null; // Foto de perfil
  avatar_data?: string | null; // Foto de perfil (base64)
  created_at: string; // Fecha de creación
}

/**
 * Obtiene el usuario autenticado (/users/me)
 */
export async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await apiClient.get<CurrentUser>("/api/v1/users/me");
  return response.data;
}

/**
 * Resumen de usuarios de un tenant
 */
export interface TenantUserSummary {
  id: number; // ID del usuario
  email: string; // Email
  full_name: string | null; // Nombre completo
  is_active: boolean; // Estado del usuario
  is_super_admin?: boolean; // Super admin global
  tenant_id?: number | null; // Tenant asociado
  role_id?: number | null; // Rol asignado
  role_name?: string | null; // Nombre del rol
}

/**
 * Obtiene los usuarios de un tenant concreto
 *
 * options:
 * - excludeAssigned: excluye usuarios ya asignados a algo (ej. proyectos)
 */
export async function fetchUsersByTenant(
  tenantId: number,
  options?: { excludeAssigned?: boolean },
): Promise<TenantUserSummary[]> {
  const response = await apiClient.get<TenantUserSummary[]>(
    `/api/v1/users/by-tenant/${tenantId}`,
    {
      // Parámetros de query
      params: {
        exclude_assigned: options?.excludeAssigned ?? false,
      },
      // Header para control multi-tenant
      ...withTenantHeaders(tenantId),
    },
  );
  return response.data;
}

/**
 * Opción simple de tenant (para selects)
 */
export interface TenantOption {
  id: number; // ID del tenant
  name: string; // Nombre del tenant
  subdomain: string; // Subdominio asignado
  is_active: boolean; // Estado del tenant
}

/**
 * Obtiene todos los tenants (normalmente super admin)
 */
export async function fetchAllTenants(): Promise<TenantOption[]> {
  const response = await apiClient.get<TenantOption[]>("/api/v1/tenants/");
  return response.data;
}

/**
 * Payload para crear una invitación de usuario
 */
export interface UserInvitationCreate {
  email: string; // Email del invitado
  full_name?: string | null; // Nombre (opcional)
  tenant_id?: number | null; // Tenant destino (opcional)
  role_name: string; // Rol a asignar
}

/**
 * Crea una invitación de usuario
 */
export async function createUserInvitation(
  payload: UserInvitationCreate,
): Promise<void> {
  await apiClient.post("/api/v1/invitations", payload);
}

export interface UserUpdateAdminPayload {
  email?: string | null;
  full_name?: string | null;
  role_name?: string | null;
}

export async function updateUser(
  userId: number,
  payload: UserUpdateAdminPayload,
  tenantId?: number | null,
): Promise<TenantUserSummary> {
  const response = await apiClient.patch<TenantUserSummary>(
    `/api/v1/users/${userId}`,
    payload,
    withTenantHeaders(tenantId),
  );
  return response.data;
}

export async function updateUserStatus(
  userId: number,
  isActive: boolean,
  tenantId?: number | null,
): Promise<TenantUserSummary> {
  const response = await apiClient.patch<TenantUserSummary>(
    `/api/v1/users/${userId}/status`,
    { is_active: isActive },
    withTenantHeaders(tenantId),
  );
  return response.data;
}

export async function deleteUser(
  userId: number,
  tenantId?: number | null,
): Promise<void> {
  await apiClient.delete(`/api/v1/users/${userId}`, withTenantHeaders(tenantId));
}

/**
 * Resultado de validación de una invitación
 */
export interface InvitationValidation {
  email: string; // Email invitado
  full_name?: string | null; // Nombre (si existe)
  tenant_name: string; // Tenant al que se invita
  role_name: string; // Rol asignado
  is_valid: boolean; // Token válido
  is_used: boolean; // Ya utilizada
  is_expired: boolean; // Caducada
}

/**
 * Valida una invitación por token (antes de aceptar)
 */
export async function validateInvitation(
  token: string,
): Promise<InvitationValidation> {
  const response = await apiClient.get<InvitationValidation>(
    "/api/v1/invitations/validate",
    {
      params: { token }, // Token de invitación
    },
  );
  return response.data;
}

/**
 * Payload para aceptar una invitación
 */
export interface InvitationAcceptPayload {
  token: string; // Token de invitación
  full_name: string; // Nombre del nuevo usuario
  password: string; // Contraseña inicial
  password_confirm: string; // Confirmación de contraseña
}

/**
 * Acepta una invitación y crea el usuario
 */
export async function acceptInvitation(
  payload: InvitationAcceptPayload,
): Promise<void> {
  await apiClient.post("/api/v1/invitations/accept", payload);
}
