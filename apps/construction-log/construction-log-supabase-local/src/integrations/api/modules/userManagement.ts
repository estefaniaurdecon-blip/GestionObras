type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

type BuildQueryParamsFn = (
  params: Record<string, string | number | boolean | undefined | null>
) => string;

export interface UserManagementApiDeps {
  apiFetchJson: ApiFetchJsonFn;
  buildQueryParams: BuildQueryParamsFn;
  tenantHeader: (tenantId?: string | number | null) => Record<string, string> | undefined;
}

export type ApiAppRole = 'master' | 'admin' | 'site_manager' | 'foreman' | 'reader' | 'ofi';

export interface ApiManagedUser {
  id: number;
  full_name: string;
  email?: string | null;
  approved: boolean;
  created_at: string;
  updated_at: string;
  organization_id: number;
}

export interface ApiUserRoles {
  user_id: number;
  roles: ApiAppRole[];
}

export interface ApiUserAssignments {
  user_id: number;
  work_ids: number[];
}

export interface ApiWorkMember {
  id: number;
  full_name: string;
  email?: string | null;
}

export interface ApiWorkMessageDirectoryItem {
  id: number;
  name: string;
  visible_member_count: number;
}

export function createUserManagementApi(deps: UserManagementApiDeps) {
  const listManagedUsers = async (): Promise<ApiManagedUser[]> => {
    return deps.apiFetchJson<ApiManagedUser[]>('/api/v1/erp/user-management/users');
  };

  const listUsersByRole = async (appRole: ApiAppRole): Promise<ApiManagedUser[]> => {
    const query = deps.buildQueryParams({ app_role: appRole });
    return deps.apiFetchJson<ApiManagedUser[]>(`/api/v1/erp/user-management/users${query}`);
  };

  const listUserRoles = async (userId: number): Promise<ApiAppRole[]> => {
    const response = await deps.apiFetchJson<ApiUserRoles>(
      `/api/v1/erp/user-management/users/${userId}/roles`
    );
    return response.roles || [];
  };

  const addUserRole = async (userId: number, role: ApiAppRole): Promise<ApiAppRole[]> => {
    const response = await deps.apiFetchJson<ApiUserRoles>(
      `/api/v1/erp/user-management/users/${userId}/roles`,
      {
        method: 'POST',
        body: JSON.stringify({ role }),
      }
    );
    return response.roles || [];
  };

  const removeUserRole = async (userId: number, role: ApiAppRole): Promise<ApiAppRole[]> => {
    const response = await deps.apiFetchJson<ApiUserRoles>(
      `/api/v1/erp/user-management/users/${userId}/roles/${role}`,
      {
        method: 'DELETE',
      }
    );
    return response.roles || [];
  };

  const approveManagedUser = async (userId: number, role: ApiAppRole): Promise<ApiManagedUser> => {
    return deps.apiFetchJson<ApiManagedUser>(`/api/v1/erp/user-management/users/${userId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  };

  const listUserAssignments = async (userId: number): Promise<number[]> => {
    const response = await deps.apiFetchJson<ApiUserAssignments>(
      `/api/v1/erp/user-management/users/${userId}/assignments`
    );
    return response.work_ids || [];
  };

  const assignUserToWork = async (userId: number, workId: number): Promise<number[]> => {
    const response = await deps.apiFetchJson<ApiUserAssignments>(
      '/api/v1/erp/user-management/assignments',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          work_id: workId,
        }),
      }
    );
    return response.work_ids || [];
  };

  const removeUserFromWork = async (userId: number, workId: number): Promise<number[]> => {
    const query = deps.buildQueryParams({
      user_id: userId,
      work_id: workId,
    });
    const response = await deps.apiFetchJson<ApiUserAssignments>(
      `/api/v1/erp/user-management/assignments${query}`,
      {
        method: 'DELETE',
      }
    );
    return response.work_ids || [];
  };

  const listAssignableForemen = async (organizationId?: string | number): Promise<ApiManagedUser[]> => {
    const query = deps.buildQueryParams({
      organization_id: organizationId,
    });
    return deps.apiFetchJson<ApiManagedUser[]>(`/api/v1/erp/user-management/assignable-foremen${query}`);
  };

  const listWorkMessageDirectory = async (
    tenantId?: string | number | null
  ): Promise<ApiWorkMessageDirectoryItem[]> => {
    return deps.apiFetchJson<ApiWorkMessageDirectoryItem[]>('/api/v1/erp/projects/member-directory', {
      headers: deps.tenantHeader(tenantId),
    });
  };

  const listWorkMembers = async (
    workId: number,
    tenantId?: string | number | null
  ): Promise<ApiWorkMember[]> => {
    return deps.apiFetchJson<ApiWorkMember[]>(`/api/v1/erp/projects/${workId}/members`, {
      headers: deps.tenantHeader(tenantId),
    });
  };

  const deleteUserAndData = async (userId: number): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/erp/user-management/users/${userId}`, {
      method: 'DELETE',
    });
  };

  return {
    listManagedUsers,
    listUsersByRole,
    listUserRoles,
    addUserRole,
    removeUserRole,
    approveManagedUser,
    listUserAssignments,
    assignUserToWork,
    removeUserFromWork,
    listAssignableForemen,
    listWorkMessageDirectory,
    listWorkMembers,
    deleteUserAndData,
  };
}
