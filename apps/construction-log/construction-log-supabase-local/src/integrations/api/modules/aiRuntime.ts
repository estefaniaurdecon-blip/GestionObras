type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

type BuildQueryParamsFn = (
  params: Record<string, string | number | boolean | undefined | null>
) => string;

export interface AiRuntimeApiDeps {
  apiFetchJson: ApiFetchJsonFn;
  buildQueryParams: BuildQueryParamsFn;
}

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

export function createAiRuntimeApi(deps: AiRuntimeApiDeps) {
  const generateSummaryReport = async (
    payload: GenerateSummaryReportRequest
  ): Promise<GenerateSummaryReportResponse> => {
    return deps.apiFetchJson<GenerateSummaryReportResponse>('/api/v1/ai/generate-summary-report', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const analyzeWorkImage = async (
    payload: AnalyzeWorkImageRequest
  ): Promise<AnalyzeWorkImageResponse> => {
    return deps.apiFetchJson<AnalyzeWorkImageResponse>('/api/v1/ai/analyze-work-image', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const analyzeLogoColors = async (
    payload: AnalyzeLogoColorsRequest
  ): Promise<AnalyzeLogoColorsResponse> => {
    return deps.apiFetchJson<AnalyzeLogoColorsResponse>('/api/v1/ai/analyze-logo-colors', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  function standardizeCompanies(
    payload: StandardizeCompaniesAnalyzeRequest
  ): Promise<StandardizeCompaniesAnalyzeResponse>;
  function standardizeCompanies(
    payload: StandardizeCompaniesApplyRequest
  ): Promise<StandardizeCompaniesApplyResponse>;
  async function standardizeCompanies(
    payload: StandardizeCompaniesRequest
  ): Promise<StandardizeCompaniesAnalyzeResponse | StandardizeCompaniesApplyResponse> {
    return deps.apiFetchJson<StandardizeCompaniesAnalyzeResponse | StandardizeCompaniesApplyResponse>(
      '/api/v1/ai/standardize-companies',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }

  const analyzeInventory = async (
    payload: AnalyzeInventoryRequest
  ): Promise<AnalyzeInventoryResponse> => {
    return deps.apiFetchJson<AnalyzeInventoryResponse>('/api/v1/ai/analyze-inventory', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const populateInventoryFromReports = async (
    payload: PopulateInventoryRequest
  ): Promise<PopulateInventoryResponse> => {
    return deps.apiFetchJson<PopulateInventoryResponse>('/api/v1/ai/populate-inventory-from-reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const cleanInventory = async (payload: CleanInventoryRequest): Promise<CleanInventoryResponse> => {
    return deps.apiFetchJson<CleanInventoryResponse>('/api/v1/ai/clean-inventory', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const listInventoryItems = async (workId: string): Promise<InventoryItemApi[]> => {
    const query = deps.buildQueryParams({ work_id: workId });
    return deps.apiFetchJson<InventoryItemApi[]>(`/api/v1/ai/inventory-items${query}`);
  };

  const updateInventoryItem = async (
    workId: string,
    itemId: string,
    payload: InventoryUpdatePayload
  ): Promise<InventoryItemApi> => {
    const query = deps.buildQueryParams({ work_id: workId });
    return deps.apiFetchJson<InventoryItemApi>(`/api/v1/ai/inventory-items/${itemId}${query}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  };

  const deleteInventoryItem = async (workId: string, itemId: string): Promise<void> => {
    const query = deps.buildQueryParams({ work_id: workId });
    return deps.apiFetchJson<void>(`/api/v1/ai/inventory-items/${itemId}${query}`, {
      method: 'DELETE',
    });
  };

  const mergeInventorySuppliers = async (
    payload: MergeInventorySuppliersRequest
  ): Promise<MergeInventorySuppliersResponse> => {
    return deps.apiFetchJson<MergeInventorySuppliersResponse>('/api/v1/ai/inventory/merge-suppliers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const validateFixInventory = async (workId: string): Promise<ValidateFixInventoryResponse> => {
    return deps.apiFetchJson<ValidateFixInventoryResponse>('/api/v1/ai/inventory/validate-fix', {
      method: 'POST',
      body: JSON.stringify({ work_id: workId }),
    });
  };

  const applyInventoryAnalysis = async (
    payload: ApplyInventoryAnalysisRequest
  ): Promise<ApplyInventoryAnalysisResponse> => {
    return deps.apiFetchJson<ApplyInventoryAnalysisResponse>('/api/v1/ai/inventory/apply-analysis', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  return {
    generateSummaryReport,
    analyzeWorkImage,
    analyzeLogoColors,
    standardizeCompanies,
    analyzeInventory,
    populateInventoryFromReports,
    cleanInventory,
    listInventoryItems,
    updateInventoryItem,
    deleteInventoryItem,
    mergeInventorySuppliers,
    validateFixInventory,
    applyInventoryAnalysis,
  };
}
