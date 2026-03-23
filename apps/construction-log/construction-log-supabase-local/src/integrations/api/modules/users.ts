type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

export interface UsersApiDeps {
  apiFetchJson: ApiFetchJsonFn;
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

export interface ApiTenant {
  id: number;
  name: string;
  subdomain: string;
  is_active: boolean;
  created_at?: string;
}

export function normalizeApiUser(user: ApiUser): ApiUser {
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

export function createUsersApi(deps: UsersApiDeps) {
  const listContactUsersByTenant = async (tenantId: number): Promise<ApiUser[]> => {
    const users = await deps.apiFetchJson<ApiUser[]>(
      `/api/v1/users/contacts/by-tenant/${tenantId}`
    );
    return users.map(normalizeApiUser);
  };

  const listUsersByTenant = async (
    tenantId: number,
    excludeAssigned = false
  ): Promise<ApiUser[]> => {
    const users = await deps.apiFetchJson<ApiUser[]>(
      `/api/v1/users/by-tenant/${tenantId}?exclude_assigned=${excludeAssigned ? 'true' : 'false'}`
    );
    return users.map(normalizeApiUser);
  };

  const listTenants = async (): Promise<ApiTenant[]> => {
    return deps.apiFetchJson<ApiTenant[]>('/api/v1/tenants/');
  };

  const createUser = async (request: UserCreateRequest): Promise<ApiUser> => {
    const user = await deps.apiFetchJson<ApiUser>('/api/v1/users/', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return normalizeApiUser(user);
  };

  const updateUser = async (userId: number, request: UserUpdateRequest): Promise<ApiUser> => {
    const user = await deps.apiFetchJson<ApiUser>(`/api/v1/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
    return normalizeApiUser(user);
  };

  const updateUserStatus = async (userId: number, isActive: boolean): Promise<ApiUser> => {
    const user = await deps.apiFetchJson<ApiUser>(`/api/v1/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive } satisfies UserStatusUpdateRequest),
    });
    return normalizeApiUser(user);
  };

  const deleteUser = async (userId: number): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/users/${userId}`, {
      method: 'DELETE',
    });
  };

  const updateCurrentUserProfile = async (request: UserProfileUpdateRequest): Promise<ApiUser> => {
    const user = await deps.apiFetchJson<ApiUser>('/api/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
    return normalizeApiUser(user);
  };

  const changePassword = async (request: ChangePasswordRequest): Promise<void> => {
    return deps.apiFetchJson<void>('/api/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  };

  return {
    listContactUsersByTenant,
    listUsersByTenant,
    listTenants,
    createUser,
    updateUser,
    updateUserStatus,
    deleteUser,
    updateCurrentUserProfile,
    changePassword,
  };
}
