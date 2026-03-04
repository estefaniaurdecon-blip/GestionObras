import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/hooks/useOrganization';
import { storage } from '@/utils/storage';

interface DownloadRecord {
  work_report_id: string;
  user_id: string;
  organization_id: string | null;
  format: 'pdf' | 'excel';
  downloaded_at: string;
}

const STORAGE_KEY_PREFIX = 'work_report_downloads_local::v1::';

const toStorageKey = (organizationId?: string | null): string => {
  const normalized = (organizationId || '').trim() || 'default';
  return `${STORAGE_KEY_PREFIX}${normalized}`;
};

const readRecords = async (storageKey: string): Promise<DownloadRecord[]> => {
  try {
    const raw = await storage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DownloadRecord => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<DownloadRecord>;
      return (
        typeof candidate.work_report_id === 'string' &&
        typeof candidate.user_id === 'string' &&
        (typeof candidate.organization_id === 'string' || candidate.organization_id === null) &&
        (candidate.format === 'pdf' || candidate.format === 'excel') &&
        typeof candidate.downloaded_at === 'string'
      );
    });
  } catch {
    return [];
  }
};

const isOlderThan = (dateIso: string, referenceIso: string): boolean => {
  const left = Date.parse(dateIso);
  const right = Date.parse(referenceIso);
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return left < right;
};

export const useWorkReportDownloads = () => {
  const { user } = useAuth();
  const { organization } = useOrganization();

  /**
   * Registra una descarga de parte de trabajo.
   * Si ya existe un registro para este usuario y parte, actualiza la fecha.
   */
  const trackDownload = async (workReportId: string, format: 'pdf' | 'excel') => {
    if (!user) return;

    try {
      const userId = String(user.id);
      const organizationId = organization?.id || null;
      const storageKey = toStorageKey(organizationId);
      const currentRecords = await readRecords(storageKey);

      const nextRecords = currentRecords.filter(
        (record) => !(record.work_report_id === workReportId && record.user_id === userId)
      );

      nextRecords.push({
        work_report_id: workReportId,
        user_id: userId,
        organization_id: organizationId,
        format,
        downloaded_at: new Date().toISOString(),
      });

      await storage.setItem(storageKey, JSON.stringify(nextRecords));
    } catch (error) {
      console.error('Error tracking download locally:', error);
    }
  };

  /**
   * Verifica quién ha descargado un parte de trabajo y cuándo.
   * Retorna los usuarios que descargaron el parte antes de la última modificación.
   */
  const getUsersToNotifyForModification = async (
    workReportId: string,
    lastModifiedAt: string
  ): Promise<{ userId: string; downloadedAt: string }[]> => {
    if (!user) return [];

    try {
      const userId = String(user.id);
      const storageKey = toStorageKey(organization?.id || null);
      const records = await readRecords(storageKey);

      return records
        .filter(
          (record) =>
            record.work_report_id === workReportId &&
            record.user_id !== userId &&
            isOlderThan(record.downloaded_at, lastModifiedAt)
        )
        .map((record) => ({
          userId: record.user_id,
          downloadedAt: record.downloaded_at,
        }));
    } catch (error) {
      console.error('Error fetching local download records:', error);
      return [];
    }
  };

  return {
    trackDownload,
    getUsersToNotifyForModification,
  };
};
