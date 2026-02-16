import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/hooks/useOrganization';

interface DownloadRecord {
  work_report_id: string;
  user_id: string;
  organization_id: string | null;
  format: 'pdf' | 'excel';
}

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
      const downloadData: DownloadRecord = {
        work_report_id: workReportId,
        user_id: user.id,
        organization_id: organization?.id || null,
        format,
      };

      // Upsert: si ya existe, actualiza downloaded_at y format
      // Usamos casting porque la tabla es nueva y los tipos aún no están actualizados
      const { error } = await (supabase as any)
        .from('work_report_downloads')
        .upsert(downloadData, { 
          onConflict: 'work_report_id,user_id',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error('Error tracking download:', error);
      }
    } catch (error) {
      console.error('Error tracking download:', error);
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
      // Usamos casting porque la tabla es nueva y los tipos aún no están actualizados
      const { data, error } = await (supabase as any)
        .from('work_report_downloads')
        .select('user_id, downloaded_at')
        .eq('work_report_id', workReportId)
        .lt('downloaded_at', lastModifiedAt)
        .neq('user_id', user.id); // No notificar al que modifica

      if (error) {
        console.error('Error fetching download records:', error);
        return [];
      }

      return data?.map((d: any) => ({
        userId: d.user_id,
        downloadedAt: d.downloaded_at
      })) || [];
    } catch (error) {
      console.error('Error fetching download records:', error);
      return [];
    }
  };

  return {
    trackDownload,
    getUsersToNotifyForModification,
  };
};
