import { apiFetchJson } from '@/integrations/api/client';
import { offlineDb } from '@/offline-db/db';
import { upsertForemanCatalogEntriesTx } from '@/offline-db/repositories/foremanCatalogRepo';
import { type ApiErpWorkReport } from '@/services/workReportContract';

const LAST_SYNC_KEY_PREFIX = 'work_reports_last_sync::';

type WorkReportServerChange = ApiErpWorkReport;

export type SyncPullPhaseResult = {
  pulledCount: number;
  applied: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toEpochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function getLastSyncMetaKey(tenantId: string): string {
  return `${LAST_SYNC_KEY_PREFIX}${tenantId}`;
}

export async function getLastSyncSince(tenantId: string): Promise<string | undefined> {
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
      await upsertForemanCatalogEntriesTx(tx, tenantId, payload, updatedAt);
      applied += 1;
    }
  });

  return applied;
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

export async function runIncrementalPullSyncPhase(
  tenantId: string,
  since: string | null | undefined,
  limit: number = 200
): Promise<SyncPullPhaseResult> {
  const pulled = await pullServerReports(tenantId, since, limit);
  const applied = await applyServerChanges(pulled, tenantId);
  await setLastSyncSince(tenantId, new Date().toISOString());

  return {
    pulledCount: pulled.length,
    applied,
  };
}
