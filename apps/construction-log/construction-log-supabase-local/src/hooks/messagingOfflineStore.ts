import type { Message } from '@/types/notifications';
import { blobToBase64 } from '@/utils/nativeFile';
import { storage } from '@/utils/storage';

export type LocalSyncStatus = 'synced' | 'pending' | 'error';

export interface StoredMessageRecord extends Message {
  syncStatus?: LocalSyncStatus;
  lastSyncError?: string | null;
}

export interface StoredSharedFileRecord {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  from_user_id: string;
  to_user_id: string;
  work_report_id?: string;
  message?: string;
  downloaded: boolean;
  created_at: string;
  from_user?: {
    full_name: string;
  };
  to_user?: {
    full_name: string;
  };
  syncStatus?: LocalSyncStatus;
  lastSyncError?: string | null;
  localBlobBase64?: string | null;
  localContentType?: string | null;
}

const MESSAGE_STORAGE_KEY_PREFIX = 'messaging_messages_local::v1::';
const SHARED_FILES_STORAGE_KEY_PREFIX = 'messaging_shared_files_local::v1::';

function toMessageStorageKey(scopeId: string): string {
  return `${MESSAGE_STORAGE_KEY_PREFIX}${scopeId}`;
}

function toSharedFilesStorageKey(scopeId: string): string {
  return `${SHARED_FILES_STORAGE_KEY_PREFIX}${scopeId}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toOptionalText(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : undefined;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSyncStatus(value: unknown): LocalSyncStatus {
  return value === 'pending' || value === 'error' ? value : 'synced';
}

function sortMessages(items: StoredMessageRecord[]): StoredMessageRecord[] {
  return [...items].sort((a, b) => {
    const aTs = new Date(a.created_at).getTime();
    const bTs = new Date(b.created_at).getTime();
    return aTs - bTs;
  });
}

function sortSharedFiles(items: StoredSharedFileRecord[]): StoredSharedFileRecord[] {
  return [...items].sort((a, b) => {
    const aTs = new Date(a.created_at).getTime();
    const bTs = new Date(b.created_at).getTime();
    return bTs - aTs;
  });
}

function normalizeStoredMessage(value: unknown): StoredMessageRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = toText(record.id);
  const fromUserId = toText(record.from_user_id);
  const toUserId = toText(record.to_user_id);
  const createdAt = toText(record.created_at);
  const message = toText(record.message);

  if (!id || !fromUserId || !toUserId || !createdAt || !message) {
    return null;
  }

  return {
    id,
    from_user_id: fromUserId,
    to_user_id: toUserId,
    work_report_id: toOptionalText(record.work_report_id),
    message,
    read: toBoolean(record.read),
    created_at: createdAt,
    from_user:
      asRecord(record.from_user) && toText(asRecord(record.from_user)?.full_name)
        ? { full_name: toText(asRecord(record.from_user)?.full_name) }
        : undefined,
    to_user:
      asRecord(record.to_user) && toText(asRecord(record.to_user)?.full_name)
        ? { full_name: toText(asRecord(record.to_user)?.full_name) }
        : undefined,
    syncStatus: normalizeSyncStatus(record.syncStatus),
    lastSyncError: toOptionalText(record.lastSyncError) ?? null,
  };
}

function normalizeStoredSharedFile(value: unknown): StoredSharedFileRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = toText(record.id);
  const fileName = toText(record.file_name);
  const fromUserId = toText(record.from_user_id);
  const toUserId = toText(record.to_user_id);
  const createdAt = toText(record.created_at);

  if (!id || !fileName || !fromUserId || !toUserId || !createdAt) {
    return null;
  }

  return {
    id,
    file_name: fileName,
    file_path: toText(record.file_path),
    file_size: toNumber(record.file_size),
    file_type: toText(record.file_type),
    from_user_id: fromUserId,
    to_user_id: toUserId,
    work_report_id: toOptionalText(record.work_report_id),
    message: toOptionalText(record.message),
    downloaded: toBoolean(record.downloaded),
    created_at: createdAt,
    from_user:
      asRecord(record.from_user) && toText(asRecord(record.from_user)?.full_name)
        ? { full_name: toText(asRecord(record.from_user)?.full_name) }
        : undefined,
    to_user:
      asRecord(record.to_user) && toText(asRecord(record.to_user)?.full_name)
        ? { full_name: toText(asRecord(record.to_user)?.full_name) }
        : undefined,
    syncStatus: normalizeSyncStatus(record.syncStatus),
    lastSyncError: toOptionalText(record.lastSyncError) ?? null,
    localBlobBase64: toOptionalText(record.localBlobBase64) ?? null,
    localContentType: toOptionalText(record.localContentType) ?? null,
  };
}

export async function readStoredMessages(scopeId: string): Promise<StoredMessageRecord[]> {
  try {
    const raw = await storage.getItem(toMessageStorageKey(scopeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortMessages(
      parsed
        .map(normalizeStoredMessage)
        .filter((item): item is StoredMessageRecord => Boolean(item))
    );
  } catch {
    return [];
  }
}

export async function writeStoredMessages(
  scopeId: string,
  items: StoredMessageRecord[]
): Promise<StoredMessageRecord[]> {
  const sorted = sortMessages(items);
  await storage.setItem(toMessageStorageKey(scopeId), JSON.stringify(sorted));
  return sorted;
}

export async function readStoredSharedFiles(scopeId: string): Promise<StoredSharedFileRecord[]> {
  try {
    const raw = await storage.getItem(toSharedFilesStorageKey(scopeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortSharedFiles(
      parsed
        .map(normalizeStoredSharedFile)
        .filter((item): item is StoredSharedFileRecord => Boolean(item))
    );
  } catch {
    return [];
  }
}

export async function writeStoredSharedFiles(
  scopeId: string,
  items: StoredSharedFileRecord[]
): Promise<StoredSharedFileRecord[]> {
  const sorted = sortSharedFiles(items);
  await storage.setItem(toSharedFilesStorageKey(scopeId), JSON.stringify(sorted));
  return sorted;
}

export function mergeMessageRecords(
  serverItems: StoredMessageRecord[],
  localItems: StoredMessageRecord[]
): StoredMessageRecord[] {
  const byId = new Map<string, StoredMessageRecord>();

  for (const item of localItems) {
    byId.set(item.id, item);
  }

  for (const item of serverItems) {
    byId.set(item.id, {
      ...item,
      syncStatus: 'synced',
      lastSyncError: null,
    });
  }

  return sortMessages([...byId.values()]);
}

export function mergeSharedFileRecords(
  serverItems: StoredSharedFileRecord[],
  localItems: StoredSharedFileRecord[]
): StoredSharedFileRecord[] {
  const byId = new Map<string, StoredSharedFileRecord>();

  for (const item of localItems) {
    byId.set(item.id, item);
  }

  for (const item of serverItems) {
    byId.set(item.id, {
      ...item,
      syncStatus: 'synced',
      lastSyncError: null,
      localBlobBase64: null,
      localContentType: null,
    });
  }

  return sortSharedFiles([...byId.values()]);
}

export function createPendingMessageRecord(params: {
  fromUserId: string;
  toUserId: string;
  message: string;
  workReportId?: string;
  fromUserName?: string;
  toUserName?: string;
}): StoredMessageRecord {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `local-message-${crypto.randomUUID()}`
      : `local-message-${Date.now()}`;

  return {
    id,
    from_user_id: params.fromUserId,
    to_user_id: params.toUserId,
    work_report_id: params.workReportId,
    message: params.message,
    read: false,
    created_at: new Date().toISOString(),
    from_user: params.fromUserName ? { full_name: params.fromUserName } : undefined,
    to_user: params.toUserName ? { full_name: params.toUserName } : undefined,
    syncStatus: 'pending',
    lastSyncError: null,
  };
}

export async function createPendingSharedFileRecord(params: {
  file: File;
  fromUserId: string;
  toUserId: string;
  message?: string;
  workReportId?: string;
  fromUserName?: string;
  toUserName?: string;
}): Promise<StoredSharedFileRecord> {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `local-file-${crypto.randomUUID()}`
      : `local-file-${Date.now()}`;

  const base64 = await blobToBase64(params.file);

  return {
    id,
    file_name: params.file.name || `file-${Date.now()}`,
    file_path: `local://shared-files/${id}`,
    file_size: params.file.size,
    file_type: params.file.type || 'application/octet-stream',
    from_user_id: params.fromUserId,
    to_user_id: params.toUserId,
    work_report_id: params.workReportId,
    message: params.message,
    downloaded: false,
    created_at: new Date().toISOString(),
    from_user: params.fromUserName ? { full_name: params.fromUserName } : undefined,
    to_user: params.toUserName ? { full_name: params.toUserName } : undefined,
    syncStatus: 'pending',
    lastSyncError: null,
    localBlobBase64: base64,
    localContentType: params.file.type || 'application/octet-stream',
  };
}

export function fileBase64ToBlob(
  base64: string,
  contentType = 'application/octet-stream'
): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: contentType });
}

