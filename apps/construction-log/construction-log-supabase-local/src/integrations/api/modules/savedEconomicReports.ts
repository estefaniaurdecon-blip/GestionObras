type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

import { storage } from '@/utils/storage';

export interface SavedEconomicReportApiDeps {
  apiFetchJson: ApiFetchJsonFn;
  tenantHeader?: (tenantId?: string | number | null) => Record<string, string> | undefined;
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

const LOCAL_SAVED_ECONOMIC_REPORTS_KEY_PREFIX = 'savedEconomicReports::';

function toTenantScopeKey(tenantId?: string | number | null): string {
  const normalized = tenantId === undefined || tenantId === null ? '' : String(tenantId).trim();
  return normalized || 'global';
}

function buildLocalStorageKey(tenantId?: string | number | null): string {
  return `${LOCAL_SAVED_ECONOMIC_REPORTS_KEY_PREFIX}${toTenantScopeKey(tenantId)}`;
}

function parseTenantId(tenantId?: string | number | null): number {
  const parsed = Number(tenantId);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toSafeDate(value?: string): string {
  return typeof value === 'string' && value.trim() ? value : new Date().toISOString().slice(0, 10);
}

function toIsoTimestamp(): string {
  return new Date().toISOString();
}

function toNonEmptyText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function toAmount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function getErrorStatus(error: unknown): number | null {
  const candidate = asRecord(error);
  if (!candidate) return null;

  const rawStatus = candidate.status;
  const parsedStatus =
    typeof rawStatus === 'number'
      ? rawStatus
      : typeof rawStatus === 'string'
        ? Number(rawStatus)
        : Number.NaN;

  return Number.isFinite(parsedStatus) ? parsedStatus : null;
}

function getErrorMessage(error: unknown): string {
  const candidate = asRecord(error);
  if (!candidate) return '';

  const message = normalizeText(candidate.message);
  const data = asRecord(candidate.data);
  const detail = normalizeText(data?.detail);
  return `${message} ${detail}`.trim();
}

function isApiMissingEndpointError(error: unknown): boolean {
  const status = getErrorStatus(error);

  if (status === 404 || status === 405 || status === 501) {
    return true;
  }

  const combined = getErrorMessage(error);

  return (
    combined.includes('not found') ||
    combined.includes('notfound') ||
    combined.includes('404') ||
    combined.includes('method not allowed') ||
    combined.includes('405')
  );
}

function shouldFallbackToLocal(error: unknown): boolean {
  if (isApiMissingEndpointError(error)) {
    return true;
  }

  const status = getErrorStatus(error);
  if (status === null) {
    return true;
  }

  if (status >= 500) {
    return true;
  }

  const combined = getErrorMessage(error);
  return (
    combined.includes('networkerror') ||
    combined.includes('failed to fetch') ||
    combined.includes('timeout') ||
    combined.includes('respuesta no json')
  );
}

function logLocalFallback(operation: string, error: unknown): void {
  console.warn(`[saved-economic-reports] ${operation}: usando fallback local`, error);
}

async function readLocalReports(tenantId?: string | number | null): Promise<ApiSavedEconomicReport[]> {
  const raw = await storage.getItem(buildLocalStorageKey(tenantId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ApiSavedEconomicReport[];
  } catch {
    return [];
  }
}

async function writeLocalReports(
  reports: ApiSavedEconomicReport[],
  tenantId?: string | number | null
): Promise<void> {
  await storage.setItem(buildLocalStorageKey(tenantId), JSON.stringify(reports));
}

async function listLocalSavedEconomicReports(
  tenantId?: string | number | null
): Promise<ApiSavedEconomicReport[]> {
  const reports = await readLocalReports(tenantId);
  return [...reports].sort((left, right) => right.date.localeCompare(left.date));
}

function mergeSavedEconomicReports(
  primaryReports: ApiSavedEconomicReport[],
  secondaryReports: ApiSavedEconomicReport[],
): ApiSavedEconomicReport[] {
  const byWorkReportId = new Map<string, ApiSavedEconomicReport>();

  const pickPreferredReport = (
    current: ApiSavedEconomicReport | undefined,
    candidate: ApiSavedEconomicReport,
  ): ApiSavedEconomicReport => {
    if (!current) return candidate;
    const currentUpdatedAt = Date.parse(current.updated_at ?? current.created_at ?? '');
    const candidateUpdatedAt = Date.parse(candidate.updated_at ?? candidate.created_at ?? '');

    if (!Number.isFinite(currentUpdatedAt) && !Number.isFinite(candidateUpdatedAt)) {
      return candidate;
    }

    if (!Number.isFinite(currentUpdatedAt)) return candidate;
    if (!Number.isFinite(candidateUpdatedAt)) return current;
    return candidateUpdatedAt >= currentUpdatedAt ? candidate : current;
  };

  [...secondaryReports, ...primaryReports].forEach((report) => {
    const key = toNonEmptyText(report.work_report_id) || `id-${report.id}`;
    byWorkReportId.set(key, pickPreferredReport(byWorkReportId.get(key), report));
  });

  return [...byWorkReportId.values()].sort((left, right) => {
    const rightUpdatedAt = Date.parse(right.updated_at ?? right.created_at ?? '');
    const leftUpdatedAt = Date.parse(left.updated_at ?? left.created_at ?? '');
    if (Number.isFinite(rightUpdatedAt) && Number.isFinite(leftUpdatedAt) && rightUpdatedAt !== leftUpdatedAt) {
      return rightUpdatedAt - leftUpdatedAt;
    }
    return right.date.localeCompare(left.date);
  });
}

async function upsertLocalSavedEconomicReport(
  payload: SavedEconomicReportCreatePayload,
  tenantId?: string | number | null
): Promise<ApiSavedEconomicReport> {
  const reports = await readLocalReports(tenantId);
  const nowIso = toIsoTimestamp();
  const scopedTenantId = parseTenantId(tenantId);
  const workReportId = toNonEmptyText(payload.work_report_id) || `local-${Date.now()}`;

  const existingIndex = reports.findIndex((item) => item.work_report_id === workReportId);
  if (existingIndex >= 0) {
    const existing = reports[existingIndex];
    const updated: ApiSavedEconomicReport = {
      ...existing,
      work_name: toNonEmptyText(payload.work_name) || existing.work_name,
      work_number: toNonEmptyText(payload.work_number) || existing.work_number,
      date: toSafeDate(payload.date ?? existing.date),
      foreman: toNonEmptyText(payload.foreman) || existing.foreman,
      site_manager: toNonEmptyText(payload.site_manager) || existing.site_manager,
      work_groups: payload.work_groups ?? existing.work_groups ?? [],
      machinery_groups: payload.machinery_groups ?? existing.machinery_groups ?? [],
      material_groups: payload.material_groups ?? existing.material_groups ?? [],
      subcontract_groups: payload.subcontract_groups ?? existing.subcontract_groups ?? [],
      rental_machinery_groups:
        payload.rental_machinery_groups ?? existing.rental_machinery_groups ?? [],
      total_amount: toAmount(payload.total_amount ?? existing.total_amount),
      updated_at: nowIso,
    };
    reports[existingIndex] = updated;
    await writeLocalReports(reports, tenantId);
    return updated;
  }

  const nextId =
    reports.reduce((max, item) => (item.id > max ? item.id : max), 0) + 1;

  const created: ApiSavedEconomicReport = {
    id: nextId,
    tenant_id: scopedTenantId,
    work_report_id: workReportId,
    saved_by: 'offline',
    work_name: toNonEmptyText(payload.work_name),
    work_number: toNonEmptyText(payload.work_number),
    date: toSafeDate(payload.date),
    foreman: toNonEmptyText(payload.foreman),
    site_manager: toNonEmptyText(payload.site_manager),
    work_groups: payload.work_groups ?? [],
    machinery_groups: payload.machinery_groups ?? [],
    material_groups: payload.material_groups ?? [],
    subcontract_groups: payload.subcontract_groups ?? [],
    rental_machinery_groups: payload.rental_machinery_groups ?? [],
    total_amount: toAmount(payload.total_amount),
    created_at: nowIso,
    updated_at: nowIso,
  };

  reports.push(created);
  await writeLocalReports(reports, tenantId);
  return created;
}

async function deleteLocalSavedEconomicReport(
  reportId: number,
  tenantId?: string | number | null
): Promise<void> {
  const reports = await readLocalReports(tenantId);
  const next = reports.filter((item) => item.id !== reportId);
  await writeLocalReports(next, tenantId);
}

export function createSavedEconomicReportsApi(deps: SavedEconomicReportApiDeps) {
  const listSavedEconomicReports = async (
    tenantId?: string | number | null
  ): Promise<ApiSavedEconomicReport[]> => {
    const localReports = await listLocalSavedEconomicReports(tenantId);

    try {
      const response = await deps.apiFetchJson<SavedEconomicReportListResponse>(
        '/api/v1/erp/saved-economic-reports',
        {
          headers: deps.tenantHeader?.(tenantId),
        }
      );
      const mergedReports = mergeSavedEconomicReports(response.items, localReports);
      await writeLocalReports(mergedReports, tenantId);
      return mergedReports;
    } catch (error) {
      if (!shouldFallbackToLocal(error)) {
        throw error;
      }
      logLocalFallback('list', error);
      return localReports;
    }
  };

  const upsertSavedEconomicReport = async (
    payload: SavedEconomicReportCreatePayload,
    tenantId?: string | number | null
  ): Promise<ApiSavedEconomicReport> => {
    // Persist locally first so pricing changes are never blocked by API availability.
    const localSavedReport = await upsertLocalSavedEconomicReport(payload, tenantId);

    try {
      const remoteSavedReport = await deps.apiFetchJson<ApiSavedEconomicReport>(
        '/api/v1/erp/saved-economic-reports',
        {
          method: 'POST',
          headers: deps.tenantHeader?.(tenantId),
          body: JSON.stringify(payload),
        }
      );
      const mergedReports = mergeSavedEconomicReports([remoteSavedReport], [localSavedReport]);
      const localReports = await readLocalReports(tenantId);
      const remainingReports = localReports.filter(
        (report) => report.work_report_id !== localSavedReport.work_report_id,
      );
      await writeLocalReports(mergeSavedEconomicReports(mergedReports, remainingReports), tenantId);
      return remoteSavedReport;
    } catch (error) {
      if (!shouldFallbackToLocal(error)) {
        throw error;
      }
      logLocalFallback('upsert', error);
      return localSavedReport;
    }
  };

  const deleteSavedEconomicReport = async (
    reportId: number,
    tenantId?: string | number | null
  ): Promise<void> => {
    try {
      await deps.apiFetchJson<void>(
        `/api/v1/erp/saved-economic-reports/${reportId}`,
        {
          method: 'DELETE',
          headers: deps.tenantHeader?.(tenantId),
        }
      );
      await deleteLocalSavedEconomicReport(reportId, tenantId);
      return;
    } catch (error) {
      if (!shouldFallbackToLocal(error)) {
        throw error;
      }
      logLocalFallback('delete', error);
      return deleteLocalSavedEconomicReport(reportId, tenantId);
    }
  };

  return {
    listSavedEconomicReports,
    upsertSavedEconomicReport,
    deleteSavedEconomicReport,
  };
}
