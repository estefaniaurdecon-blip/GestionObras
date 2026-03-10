import { useState } from 'react';
import { subWeeks } from 'date-fns';
import { generateWorkReportPDF } from '@/utils/pdfGenerator';
import { exportWeeklyReports, exportMonthlyReports } from '@/utils/weeklyMonthlyExportUtils';
import { exportToExcel } from '@/utils/exportUtils';
import { useToast } from '@/hooks/use-toast';
import {
  getErpWorkReport,
  listErpWorkReports,
} from '@/integrations/api/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useWorkReportDownloads } from '@/hooks/useWorkReportDownloads';
import {
  type ApiErpWorkReport,
  mapApiWorkReportToLegacyWorkReport,
} from '@/services/workReportContract';
import type { Notification as AppNotification } from '@/types/notifications';
import type { WorkReport } from '@/types/workReport';

export const toApiReportId = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const normalized = raw.trim();
  if (!normalized) return null;
  const direct = Number(normalized);
  if (Number.isInteger(direct) && direct > 0) return direct;

  const match = normalized.match(/(\d+)(?!.*\d)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

type UseNotificationDownloadParams = {
  selectedNotification: AppNotification | null;
  reports: WorkReport[];
  companyLogo?: string;
  onDownloadComplete?: () => void;
};

export function useNotificationDownload({
  selectedNotification,
  reports,
  companyLogo,
  onDownloadComplete,
}: UseNotificationDownloadParams) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();
  const { organization } = useOrganization();
  const { isSiteManager, isAdmin, isMaster } = useUserPermissions();
  const { trackDownload } = useWorkReportDownloads();

  const handleDownload = async (format: 'pdf' | 'excel', period: 'day' | 'week' | 'month') => {
    if (!selectedNotification?.related_id) return;

    setIsDownloading(true);

    try {
      const apiReportId = toApiReportId(selectedNotification.related_id);
      if (apiReportId === null) {
        toast({
          title: "Error",
          description: "La notificación no está vinculada a un parte válido",
          variant: "destructive",
        });
        setIsDownloading(false);
        return;
      }

      // Try to find in local reports first
      let relatedReport = reports.find(
        (report) => report.id === selectedNotification.related_id || toApiReportId(report.id) === apiReportId,
      );
      let relatedApiReport: ApiErpWorkReport | null = null;

      // If not found locally, fetch from database
      if (!relatedReport) {
        relatedApiReport = await getErpWorkReport(apiReportId);

        if (!relatedApiReport) {
          toast({
            title: "Error",
            description: "No se encontró el parte de trabajo",
            variant: "destructive",
          });
          setIsDownloading(false);
          return;
        }

        relatedReport = mapApiWorkReportToLegacyWorkReport(relatedApiReport);
      }

      const reportDate = new Date(relatedReport.date);
      let filteredReports = [relatedReport]; // Start with the fetched report

      // Filter by period - fetch additional reports if needed
      if (period === 'day') {
        filteredReports = [relatedReport]; // Single day only
      } else if (period === 'week' || period === 'month') {
        if (!relatedApiReport) {
          relatedApiReport = await getErpWorkReport(apiReportId);
        }
        if (!relatedApiReport?.project_id) {
          throw new Error('No se encontró project_id para el parte');
        }

        // Fetch reports for the period from database
        const apiReports = await listErpWorkReports({
          projectId: relatedApiReport.project_id,
          limit: 500,
          offset: 0,
        });
        const allReports: WorkReport[] = apiReports.map(mapApiWorkReportToLegacyWorkReport);

        if (allReports.length > 0) {
          if (period === 'week') {
            const weekStart = subWeeks(reportDate, 0);
            filteredReports = allReports.filter(r =>
              new Date(r.date) >= weekStart && new Date(r.date) <= reportDate
            );
          } else if (period === 'month') {
            filteredReports = allReports.filter(r => {
              const rDate = new Date(r.date);
              return rDate.getMonth() === reportDate.getMonth() &&
                     rDate.getFullYear() === reportDate.getFullYear();
            });
          }
        }
      }

      if (format === 'pdf') {
        if (filteredReports.length === 1) {
          const brandColor = organization?.brand_color || undefined;
          await generateWorkReportPDF(filteredReports[0], false, companyLogo, brandColor);
        } else {
          toast({
            title: "Información",
            description: "PDF solo disponible para días individuales. Use Excel para períodos más largos.",
            variant: "default",
          });
          setIsDownloading(false);
          return;
        }
      } else if (format === 'excel') {
        if (period === 'week') {
          await exportWeeklyReports(filteredReports, relatedReport.workName);
        } else if (period === 'month') {
          await exportMonthlyReports(filteredReports, relatedReport.workName);
        } else {
          await exportToExcel(filteredReports);
        }
      }

      // Registrar la descarga para notificaciones de modificación
      if (isSiteManager || isAdmin || isMaster) {
        await trackDownload(String(apiReportId), format);
      }

      toast({
        title: "Descarga completada",
        description: `El parte se ha descargado en formato ${format.toUpperCase()}`,
      });
      onDownloadComplete?.();
    } catch (error) {
      console.error('Error downloading report:', error);
      toast({
        title: "Error",
        description: "No se pudo descargar el parte",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return { handleDownload, isDownloading };
}
