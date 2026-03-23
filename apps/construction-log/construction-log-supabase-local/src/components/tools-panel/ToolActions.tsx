import type { WorkReport } from '@/offline-db/types';
import { AlarmClockCheck, BarChart3, ClipboardPen } from 'lucide-react';
import { BulkExportCustomDialog } from './BulkExportCustomDialog';
import { BulkExportSinglePeriodDialog } from './BulkExportSinglePeriodDialog';
import { DataManagementExportDialog } from './DataManagementExportDialog';
import { DataManagementImportDialog } from './DataManagementImportDialog';
import { CalendarNumberIcon, ToolsOptionButton } from './toolsPanelShared';

type ToolsActionTab = 'bulk-export' | 'data-management' | 'summary-report';

export const ToolActions = ({
  activeToolsTab,
  tenantUnavailable,
  onOpenMetrics,
  onOpenGenerateReport,
  onOpenReportsAnalysis,
  onPending,
  onDataChanged,
  workReports,
}: {
  activeToolsTab: ToolsActionTab;
  tenantUnavailable: boolean;
  onOpenMetrics: () => void;
  onOpenGenerateReport: () => void;
  onOpenReportsAnalysis: () => void;
  onPending: (featureName: string) => void;
  onDataChanged: () => Promise<void>;
  workReports: WorkReport[];
}) => {
  if (activeToolsTab === 'bulk-export') {
    return (
      <>
        <BulkExportSinglePeriodDialog
          disabled={tenantUnavailable}
          reports={workReports}
          mode="day"
          icon={<CalendarNumberIcon value="1" />}
          label="Exportar dia"
        />
        <BulkExportSinglePeriodDialog
          disabled={tenantUnavailable}
          reports={workReports}
          mode="week"
          icon={<CalendarNumberIcon value="7" />}
          label="Exportar semanal"
        />
        <BulkExportSinglePeriodDialog
          disabled={tenantUnavailable}
          reports={workReports}
          mode="month"
          icon={<CalendarNumberIcon value="30" />}
          label="Exportar mensual"
        />
        <BulkExportCustomDialog disabled={tenantUnavailable} reports={workReports} />
      </>
    );
  }

  if (activeToolsTab === 'data-management') {
    return (
      <>
        <ToolsOptionButton
          icon={<AlarmClockCheck className="h-8 w-8 text-indigo-600" />}
          label="Ver resumen en tiempo real"
          onClick={onOpenMetrics}
        />
        <DataManagementImportDialog disabled={tenantUnavailable} onDataChanged={onDataChanged} />
        <DataManagementExportDialog disabled={tenantUnavailable} reports={workReports} />
      </>
    );
  }

  if (activeToolsTab === 'summary-report') {
    return (
      <>
        <ToolsOptionButton
          icon={<ClipboardPen className="h-8 w-8 text-indigo-600" />}
          label="Generar informe"
          disabled={tenantUnavailable}
          onClick={onOpenGenerateReport}
        />
        <ToolsOptionButton
          icon={<BarChart3 className="h-8 w-8 text-indigo-600" />}
          label="Analisis de informes"
          disabled={tenantUnavailable}
          onClick={onOpenReportsAnalysis}
        />
      </>
    );
  }

  return null;
};
