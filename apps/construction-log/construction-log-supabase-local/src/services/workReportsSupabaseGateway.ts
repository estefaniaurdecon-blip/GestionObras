import { supabase } from '@/integrations/api/legacySupabaseRemoved';

export type WorkReportsRealtimePayload = {
  eventType: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

const dataURLtoBlob = (dataUrl: string): Blob => {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(base64 || '');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

export const uploadWorkReportImageAndGetPublicUrl = async (
  base64DataUrl: string,
  userId: string | number,
  reportId: string,
  section: string,
  index: number,
) => {
  let blob: Blob;
  try {
    blob = await (await fetch(base64DataUrl)).blob();
  } catch {
    blob = dataURLtoBlob(base64DataUrl);
  }

  const ext = (blob.type?.split('/')?.[1] || 'jpeg').toLowerCase();
  const filePath = `${userId}/${reportId}/${section}_${index}_${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('work-report-images')
    .upload(filePath, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('work-report-images').getPublicUrl(filePath);
  return data.publicUrl;
};

export const getOrganizationIdByUser = async (userId: string | number) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.organization_id ?? null;
};

export const subscribeWorkReportsRealtime = (
  organizationId: string,
  onPayload: (payload: WorkReportsRealtimePayload) => void,
  onStatus?: (status: string) => void,
) => {
  const channel = supabase
    .channel('work_reports_realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'work_reports',
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => onPayload(payload as WorkReportsRealtimePayload),
    )
    .subscribe((status) => {
      onStatus?.(status);
    });

  return () => {
    supabase.removeChannel(channel);
  };
};

export const upsertWorkReportRow = async (reportData: Record<string, unknown>) => {
  const { error } = await supabase.from('work_reports').upsert([reportData], { onConflict: 'id' });
  if (error) throw error;
};

export const updateWorkReportRow = async (
  reportId: string,
  reportData: Record<string, unknown>,
) => {
  const { error } = await supabase.from('work_reports').update(reportData).eq('id', reportId);
  if (error) throw error;
};

export const deleteWorkReportRow = async (reportId: string) => {
  const { error } = await supabase.from('work_reports').delete().eq('id', reportId);
  if (error) throw error;
};

export const findWorkReportByUniqueFields = async (
  workId: string | undefined,
  date: string,
  workNumber: string,
) => {
  const { data, error } = await supabase
    .from('work_reports')
    .select('id')
    .eq('work_id', workId)
    .eq('date', date)
    .eq('work_number', workNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
};

export const listWorkReportRows = async (limit = 200) => {
  const { data, error } = await supabase
    .from('work_reports')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
};

export const listSiteManagerUserIds = async (organizationId: string) => {
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('role', 'site_manager');
  if (error) throw error;
  return (data || []).map((row) => String(row.user_id));
};

export const listAssignedWorkUserIds = async (workId: string, candidateUserIds: string[]) => {
  if (candidateUserIds.length === 0) return [];
  const { data, error } = await supabase
    .from('work_assignments')
    .select('user_id')
    .eq('work_id', workId)
    .in('user_id', candidateUserIds);
  if (error) throw error;
  return (data || []).map((row) => String(row.user_id));
};

export type AssignedWorkRow = {
  id: string;
  number: string;
  name: string;
};

export const listAssignedWorksByUser = async (
  userId: string | number,
): Promise<AssignedWorkRow[]> => {
  const { data: assignments, error: assignmentsError } = await supabase
    .from('work_assignments')
    .select('work_id')
    .eq('user_id', userId);

  if (assignmentsError) throw assignmentsError;
  if (!assignments || assignments.length === 0) return [];

  const workIds = assignments
    .map((assignment) => assignment.work_id)
    .filter((workId): workId is string => Boolean(workId));
  if (workIds.length === 0) return [];

  const { data: works, error: worksError } = await supabase
    .from('works')
    .select('id, number, name')
    .in('id', workIds);
  if (worksError) throw worksError;

  return (works || []).map((work) => ({
    id: String(work.id),
    number: String(work.number || ''),
    name: String(work.name || ''),
  }));
};

export const listProfileNamesByIds = async (
  userIds: string[],
): Promise<Array<{ id: string; full_name: string | null }>> => {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);
  if (error) throw error;

  return (data || []).map((profile) => ({
    id: String(profile.id),
    full_name: profile.full_name ?? null,
  }));
};

export const listWorkReportDownloads = async (reportId: string, excludeUserId: string | number) => {
  const legacyClient = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => {
          neq: (
            column: string,
            value: unknown,
          ) => Promise<{
            data: Array<{ user_id: string | number; downloaded_at: string }> | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const { data, error } = await legacyClient
    .from('work_report_downloads')
    .select('user_id, downloaded_at')
    .eq('work_report_id', reportId)
    .neq('user_id', excludeUserId);
  if (error) throw error;
  return data || [];
};

export const getUserProfileFullName = async (userId: string | number) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.full_name || null;
};

export const insertNotificationsRows = async (
  notifications: Array<Record<string, unknown>>,
) => {
  if (notifications.length === 0) return;
  const { error } = await supabase.from('notifications').insert(notifications);
  if (error) throw error;
};

