import { apiFetchJson } from '@/integrations/api/client';
import { offlineDb } from '@/offline-db/db';
import type { OutboxRow } from '@/offline-db/types';
import { getToken, isTokenExpired } from '@/integrations/api/storage';
import {
  API_WORK_REPORT_STATUSES,
  type ApiErpWorkReport,
  type WorkReportSyncAck,
  type WorkReportSyncOperation,
  type WorkReportSyncRequest,
  type WorkReportSyncResponse,
} from '@/services/workReportContract';
import {
  buildDeterministicClientOpId,
  decideConsolidatedAction,
  getCompatRetryPayload,
  shouldClearOutboxForAck,
} from './syncRobustnessRules';

const LAST_SYNC_KEY_PREFIX = 'work_reports_last_sync::';
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SYNC_STATUSES = new Set(API_WORK_REPORT_STATUSES);
type WorkReportServerChange = ApiErpWorkReport;

type ApiProjectLookup = {
  id: number;
  name?: string | null;
  code?: string | null;
};

type PendingEntry = {
  id: string;
  entity: string;
  entityId: string;
  op: 'create' | 'update' | 'delete';
  createdAt: number;
  tenantId: string | null;
  parsedPayload: Record<string, unknown>;
};

type LocalWorkReportSnapshot = {
  id: string;
  project_id: string | null;
  title: string | null;
  date: string;
  status: string;
  payload_json: string;
  deleted_at: number | null;
};

type SyncPlan =
  | {
      kind: 'error';
      tenantId: string;
      localReportId: string;
      outboxIds: string[];
      message: string;
    }
  | {
      kind: 'noop';
      tenantId: string;
      localReportId: string;
      outboxIds: string[];
      serverReportId: number | null;
      message: string;
    }
  | {
      kind: 'operation';
      tenantId: string;
      localReportId: string;
      outboxIds: string[];
      serverReportId: number | null;
      operation: WorkReportSyncOperation;
    };

export type SyncResult = {
  processed: number;
  synced: number;
  failed: number;
  pendingAfter: number;
  note: string;
};

type SyncOptions = {
  limit?: number;
  tenantId?: string | null;
};

export class SyncAuthRequiredError extends Error {
  reason: 'no_token' | 'token_expired' | 'session_invalid';

  constructor(reason: 'no_token' | 'token_expired' | 'session_invalid') {
    const messageByReason: Record<typeof reason, string> = {
      no_token: 'No hay sesion activa para sincronizar.',
      token_expired: 'La sesion ha caducado y se requiere volver a iniciar sesion.',
      session_invalid: 'La sesion no es valida en servidor. Inicia sesion de nuevo con MFA.',
    };
    super(messageByReason[reason]);
    this.name = 'SyncAuthRequiredError';
    this.reason = reason;
  }
}

export function isSyncAuthRequiredError(error: unknown): error is SyncAuthRequiredError {
  return error instanceof SyncAuthRequiredError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : null;
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function toJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizePayloadForSync(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  delete next.serverReportId;
  delete next.server_report_id;
  return next;
}

function toTenantIdFromPayload(payload: Record<string, unknown>): string | null {
  return asString(payload.tenantId) ?? asString(payload.tenant_id);
}

function toSyncErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Error de sincronización';
}

function isAuthApiError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: number; message?: string };
  if (candidate.status === 401) return true;
  const message = String(candidate.message ?? '').toLowerCase();
  return message.includes('sesion') || message.includes('session') || message.includes('unauthorized');
}

function shouldRetryServerChangesSerialization(error: unknown): boolean {
  const message = toSyncErrorMessage(error).toLowerCase();
  return (
    message.includes('workreportsyncresponse') ||
    message.includes('server_changes') ||
    message.includes('workreportread') ||
    message.includes('model_type')
  );
}

function toEpochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function normalizeLookupText(value: unknown): string | null {
  const base = asString(typeof value === 'number' ? String(value) : value);
  if (!base) return null;
  return base.toLowerCase();
}

function normalizeDateForSync(value: unknown): string | null {
  const direct = asString(value);
  if (direct && DATE_ONLY_PATTERN.test(direct)) return direct;

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getUTCFullYear();
      const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
      const d = String(parsed.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  return null;
}

function normalizeStatusForSync(value: unknown, fallback: string = 'draft'): string {
  const normalized = asString(value)?.toLowerCase();
  if (normalized && ALLOWED_SYNC_STATUSES.has(normalized)) return normalized;
  return fallback;
}

function sanitizeUpdateOperationDataForTransport(data: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...data };
  delete next.date;

  if (isRecord(next.patch)) {
    const patch: Record<string, unknown> = { ...next.patch };
    delete patch.date;
    next.patch = patch;
  }

  return next;
}

function sanitizeSyncRequestForTransport(requestPayload: WorkReportSyncRequest): WorkReportSyncRequest {
  return {
    ...requestPayload,
    operations: requestPayload.operations.map((operation) => {
      if (operation.op !== 'update' || !isRecord(operation.data)) {
        return operation;
      }

      return {
        ...operation,
        data: sanitizeUpdateOperationDataForTransport(operation.data),
      };
    }),
  };
}

function getLastSyncMetaKey(tenantId: string): string {
  return `${LAST_SYNC_KEY_PREFIX}${tenantId}`;
}

async function getLastSyncSince(tenantId: string): Promise<string | undefined> {
  const rows = await offlineDb.query<{ value: string }>(
    'SELECT value FROM local_meta WHERE key = ? LIMIT 1;',
    [getLastSyncMetaKey(tenantId)]
  );
  return asString(rows[0]?.value) ?? undefined;
}

async function setLastSyncSince(tenantId: string, timestampIso: string): Promise<void> {
  await offlineDb.exec(
    `INSERT INTO local_meta (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [getLastSyncMetaKey(tenantId), timestampIso]
  );
}

async function getWorkReportSnapshot(localReportId: string): Promise<LocalWorkReportSnapshot | null> {
  const rows = await offlineDb.query<LocalWorkReportSnapshot>(
    `SELECT id, project_id, title, date, status, payload_json, deleted_at
     FROM work_reports
     WHERE id = ?
     LIMIT 1;`,
    [localReportId]
  );
  return rows[0] ?? null;
}

async function fetchProjectsForTenant(tenantId: string): Promise<ApiProjectLookup[]> {
  try {
    return await apiFetchJson<ApiProjectLookup[]>('/api/v1/erp/projects', {
      method: 'GET',
      headers: { 'X-Tenant-Id': tenantId },
    });
  } catch (error) {
    console.warn('[Sync] No se pudieron cargar proyectos para resolver project_id.', {
      tenantId,
      error,
    });
    return [];
  }
}

async function getTenantProjects(
  tenantId: string,
  cache: Map<string, Promise<ApiProjectLookup[]>>
): Promise<ApiProjectLookup[]> {
  const cached = cache.get(tenantId);
  if (cached) return cached;
  const request = fetchProjectsForTenant(tenantId);
  cache.set(tenantId, request);
  return request;
}

async function resolveProjectIdForSync(
  snapshot: LocalWorkReportSnapshot,
  payload: Record<string, unknown>,
  tenantId: string,
  projectCache: Map<string, Promise<ApiProjectLookup[]>>
): Promise<number | null> {
  const directCandidates: unknown[] = [
    snapshot.project_id,
    payload.project_id,
    payload.projectId,
    payload.work_id,
    payload.workId,
  ];

  for (const candidate of directCandidates) {
    const numeric = toInteger(candidate);
    if (numeric !== null) return numeric;
  }

  const textCandidates = [
    normalizeLookupText(snapshot.project_id),
    normalizeLookupText(payload.project_id),
    normalizeLookupText(payload.projectId),
    normalizeLookupText(payload.work_id),
    normalizeLookupText(payload.workId),
    normalizeLookupText(payload.workNumber),
    normalizeLookupText(payload.work_name),
    normalizeLookupText(payload.workName),
    normalizeLookupText(payload.project_name),
    normalizeLookupText(payload.projectName),
  ].filter((value): value is string => Boolean(value));

  if (textCandidates.length === 0) return null;

  const projects = await getTenantProjects(tenantId, projectCache);
  if (projects.length === 0) return null;

  for (const candidate of textCandidates) {
    const numeric = toInteger(candidate);
    if (numeric !== null && projects.some((project) => project.id === numeric)) {
      return numeric;
    }
  }

  for (const candidate of textCandidates) {
    const byCode = projects.find((project) => normalizeLookupText(project.code) === candidate);
    if (byCode) return byCode.id;
  }

  for (const candidate of textCandidates) {
    const byName = projects.find((project) => normalizeLookupText(project.name) === candidate);
    if (byName) return byName.id;
  }

  if (projects.length > 0 && typeof projects[0]?.id === 'number') {
    console.warn('[Sync] project_id no resuelto por datos locales; usando obra fallback.', {
      tenantId,
      fallbackProjectId: projects[0].id,
      candidates: textCandidates,
    });
    return projects[0].id;
  }

  return null;
}

function readServerReportIdFromPayload(payload: Record<string, unknown>): number | null {
  const direct = toInteger(payload.serverReportId ?? payload.server_report_id);
  if (direct !== null) return direct;

  const nestedPayload = isRecord(payload.payload) ? payload.payload : null;
  if (nestedPayload) {
    const nested = toInteger(nestedPayload.serverReportId ?? nestedPayload.server_report_id);
    if (nested !== null) return nested;
  }

  const patch = isRecord(payload.patch) ? payload.patch : null;
  if (patch) {
    const patchDirect = toInteger(patch.serverReportId ?? patch.server_report_id);
    if (patchDirect !== null) return patchDirect;
    const patchPayload = isRecord(patch.payload) ? patch.payload : null;
    if (patchPayload) {
      const patchNested = toInteger(patchPayload.serverReportId ?? patchPayload.server_report_id);
      if (patchNested !== null) return patchNested;
    }
  }

  return null;
}

function inferServerReportIdFromLocalId(localReportId: string): number | null {
  if (!localReportId.startsWith('srv-')) return null;
  return toInteger(localReportId.replace('srv-', ''));
}

function resolveServerReportId(
  localReportId: string,
  snapshotPayload: Record<string, unknown>,
  sourceEntries: PendingEntry[]
): number | null {
  const fromSnapshot = readServerReportIdFromPayload(snapshotPayload);
  if (fromSnapshot !== null) return fromSnapshot;

  for (const entry of sourceEntries) {
    const fromEntry = readServerReportIdFromPayload(entry.parsedPayload);
    if (fromEntry !== null) return fromEntry;
  }

  return inferServerReportIdFromLocalId(localReportId);
}

async function buildCreateData(
  snapshot: LocalWorkReportSnapshot,
  tenantId: string,
  projectCache: Map<string, Promise<ApiProjectLookup[]>>
): Promise<Record<string, unknown> | null> {
  const payload = sanitizePayloadForSync(toJsonRecord(snapshot.payload_json));
  const projectId = await resolveProjectIdForSync(snapshot, payload, tenantId, projectCache);
  const date =
    normalizeDateForSync(snapshot.date) ??
    normalizeDateForSync(payload.date) ??
    normalizeDateForSync(payload.reportDate) ??
    normalizeDateForSync(payload.workDate);
  const status = normalizeStatusForSync(snapshot.status ?? payload.status, 'draft');
  const reportIdentifier = asString(payload.reportIdentifier) ?? asString(payload.report_identifier);
  const isClosed = status.toLowerCase() === 'closed' || Boolean(payload.isClosed ?? payload.is_closed);

  if (projectId === null || date === null) return null;

  const operationData: Record<string, unknown> = {
    project_id: projectId,
    date,
    status,
    payload,
  };
  if (snapshot.title !== null) operationData.title = snapshot.title;
  if (reportIdentifier !== null) operationData.report_identifier = reportIdentifier;
  if (isClosed) operationData.is_closed = true;
  return operationData;
}

async function buildUpdateData(
  snapshot: LocalWorkReportSnapshot,
  tenantId: string,
  projectCache: Map<string, Promise<ApiProjectLookup[]>>
): Promise<Record<string, unknown>> {
  const payload = sanitizePayloadForSync(toJsonRecord(snapshot.payload_json));
  const projectId = await resolveProjectIdForSync(snapshot, payload, tenantId, projectCache);
  const status = normalizeStatusForSync(snapshot.status ?? payload.status, 'draft');
  const reportIdentifier = asString(payload.reportIdentifier) ?? asString(payload.report_identifier);
  const isClosed = status.toLowerCase() === 'closed' || Boolean(payload.isClosed ?? payload.is_closed);

  const operationData: Record<string, unknown> = { payload };
  if (projectId !== null) operationData.project_id = projectId;
  if (snapshot.title !== null) operationData.title = snapshot.title;
  if (status) operationData.status = status;
  if (reportIdentifier !== null) operationData.report_identifier = reportIdentifier;
  if (isClosed) operationData.is_closed = true;
  return operationData;
}

async function buildSyncPlan(
  tenantId: string,
  localReportId: string,
  sourceEntries: PendingEntry[],
  projectCache: Map<string, Promise<ApiProjectLookup[]>>
): Promise<SyncPlan> {
  const fallbackOutboxIds = sourceEntries.map((entry) => entry.id);
  const snapshot = await getWorkReportSnapshot(localReportId);
  if (!snapshot) {
    return {
      kind: 'error',
      tenantId,
      localReportId,
      outboxIds: fallbackOutboxIds,
      message: 'Parte local no encontrado para consolidar sincronización.',
    };
  }

  const snapshotPayload = toJsonRecord(snapshot.payload_json);
  const serverReportId = resolveServerReportId(localReportId, snapshotPayload, sourceEntries);
  const decision = decideConsolidatedAction({
    localReportId,
    entries: sourceEntries,
    serverReportId,
  }) as {
    kind: 'create' | 'update' | 'delete' | 'noop' | 'error';
    message?: string;
    outboxIds: string[];
  };
  const outboxIds = decision.outboxIds.length > 0 ? decision.outboxIds : fallbackOutboxIds;

  if (decision.kind === 'error') {
    return {
      kind: 'error',
      tenantId,
      localReportId,
      outboxIds,
      message: decision.message ?? 'No se pudo consolidar el outbox del parte.',
    };
  }

  if (decision.kind === 'noop') {
    return {
      kind: 'noop',
      tenantId,
      localReportId,
      outboxIds,
      serverReportId: null,
      message: decision.message ?? 'No-op local.',
    };
  }

  if (decision.kind === 'delete') {
    if (serverReportId === null) {
      return {
        kind: 'error',
        tenantId,
        localReportId,
        outboxIds,
        message: 'Delete pendiente sin server_id. Sincroniza primero la creación.',
      };
    }

    return {
      kind: 'operation',
      tenantId,
      localReportId,
      outboxIds,
      serverReportId,
      operation: {
        client_op_id: buildDeterministicClientOpId({
          tenantId,
          localReportId,
          op: 'delete',
          serverReportId,
          outboxIds,
        }),
        op: 'delete',
        report_id: serverReportId,
        external_id: localReportId,
        data: {},
      },
    };
  }

  if (decision.kind === 'create') {
    const createData = await buildCreateData(snapshot, tenantId, projectCache);
    if (!createData) {
      return {
        kind: 'error',
        tenantId,
        localReportId,
        outboxIds,
        message: 'Create inválido: falta project_id o date en el parte local.',
      };
    }

    return {
      kind: 'operation',
      tenantId,
      localReportId,
      outboxIds,
      serverReportId: serverReportId ?? null,
      operation: {
        client_op_id: buildDeterministicClientOpId({
          tenantId,
          localReportId,
          op: 'create',
          serverReportId: serverReportId ?? null,
          outboxIds,
        }),
        op: 'create',
        client_temp_id: localReportId,
        external_id: localReportId,
        data: createData,
      },
    };
  }

  return {
    kind: 'operation',
    tenantId,
    localReportId,
    outboxIds,
    serverReportId,
    operation: {
      client_op_id: buildDeterministicClientOpId({
        tenantId,
        localReportId,
        op: 'update',
        serverReportId,
        outboxIds,
      }),
      op: 'update',
      report_id: serverReportId,
      external_id: localReportId,
      data: await buildUpdateData(snapshot, tenantId, projectCache),
    },
  };
}

function resolveMappedServerId(
  plan: Extract<SyncPlan, { kind: 'operation' }>,
  ack: WorkReportSyncAck | undefined,
  response: WorkReportSyncResponse
): number | null {
  if (typeof ack?.mapped_server_id === 'number' && Number.isFinite(ack.mapped_server_id)) {
    return ack.mapped_server_id;
  }
  if (typeof ack?.report_id === 'number' && Number.isFinite(ack.report_id)) {
    return ack.report_id;
  }
  if (response.id_map && typeof response.id_map[plan.localReportId] === 'number') {
    return response.id_map[plan.localReportId];
  }
  return plan.serverReportId ?? null;
}

async function markEntriesAsSynced(plan: SyncPlan, mappedServerId: number | null): Promise<void> {
  const outboxIds = plan.outboxIds;
  if (outboxIds.length === 0) return;

  await offlineDb.transaction(async (tx) => {
    const reportRows = await tx.query<{ payload_json: string }>(
      'SELECT payload_json FROM work_reports WHERE id = ? LIMIT 1;',
      [plan.localReportId]
    );

    if (reportRows.length > 0) {
      const currentPayload = toJsonRecord(reportRows[0].payload_json);
      if (mappedServerId !== null) {
        currentPayload.serverReportId = mappedServerId;
      }
      await tx.run(
        `UPDATE work_reports
         SET payload_json = ?,
             sync_status = 'synced',
             last_sync_error = NULL
         WHERE id = ?;`,
        [JSON.stringify(currentPayload), plan.localReportId]
      );
    } else {
      await tx.run(
        `UPDATE work_reports
         SET sync_status = 'synced',
             last_sync_error = NULL
         WHERE id = ?;`,
        [plan.localReportId]
      );
    }

    const placeholders = outboxIds.map(() => '?').join(', ');
    await tx.run(`DELETE FROM outbox WHERE id IN (${placeholders});`, outboxIds);
  });
}

async function markPlanError(plan: SyncPlan, errorMessage: string): Promise<void> {
  const outboxIds = plan.outboxIds;
  if (outboxIds.length === 0) return;

  await offlineDb.transaction(async (tx) => {
    const placeholders = outboxIds.map(() => '?').join(', ');
    await tx.run(
      `UPDATE outbox
       SET status = 'pending',
           attempts = attempts + 1,
           last_error = ?
       WHERE id IN (${placeholders});`,
      [errorMessage, ...outboxIds]
    );

    await tx.run(
      `UPDATE work_reports
       SET sync_status = 'pending',
           last_sync_error = ?
       WHERE id = ?;`,
      [errorMessage, plan.localReportId]
    );
  });
}

async function applyServerChanges(changes: WorkReportServerChange[] | undefined, tenantId: string): Promise<number> {
  if (!Array.isArray(changes) || changes.length === 0) return 0;

  let applied = 0;
  await offlineDb.transaction(async (tx) => {
    for (const change of changes) {
      if (!change || typeof change.id !== 'number') continue;

      const localId = asString(change.external_id) ?? `srv-${change.id}`;
      const projectId =
        change.project_id === null || change.project_id === undefined ? null : String(change.project_id);
      const createdAt = toEpochMs(change.created_at);
      const updatedAt = toEpochMs(change.updated_at);
      const deletedAt = change.deleted_at ? toEpochMs(change.deleted_at) : null;
      const payload = isRecord(change.payload) ? { ...change.payload } : {};
      payload.serverReportId = change.id;

      await tx.run(
        `INSERT INTO work_reports (
          id, tenant_id, project_id, title, date, status, payload_json,
          created_at, updated_at, deleted_at, sync_status, last_sync_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', NULL)
        ON CONFLICT(id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          project_id = excluded.project_id,
          title = excluded.title,
          date = excluded.date,
          status = excluded.status,
          payload_json = excluded.payload_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at,
          sync_status = 'synced',
          last_sync_error = NULL;`,
        [
          localId,
          tenantId,
          projectId,
          asString(change.title),
          asString(change.date) ?? new Date().toISOString().slice(0, 10),
          asString(change.status) ?? 'draft',
          JSON.stringify(payload),
          createdAt,
          updatedAt,
          deletedAt,
        ]
      );
      applied += 1;
    }
  });

  return applied;
}

async function sendSyncBatch(
  tenantId: string,
  requestPayload: WorkReportSyncRequest
): Promise<WorkReportSyncResponse> {
  const sanitizedRequestPayload = sanitizeSyncRequestForTransport(requestPayload);

  const doRequest = async (payload: WorkReportSyncRequest): Promise<WorkReportSyncResponse> => {
    return apiFetchJson<WorkReportSyncResponse>('/api/v1/erp/work-reports/sync', {
      method: 'POST',
      headers: { 'X-Tenant-Id': tenantId },
      body: JSON.stringify(payload),
    });
  };

  try {
    return await doRequest(sanitizedRequestPayload);
  } catch (error) {
    if (!shouldRetryServerChangesSerialization(error)) {
      throw error;
    }

    const compatRetryPayload = getCompatRetryPayload(sanitizedRequestPayload, true);
    if (!compatRetryPayload) {
      throw error;
    }

    console.warn('[Sync][compat-retry] Reintento único por bug backend en server_changes.', {
      tenantId,
      retryPayload: compatRetryPayload,
      originalError: toSyncErrorMessage(error),
      todo: 'Backend debe serializar server_changes con model_dump() y no ORM directo.',
    });
    return doRequest(compatRetryPayload);
  }
}

async function pullServerReports(
  tenantId: string,
  since: string | null | undefined,
  limit: number = 200
): Promise<WorkReportServerChange[]> {
  const params = new URLSearchParams();
  params.set('include_deleted', 'true');
  params.set('limit', String(Math.max(1, Math.min(limit, 500))));
  params.set('offset', '0');
  if (since) {
    params.set('updated_since', since);
  }

  return apiFetchJson<WorkReportServerChange[]>(`/api/v1/erp/work-reports?${params.toString()}`, {
    method: 'GET',
    headers: { 'X-Tenant-Id': tenantId },
  });
}

export async function syncNow(options: SyncOptions = {}): Promise<SyncResult> {
  await offlineDb.init();

  const tokenData = await getToken();
  if (!tokenData?.access_token) {
    throw new SyncAuthRequiredError('no_token');
  }
  if (isTokenExpired(tokenData)) {
    throw new SyncAuthRequiredError('token_expired');
  }

  const limit = Math.max(1, Math.min(options.limit ?? 50, 500));
  const batch = await offlineDb.query<OutboxRow>(
    `SELECT
      id, entity, entity_id, op, payload_json, created_at, attempts, last_error, status
     FROM outbox
     WHERE status = 'pending'
     ORDER BY created_at ASC, id ASC
     LIMIT ?;`,
    [limit]
  );

  const entries: PendingEntry[] = batch.map((row) => {
    const parsedPayload = toJsonRecord(row.payload_json);
    return {
      id: row.id,
      entity: row.entity,
      entityId: row.entity_id,
      op: row.op,
      createdAt: row.created_at,
      tenantId: toTenantIdFromPayload(parsedPayload) ?? asString(options.tenantId),
      parsedPayload,
    };
  });

  let synced = 0;
  let failed = 0;
  let firstFailureReason: string | null = null;
  const processed = entries.length;
  const projectCache = new Map<string, Promise<ApiProjectLookup[]>>();

  const groupedByTenant = new Map<string, PendingEntry[]>();
  const preferredTenantId = asString(options.tenantId);
  if (preferredTenantId) {
    groupedByTenant.set(preferredTenantId, []);
  }

  for (const entry of entries) {
    if (!entry.tenantId) {
      failed += 1;
      const message = 'No se pudo resolver tenant para sincronizar.';
      if (!firstFailureReason) firstFailureReason = message;
      await markPlanError(
        {
          kind: 'error',
          tenantId: '',
          localReportId: entry.entityId,
          outboxIds: [entry.id],
          message,
        },
        message
      );
      continue;
    }

    if (entry.op !== 'create' && entry.op !== 'update' && entry.op !== 'delete') {
      failed += 1;
      const message = `Operación no soportada en outbox: ${String(entry.op)}`;
      if (!firstFailureReason) firstFailureReason = message;
      await markPlanError(
        {
          kind: 'error',
          tenantId: entry.tenantId,
          localReportId: entry.entityId,
          outboxIds: [entry.id],
          message,
        },
        message
      );
      continue;
    }

    if (entry.entityId.trim().length === 0 || entry.entity !== 'work_report') {
      failed += 1;
      const message = 'Entrada de outbox inválida para parte.';
      if (!firstFailureReason) firstFailureReason = message;
      await markPlanError(
        {
          kind: 'error',
          tenantId: entry.tenantId,
          localReportId: entry.entityId,
          outboxIds: [entry.id],
          message,
        },
        message
      );
      continue;
    }

    const tenantEntries = groupedByTenant.get(entry.tenantId) ?? [];
    tenantEntries.push(entry);
    groupedByTenant.set(entry.tenantId, tenantEntries);
  }

  for (const [tenantId, tenantEntries] of groupedByTenant.entries()) {
    const byReport = new Map<string, PendingEntry[]>();
    for (const entry of tenantEntries) {
      const list = byReport.get(entry.entityId) ?? [];
      list.push(entry);
      byReport.set(entry.entityId, list);
    }

    const plans: Extract<SyncPlan, { kind: 'operation' }>[] = [];

    for (const [localReportId, reportEntries] of byReport.entries()) {
      const plan = await buildSyncPlan(tenantId, localReportId, reportEntries, projectCache);

      if (plan.kind === 'error') {
        failed += plan.outboxIds.length;
        if (!firstFailureReason) firstFailureReason = plan.message;
        await markPlanError(plan, plan.message);
        console.warn('[Sync] Plan inválido', {
          tenantId,
          localReportId,
          outboxIds: plan.outboxIds,
          message: plan.message,
        });
        continue;
      }

      if (plan.kind === 'noop') {
        synced += plan.outboxIds.length;
        await markEntriesAsSynced(plan, plan.serverReportId);
        console.debug('[Sync] No-op local aplicado', {
          tenantId,
          localReportId,
          outboxIds: plan.outboxIds,
        });
        continue;
      }

      plans.push(plan);
    }

    const sinceFromMeta = await getLastSyncSince(tenantId);

    if (plans.length > 0) {
      const requestPayload: WorkReportSyncRequest = {
        // Enviado explícitamente para evitar defaults incompatibles de backend.
        since: sinceFromMeta ?? null,
        operations: plans.map((plan) => plan.operation),
        include_deleted: true,
        limit: 200,
      };

      console.debug('[Sync] Request', { tenantId, payload: requestPayload });
      console.debug('[Sync] Request JSON', JSON.stringify(requestPayload));

      try {
        const response = await sendSyncBatch(tenantId, requestPayload);
        console.debug('[Sync] Response', { tenantId, response });

        const ackMap = new Map<string, WorkReportSyncAck>();
        for (const ack of response.ack ?? []) {
          ackMap.set(ack.client_op_id, ack);
        }

      for (const plan of plans) {
        const ack = ackMap.get(plan.operation.client_op_id);
        if (shouldClearOutboxForAck(ack)) {
          const mappedServerId = resolveMappedServerId(plan, ack, response);
          synced += plan.outboxIds.length;
          await markEntriesAsSynced(plan, mappedServerId);
            console.debug('[Sync] Ack OK', {
              tenantId,
              clientOpId: plan.operation.client_op_id,
              localReportId: plan.localReportId,
              mappedServerId,
              outboxIds: plan.outboxIds,
            });
            continue;
          }

          failed += plan.outboxIds.length;
          let errorMessage =
            asString(ack?.error) ??
            (ack ? 'Error de sincronización en servidor.' : 'El servidor no devolvió confirmación para la operación.');

          if (!firstFailureReason) firstFailureReason = errorMessage;
          await markPlanError(plan, errorMessage);
          console.warn('[Sync] Ack FAIL', {
            tenantId,
            clientOpId: plan.operation.client_op_id,
            localReportId: plan.localReportId,
            errorMessage,
            outboxIds: plan.outboxIds,
          });
        }
      } catch (error) {
        if (isAuthApiError(error)) {
          throw new SyncAuthRequiredError('session_invalid');
        }
        const errorMessage = toSyncErrorMessage(error);
        if (!firstFailureReason) firstFailureReason = errorMessage;
        for (const plan of plans) {
          failed += plan.outboxIds.length;
          await markPlanError(plan, errorMessage);
        }
        console.error('[Sync] Request error', { tenantId, errorMessage, error });
      }
    }

    try {
      const pulled = await pullServerReports(tenantId, sinceFromMeta ?? null, 200);
      const applied = await applyServerChanges(pulled, tenantId);
      await setLastSyncSince(tenantId, new Date().toISOString());
      console.debug('[Sync] Pull aplicado', {
        tenantId,
        pulled: pulled.length,
        applied,
      });
    } catch (pullError) {
      if (isAuthApiError(pullError)) {
        throw new SyncAuthRequiredError('session_invalid');
      }
      const pullMessage = `Error en pull incremental: ${toSyncErrorMessage(pullError)}`;
      if (!firstFailureReason) firstFailureReason = pullMessage;
      console.error('[Sync] Pull error', { tenantId, pullMessage, pullError });
    }
  }

  const pendingRow = await offlineDb.query<{ count: number }>(
    "SELECT COUNT(*) as count FROM outbox WHERE status = 'pending';"
  );
  const pendingAfter = Number(pendingRow?.[0]?.count ?? 0);

  return {
    processed,
    synced,
    failed,
    pendingAfter,
    note:
      synced > 0
        ? 'Sincronización completada.'
        : firstFailureReason
          ? `No se pudo sincronizar ningún parte. ${firstFailureReason}`
          : 'No se pudo sincronizar ningún parte.',
  };
}
