type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

type BuildQueryParamsFn = (
  params: Record<string, string | number | boolean | undefined | null>
) => string;

export interface CustomHolidaysApiDeps {
  apiFetchJson: ApiFetchJsonFn;
  buildQueryParams: BuildQueryParamsFn;
}

export interface ApiCustomHoliday {
  id: number;
  tenant_id: number;
  date: string;
  name: string;
  region?: string | null;
  created_by_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomHolidayPayload {
  date: string;
  name: string;
  region?: string | null;
}

export interface UpdateCustomHolidayPayload {
  date?: string;
  name?: string;
  region?: string | null;
}

export interface ListCustomHolidaysParams {
  region?: string | null;
}

export function createCustomHolidaysApi(deps: CustomHolidaysApiDeps) {
  const listCustomHolidays = async (
    params: ListCustomHolidaysParams = {}
  ): Promise<ApiCustomHoliday[]> => {
    const query = deps.buildQueryParams({
      region: params.region,
    });
    return deps.apiFetchJson<ApiCustomHoliday[]>(`/api/v1/erp/custom-holidays${query}`);
  };

  const createCustomHoliday = async (
    payload: CreateCustomHolidayPayload
  ): Promise<ApiCustomHoliday> => {
    return deps.apiFetchJson<ApiCustomHoliday>('/api/v1/erp/custom-holidays', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const updateCustomHoliday = async (
    holidayId: number,
    payload: UpdateCustomHolidayPayload
  ): Promise<ApiCustomHoliday> => {
    return deps.apiFetchJson<ApiCustomHoliday>(
      `/api/v1/erp/custom-holidays/${holidayId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  };

  const deleteCustomHoliday = async (holidayId: number): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/erp/custom-holidays/${holidayId}`, {
      method: 'DELETE',
    });
  };

  return {
    listCustomHolidays,
    createCustomHoliday,
    updateCustomHoliday,
    deleteCustomHoliday,
  };
}
