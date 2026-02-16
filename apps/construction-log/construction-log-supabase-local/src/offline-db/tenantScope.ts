import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

import { getApiBaseUrl, type ApiUser } from '@/integrations/api/client';
import {
  LEGACY_OFFLINE_DB_STORAGE_KEY,
  getOfflineDbScopedStorageKey,
  setOfflineDbTenantScope,
} from '@/offline-db/db';
import {
  workReportsRepo,
  type LegacyOutboxImportRow,
  type LegacyWorkReportImportRow,
} from '@/offline-db/repositories/workReportsRepo';
import { storage } from '@/utils/storage';

export const TENANT_REQUIRED_MESSAGE = 'No se pudo resolver tenant. Reintenta o vuelve a iniciar sesión.';

const MIGRATION_FLAG_PREFIX = 'offline_migrated_v2::';
const ACTIVE_TENANT_KEY_PREFIX = 'activeTenant::';

type ActiveTenantSource = 'session' | 'persisted' | 'configured' | 'dev_override' | 'none';

type ActiveTenantResolution = {
  tenantId: string | null;
  source: ActiveTenantSource;
  canPickTenant: boolean;
};

type LegacySnapshot = {
  workReports: LegacyWorkReportImportRow[];
  outbox: LegacyOutboxImportRow[];
};

export class TenantResolutionError extends Error {
  code = 'TENANT_NOT_RESOLVED';

  constructor(message = TENANT_REQUIRED_MESSAGE) {
    super(message);
    this.name = 'TenantResolutionError';
  }
}

const migrationByTenant = new Map<string, Promise<void>>();
let hasLoggedDevTenantOverride = false;

function normalizeTenantId(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return String(value);
  }

  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized;
}

function normalizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((role) => String(role).trim().toLowerCase()).filter(Boolean);
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBase64Bytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function rowsFromExec(result?: { columns: string[]; values: unknown[][] }): Record<string, unknown>[] {
  if (!result) return [];
  return result.values.map((values) => {
    const row: Record<string, unknown> = {};
    result.columns.forEach((column, index) => {
      row[column] = values[index];
    });
    return row;
  });
}

function queryRows(db: Database, sql: string): Record<string, unknown>[] {
  try {
    const result = db.exec(sql);
    return rowsFromExec(result[0]);
  } catch {
    return [];
  }
}

async function getSqlJs(): Promise<SqlJsStatic> {
  const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default;
  return initSqlJs({
    locateFile: () => wasmUrl,
  });
}

function mapLegacyWorkReports(rows: Record<string, unknown>[]): LegacyWorkReportImportRow[] {
  return rows
    .map((row) => {
      const id = normalizeText(row.id);
      if (!id) return null;

      return {
        id,
        tenant_id: normalizeTenantId(row.tenant_id),
        project_id: normalizeText(row.project_id),
        title: normalizeText(row.title),
        date: normalizeText(row.date) ?? '',
        status: normalizeText(row.status) ?? 'draft',
        payload_json: normalizeText(row.payload_json) ?? '{}',
        created_at: normalizeNumber(row.created_at),
        updated_at: normalizeNumber(row.updated_at),
        deleted_at:
          row.deleted_at === null || row.deleted_at === undefined ? null : normalizeNumber(row.deleted_at),
        sync_status: normalizeText(row.sync_status) ?? 'pending',
        last_sync_error: normalizeText(row.last_sync_error),
      };
    })
    .filter((row): row is LegacyWorkReportImportRow => Boolean(row));
}

function mapLegacyOutbox(rows: Record<string, unknown>[]): LegacyOutboxImportRow[] {
  return rows
    .map((row) => {
      const id = normalizeText(row.id);
      if (!id) return null;

      const entity = normalizeText(row.entity);
      const entityId = normalizeText(row.entity_id);
      if (!entity || !entityId) return null;

      return {
        id,
        entity,
        entity_id: entityId,
        op: (normalizeText(row.op) ?? 'update') as LegacyOutboxImportRow['op'],
        payload_json: normalizeText(row.payload_json) ?? '{}',
        created_at: normalizeNumber(row.created_at),
        attempts: Math.max(0, Math.trunc(normalizeNumber(row.attempts))),
        last_error: normalizeText(row.last_error),
        status: (normalizeText(row.status) ?? 'pending') as LegacyOutboxImportRow['status'],
      };
    })
    .filter((row): row is LegacyOutboxImportRow => Boolean(row));
}

async function readLegacySnapshotFromStorageKey(storageKey: string): Promise<LegacySnapshot | null> {
  const encoded = await storage.getItem(storageKey);
  if (!encoded) return null;

  const sql = await getSqlJs();
  const db = new sql.Database(toBase64Bytes(encoded));

  try {
    const workReports = mapLegacyWorkReports(
      queryRows(
        db,
        `SELECT
          id,
          tenant_id,
          project_id,
          title,
          date,
          status,
          payload_json,
          created_at,
          updated_at,
          deleted_at,
          sync_status,
          last_sync_error
         FROM work_reports;`
      )
    );

    const outbox = mapLegacyOutbox(
      queryRows(
        db,
        `SELECT
          id,
          entity,
          entity_id,
          op,
          payload_json,
          created_at,
          attempts,
          last_error,
          status
         FROM outbox;`
      )
    );

    return { workReports, outbox };
  } finally {
    db.close();
  }
}

function isSuperAdminOrMultiTenant(user: ApiUser | null | undefined): boolean {
  if (!user) return false;
  if (Boolean(user.is_super_admin)) return true;
  const roles = normalizeRoles(user.roles);
  return roles.some((role) =>
    ['super_admin', 'superadmin', 'master', 'platform_admin', 'multi_tenant', 'multi-tenant'].includes(role)
  );
}

function getActiveTenantStorageKey(user: ApiUser): string {
  const normalizedUserId = String(user.id).trim();
  const normalizedApiBase = getApiBaseUrl().trim();
  return `${ACTIVE_TENANT_KEY_PREFIX}${normalizedUserId}::${normalizedApiBase}`;
}

function getDevTenantOverride(): string | null {
  if (!import.meta.env.DEV) return null;
  const override = normalizeTenantId(import.meta.env.VITE_DEV_TENANT_ID);
  if (!override) return null;
  if (!hasLoggedDevTenantOverride) {
    console.info(`[tenant] Using VITE_DEV_TENANT_ID override: ${override}`);
    hasLoggedDevTenantOverride = true;
  }
  return override;
}

function getConfiguredTenantId(): string | null {
  return normalizeTenantId(import.meta.env.VITE_TENANT_ID);
}

async function resolveActiveTenant(user: ApiUser | null | undefined): Promise<ActiveTenantResolution> {
  const sessionTenantId = normalizeTenantId(user?.tenant_id);
  if (sessionTenantId) {
    return {
      tenantId: sessionTenantId,
      source: 'session',
      canPickTenant: false,
    };
  }

  if (user) {
    const storageKey = getActiveTenantStorageKey(user);
    const persistedTenantId = normalizeTenantId(await storage.getItem(storageKey));
    if (persistedTenantId) {
      return {
        tenantId: persistedTenantId,
        source: 'persisted',
        canPickTenant: false,
      };
    }
  }

  const configuredTenantId = getConfiguredTenantId();
  if (configuredTenantId) {
    return {
      tenantId: configuredTenantId,
      source: 'configured',
      canPickTenant: false,
    };
  }

  const devOverride = getDevTenantOverride();
  if (devOverride) {
    return {
      tenantId: devOverride,
      source: 'dev_override',
      canPickTenant: false,
    };
  }

  return {
    tenantId: null,
    source: 'none',
    canPickTenant: isSuperAdminOrMultiTenant(user),
  };
}

function getMigrationFlagKey(tenantId: string): string {
  return `${MIGRATION_FLAG_PREFIX}${tenantId}`;
}

function getLegacyUserScope(user: ApiUser | null | undefined): string | null {
  if (!user) return null;
  const userId = normalizeTenantId(user.id);
  if (!userId) return null;
  return `user-${userId}`;
}

async function runLegacyMigrationForTenant(tenantId: string, user: ApiUser | null | undefined): Promise<void> {
  const migrationFlagKey = getMigrationFlagKey(tenantId);
  const alreadyMigrated = (await storage.getItem(migrationFlagKey)) === '1';
  if (alreadyMigrated) return;

  const legacyUserScope = getLegacyUserScope(user);
  const candidateKeys = [LEGACY_OFFLINE_DB_STORAGE_KEY];
  if (legacyUserScope) {
    candidateKeys.push(getOfflineDbScopedStorageKey(legacyUserScope));
  }

  const snapshotKeysImported: string[] = [];
  let totalReportsImported = 0;
  let totalReportsRescoped = 0;
  let totalOutboxImported = 0;
  let totalOutboxRescoped = 0;
  let totalReportsSkipped = 0;
  let totalOutboxSkipped = 0;

  for (const key of candidateKeys) {
    const snapshot = await readLegacySnapshotFromStorageKey(key);
    if (!snapshot) continue;

    snapshotKeysImported.push(key);
    const importResult = await workReportsRepo.importLegacySnapshot({
      tenantId,
      legacyUserScope,
      workReports: snapshot.workReports,
      outbox: snapshot.outbox,
    });

    totalReportsImported += importResult.reportsImported;
    totalReportsRescoped += importResult.reportsRescoped;
    totalOutboxImported += importResult.outboxImported;
    totalOutboxRescoped += importResult.outboxRescoped;
    totalReportsSkipped += importResult.reportsSkipped;
    totalOutboxSkipped += importResult.outboxSkipped;
  }

  const rescopeResult = await workReportsRepo.migrateLegacyScopesToTenant({
    tenantId,
    legacyUserScope,
  });

  const integrity = await workReportsRepo.validateTenantIntegrity({ tenantId });
  if (!integrity.ok) {
    throw new TenantResolutionError(
      `Migración offline inválida para tenant ${tenantId}. Filas sin tenant: ${integrity.invalidTenantRows}.`
    );
  }

  await storage.setItem(migrationFlagKey, '1');

  for (const storageKey of snapshotKeysImported) {
    await storage.removeItem(storageKey);
  }

  console.info('[offline-db] Legacy migration completed', {
    tenantId,
    snapshotKeysImported,
    reportsImported: totalReportsImported,
    reportsRescoped: totalReportsRescoped + rescopeResult.reportsUpdated,
    reportsSkipped: totalReportsSkipped,
    outboxImported: totalOutboxImported,
    outboxRescoped: totalOutboxRescoped + rescopeResult.outboxUpdated,
    outboxSkipped: totalOutboxSkipped,
    totalReports: integrity.totalReports,
    totalOutbox: integrity.totalOutbox,
  });
}

async function ensureTenantMigration(tenantId: string, user: ApiUser | null | undefined): Promise<void> {
  const normalizedTenantId = tenantId.trim();
  const runningMigration = migrationByTenant.get(normalizedTenantId);
  if (runningMigration) {
    await runningMigration;
    return;
  }

  const migrationPromise = (async () => {
    await runLegacyMigrationForTenant(normalizedTenantId, user);
  })();

  migrationByTenant.set(normalizedTenantId, migrationPromise);
  try {
    await migrationPromise;
  } finally {
    migrationByTenant.delete(normalizedTenantId);
  }
}

export function isTenantResolutionError(error: unknown): error is TenantResolutionError {
  return error instanceof TenantResolutionError;
}

export function resolveOfflineTenantId(user: ApiUser | null | undefined): string | null {
  const sessionTenantId = normalizeTenantId(user?.tenant_id);
  if (sessionTenantId) return sessionTenantId;
  return getDevTenantOverride();
}

export async function getActiveTenantId(user: ApiUser | null | undefined): Promise<string | null> {
  const resolution = await resolveActiveTenant(user);
  return resolution.tenantId;
}

export async function setActiveTenantId(
  user: ApiUser | null | undefined,
  tenantId: string
): Promise<string> {
  const normalizedTenantId = normalizeTenantId(tenantId);
  if (!user || !normalizedTenantId) {
    throw new TenantResolutionError(TENANT_REQUIRED_MESSAGE);
  }

  await storage.setItem(getActiveTenantStorageKey(user), normalizedTenantId);
  return normalizedTenantId;
}

export async function clearActiveTenantId(user: ApiUser | null | undefined): Promise<void> {
  if (!user) return;
  await storage.removeItem(getActiveTenantStorageKey(user));
}

export async function requireTenantId(
  user: ApiUser | null | undefined,
  options: { tenantId?: string | null } = {}
): Promise<string> {
  const explicitTenantId = normalizeTenantId(options.tenantId);
  if (explicitTenantId) return explicitTenantId;

  const resolved = await resolveActiveTenant(user);
  if (resolved.tenantId) return resolved.tenantId;

  throw new TenantResolutionError(TENANT_REQUIRED_MESSAGE);
}

export async function prepareOfflineTenantScope(
  user: ApiUser | null | undefined,
  options: { tenantId?: string | null } = {}
): Promise<string> {
  const tenantId = await requireTenantId(user, options);
  setOfflineDbTenantScope(tenantId);
  await workReportsRepo.init();
  await ensureTenantMigration(tenantId, user);
  return tenantId;
}

export async function getTenantResolutionState(user: ApiUser | null | undefined): Promise<{
  tenantId: string | null;
  isResolved: boolean;
  requiresTenantPicker: boolean;
  errorMessage: string | null;
}> {
  const resolution = await resolveActiveTenant(user);
  return {
    tenantId: resolution.tenantId,
    isResolved: Boolean(resolution.tenantId),
    requiresTenantPicker: !resolution.tenantId && resolution.canPickTenant,
    errorMessage: resolution.tenantId ? null : TENANT_REQUIRED_MESSAGE,
  };
}
