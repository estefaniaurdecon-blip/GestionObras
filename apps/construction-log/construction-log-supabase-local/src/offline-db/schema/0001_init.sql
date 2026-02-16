-- Offline-first local database (SQLite)
-- v1: work_reports + outbox + local_meta

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS local_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NULL,
  title TEXT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'draft',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_sync_error TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_reports_tenant_date
  ON work_reports(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_work_reports_project_date
  ON work_reports(project_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_work_reports_sync_status
  ON work_reports(sync_status);
CREATE INDEX IF NOT EXISTS idx_work_reports_deleted_at
  ON work_reports(deleted_at);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL, -- e.g. 'work_report'
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL, -- 'create'|'update'|'delete'
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' -- 'pending'|'synced'|'error'
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_created_at
  ON outbox(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_outbox_entity
  ON outbox(entity, entity_id);

