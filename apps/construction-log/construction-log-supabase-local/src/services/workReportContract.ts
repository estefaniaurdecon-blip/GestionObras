import type { WorkReport as LegacyWorkReport } from '@/types/workReport';

export const API_WORK_REPORT_STATUSES = [
  'draft',
  'pending',
  'approved',
  'completed',
  'missing_data',
  'missing_delivery_notes',
  'closed',
  'archived',
] as const;

export type ApiWorkReportStatus = (typeof API_WORK_REPORT_STATUSES)[number];
export type WorkReportSyncOperationType = 'create' | 'update' | 'delete';

export interface ApiErpWorkReport {
  id: number;
  tenant_id: number;
  project_id: number;
  external_id?: string | null;
  report_identifier?: string | null;
  idempotency_key?: string | null;
  title?: string | null;
  date: string;
  status: ApiWorkReportStatus;
  is_closed: boolean;
  payload: Record<string, unknown>;
  created_by_id?: number | null;
  updated_by_id?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface ListErpWorkReportsParams {
  tenantId?: string | number | null;
  projectId?: number;
  externalId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  updatedSince?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateErpWorkReportPayload {
  project_id: number;
  date: string;
  title?: string | null;
  status?: ApiWorkReportStatus;
  is_closed?: boolean;
  report_identifier?: string | null;
  external_id?: string | null;
  payload?: Record<string, unknown>;
}

export interface UpdateErpWorkReportPayload {
  project_id?: number;
  date?: string;
  title?: string | null;
  status?: ApiWorkReportStatus;
  is_closed?: boolean;
  report_identifier?: string | null;
  external_id?: string | null;
  payload?: Record<string, unknown>;
}

export interface WorkReportSyncOperation {
  client_op_id: string;
  op: WorkReportSyncOperationType;
  report_id?: number;
  external_id?: string;
  client_temp_id?: string;
  data: Record<string, unknown>;
}

export interface WorkReportSyncRequest {
  since?: string | null;
  operations: WorkReportSyncOperation[];
  include_deleted?: boolean;
  limit?: number;
}

export interface WorkReportSyncAck {
  client_op_id: string;
  op?: WorkReportSyncOperationType;
  ok: boolean;
  error?: string | null;
  report_id?: number | null;
  external_id?: string | null;
  client_temp_id?: string | null;
  mapped_server_id?: number | null;
  server_updated_at?: string | null;
}

export interface WorkReportSyncResponse {
  ack?: WorkReportSyncAck[];
  id_map?: Record<string, number>;
  server_changes?: ApiErpWorkReport[];
}

export type WorkReportDetail = {
  workName: string;
  workNumber: string;
  date: string;
};

const LEGACY_ROW_RESERVED_KEYS = new Set([
  'id',
  '_server_id',
  'project_id',
  'projectId',
  'work_id',
  'workId',
  'date',
  'status',
  'organization_id',
  'organizationId',
  'tenant_id',
  'tenantId',
  'title',
  'report_identifier',
  'reportIdentifier',
  'external_id',
  'externalId',
  'is_closed',
  'isClosed',
]);

export function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function toText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized.length > 0) return normalized;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return fallback;
}

export function normalizeApiWorkReportStatus(
  value: unknown,
  fallback: ApiWorkReportStatus = 'draft',
): ApiWorkReportStatus {
  const normalized = toText(value).toLowerCase();
  return API_WORK_REPORT_STATUSES.includes(normalized as ApiWorkReportStatus)
    ? (normalized as ApiWorkReportStatus)
    : fallback;
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function toLegacyStatus(
  value: unknown,
  payload: Record<string, unknown>,
): LegacyWorkReport['status'] {
  const normalized = normalizeApiWorkReportStatus(
    value ?? payload.status,
    payload.missing_delivery_notes ? 'missing_delivery_notes' : 'missing_data',
  );

  if (normalized === 'missing_delivery_notes') return 'missing_delivery_notes';
  if (
    normalized === 'completed' ||
    normalized === 'approved' ||
    normalized === 'closed' ||
    normalized === 'archived'
  ) {
    return 'completed';
  }
  return 'missing_data';
}

function getProjectIdFromLegacyRow(source: Record<string, unknown>): number | null {
  return (
    toPositiveInteger(source.project_id) ??
    toPositiveInteger(source.projectId) ??
    toPositiveInteger(source.work_id) ??
    toPositiveInteger(source.workId)
  );
}

function getTitleFromLegacyRow(source: Record<string, unknown>): string | null {
  return toText(source.title, source.work_name, source.workName) || null;
}

function getReportIdentifierFromLegacyRow(source: Record<string, unknown>): string | null {
  return (
    toText(
      source.report_identifier,
      source.reportIdentifier,
      source.work_number,
      source.workNumber,
    ) || null
  );
}

function getExternalIdFromLegacyRow(
  source: Record<string, unknown>,
  options: { includeIdFallback?: boolean } = {},
): string | null {
  if (options.includeIdFallback === true) {
    return toText(source.external_id, source.externalId, source.id) || null;
  }
  return toText(source.external_id, source.externalId) || null;
}

function stripCanonicalFieldsFromLegacyRow(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (LEGACY_ROW_RESERVED_KEYS.has(key)) continue;
    payload[key] = value;
  }
  return payload;
}

export function extractWorkReportDetail(report: ApiErpWorkReport): WorkReportDetail {
  const payload = toRecord(report.payload);
  return {
    workName: toText(
      payload.workName,
      payload.work_name,
      payload.projectName,
      payload.project_name,
      report.title,
      `Obra ${report.project_id}`,
    ),
    workNumber: toText(
      payload.workNumber,
      payload.work_number,
      payload.reportIdentifier,
      payload.report_identifier,
      report.report_identifier,
      report.id,
    ),
    date: toText(payload.date, report.date),
  };
}

export function mapApiWorkReportToLegacyWorkReport(
  report: ApiErpWorkReport,
): LegacyWorkReport {
  const payload = toRecord(report.payload);
  const detail = extractWorkReportDetail(report);

  return {
    id: report.external_id || String(report.id),
    workId: toText(payload.workId, payload.work_id, report.project_id) || undefined,
    workNumber: detail.workNumber,
    date: detail.date,
    workName: detail.workName,
    foreman: toText(payload.mainForeman, payload.main_foreman, payload.foreman),
    foremanHours: toNumber(
      payload.mainForemanHours ?? payload.main_foreman_hours ?? payload.foremanHours ?? payload.foreman_hours,
      0,
    ),
    foremanEntries: toArray(
      payload.foremanEntries ??
      payload.foreman_entries ??
      payload.foremanResources ??
      payload.foreman_resources,
    ),
    foremanSignature: toText(payload.foremanSignature, payload.foreman_signature) || undefined,
    siteManager: toText(payload.siteManager, payload.site_manager),
    siteManagerSignature:
      toText(payload.siteManagerSignature, payload.site_manager_signature) || undefined,
    observations: toText(payload.observations),
    workGroups: toArray(payload.workGroups ?? payload.work_groups),
    machineryGroups: toArray(payload.machineryGroups ?? payload.machinery_groups),
    materialGroups: toArray(payload.materialGroups ?? payload.material_groups),
    subcontractGroups: toArray(payload.subcontractGroups ?? payload.subcontract_groups),
    createdAt: toText(report.created_at, report.updated_at, new Date().toISOString()),
    updatedAt: toText(report.updated_at, report.created_at, new Date().toISOString()),
    createdBy: toText(payload.createdBy, payload.created_by, report.created_by_id) || undefined,
    approved: toBoolean(payload.approved, report.status === 'approved'),
    approvedBy: toText(payload.approvedBy, payload.approved_by) || undefined,
    approvedAt: toText(payload.approvedAt, payload.approved_at) || undefined,
    lastEditedBy:
      toText(payload.lastEditedBy, payload.last_edited_by, report.updated_by_id) || undefined,
    lastEditedAt: toText(payload.lastEditedAt, payload.last_edited_at) || undefined,
    status: toLegacyStatus(report.status, payload),
    missingDeliveryNotes: toBoolean(
      payload.missingDeliveryNotes ?? payload.missing_delivery_notes,
      false,
    ),
    autoCloneNextDay: toBoolean(payload.autoCloneNextDay ?? payload.auto_clone_next_day, false),
    completedSections: toArray(payload.completedSections ?? payload.completed_sections),
    isArchived: report.status === 'archived',
    archivedAt: report.deleted_at || undefined,
    archivedBy: toText(payload.archivedBy, payload.archived_by) || undefined,
  };
}

export function mapApiWorkReportToLegacyRow(
  report: ApiErpWorkReport,
): Record<string, unknown> {
  const payload = toRecord(report.payload);
  return {
    id: report.external_id || String(report.id),
    _server_id: report.id,
    work_id: toText(payload.work_id, payload.workId, report.project_id),
    date: toText(payload.date, report.date),
    status: normalizeApiWorkReportStatus(payload.status ?? report.status, report.status),
    organization_id: String(report.tenant_id),
    title: report.title ?? null,
    report_identifier:
      toText(report.report_identifier, payload.report_identifier, payload.reportIdentifier) ||
      null,
    is_closed: report.is_closed,
    external_id: report.external_id ?? null,
    created_at: report.created_at,
    updated_at: report.updated_at,
    deleted_at: report.deleted_at ?? null,
    ...payload,
  };
}

export function buildCreateErpWorkReportPayloadFromLegacyRow(
  source: Record<string, unknown>,
): CreateErpWorkReportPayload {
  const payload = stripCanonicalFieldsFromLegacyRow(source);
  const projectId = getProjectIdFromLegacyRow(source) ?? 0;
  const status = normalizeApiWorkReportStatus(source.status, 'missing_data');
  const title = getTitleFromLegacyRow(source);
  const reportIdentifier = getReportIdentifierFromLegacyRow(source);
  const externalId = getExternalIdFromLegacyRow(source, { includeIdFallback: true });

  return {
    project_id: projectId,
    date: toText(source.date),
    status,
    is_closed: status === 'closed' || toBoolean(source.is_closed ?? source.isClosed, false),
    ...(title !== null ? { title } : {}),
    ...(reportIdentifier !== null ? { report_identifier: reportIdentifier } : {}),
    ...(externalId !== null ? { external_id: externalId } : {}),
    payload,
  };
}

export function buildUpdateErpWorkReportPayloadFromLegacyRow(
  source: Record<string, unknown>,
): UpdateErpWorkReportPayload {
  const payload = stripCanonicalFieldsFromLegacyRow(source);
  const projectId = getProjectIdFromLegacyRow(source);
  const title = Object.prototype.hasOwnProperty.call(source, 'title')
    ? getTitleFromLegacyRow(source)
    : undefined;
  const reportIdentifier = Object.prototype.hasOwnProperty.call(source, 'report_identifier') ||
    Object.prototype.hasOwnProperty.call(source, 'reportIdentifier') ||
    Object.prototype.hasOwnProperty.call(source, 'work_number') ||
    Object.prototype.hasOwnProperty.call(source, 'workNumber')
      ? getReportIdentifierFromLegacyRow(source)
      : undefined;
  const externalId = Object.prototype.hasOwnProperty.call(source, 'external_id') ||
    Object.prototype.hasOwnProperty.call(source, 'externalId')
      ? getExternalIdFromLegacyRow(source)
      : undefined;
  const next: UpdateErpWorkReportPayload = {
    payload,
  };

  if (projectId !== null) next.project_id = projectId;

  const date = toText(source.date);
  if (date) next.date = date;

  if (Object.prototype.hasOwnProperty.call(source, 'status')) {
    next.status = normalizeApiWorkReportStatus(source.status, 'missing_data');
    next.is_closed =
      next.status === 'closed' || toBoolean(source.is_closed ?? source.isClosed, false);
  } else if (
    Object.prototype.hasOwnProperty.call(source, 'is_closed') ||
    Object.prototype.hasOwnProperty.call(source, 'isClosed')
  ) {
    next.is_closed = toBoolean(source.is_closed ?? source.isClosed, false);
  }

  if (title !== undefined) next.title = title;
  if (reportIdentifier !== undefined) next.report_identifier = reportIdentifier;
  if (externalId !== undefined) next.external_id = externalId;

  return next;
}
