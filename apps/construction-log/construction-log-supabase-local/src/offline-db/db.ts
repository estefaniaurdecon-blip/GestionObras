import { Capacitor } from '@capacitor/core';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { storage } from '@/utils/storage';

import migration0001 from './schema/0001_init.sql?raw';
import migration0002 from './schema/0002_placeholder.sql?raw';

const LEGACY_DB_STORAGE_KEY = 'offline_db_sqlite_file_b64_v1';
const SCOPED_DB_STORAGE_KEY_PREFIX = 'offline_db_sqlite_file_b64_v2_scope_';
const META_SCHEMA_VERSION_KEY = 'schema_version';
export const LEGACY_OFFLINE_DB_STORAGE_KEY = LEGACY_DB_STORAGE_KEY;

type Migration = { version: number; name: string; sql: string };

export type OfflineDbTx = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<void>;
};

class AsyncMutex {
  private current: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const start = this.current;
    let release!: () => void;
    this.current = new Promise<void>((resolve) => {
      release = resolve;
    });
    await start;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

function stripSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function rowsFromExecResult<T = Record<string, unknown>>(
  result: { columns: string[]; values: unknown[][] } | undefined
): T[] {
  if (!result) return [];
  return result.values.map((row) => {
    const obj: Record<string, unknown> = {};
    result.columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as T;
  });
}

class OfflineDb {
  private sql: SqlJsStatic | null = null;
  private db: Database | null = null;
  private initPromise: Promise<void> | null = null;
  private mutex = new AsyncMutex();
  private storageScope: string | null = null;
  private storageKey: string | null = null;

  setStorageScope(scope: string): void {
    const nextScope = scope.trim();
    if (!nextScope) {
      throw new Error('offline-db tenant scope is required');
    }
    const nextKey = getScopedDbStorageKey(nextScope);
    if (nextKey === this.storageKey) return;

    this.storageScope = nextScope;
    this.storageKey = nextKey;

    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore close errors
      }
    }
    this.db = null;
    this.sql = null;
    this.initPromise = null;
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (!this.storageKey) {
      throw new Error('offline-db not scoped: call setOfflineDbTenantScope(tenantId) first');
    }

    this.initPromise = (async () => {
      const activeStorageKey = this.storageKey as string;
      this.sql = await this.loadSqlJs();

      const persisted = await storage.getItem(activeStorageKey);
      const bytes = persisted ? fromBase64(persisted) : undefined;

      this.db = bytes ? new this.sql.Database(bytes) : new this.sql.Database();

      this.db.exec('PRAGMA foreign_keys = ON;');

      await this.applyMigrations();
      await this.persist(activeStorageKey);

      console.log(
        `[offline-db] Ready | platform=${Capacitor.getPlatform()} | scope=${this.storageScope ?? 'legacy'} | bytes=${this.db.export().length}`
      );
    })();

    return this.initPromise;
  }

  private async loadSqlJs(): Promise<SqlJsStatic> {
    const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default;
    return initSqlJs({
      locateFile: () => wasmUrl,
    });
  }

  private getDbOrThrow(): Database {
    if (!this.db) throw new Error('offline-db not initialized');
    return this.db;
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.init();
    return this.mutex.runExclusive(async () => {
      const db = this.getDbOrThrow();
      const res = db.exec(sql, params);
      return rowsFromExecResult<T>(res[0]);
    });
  }

  async exec(sql: string, params: unknown[] = []): Promise<void> {
    await this.init();
    await this.mutex.runExclusive(async () => {
      const db = this.getDbOrThrow();
      db.run(sql, params);
      await this.persist();
    });
  }

  async transaction<T>(fn: (tx: OfflineDbTx) => Promise<T>): Promise<T> {
    await this.init();
    return this.mutex.runExclusive(async () => {
      const db = this.getDbOrThrow();
      db.exec('BEGIN;');

      const tx: OfflineDbTx = {
        query: async <TResult = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
          const res = db.exec(sql, params);
          return rowsFromExecResult<TResult>(res[0]);
        },
        run: async (sql: string, params: unknown[] = []) => {
          db.run(sql, params);
        },
      };

      try {
        const result = await fn(tx);
        db.exec('COMMIT;');
        await this.persist();
        return result;
      } catch (err) {
        try {
          db.exec('ROLLBACK;');
        } catch {
          // ignore rollback errors
        }
        throw err;
      }
    });
  }

  private async applyMigrations(): Promise<void> {
    const migrations: Migration[] = [
      { version: 1, name: '0001_init', sql: migration0001 },
      { version: 2, name: '0002_placeholder', sql: migration0002 },
    ];

    const db = this.getDbOrThrow();
    const current = this.getSchemaVersion(db);

    for (const migration of migrations) {
      if (migration.version <= current) continue;
      if (!stripSql(migration.sql)) continue;

      console.log(`[offline-db] Applying migration v${migration.version} (${migration.name})`);
      db.exec(migration.sql);
      this.setMeta(db, META_SCHEMA_VERSION_KEY, String(migration.version));
    }
  }

  private getSchemaVersion(db: Database): number {
    try {
      const res = db.exec(
        "SELECT value FROM local_meta WHERE key = ? LIMIT 1;",
        [META_SCHEMA_VERSION_KEY]
      );
      const value = res?.[0]?.values?.[0]?.[0];
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return 0;
      return parsed;
    } catch {
      return 0;
    }
  }

  private setMeta(db: Database, key: string, value: string) {
    try {
      db.run(
        'INSERT INTO local_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
        [key, value]
      );
    } catch (err) {
      console.warn('[offline-db] Failed to set meta', { key, err });
    }
  }

  private async persist(targetKey?: string): Promise<void> {
    const keyToUse = targetKey ?? this.storageKey;
    if (!keyToUse) {
      throw new Error('offline-db not scoped: cannot persist without tenant scope');
    }
    const db = this.getDbOrThrow();
    const bytes = db.export();
    const b64 = toBase64(bytes);
    await storage.setItem(keyToUse, b64);
  }
}

export const offlineDb = new OfflineDb();

function sanitizeScope(scope: string): string {
  return scope.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getScopedDbStorageKey(scope: string): string {
  return `${SCOPED_DB_STORAGE_KEY_PREFIX}${sanitizeScope(scope)}`;
}

export function getOfflineDbScopedStorageKey(scope: string): string {
  return getScopedDbStorageKey(scope);
}

export function setOfflineDbTenantScope(tenantId: string): void {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) {
    throw new Error('setOfflineDbTenantScope requires a valid tenantId');
  }
  const scope = `tenant-${normalizedTenantId}`;
  offlineDb.setStorageScope(scope);
}
