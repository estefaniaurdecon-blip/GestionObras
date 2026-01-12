import { apiClient } from "./client";

export interface CurrentUser {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  tenant_id: number | null;
  role_id: number | null;
  created_at: string;
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await apiClient.get<CurrentUser>("/api/v1/users/me");
  return response.data;
}

export interface TenantUserSummary {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
}

export async function fetchUsersByTenant(
  tenantId: number,
): Promise<TenantUserSummary[]> {
  const response = await apiClient.get<TenantUserSummary[]>(
    `/api/v1/users/by-tenant/${tenantId}`,
    {
      headers: {
        "X-Tenant-Id": tenantId.toString(),
      },
    },
  );
  return response.data;
}

export interface TenantOption {
  id: number;
  name: string;
  subdomain: string;
}

export async function fetchAllTenants(): Promise<TenantOption[]> {
  const response = await apiClient.get<TenantOption[]>("/api/v1/tenants/");
  return response.data;
}

export interface UserInvitationCreate {
  email: string;
  full_name?: string | null;
  tenant_id?: number | null;
  role_name: string;
}

export async function createUserInvitation(
  payload: UserInvitationCreate,
): Promise<void> {
  await apiClient.post("/api/v1/invitations", payload);
}

export interface InvitationValidation {
  email: string;
  full_name?: string | null;
  tenant_name: string;
  role_name: string;
  is_valid: boolean;
  is_used: boolean;
  is_expired: boolean;
}

export async function validateInvitation(
  token: string,
): Promise<InvitationValidation> {
  const response = await apiClient.get<InvitationValidation>(
    "/api/v1/invitations/validate",
    { params: { token } },
  );
  return response.data;
}

export interface InvitationAcceptPayload {
  token: string;
  full_name: string;
  password: string;
}

export async function acceptInvitation(
  payload: InvitationAcceptPayload,
): Promise<void> {
  await apiClient.post("/api/v1/invitations/accept", payload);
}
