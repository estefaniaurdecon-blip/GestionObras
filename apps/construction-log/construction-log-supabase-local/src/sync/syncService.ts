import { offlineDb } from '@/offline-db/db';
import type { OutboxRow } from '@/offline-db/types';
import { changePassword, refreshSessionIfPossible } from '@/integrations/api/client';
import { getToken, isTokenExpired } from '@/integrations/api/storage';
import { saveOfflineCredential } from '@/integrations/api/offlineCredentials';
import {
  API_WORK_REPORT_STATUSES,
  type WorkReportSyncOperation,
  type WorkReportSyncRequest,
} from '@/services/workReportContract';
import {
  buildDeterministicClientOpId,
  decideConsolidatedAction,
  shouldClearOutboxForAck,
} from './syncRobustnessRules';
import {
  markEntriesAsSynced,
  markPlanError,
  resolveMappedServerId,
} from './syncApplyResultsService';
import { getLastSyncSince, runIncrementalPullSyncPhase } from './syncPullService';
import { buildSyncAckMap, sendSyncBatch } from './syncTransportService';
import {
  asString,
  resolveProjectIdForSync,
  resolveServerReportId,
  type ApiProjectLookup,
} from './syncResolvers';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SYNC_STATUSES = new Set(API_WORK_REPORT_STATUSES);
const SYNC_PLAN_ERROR_PROJECT_ID_UNRESOLVED = 'project_id_unresolved';
const SYNC_PLAN_ERROR_DATE_MISSING = 'date_missing';


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

type BuildOperationDataResult = {
  data: Record<string, unknown> | null;
  errorMessage: string | null;
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

const PROJECT_LOOKUP_KEYS = [
  'project_id',
  'projectId',
  'work_id',
  'workId',
  'title',
  'workNumber',
  'work_name',
  'workName',
  'project_name',
  'projectName',
] as const;

function collectProjectLookupCandidatesFromRecord(record: Record<string, unknown>): unknown[] {
  const candidates: unknown[] = [];
  for (const key of PROJECT_LOOKUP_KEYS) {
    if (key in record) {
      candidates.push(record[key]);
    }
  }
  return candidates;
}

function collectProjectLookupCandidates(entries: PendingEntry[]): unknown[] {
  const candidates: unknown[] = [];

  for (const entry of entries) {
    const root = entry.parsedPayload;
    candidates.push(...collectProjectLookupCandidatesFromRecord(root));

    const nestedPayload = isRecord(root.payload) ? root.payload : null;
    if (nestedPayload) {
      candidates.push(...collectProjectLookupCandidatesFromRecord(nestedPayload));
    }

    const patch = isRecord(root.patch) ? root.patch : null;
    if (patch) {
      candidates.push(...collectProjectLookupCandidatesFromRecord(patch));

      const patchPayload = isRecord(patch.payload) ? patch.payload : null;
      if (patchPayload) {
        candidates.push(...collectProjectLookupCandidatesFromRecord(patchPayload));
      }
    }
  }

  return candidates;
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
  if (normalized && ALLOWED_SYNC_STATUSES.has(normalized as (typeof API_WORK_REPORT_STATUSES)[number])) {
    return normalized;
  }
  return fallback;
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

async function buildCreateData(
  snapshot: LocalWorkReportSnapshot,
  tenantId: string,
  projectCache: Map<string, Promise<ApiProjectLookup[]>>,
  extraProjectCandidates: unknown[] = []
): Promise<BuildOperationDataResult> {
  const payload = sanitizePayloadForSync(toJsonRecord(snapshot.payload_json));
  const projectId = await resolveProjectIdForSync(
    snapshot,
    payload,
    tenantId,
    projectCache,
    extraProjectCandidates
  );
  const date =
    normalizeDateForSync(snapshot.date) ??
    normalizeDateForSync(payload.date) ??
    normalizeDateForSync(payload.reportDate) ??
    normalizeDateForSync(payload.workDate);
  const status = normalizeStatusForSync(snapshot.status ?? payload.status, 'draft');
  const reportIdentifier = asString(payload.reportIdentifier) ?? asString(payload.report_identifier);
  const isClosed = status.toLowerCase() === 'closed' || Boolean(payload.isClosed ?? payload.is_closed);

  if (projectId === null) {
    return { data: null, errorMessage: SYNC_PLAN_ERROR_PROJECT_ID_UNRESOLVED };
  }

  if (date === null) {
    return { data: null, errorMessage: SYNC_PLAN_ERROR_DATE_MISSING };
  }

  const operationData: Record<string, unknown> = {
    project_id: projectId,
    date,
    status,
    payload,
  };
  if (snapshot.title !== null) operationData.title = snapshot.title;
  if (reportIdentifier !== null) operationData.report_identifier = reportIdentifier;
  if (isClosed) operationData.is_closed = true;
  return { data: operationData, errorMessage: null };
}

async function buildUpdateData(
  snapshot: LocalWorkReportSnapshot,
  tenantId: string,
  projectCache: Map<string, Promise<ApiProjectLookup[]>>,
  extraProjectCandidates: unknown[] = []
): Promise<BuildOperationDataResult> {
  const payload = sanitizePayloadForSync(toJsonRecord(snapshot.payload_json));
  const projectId = await resolveProjectIdForSync(
    snapshot,
    payload,
    tenantId,
    projectCache,
    extraProjectCandidates
  );
  const status = normalizeStatusForSync(snapshot.status ?? payload.status, 'draft');
  const reportIdentifier = asString(payload.reportIdentifier) ?? asString(payload.report_identifier);
  const isClosed = status.toLowerCase() === 'closed' || Boolean(payload.isClosed ?? payload.is_closed);

  if (projectId === null) {
    return { data: null, errorMessage: SYNC_PLAN_ERROR_PROJECT_ID_UNRESOLVED };
  }

  const operationData: Record<string, unknown> = { payload };
  operationData.project_id = projectId;
  if (snapshot.title !== null) operationData.title = snapshot.title;
  if (status) operationData.status = status;
  if (reportIdentifier !== null) operationData.report_identifier = reportIdentifier;
  if (isClosed) operationData.is_closed = true;
  return { data: operationData, errorMessage: null };
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
  const projectLookupCandidates = collectProjectLookupCandidates(sourceEntries);
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
    const createData = await buildCreateData(
      snapshot,
      tenantId,
      projectCache,
      projectLookupCandidates
    );
    if (!createData.data) {
      return {
        kind: 'error',
        tenantId,
        localReportId,
        outboxIds,
        message: createData.errorMessage ?? 'Create inválido: falta project_id o date en el parte local.',
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
        data: createData.data,
      },
    };
  }

  const updateData = await buildUpdateData(
    snapshot,
    tenantId,
    projectCache,
    projectLookupCandidates
  );
  if (!updateData.data) {
    return {
      kind: 'error',
      tenantId,
      localReportId,
      outboxIds,
      message: updateData.errorMessage ?? 'Update inválido: falta project_id fiable en el parte local.',
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
      data: updateData.data,
    },
  };
}

async function syncCredentialChanges(): Promise<void> {
  const entries = await offlineDb.query<OutboxRow>(
    `SELECT id, entity, entity_id, op, payload_json, created_at, attempts, last_error, status
     FROM outbox
     WHERE entity = 'credential_change' AND status = 'pending'
     ORDER BY created_at ASC;`,
  );

  for (const entry of entries) {
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(entry.payload_json);
      payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      await offlineDb.transaction(async (tx) => {
        await tx.run(
          `UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?;`,
          ['Payload JSON inválido en credential_change', entry.id],
        );
      });
      continue;
    }

    try {
      await changePassword({
        current_password: String(payload.current_password ?? ''),
        new_password: String(payload.new_password ?? ''),
        new_password_confirm: String(payload.new_password_confirm ?? ''),
      });
      // Actualizar credencial offline con la contraseña confirmada por el servidor
      const email = asString(payload.email) ?? entry.entity_id;
      if (email) {
        try {
          await saveOfflineCredential(email, String(payload.new_password ?? ''));
        } catch {
          // no crítico
        }
      }
      await offlineDb.transaction(async (tx) => {
        await tx.run(`DELETE FROM outbox WHERE id = ?;`, [entry.id]);
      });
    } catch (error) {
      if (isAuthApiError(error)) {
        throw new SyncAuthRequiredError('session_invalid');
      }
      const errorMessage = toSyncErrorMessage(error);
      await offlineDb.transaction(async (tx) => {
        await tx.run(
          `UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?;`,
          [errorMessage, entry.id],
        );
      });
    }
  }
}

export async function syncNow(options: SyncOptions = {}): Promise<SyncResult> {
  await offlineDb.init();

  let tokenData = await getToken();
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if ((!tokenData?.access_token || isTokenExpired(tokenData)) && !isOffline) {
    const sessionRecovered = await refreshSessionIfPossible();
    if (sessionRecovered) {
      tokenData = await getToken();
    }
  }

  if (!tokenData?.access_token) {
    throw new SyncAuthRequiredError('no_token');
  }
  if (isTokenExpired(tokenData)) {
    throw new SyncAuthRequiredError('token_expired');
  }

  // Sincronizar cambios de contraseña pendientes antes que cualquier otra cosa
  await syncCredentialChanges();

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

        const ackMap = buildSyncAckMap(response);

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
          const errorMessage =
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
      const pullResult = await runIncrementalPullSyncPhase(tenantId, sinceFromMeta ?? null, 200);
      console.debug('[Sync] Pull aplicado', {
        tenantId,
        pulled: pullResult.pulledCount,
        applied: pullResult.applied,
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
