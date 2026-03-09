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

export interface RentalMachineryApiDeps {
  apiFetchJson: ApiFetchJsonFn;
  buildQueryParams: BuildQueryParamsFn;
  tenantHeader: TenantHeaderFn;
}

export interface ApiRentalMachinery {
  id: number;
  tenant_id: number;
  project_id: number;
  is_rental: boolean;
  name: string;
  machine_number?: string | null;
  description?: string | null;
  notes?: string | null;
  image_url?: string | null;
  provider?: string | null;
  start_date: string;
  end_date?: string | null;
  price?: number | string | null;
  price_unit: string;
  status: string;
  created_by_id?: number | null;
  updated_by_id?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface ListRentalMachineryParams {
  tenantId?: string | number | null;
  projectId?: number;
  date?: string;
  status?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateRentalMachineryPayload {
  project_id: number;
  is_rental?: boolean;
  name: string;
  machine_number?: string | null;
  description?: string | null;
  notes?: string | null;
  image_url?: string | null;
  provider?: string | null;
  start_date: string;
  end_date?: string | null;
  price?: number | string | null;
  price_unit?: 'day' | 'hour' | 'month';
  status?: 'active' | 'inactive' | 'archived';
}

export interface UpdateRentalMachineryPayload {
  project_id?: number;
  is_rental?: boolean;
  name?: string;
  machine_number?: string | null;
  description?: string | null;
  notes?: string | null;
  image_url?: string | null;
  provider?: string | null;
  start_date?: string;
  end_date?: string | null;
  price?: number | string | null;
  price_unit?: 'day' | 'hour' | 'month';
  status?: 'active' | 'inactive' | 'archived';
}

export function createRentalMachineryApi(deps: RentalMachineryApiDeps) {
  const listRentalMachinery = async (
    params: ListRentalMachineryParams = {}
  ): Promise<ApiRentalMachinery[]> => {
    const query = deps.buildQueryParams({
      project_id: params.projectId,
      date: params.date,
      status: params.status,
      include_deleted: params.includeDeleted,
      limit: params.limit,
      offset: params.offset,
    });
    return deps.apiFetchJson<ApiRentalMachinery[]>(`/api/v1/erp/rental-machinery${query}`, {
      headers: deps.tenantHeader(params.tenantId),
    });
  };

  const createRentalMachinery = async (
    payload: CreateRentalMachineryPayload,
    tenantId?: string | number | null
  ): Promise<ApiRentalMachinery> => {
    return deps.apiFetchJson<ApiRentalMachinery>('/api/v1/erp/rental-machinery', {
      method: 'POST',
      headers: deps.tenantHeader(tenantId),
      body: JSON.stringify(payload),
    });
  };

  const updateRentalMachinery = async (
    machineryId: number,
    payload: UpdateRentalMachineryPayload,
    tenantId?: string | number | null
  ): Promise<ApiRentalMachinery> => {
    return deps.apiFetchJson<ApiRentalMachinery>(`/api/v1/erp/rental-machinery/${machineryId}`, {
      method: 'PATCH',
      headers: deps.tenantHeader(tenantId),
      body: JSON.stringify(payload),
    });
  };

  const deleteRentalMachinery = async (
    machineryId: number,
    tenantId?: string | number | null
  ): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/erp/rental-machinery/${machineryId}`, {
      method: 'DELETE',
      headers: deps.tenantHeader(tenantId),
    });
  };

  return {
    listRentalMachinery,
    createRentalMachinery,
    updateRentalMachinery,
    deleteRentalMachinery,
  };
}
