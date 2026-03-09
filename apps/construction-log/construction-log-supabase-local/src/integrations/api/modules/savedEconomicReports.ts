type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

export interface SavedEconomicReportApiDeps {
  apiFetchJson: ApiFetchJsonFn;
}

export interface ApiSavedEconomicReport {
  id: number;
  tenant_id: number;
  work_report_id: string;
  saved_by: string;
  work_name: string;
  work_number: string;
  date: string;
  foreman: string;
  site_manager: string;
  work_groups: any[];
  machinery_groups: any[];
  material_groups: any[];
  subcontract_groups: any[];
  rental_machinery_groups: any[];
  total_amount: number;
  created_at: string;
  updated_at: string;
}

export interface SavedEconomicReportCreatePayload {
  work_report_id: string;
  work_name?: string;
  work_number?: string;
  date?: string;
  foreman?: string;
  site_manager?: string;
  work_groups?: any[];
  machinery_groups?: any[];
  material_groups?: any[];
  subcontract_groups?: any[];
  rental_machinery_groups?: any[];
  total_amount?: number;
}

interface SavedEconomicReportListResponse {
  items: ApiSavedEconomicReport[];
  total: number;
}

export function createSavedEconomicReportsApi(deps: SavedEconomicReportApiDeps) {
  const listSavedEconomicReports = async (): Promise<ApiSavedEconomicReport[]> => {
    const response = await deps.apiFetchJson<SavedEconomicReportListResponse>(
      '/api/v1/erp/saved-economic-reports'
    );
    return response.items;
  };

  const upsertSavedEconomicReport = async (
    payload: SavedEconomicReportCreatePayload
  ): Promise<ApiSavedEconomicReport> => {
    return deps.apiFetchJson<ApiSavedEconomicReport>(
      '/api/v1/erp/saved-economic-reports',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  };

  const deleteSavedEconomicReport = async (reportId: number): Promise<void> => {
    return deps.apiFetchJson<void>(
      `/api/v1/erp/saved-economic-reports/${reportId}`,
      { method: 'DELETE' }
    );
  };

  return {
    listSavedEconomicReports,
    upsertSavedEconomicReport,
    deleteSavedEconomicReport,
  };
}
