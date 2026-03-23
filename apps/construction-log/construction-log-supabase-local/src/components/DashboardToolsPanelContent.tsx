import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorkReport } from '@/offline-db/types';
import { ChevronLeft } from 'lucide-react';
import type { OpenExistingReportOptions, SummaryReportViewMode } from './DashboardToolsTabContents';
import { ToolActions } from './tools-panel/ToolActions';
import { ReportsAnalysisWindow } from './tools-panel/ReportsAnalysisWindow';

type ToolsActionTab = 'bulk-export' | 'data-management' | 'summary-report';

const TOOLS_LABELS: Record<ToolsActionTab, string> = {
  'bulk-export': 'Exportacion masiva',
  'data-management': 'Gestion de datos',
  'summary-report': 'Informe resumen',
};

type BaseToolsProps = {
  tenantUnavailable: boolean;
  onPending: (featureName: string) => void;
};

export type ToolsPanelContentProps = BaseToolsProps & {
  activeToolsTab: ToolsActionTab;
  workReports: WorkReport[];
  summaryReportAnalysisOpen: boolean;
  summaryReportViewMode: SummaryReportViewMode;
  onSummaryReportViewModeChange: (mode: SummaryReportViewMode) => void;
  onSummaryReportAnalysisOpenChange: (open: boolean) => void;
  onOpenMetrics: () => void;
  onOpenExistingReport: (report: WorkReport, options?: OpenExistingReportOptions) => void;
  onBackToParts: () => void;
  onDataChanged: () => Promise<void>;
};

export const ToolsPanelContent = ({
  activeToolsTab,
  workReports,
  tenantUnavailable,
  summaryReportAnalysisOpen,
  summaryReportViewMode,
  onSummaryReportViewModeChange,
  onSummaryReportAnalysisOpenChange,
  onOpenMetrics,
  onOpenExistingReport,
  onPending,
  onDataChanged,
  onBackToParts,
}: ToolsPanelContentProps) => {
  const panelTitle =
    activeToolsTab === 'summary-report' && summaryReportAnalysisOpen && summaryReportViewMode === 'analysis'
      ? 'Analisis de informes'
      : TOOLS_LABELS[activeToolsTab];
  const subtitle =
    activeToolsTab === 'bulk-export'
      ? 'Genera un archivo ZIP con multiples partes de trabajo.'
      : 'Selecciona una accion para continuar.';
  const actionGridClass =
    activeToolsTab === 'bulk-export'
      ? 'mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2'
      : 'mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <Card className="bg-white">
      <CardHeader className="pb-3">
        <div className="grid grid-cols-[88px_1fr_88px] items-start">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBackToParts}
            className="mt-0.5 h-8 w-[88px] justify-start px-2 text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="mr-1 h-5 w-5" strokeWidth={3} />
            Volver
          </Button>
          <div className="space-y-1 text-center">
            <CardTitle className="text-xl sm:text-2xl">{panelTitle}</CardTitle>
            <CardDescription className="text-sm sm:text-[15px]">{subtitle}</CardDescription>
          </div>
          <div aria-hidden className="h-8 w-[88px]" />
        </div>
      </CardHeader>
      <CardContent>
        {activeToolsTab === 'summary-report' && summaryReportAnalysisOpen ? (
          <ReportsAnalysisWindow
            reports={workReports}
            tenantUnavailable={tenantUnavailable}
            onPending={onPending}
            onOpenExistingReport={onOpenExistingReport}
            mode={summaryReportViewMode}
          />
        ) : (
          <div className={actionGridClass}>
            <ToolActions
              activeToolsTab={activeToolsTab}
              tenantUnavailable={tenantUnavailable}
              onOpenMetrics={onOpenMetrics}
              onOpenGenerateReport={() => {
                onSummaryReportViewModeChange('generate');
                onSummaryReportAnalysisOpenChange(true);
              }}
              onOpenReportsAnalysis={() => {
                onSummaryReportViewModeChange('analysis');
                onSummaryReportAnalysisOpenChange(true);
              }}
              onPending={onPending}
              onDataChanged={onDataChanged}
              workReports={workReports}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
