type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

export interface SavedEconomicReportApiDeps {
  apiFetchJson: ApiFetchJsonFn;
}

export interface EconomicWorkGroupItem {
  name?: string;
  worker?: string;
  employee?: string;
  personName?: string;
  activity?: string;
  category?: string;
  role?: string;
  hours?: number | string;
  hourlyRate?: number | string;
  pricePerHour?: number | string;
  price_per_hour?: number | string;
  total?: number | string;
}

export interface EconomicWorkGroup {
  company?: string;
  employer?: string;
  items?: EconomicWorkGroupItem[];
}

export interface EconomicMachineryGroupItem {
  type?: string;
  name?: string;
  activity?: string;
  hours?: number | string;
  hourlyRate?: number | string;
  pricePerHour?: number | string;
  price_per_hour?: number | string;
  total?: number | string;
}

export interface EconomicMachineryGroup {
  company?: string;
  items?: EconomicMachineryGroupItem[];
}

export interface EconomicMaterialGroupItem {
  name?: string;
  description?: string;
  material?: string;
  supplier?: string;
  quantity?: number | string;
  unit?: string;
  unitPrice?: number | string;
  pricePerUnit?: number | string;
  price_per_unit?: number | string;
  total?: number | string;
}

export interface EconomicMaterialGroup {
  supplier?: string;
  invoiceNumber?: string;
  items?: EconomicMaterialGroupItem[];
}

export interface EconomicFuelRefill {
  liters?: number;
  pricePerLiter?: number;
  total?: number;
}

export interface EconomicRentalMachineryGroupItem {
  type?: string;
  name?: string;
  activity?: string;
  totalDays?: number | string;
  dailyRate?: number | string;
  hours?: number | string;
  pricePerHour?: number | string;
  price_per_hour?: number | string;
  fuelRefills?: EconomicFuelRefill[];
  fuelRefillsTotal?: number | string;
  total?: number | string;
}

export interface EconomicRentalMachineryGroup {
  company?: string;
  items?: EconomicRentalMachineryGroupItem[];
}

export interface EconomicSubcontractGroup {
  company?: string;
  description?: string;
  amount?: number | string;
  items?: EconomicSubcontractGroupItem[];
}

export interface EconomicSubcontractGroupItem {
  contractedPart?: string;
  activity?: string;
  unitType?: string;
  workers?: number | string;
  hours?: number | string;
  hourlyRate?: number | string;
  unitPrice?: number | string;
  quantity?: number | string;
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
  work_groups: EconomicWorkGroup[];
  machinery_groups: EconomicMachineryGroup[];
  material_groups: EconomicMaterialGroup[];
  subcontract_groups: EconomicSubcontractGroup[];
  rental_machinery_groups: EconomicRentalMachineryGroup[];
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
  work_groups?: EconomicWorkGroup[];
  machinery_groups?: EconomicMachineryGroup[];
  material_groups?: EconomicMaterialGroup[];
  subcontract_groups?: EconomicSubcontractGroup[];
  rental_machinery_groups?: EconomicRentalMachineryGroup[];
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
