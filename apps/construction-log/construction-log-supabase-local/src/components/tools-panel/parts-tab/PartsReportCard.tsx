import { Copy, Eye, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { WorkReport } from '@/offline-db/types';
import { getReportListItemMeta } from './shared';

type PartsReportCardProps = {
  report: WorkReport;
  navigationIds: string[];
  keyPrefix: string;
  reportNameClass: string;
  reportDetailClass: string;
  tenantUnavailable: boolean;
  workReportsReadOnlyByRole: boolean;
  onCloneFromHistoryDialog: (report: WorkReport) => void;
  onOpenExistingReport: (report: WorkReport, options?: { navigationReportIds?: string[] }) => void;
  onDeleteReport: (report: WorkReport) => void;
};

export const PartsReportCard = ({
  report,
  navigationIds,
  keyPrefix,
  reportNameClass,
  reportDetailClass,
  tenantUnavailable,
  workReportsReadOnlyByRole,
  onCloneFromHistoryDialog,
  onOpenExistingReport,
  onDeleteReport,
}: PartsReportCardProps) => {
  const { reportName, reportIdentifier, dateKey, totalHoursLabel, isClosed, isImportedPending } =
    getReportListItemMeta(report);

  return (
    <div key={`${keyPrefix}-${report.id}`} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className={reportNameClass}>{reportName}</div>
        <div className={reportDetailClass}>Identificador: {reportIdentifier}</div>
        <div className={reportDetailClass}>Fecha: {dateKey}</div>
        <div className={reportDetailClass}>Estado: {isClosed ? 'Cerrado' : 'Abierto'}</div>
        <div className={reportDetailClass}>Horas totales: {totalHoursLabel}</div>
      </div>
      <div className="flex flex-col items-start gap-2 sm:flex-shrink-0 sm:items-end">
        <div className="flex flex-wrap items-center gap-0.5 px-1 py-1 sm:justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-500 hover:text-slate-800"
            title="Clonar parte"
            onClick={() => onCloneFromHistoryDialog(report)}
            disabled={tenantUnavailable || workReportsReadOnlyByRole}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-500 hover:text-slate-800"
            title={isClosed || workReportsReadOnlyByRole ? 'Ver parte' : 'Editar parte'}
            onClick={() =>
              onOpenExistingReport(report, {
                navigationReportIds: navigationIds,
              })
            }
            disabled={tenantUnavailable}
          >
            {isClosed || workReportsReadOnlyByRole ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-700"
            title="Eliminar parte"
            onClick={() => onDeleteReport(report)}
            disabled={tenantUnavailable || workReportsReadOnlyByRole}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {!isClosed ? (
          <Badge variant="outline" className="border-amber-400 bg-amber-50 text-[13px] text-amber-700 sm:text-sm">
            Por completar
          </Badge>
        ) : null}
        {isImportedPending ? (
          <Badge variant="outline" className="border-sky-300 bg-sky-50 text-[13px] text-sky-700 sm:text-sm">
            Importado
          </Badge>
        ) : null}
        <Badge
          variant="outline"
          className={
            report.syncStatus === 'synced'
              ? 'border-emerald-300 bg-emerald-50 text-[13px] text-emerald-700 sm:text-sm'
              : report.syncStatus === 'error'
                ? 'border-rose-500 bg-rose-100 text-[13px] text-rose-800 sm:text-sm'
                : 'border-red-300 bg-red-50 text-[13px] text-red-700 sm:text-sm'
          }
        >
          {report.syncStatus === 'synced'
            ? 'Sincronizado'
            : report.syncStatus === 'error'
              ? 'Error de sincronizacion'
              : 'Pendiente de sincronizar'}
        </Badge>
      </div>
    </div>
  );
};
