-- Catalogo local de encargados/capataces para autocompletado por tenant.

CREATE TABLE IF NOT EXISTS foreman_catalog (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  role TEXT NULL,
  last_used_at INTEGER NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_foreman_catalog_tenant_name
  ON foreman_catalog(tenant_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_foreman_catalog_tenant_last_used
  ON foreman_catalog(tenant_id, last_used_at DESC);
