type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

type BuildQueryParamsFn = (
  params: Record<string, string | number | boolean | undefined | null>
) => string;

type TenantHeaderFn = (
  tenantId?: string | number | null
) => Record<string, string> | undefined;

export interface WorkRepasosApiDeps {
  apiFetchJson: ApiFetchJsonFn;
  buildQueryParams: BuildQueryParamsFn;
  tenantHeader: TenantHeaderFn;
}

export interface ApiWorkRepaso {
  id: number;
  tenant_id: number;
  project_id: number;
  external_id?: string | null;
  code: string;
  status: 'pending' | 'in_progress' | 'completed';
  description: string;
  assigned_company?: string | null;
  estimated_hours?: number | string | null;
  actual_hours?: number | string | null;
  before_image?: string | null;
  after_image?: string | null;
  subcontract_groups?: unknown[];
  created_by_id?: number | null;
  updated_by_id?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface ListWorkRepasosParams {
  tenantId?: string | number | null;
  projectId?: number;
  status?: 'pending' | 'in_progress' | 'completed';
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateWorkRepasoPayload {
  project_id: number;
  external_id?: string | null;
  status?: 'pending' | 'in_progress' | 'completed';
  description: string;
  assigned_company?: string | null;
  estimated_hours?: number;
  actual_hours?: number;
  before_image?: string | null;
  after_image?: string | null;
  subcontract_groups?: unknown[];
}

export interface UpdateWorkRepasoPayload {
  project_id?: number;
  status?: 'pending' | 'in_progress' | 'completed';
  description?: string;
  assigned_company?: string | null;
  estimated_hours?: number;
  actual_hours?: number;
  before_image?: string | null;
  after_image?: string | null;
  subcontract_groups?: unknown[];
}

export function createWorkRepasosApi(deps: WorkRepasosApiDeps) {
  const listWorkRepasos = async (
    params: ListWorkRepasosParams = {}
  ): Promise<ApiWorkRepaso[]> => {
    const query = deps.buildQueryParams({
      project_id: params.projectId,
      status: params.status,
      include_deleted: params.includeDeleted,
      limit: params.limit,
      offset: params.offset,
    });
    return deps.apiFetchJson<ApiWorkRepaso[]>(`/api/v1/erp/work-repasos${query}`, {
      headers: deps.tenantHeader(params.tenantId),
    });
  };

  const createWorkRepaso = async (
    payload: CreateWorkRepasoPayload,
    tenantId?: string | number | null
  ): Promise<ApiWorkRepaso> => {
    return deps.apiFetchJson<ApiWorkRepaso>('/api/v1/erp/work-repasos', {
      method: 'POST',
      headers: deps.tenantHeader(tenantId),
      body: JSON.stringify(payload),
    });
  };

  const updateWorkRepaso = async (
    repasoId: number,
    payload: UpdateWorkRepasoPayload,
    tenantId?: string | number | null
  ): Promise<ApiWorkRepaso> => {
    return deps.apiFetchJson<ApiWorkRepaso>(`/api/v1/erp/work-repasos/${repasoId}`, {
      method: 'PATCH',
      headers: deps.tenantHeader(tenantId),
      body: JSON.stringify(payload),
    });
  };

  const deleteWorkRepaso = async (
    repasoId: number,
    tenantId?: string | number | null
  ): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/erp/work-repasos/${repasoId}`, {
      method: 'DELETE',
      headers: deps.tenantHeader(tenantId),
    });
  };

  return {
    listWorkRepasos,
    createWorkRepaso,
    updateWorkRepaso,
    deleteWorkRepaso,
  };
}
