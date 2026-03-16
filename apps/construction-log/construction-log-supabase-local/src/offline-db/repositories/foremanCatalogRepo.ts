import { offlineDb, type OfflineDbTx } from '@/offline-db/db';

type ForemanCatalogEntryDraft = {
  name: string;
  normalizedName: string;
  role: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

function normalizeRole(value: unknown): string | null {
  const role = toText(value);
  return role ? role : null;
}

export function extractForemanCatalogEntriesFromPayload(payload: unknown): ForemanCatalogEntryDraft[] {
  if (!isRecord(payload)) return [];

  const collected = new Map<string, ForemanCatalogEntryDraft>();

  const addEntry = (rawName: unknown, rawRole?: unknown) => {
    const name = toText(rawName);
    if (!name) return;
    const normalizedName = normalizeName(name);
    if (!normalizedName) return;
    const role = normalizeRole(rawRole);
    const existing = collected.get(normalizedName);
    if (existing) {
      if (!existing.role && role) {
        collected.set(normalizedName, { ...existing, role });
      }
      return;
    }
    collected.set(normalizedName, { name, normalizedName, role });
  };

  addEntry(payload.mainForeman, 'encargado');
  addEntry(payload.foreman, 'encargado');

  if (Array.isArray(payload.foremanResources)) {
    payload.foremanResources.forEach((resource) => {
      if (!isRecord(resource)) return;
      addEntry(resource.name, resource.role);
    });
  }

  if (Array.isArray(payload.foremanEntries)) {
    payload.foremanEntries.forEach((entry) => {
      if (!isRecord(entry)) return;
      addEntry(entry.name, entry.role);
    });
  }

  return Array.from(collected.values());
}

export async function upsertForemanCatalogEntriesTx(
  tx: OfflineDbTx,
  tenantId: string,
  payload: unknown,
  usedAt: number = Date.now(),
): Promise<void> {
  const entries = extractForemanCatalogEntriesFromPayload(payload);
  if (entries.length === 0) return;

  for (const entry of entries) {
    await tx.run(
      `INSERT INTO foreman_catalog (
        id, tenant_id, name, normalized_name, role, last_used_at, usage_count
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(tenant_id, normalized_name) DO UPDATE SET
        name = excluded.name,
        role = COALESCE(excluded.role, foreman_catalog.role),
        last_used_at = CASE
          WHEN excluded.last_used_at > foreman_catalog.last_used_at THEN excluded.last_used_at
          ELSE foreman_catalog.last_used_at
        END,
        usage_count = foreman_catalog.usage_count + 1;`,
      [
        crypto.randomUUID(),
        tenantId,
        entry.name,
        entry.normalizedName,
        entry.role,
        usedAt,
      ],
    );
  }
}

export const foremanCatalogRepo = {
  async listForemanNames(limit = 300): Promise<string[]> {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const rows = await offlineDb.query<{ name: string }>(
      `SELECT name
       FROM foreman_catalog
       ORDER BY usage_count DESC, last_used_at DESC, name ASC
       LIMIT ?;`,
      [safeLimit],
    );

    return rows
      .map((row) => toText(row.name))
      .filter(Boolean);
  },
};
