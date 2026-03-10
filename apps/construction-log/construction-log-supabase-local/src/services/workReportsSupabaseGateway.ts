/**
 * workReportsSupabaseGateway.ts
 *
 * Adapter layer between the legacy flat-row format
 * and the backend API (which stores reports with a JSONB payload field).
 *
 * All Supabase references have been removed. Realtime is stubbed (returns no-op)
 * pending a polling-based replacement.
 */
import {
  createErpWorkReport,
  createNotification,
  deleteErpWorkReport,
  getCurrentUser,
  listErpWorkReports,
  listManagedUserAssignments,
  listManagedUsers,
  listManagedUsersByRole,
  listProjects,
  updateErpWorkReport,
  uploadGenericImage,
} from '@/integrations/api/client';
import {
  buildCreateErpWorkReportPayloadFromLegacyRow,
  buildUpdateErpWorkReportPayloadFromLegacyRow,
  extractWorkReportDetail,
  mapApiWorkReportToLegacyRow,
} from '@/services/workReportContract';

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

async function resolveServerId(reportId: string | number): Promise<number | null> {
  if (typeof reportId === 'number') return reportId;
  if (/^\d+$/.test(String(reportId))) return parseInt(String(reportId), 10);
  const results = await listErpWorkReports({ externalId: String(reportId), limit: 1 });
  return results[0]?.id ?? null;
}

const dataURLtoBlob = (dataUrl: string): Blob => {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
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

export const getOrganizationIdByUser = async (_userId: string | number): Promise<string | null> => {
  try {
    const user = await getCurrentUser();
    return user.tenant_id != null ? String(user.tenant_id) : null;
  } catch {
    return null;
  }
};

export const subscribeWorkReportsRealtime = (
  _organizationId: string,
  _onPayload: (payload: WorkReportsRealtimePayload) => void,
  _onStatus?: (status: string) => void,
): (() => void) => {
  console.warn(
    '[workReportsGateway] subscribeWorkReportsRealtime: realtime not available, polling deferred.',
  );
  return () => {};
};

export const upsertWorkReportRow = async (reportData: Record<string, unknown>): Promise<void> => {
  await createErpWorkReport(buildCreateErpWorkReportPayloadFromLegacyRow(reportData));
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

  await updateErpWorkReport(serverId, buildUpdateErpWorkReportPayloadFromLegacyRow(reportData));
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
  if (Number.isNaN(projectId)) return null;

  const results = await listErpWorkReports({
    projectId,
    dateFrom: date,
    dateTo: date,
    limit: 50,
  });

  const match = results.find((report) => extractWorkReportDetail(report).workNumber === String(workNumber));
  return match ? { id: String(match.id) } : null;
};

export const listWorkReportRows = async (limit = 200): Promise<Record<string, unknown>[]> => {
  const results = await listErpWorkReports({ limit });
  return results.map(mapApiWorkReportToLegacyRow);
};

export const listSiteManagerUserIds = async (_organizationId: string): Promise<string[]> => {
  const users = await listManagedUsersByRole('site_manager');
  return users.map((user) => String(user.id));
};

export const listAssignedWorkUserIds = async (
  workId: string,
  candidateUserIds: string[],
): Promise<string[]> => {
  if (candidateUserIds.length === 0) return [];
  const workIdNum = parseInt(workId, 10);
  if (Number.isNaN(workIdNum)) return [];

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
    .filter((project) => workIdSet.has(project.id))
    .map((project) => ({
      id: String(project.id),
      number: String(project.code ?? project.id),
      name: project.name,
    }));
};

export const listProfileNamesByIds = async (
  userIds: string[],
): Promise<Array<{ id: string; full_name: string | null }>> => {
  if (userIds.length === 0) return [];
  const allUsers = await listManagedUsers();
  const idSet = new Set(userIds.map(String));
  return allUsers
    .filter((user) => idSet.has(String(user.id)))
    .map((user) => ({ id: String(user.id), full_name: user.full_name ?? null }));
};

export const listWorkReportDownloads = async (
  _reportId: string | number,
  _excludeUserId: string | number,
): Promise<Array<{ user_id: string | number; downloaded_at: string }>> => {
  return [];
};

export const getUserProfileFullName = async (userId: string | number): Promise<string | null> => {
  try {
    const me = await getCurrentUser();
    if (String(me.id) === String(userId)) return me.full_name ?? null;
    const allUsers = await listManagedUsers();
    const found = allUsers.find((user) => String(user.id) === String(userId));
    return found?.full_name ?? null;
  } catch {
    return null;
  }
};

export const insertNotificationsRows = async (
  notifications: Array<Record<string, unknown>>,
): Promise<void> => {
  if (notifications.length === 0) return;

  await Promise.all(
    notifications.map((notification) =>
      createNotification({
        user_id: parseInt(String(notification.user_id), 10),
        type: 'generic',
        title: String(notification.title || notification.message || 'Notificacion'),
        body:
          notification.message != null
            ? String(notification.message)
            : notification.body != null
              ? String(notification.body)
              : undefined,
        reference:
          notification.related_id != null ? String(notification.related_id) : undefined,
      }).catch((error) => {
        console.warn(
          '[workReportsGateway] insertNotificationsRows error for user',
          notification.user_id,
          error,
        );
      }),
    ),
  );
};
