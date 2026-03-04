import { offlineDb, type OfflineDbTx } from '@/offline-db/db';
import type {
  OutboxOp,
  OutboxStatus,
  OutboxRow,
  SyncStatus,
  WorkReport,
  WorkReportRow,
  WorkReportStatus,
} from '@/offline-db/types';

export type WorkReportsListParams = {
  tenantId: string;
  projectId?: string | null;
  limit?: number;
  status?: WorkReportStatus;
};

export type WorkReportDraftData = {
  tenantId: string;
  projectId?: string | null;
  title?: string | null;
  date?: string; // YYYY-MM-DD
  status?: WorkReportStatus;
  payload?: unknown;
};

export type WorkReportPatch = Partial<Pick<WorkReportDraftData, 'projectId' | 'title' | 'date' | 'status' | 'payload'>>;

function toLocalDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildPayloadJson(base: { title: string | null; date: string; status: WorkReportStatus; projectId: string | null }, extra: unknown) {
  if (extra === undefined) return base;
  if (isPlainObject(extra)) return { ...extra, ...base };
  return { ...base, value: extra };
}

function toWorkReport(row: WorkReportRow): WorkReport {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    title: row.title,
    date: row.date,
    status: row.status,
    payload: safeJsonParse(row.payload_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    lastSyncError: row.last_sync_error,
  };
}

async function insertOutboxEvent(tx: OfflineDbTx, params: {
  tenantId: string;
  entity: string;
  entityId: string;
  op: OutboxOp;
  payload: unknown;
  createdAt: number;
}) {
  const outboxId = crypto.randomUUID();
  await tx.run(
    `INSERT INTO outbox (
      id, entity, entity_id, op, payload_json, created_at, attempts, last_error, status
    ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 'pending');`,
    [
      outboxId,
      params.entity,
      params.entityId,
      params.op,
      JSON.stringify({
        tenantId: params.tenantId,
        ...params.payload,
      }),
      params.createdAt,
    ]
  );
}

type OutboxPayloadRow = {
  id: string;
  payload_json: string;
};

export type LegacyWorkReportImportRow = Omit<WorkReportRow, 'tenant_id'> & {
  tenant_id: string | null;
};

export type LegacyOutboxImportRow = OutboxRow;

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTimestamp(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
}

function normalizeOptionalTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeWorkReportStatus(value: unknown): WorkReportStatus {
  const normalized = normalizeText(value);
  if (
    normalized === 'draft' ||
    normalized === 'pending' ||
    normalized === 'approved' ||
    normalized === 'completed' ||
    normalized === 'missing_data' ||
    normalized === 'missing_delivery_notes'
  ) {
    return normalized;
  }
  return 'draft';
}

function normalizeSyncStatus(value: unknown): SyncStatus {
  const normalized = normalizeText(value);
  if (normalized === 'pending' || normalized === 'synced' || normalized === 'error') {
    return normalized;
  }
  return 'pending';
}

function normalizeOutboxOp(value: unknown): OutboxOp {
  const normalized = normalizeText(value);
  if (normalized === 'create' || normalized === 'update' || normalized === 'delete') {
    return normalized;
  }
  return 'update';
}

function normalizeOutboxStatus(value: unknown): OutboxStatus {
  const normalized = normalizeText(value);
  if (normalized === 'pending' || normalized === 'synced' || normalized === 'error') {
    return normalized;
  }
  return 'pending';
}

function extractTenantHintFromPayloadJson(payloadJson: string): string | null {
  const payload = safeJsonParse(payloadJson);
  if (!isPlainObject(payload)) return null;

  const tenantId = normalizeText(payload.tenantId);
  if (tenantId) return tenantId;

  const tenantIdSnake = normalizeText(payload.tenant_id);
  if (tenantIdSnake) return tenantIdSnake;

  return null;
}

export const workReportsRepo = {
  async init(): Promise<void> {
    await offlineDb.init();
  },

  async list(params: WorkReportsListParams): Promise<WorkReport[]> {
    const limit = Math.max(1, Math.min(params.limit ?? 100, 500));

    const where: string[] = ['tenant_id = ?', 'deleted_at IS NULL'];
    const args: unknown[] = [params.tenantId];

    if (params.projectId) {
      where.push('project_id = ?');
      args.push(params.projectId);
    }

    if (params.status) {
      where.push('status = ?');
      args.push(params.status);
    }

    const rows = await offlineDb.query<WorkReportRow>(
      `SELECT
        id, tenant_id, project_id, title, date, status, payload_json,
        created_at, updated_at, deleted_at, sync_status, last_sync_error
      FROM work_reports
      WHERE ${where.join(' AND ')}
      ORDER BY date DESC, updated_at DESC
      LIMIT ?;`,
      [...args, limit]
    );

    return rows.map(toWorkReport);
  },

  async getById(id: string): Promise<WorkReport | null> {
    const rows = await offlineDb.query<WorkReportRow>(
      `SELECT
        id, tenant_id, project_id, title, date, status, payload_json,
        created_at, updated_at, deleted_at, sync_status, last_sync_error
      FROM work_reports
      WHERE id = ?
        AND deleted_at IS NULL
      LIMIT 1;`,
      [id]
    );
    const row = rows[0];
    return row ? toWorkReport(row) : null;
  },

  async create(draft: WorkReportDraftData): Promise<WorkReport> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const date = draft.date ?? toLocalDateYYYYMMDD(new Date());
    const status: WorkReportStatus = draft.status ?? 'draft';
    const title = draft.title ?? null;
    const projectId = draft.projectId ?? null;

    const payload = buildPayloadJson({ title, date, status, projectId }, draft.payload);

    await offlineDb.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO work_reports (
          id, tenant_id, project_id, title, date, status, payload_json,
          created_at, updated_at, deleted_at, sync_status, last_sync_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', NULL);`,
        [id, draft.tenantId, projectId, title, date, status, JSON.stringify(payload), now, now]
      );

      await insertOutboxEvent(tx, {
        tenantId: draft.tenantId,
        entity: 'work_report',
        entityId: id,
        op: 'create',
        payload: {
          id,
          projectId,
          title,
          date,
          status,
          payload,
          createdAt: now,
          updatedAt: now,
        },
        createdAt: now,
      });
    });

    return {
      id,
      tenantId: draft.tenantId,
      projectId,
      title,
      date,
      status,
      payload,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
      lastSyncError: null,
    };
  },

  async update(id: string, patch: WorkReportPatch): Promise<WorkReport | null> {
    const existing = await workReportsRepo.getById(id);
    if (!existing) return null;

    const now = Date.now();
    const existingPayloadRecord = isPlainObject(existing.payload) ? existing.payload : {};
    let nextPayload: unknown = patch.payload ?? existing.payload;
    if (isPlainObject(nextPayload)) {
      const serverReportId = existingPayloadRecord.serverReportId ?? existingPayloadRecord.server_report_id;
      if (serverReportId !== undefined && nextPayload.serverReportId === undefined && nextPayload.server_report_id === undefined) {
        nextPayload = { ...nextPayload, serverReportId };
      }
    }

    const next: WorkReport = {
      ...existing,
      projectId: patch.projectId ?? existing.projectId,
      title: patch.title ?? existing.title,
      date: patch.date ?? existing.date,
      status: patch.status ?? existing.status,
      payload: nextPayload,
      updatedAt: now,
      syncStatus: 'pending',
      lastSyncError: null,
    };

    const payloadJson = buildPayloadJson(
      { title: next.title, date: next.date, status: next.status, projectId: next.projectId },
      next.payload
    );

    await offlineDb.transaction(async (tx) => {
      await tx.run(
        `UPDATE work_reports
         SET project_id = ?,
             title = ?,
             date = ?,
             status = ?,
             payload_json = ?,
             updated_at = ?,
             sync_status = 'pending',
             last_sync_error = NULL
         WHERE id = ?
           AND deleted_at IS NULL;`,
        [
          next.projectId,
          next.title,
          next.date,
          next.status,
          JSON.stringify(payloadJson),
          now,
          id,
        ]
      );

      await insertOutboxEvent(tx, {
        tenantId: next.tenantId,
        entity: 'work_report',
        entityId: id,
        op: 'update',
        payload: {
          id,
          patch,
          updatedAt: now,
        },
        createdAt: now,
      });
    });

    return next;
  },

  async softDelete(id: string): Promise<boolean> {
    const existing = await workReportsRepo.getById(id);
    if (!existing) return false;

    const now = Date.now();
    await offlineDb.transaction(async (tx) => {
      await tx.run(
        `UPDATE work_reports
         SET deleted_at = ?,
             updated_at = ?,
             sync_status = 'pending',
             last_sync_error = NULL
         WHERE id = ?
           AND deleted_at IS NULL;`,
        [now, now, id]
      );

      await insertOutboxEvent(tx, {
        tenantId: existing.tenantId,
        entity: 'work_report',
        entityId: id,
        op: 'delete',
        payload: {
          id,
          deletedAt: now,
        },
        createdAt: now,
      });
    });

    return true;
  },

  async hardDelete(id: string): Promise<boolean> {
    const existing = await workReportsRepo.getById(id);
    if (!existing) return false;

    await offlineDb.transaction(async (tx) => {
      await tx.run(
        `DELETE FROM outbox
         WHERE entity = 'work_report'
           AND entity_id = ?;`,
        [id]
      );

      await tx.run(
        `DELETE FROM work_reports
         WHERE id = ?;`,
        [id]
      );
    });

    return true;
  },

  async importLegacySnapshot(params: {
    tenantId: string;
    legacyUserScope?: string | null;
    workReports: LegacyWorkReportImportRow[];
    outbox: LegacyOutboxImportRow[];
  }): Promise<{
    reportsImported: number;
    reportsRescoped: number;
    reportsSkipped: number;
    outboxImported: number;
    outboxRescoped: number;
    outboxSkipped: number;
  }> {
    const tenantId = params.tenantId.trim();
    const legacyUserScope = normalizeText(params.legacyUserScope);
    if (!tenantId) {
      return {
        reportsImported: 0,
        reportsRescoped: 0,
        reportsSkipped: 0,
        outboxImported: 0,
        outboxRescoped: 0,
        outboxSkipped: 0,
      };
    }

    const now = Date.now();

    return offlineDb.transaction(async (tx) => {
      let reportsImported = 0;
      let reportsRescoped = 0;
      let reportsSkipped = 0;

      for (const row of params.workReports) {
        const rowId = normalizeText(row.id);
        if (!rowId) {
          reportsSkipped += 1;
          continue;
        }

        const payloadJson =
          typeof row.payload_json === 'string' && row.payload_json.trim().length > 0 ? row.payload_json : '{}';
        const payloadTenantHint = extractTenantHintFromPayloadJson(payloadJson);
        const rowTenantId = normalizeText(row.tenant_id);
        const importable =
          rowTenantId === tenantId ||
          rowTenantId === legacyUserScope ||
          (rowTenantId === null &&
            (payloadTenantHint === tenantId || payloadTenantHint === legacyUserScope));

        if (!importable) {
          reportsSkipped += 1;
          continue;
        }

        const requiresRescope = rowTenantId !== tenantId;
        if (requiresRescope) reportsRescoped += 1;

        const createdAt = normalizeTimestamp(row.created_at);
        const updatedAt = requiresRescope ? now : normalizeTimestamp(row.updated_at);
        const deletedAt = normalizeOptionalTimestamp(row.deleted_at);
        const syncStatus: SyncStatus = requiresRescope ? 'pending' : normalizeSyncStatus(row.sync_status);
        const lastSyncError = requiresRescope ? null : normalizeText(row.last_sync_error);

        await tx.run(
          `INSERT INTO work_reports (
            id, tenant_id, project_id, title, date, status, payload_json,
            created_at, updated_at, deleted_at, sync_status, last_sync_error
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            sync_status = excluded.sync_status,
            last_sync_error = excluded.last_sync_error;`,
          [
            rowId,
            tenantId,
            normalizeText(row.project_id),
            normalizeText(row.title),
            normalizeText(row.date) ?? toLocalDateYYYYMMDD(new Date()),
            normalizeWorkReportStatus(row.status),
            payloadJson,
            createdAt,
            updatedAt,
            deletedAt,
            syncStatus,
            lastSyncError,
          ]
        );
        reportsImported += 1;
      }

      let outboxImported = 0;
      let outboxRescoped = 0;
      let outboxSkipped = 0;

      for (const row of params.outbox) {
        const rowId = normalizeText(row.id);
        const entity = normalizeText(row.entity);
        const entityId = normalizeText(row.entity_id);
        if (!rowId || !entity || !entityId) {
          outboxSkipped += 1;
          continue;
        }

        const parsedPayload = safeJsonParse(row.payload_json);
        const payloadRecord = isPlainObject(parsedPayload) ? parsedPayload : {};
        const payloadTenantId = normalizeText(payloadRecord.tenantId);
        const importable = payloadTenantId === tenantId || payloadTenantId === legacyUserScope;

        if (!importable) {
          outboxSkipped += 1;
          continue;
        }

        const requiresRescope = payloadTenantId !== tenantId;
        if (requiresRescope) outboxRescoped += 1;

        const payloadJson = JSON.stringify({
          ...payloadRecord,
          tenantId,
        });

        await tx.run(
          `INSERT INTO outbox (
            id, entity, entity_id, op, payload_json, created_at, attempts, last_error, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            entity = excluded.entity,
            entity_id = excluded.entity_id,
            op = excluded.op,
            payload_json = excluded.payload_json,
            created_at = excluded.created_at,
            attempts = excluded.attempts,
            last_error = excluded.last_error,
            status = excluded.status;`,
          [
            rowId,
            entity,
            entityId,
            normalizeOutboxOp(row.op),
            payloadJson,
            normalizeTimestamp(row.created_at),
            requiresRescope ? 0 : Math.max(0, Number(row.attempts) || 0),
            requiresRescope ? null : normalizeText(row.last_error),
            requiresRescope ? 'pending' : normalizeOutboxStatus(row.status),
          ]
        );
        outboxImported += 1;
      }

      return {
        reportsImported,
        reportsRescoped,
        reportsSkipped,
        outboxImported,
        outboxRescoped,
        outboxSkipped,
      };
    });
  },

  async migrateLegacyScopesToTenant(params: {
    tenantId: string;
    legacyUserScope?: string | null;
  }): Promise<{
    reportsUpdated: number;
    outboxUpdated: number;
  }> {
    const tenantId = params.tenantId.trim();
    const legacyUserScope = normalizeText(params.legacyUserScope);
    if (!tenantId) return { reportsUpdated: 0, outboxUpdated: 0 };

    const now = Date.now();

    return offlineDb.transaction(async (tx) => {
      const filters = ['tenant_id IS NULL', "TRIM(tenant_id) = ''"];
      const args: unknown[] = [];
      if (legacyUserScope) {
        filters.push('tenant_id = ?');
        args.push(legacyUserScope);
      }

      const countRows = await tx.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM work_reports WHERE ${filters.join(' OR ')};`,
        args
      );
      const reportsUpdated = Number(countRows?.[0]?.count ?? 0);

      if (reportsUpdated > 0) {
        await tx.run(
          `UPDATE work_reports
           SET tenant_id = ?,
               updated_at = ?,
               sync_status = 'pending',
               last_sync_error = NULL
           WHERE ${filters.join(' OR ')};`,
          [tenantId, now, ...args]
        );
      }

      const outboxRows = await tx.query<OutboxPayloadRow>('SELECT id, payload_json FROM outbox;');
      let outboxUpdated = 0;

      for (const row of outboxRows) {
        const payload = safeJsonParse(row.payload_json);
        const payloadRecord = isPlainObject(payload) ? payload : {};
        const payloadTenantId = normalizeText(payloadRecord.tenantId);
        const shouldRescope =
          payloadTenantId === null || (legacyUserScope ? payloadTenantId === legacyUserScope : false);
        if (!shouldRescope) continue;

        const nextPayload = {
          ...payloadRecord,
          tenantId,
        };

        await tx.run(
          `UPDATE outbox
           SET payload_json = ?,
               status = 'pending',
               attempts = 0,
               last_error = NULL
           WHERE id = ?;`,
          [JSON.stringify(nextPayload), row.id]
        );
        outboxUpdated += 1;
      }

      return { reportsUpdated, outboxUpdated };
    });
  },

  async validateTenantIntegrity(params: { tenantId: string }): Promise<{
    ok: boolean;
    totalReports: number;
    totalOutbox: number;
    invalidTenantRows: number;
  }> {
    const tenantId = params.tenantId.trim();
    if (!tenantId) {
      return { ok: false, totalReports: 0, totalOutbox: 0, invalidTenantRows: 0 };
    }

    const totals = await offlineDb.query<{ total_reports: number; total_outbox: number }>(
      `SELECT
         (SELECT COUNT(*) FROM work_reports WHERE tenant_id = ?) as total_reports,
         (SELECT COUNT(*) FROM outbox) as total_outbox;`,
      [tenantId]
    );
    const invalidRows = await offlineDb.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM work_reports WHERE tenant_id IS NULL OR TRIM(tenant_id) = '';"
    );

    const totalReports = Number(totals?.[0]?.total_reports ?? 0);
    const totalOutbox = Number(totals?.[0]?.total_outbox ?? 0);
    const invalidTenantRows = Number(invalidRows?.[0]?.count ?? 0);

    return {
      ok: invalidTenantRows === 0,
      totalReports,
      totalOutbox,
      invalidTenantRows,
    };
  },
};
