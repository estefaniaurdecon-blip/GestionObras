/**
 * workReportsSupabaseGateway.ts
 *
 * Adapter layer between the legacy flat-row format (expected by useWorkReports.ts)
 * and the backend API (which stores reports with a JSONB payload field).
 *
 * All Supabase references have been removed. Realtime is stubbed (returns no-op)
 * pending a polling-based replacement.
 */
import {
  createErpWorkReport,
  createNotification,
  getCurrentUser,
  deleteErpWorkReport,
  listErpWorkReports,
  listManagedUsers,
  listManagedUserAssignments,
  listManagedUsersByRole,
  listProjects,
  updateErpWorkReport,
  uploadGenericImage,
} from '@/integrations/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkReportsRealtimePayload = {
  eventType: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

export type AssignedWorkRow = {
  id: string;
  number: string;
  name: string;
};

// ---------------------------------------------------------------------------
// Helpers: data format conversion
// ---------------------------------------------------------------------------

/**
 * Fields that live at the top level of the API WorkReport record.
 * Everything else goes into / comes from `payload`.
 */
const TOP_LEVEL_FIELDS = new Set(['id', 'work_id', 'date', 'status', 'organization_id']);

/** Convert flat Supabase-style reportData → WorkReportCreate payload */
function toApiCreate(reportData: Record<string, unknown>) {
  const { id, work_id, date, status, organization_id: _org, ...rest } = reportData;
  return {
    project_id: parseInt(String(work_id || '0'), 10),
    date: String(date || ''),
    status: (status as string) || 'missing_data',
    is_closed: status === 'closed',
    external_id: String(id || ''),
    payload: rest,
  };
}

/** Convert WorkReportRead (API) → flat row (legacy format for useWorkReports) */
function toFlatRow(report: {
  id: number;
  tenant_id: number;
  project_id: number;
  external_id?: string | null;
  date: string;
  status: string;
  is_closed: boolean;
  payload: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    // Use external_id as the canonical local ID for backward-compat.
    // Fall back to server integer id as string if external_id is absent.
    id: report.external_id || String(report.id),
    _server_id: report.id,
    work_id: String(report.project_id),
    date: report.date,
    status: report.status,
    organization_id: String(report.tenant_id),
    ...report.payload,
  };
}

/**
 * Resolve server integer ID from a reportId that may be:
 * - a server integer (from findWorkReportByUniqueFields result)
 * - a local UUID string (from WorkReport.id in the local store)
 */
async function resolveServerId(reportId: string | number): Promise<number | null> {
  if (typeof reportId === 'number') return reportId;
  if (/^\d+$/.test(String(reportId))) return parseInt(String(reportId), 10);
  // UUID string → look up by external_id
  const results = await listErpWorkReports({ externalId: String(reportId), limit: 1 });
  return results[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Image upload
// ---------------------------------------------------------------------------

const dataURLtoBlob = (dataUrl: string): Blob => {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

export const uploadWorkReportImageAndGetPublicUrl = async (
  base64DataUrl: string,
  _userId: string | number,
  reportId: string,
  section: string,
  index: number,
): Promise<string> => {
  let blob: Blob;
  try {
    blob = await (await fetch(base64DataUrl)).blob();
  } catch {
    blob = dataURLtoBlob(base64DataUrl);
  }

  const ext = (blob.type?.split('/')?.[1] || 'jpeg').toLowerCase();
  const filename = `${section}_${index}_${Date.now()}.${ext}`;

  const result = await uploadGenericImage({
    category: 'work-report',
    entity_id: reportId,
    image_type: section,
    file: blob,
    filename,
  });

  return result.url;
};

// ---------------------------------------------------------------------------
// Organization / tenant lookup
// ---------------------------------------------------------------------------

export const getOrganizationIdByUser = async (_userId: string | number): Promise<string | null> => {
  try {
    const user = await getCurrentUser();
    return user.tenant_id != null ? String(user.tenant_id) : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Realtime (stubbed — polling migration deferred)
// ---------------------------------------------------------------------------

export const subscribeWorkReportsRealtime = (
  _organizationId: string,
  _onPayload: (payload: WorkReportsRealtimePayload) => void,
  _onStatus?: (status: string) => void,
): (() => void) => {
  console.warn('[workReportsGateway] subscribeWorkReportsRealtime: realtime not available, polling deferred.');
  return () => {};
};

// ---------------------------------------------------------------------------
// CRUD via API
// ---------------------------------------------------------------------------

export const upsertWorkReportRow = async (reportData: Record<string, unknown>): Promise<void> => {
  await createErpWorkReport(toApiCreate(reportData));
};

export const updateWorkReportRow = async (
  reportId: string | number,
  reportData: Record<string, unknown>,
): Promise<void> => {
  const serverId = await resolveServerId(reportId);
  if (serverId == null) {
    console.warn('[workReportsGateway] updateWorkReportRow: no server record found for', reportId);
    return;
  }
  const { id: _id, work_id, date, status, organization_id: _org, ...rest } = reportData;
  await updateErpWorkReport(serverId, {
    ...(work_id != null ? { project_id: parseInt(String(work_id), 10) } : {}),
    ...(date != null ? { date: String(date) } : {}),
    ...(status != null ? { status: String(status), is_closed: status === 'closed' } : {}),
    payload: rest,
  });
};

export const deleteWorkReportRow = async (reportId: string): Promise<void> => {
  const serverId = await resolveServerId(reportId);
  if (serverId == null) {
    console.warn('[workReportsGateway] deleteWorkReportRow: no server record found for', reportId);
    return;
  }
  await deleteErpWorkReport(serverId);
};

export const findWorkReportByUniqueFields = async (
  workId: string | undefined,
  date: string,
  workNumber: string,
): Promise<{ id: string } | null> => {
  if (!workId) return null;
  const projectId = parseInt(workId, 10);
  if (isNaN(projectId)) return null;

  const results = await listErpWorkReports({
    projectId,
    dateFrom: date,
    dateTo: date,
    limit: 50,
  });

  const match = results.find(
    (r) => String(r.payload?.work_number ?? '') === String(workNumber),
  );
  // Return server integer ID as string so callers can use it as a reportId
  return match ? { id: String(match.id) } : null;
};

export const listWorkReportRows = async (limit = 200): Promise<Record<string, unknown>[]> => {
  const results = await listErpWorkReports({ limit });
  return results.map(toFlatRow);
};

// ---------------------------------------------------------------------------
// User / role lookups
// ---------------------------------------------------------------------------

export const listSiteManagerUserIds = async (_organizationId: string): Promise<string[]> => {
  const users = await listManagedUsersByRole('site_manager');
  return users.map((u) => String(u.id));
};

export const listAssignedWorkUserIds = async (
  workId: string,
  candidateUserIds: string[],
): Promise<string[]> => {
  if (candidateUserIds.length === 0) return [];
  const workIdNum = parseInt(workId, 10);
  if (isNaN(workIdNum)) return [];

  const results = await Promise.all(
    candidateUserIds.map(async (userId) => {
      try {
        const workIds = await listManagedUserAssignments(parseInt(userId, 10));
        return workIds.includes(workIdNum) ? userId : null;
      } catch {
        return null;
      }
    }),
  );

  return results.filter((id): id is string => id !== null);
};

export const listAssignedWorksByUser = async (
  userId: string | number,
): Promise<AssignedWorkRow[]> => {
  const [workIds, allProjects] = await Promise.all([
    listManagedUserAssignments(Number(userId)),
    listProjects(),
  ]);
  if (workIds.length === 0) return [];

  const workIdSet = new Set(workIds);
  return allProjects
    .filter((p) => workIdSet.has(p.id))
    .map((p) => ({
      id: String(p.id),
      number: String(p.code ?? p.id),
      name: p.name,
    }));
};

export const listProfileNamesByIds = async (
  userIds: string[],
): Promise<Array<{ id: string; full_name: string | null }>> => {
  if (userIds.length === 0) return [];
  const allUsers = await listManagedUsers();
  const idSet = new Set(userIds.map(String));
  return allUsers
    .filter((u) => idSet.has(String(u.id)))
    .map((u) => ({ id: String(u.id), full_name: u.full_name ?? null }));
};

// ---------------------------------------------------------------------------
// Work report downloads (stubbed — table not migrated)
// ---------------------------------------------------------------------------

export const listWorkReportDownloads = async (
  _reportId: string | number,
  _excludeUserId: string | number,
): Promise<Array<{ user_id: string | number; downloaded_at: string }>> => {
  // work_report_downloads table not yet migrated to API — returning empty.
  return [];
};

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

export const getUserProfileFullName = async (userId: string | number): Promise<string | null> => {
  try {
    const me = await getCurrentUser();
    if (String(me.id) === String(userId)) return me.full_name ?? null;
    // For other users, fetch from managed users list
    const allUsers = await listManagedUsers();
    const found = allUsers.find((u) => String(u.id) === String(userId));
    return found?.full_name ?? null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const insertNotificationsRows = async (
  notifications: Array<Record<string, unknown>>,
): Promise<void> => {
  if (notifications.length === 0) return;
  await Promise.all(
    notifications.map((n) =>
      createNotification({
        user_id: parseInt(String(n.user_id), 10),
        type: 'generic',
        title: String(n.title || n.message || 'Notificación'),
        body: n.message != null ? String(n.message) : n.body != null ? String(n.body) : undefined,
        reference: n.related_id != null ? String(n.related_id) : undefined,
      }).catch((err) => {
        console.warn('[workReportsGateway] insertNotificationsRows error for user', n.user_id, err);
      }),
    ),
  );
};
