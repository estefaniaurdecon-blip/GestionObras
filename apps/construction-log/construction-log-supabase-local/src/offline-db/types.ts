export type WorkReportStatus = 'draft' | 'pending' | 'approved' | 'completed' | 'missing_data' | 'missing_delivery_notes';

export type SyncStatus = 'pending' | 'synced' | 'error';

export type OutboxOp = 'create' | 'update' | 'delete';
export type OutboxStatus = 'pending' | 'synced' | 'error';

export interface WorkReportRow {
  id: string;
  tenant_id: string;
  project_id: string | null;
  title: string | null;
  date: string; // YYYY-MM-DD
  status: WorkReportStatus;
  payload_json: string;
  created_at: number; // epoch ms
  updated_at: number; // epoch ms
  deleted_at: number | null; // epoch ms
  sync_status: SyncStatus;
  last_sync_error: string | null;
}

export interface WorkReport {
  id: string;
  tenantId: string;
  projectId: string | null;
  title: string | null;
  date: string; // YYYY-MM-DD
  status: WorkReportStatus;
  payload: unknown;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  syncStatus: SyncStatus;
  lastSyncError: string | null;
}

export interface OutboxRow {
  id: string;
  entity: string;
  entity_id: string;
  op: OutboxOp;
  payload_json: string;
  created_at: number;
  attempts: number;
  last_error: string | null;
  status: OutboxStatus;
}

