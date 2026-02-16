import { useState, type Dispatch, type SetStateAction } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { DashboardToolsTabs, type DashboardToolsTab } from '@/components/DashboardToolsTabs';
import { PartsTabContent, ToolsPanelContent } from '@/components/DashboardToolsTabContents';
import { GenerateWorkReportPanel, type GenerateWorkReportDraft } from '@/components/GenerateWorkReportPanel';
import { HistoryReportsPanel, type HistoryReportsPanelProps } from '@/components/HistoryReportsPanel';
import { TenantPicker } from '@/components/TenantPicker';
import type { ApiTenant } from '@/integrations/api/client';
import type { WorkReport } from '@/offline-db/types';
import {
  CheckCircle2,
  Clock3,
  CloudUpload,
  ShieldCheck,
} from 'lucide-react';

type WorkReportsSummary = {
  completed: number;
  completedPctTotal: number;
  pending: number;
  approved: number;
  approvedPctCompleted: number;
};

type SyncSummary = {
  total: number;
  synced: number;
  pendingSync: number;
  errorSync: number;
  pendingTotal: number;
};

type WorkItem = {
  id: string | number;
  number?: string | null;
  name?: string | null;
};

type WorkReportsPanelConfig = {
  open: boolean;
  date?: string;
  manualCloneDraft: GenerateWorkReportDraft | null;
  initialDraft: GenerateWorkReportDraft | null;
  readOnly: boolean;
  reportIdentifier: string | null;
  saving: boolean;
  sortedWorks: WorkItem[];
  setGeneratePanelOpen: Dispatch<SetStateAction<boolean>>;
  setActiveReport: Dispatch<SetStateAction<WorkReport | null>>;
  setManualCloneDraft: Dispatch<SetStateAction<GenerateWorkReportDraft | null>>;
  onSaveGeneratedWorkReport: (draft: GenerateWorkReportDraft) => Promise<void>;
};

type WorkReportsSummaryConfig = {
  workReportsSummary: WorkReportsSummary;
  syncSummary: SyncSummary;
  hasSyncPendingValidation: boolean;
  syncPanelClass: string;
  syncTitleClass: string;
  syncHeadlineClass: string;
  syncBadgeClass: string;
  syncIconBubbleClass: string;
  syncStatusBadgeLabel: string;
};

type WorkReportsTenantConfig = {
  tenantResolving: boolean;
  tenantNeedsPicker: boolean;
  tenantPickerOptions: ApiTenant[];
  tenantPickerSelection: string;
  tenantPickerLoading: boolean;
  tenantPickerSubmitting: boolean;
  tenantPickerErrorMessage: string | null;
  setTenantPickerSelection: Dispatch<SetStateAction<string>>;
  handleConfirmTenantSelection: () => Promise<void>;
  handleRetryTenantResolution: () => void;
  signOut: () => Promise<void>;
  tenantUnavailable: boolean;
  tenantErrorMessage: string;
  canCreateWorkReport: boolean;
};

type WorkReportsListConfig = {
  workReportsLoading: boolean;
  workReports: WorkReport[];
  workReportVisibleDays: number;
  syncing: boolean;
  workReportsReadOnlyByRole: boolean;
};

type WorkReportsActionsConfig = {
  handleSyncNow: () => Promise<void>;
  openGenerateWorkReport: (targetDate?: string) => void;
  setMetricsOpen: Dispatch<SetStateAction<boolean>>;
  handlePending: (featureName: string) => void;
  openCloneFromHistoryDialog: (report: WorkReport) => void;
  openExistingReport: (report: WorkReport) => void;
};

type WorkReportsHistoryConfig = HistoryReportsPanelProps;

type WorkReportsTabProps = {
  panel: WorkReportsPanelConfig;
  summary: WorkReportsSummaryConfig;
  tenant: WorkReportsTenantConfig;
  reports: WorkReportsListConfig;
  actions: WorkReportsActionsConfig;
  history: WorkReportsHistoryConfig;
};

export const WorkReportsTab = ({ panel, summary, tenant, reports, actions, history }: WorkReportsTabProps) => {
  const {
    open: generatePanelOpen,
    date: generatePanelDate,
    manualCloneDraft,
    initialDraft: panelInitialDraft,
    readOnly: panelReadOnly,
    reportIdentifier: panelReportIdentifier,
    saving: generatePanelSaving,
    sortedWorks,
    setGeneratePanelOpen,
    setActiveReport,
    setManualCloneDraft,
    onSaveGeneratedWorkReport: handleSaveGeneratedWorkReport,
  } = panel;
  const {
    workReportsSummary,
    syncSummary,
    hasSyncPendingValidation,
    syncPanelClass,
    syncTitleClass,
    syncHeadlineClass,
    syncBadgeClass,
    syncIconBubbleClass,
    syncStatusBadgeLabel,
  } = summary;
  const {
    tenantResolving,
    tenantNeedsPicker,
    tenantPickerOptions,
    tenantPickerSelection,
    tenantPickerLoading,
    tenantPickerSubmitting,
    tenantPickerErrorMessage,
    setTenantPickerSelection,
    handleConfirmTenantSelection,
    handleRetryTenantResolution,
    signOut,
    tenantUnavailable,
    tenantErrorMessage,
    canCreateWorkReport,
  } = tenant;
  const {
    workReportsLoading,
    workReports,
    workReportVisibleDays,
    syncing,
    workReportsReadOnlyByRole,
  } = reports;
  const {
    handleSyncNow,
    openGenerateWorkReport,
    setMetricsOpen,
    handlePending,
    openCloneFromHistoryDialog,
    openExistingReport,
  } = actions;
  const [activeToolsTab, setActiveToolsTab] = useState<DashboardToolsTab>('parts');

  return (
    <TabsContent value="work-reports" className="m-0 space-y-5">
      {generatePanelOpen ? (
        <GenerateWorkReportPanel
          initialDate={generatePanelDate}
          initialDraft={manualCloneDraft ?? panelInitialDraft}
          readOnly={panelReadOnly}
          reportIdentifier={panelReportIdentifier}
          saving={generatePanelSaving}
          works={sortedWorks.map((work) => ({ id: String(work.id), number: work.number, name: work.name }))}
          onBack={() => {
            setGeneratePanelOpen(false);
            setActiveReport(null);
            setManualCloneDraft(null);
          }}
          onSave={handleSaveGeneratedWorkReport}
        />
      ) : (
        <>
          <div className="text-center space-y-1">
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">Partes de Trabajo</h2>
            <p className="text-sm text-muted-foreground">Gestiona tus partes diarios</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-emerald-200 bg-emerald-50/60">
              <CardContent className="p-3">
                <div className="flex min-h-[88px] items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm text-emerald-800">Completados</div>
                    <div className="text-2xl font-semibold text-emerald-700">{workReportsSummary.completed}</div>
                    <Badge
                      variant="outline"
                      className="border-emerald-300 bg-emerald-100 text-emerald-700"
                    >
                      {workReportsSummary.completedPctTotal}% Total
                    </Badge>
                  </div>
                  <div className="rounded-full bg-emerald-100 p-2 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/60">
              <CardContent className="p-3">
                <div className="flex min-h-[88px] items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm text-amber-800">Pendientes</div>
                    <div className="text-2xl font-semibold text-amber-700">{workReportsSummary.pending}</div>
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-100 text-amber-700"
                    >
                      {workReportsSummary.pending > 0 ? 'Por completar' : 'Sin pendientes'}
                    </Badge>
                  </div>
                  <div className="rounded-full bg-amber-100 p-2 text-amber-600">
                    <Clock3 className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50/60">
              <CardContent className="p-3">
                <div className="flex min-h-[88px] items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm text-blue-800">Aprobados</div>
                    <div className="text-2xl font-semibold text-blue-700">{workReportsSummary.approved}</div>
                    <Badge
                      variant="outline"
                      className="border-blue-300 bg-blue-100 text-blue-700"
                    >
                      {workReportsSummary.approvedPctCompleted}% de completados
                    </Badge>
                  </div>
                  <div className="rounded-full bg-blue-100 p-2 text-blue-600">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={syncPanelClass}>
              <CardContent className="p-3">
                <div className="flex min-h-[88px] items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className={`text-sm ${syncTitleClass}`}>
                      Estado de sincronización
                    </div>
                    <div aria-hidden className="invisible select-none text-2xl font-semibold leading-tight">
                      0
                    </div>
                    <Badge variant="outline" className={syncBadgeClass}>
                      {syncStatusBadgeLabel}
                    </Badge>
                  </div>
                  <div className={`rounded-full p-2 ${syncIconBubbleClass}`}>
                    <CloudUpload className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          {tenantResolving ? (
            <Alert>
              <AlertTitle>Resolviendo tenant...</AlertTitle>
              <AlertDescription>Esperando contexto de tenant para habilitar el módulo offline.</AlertDescription>
            </Alert>
          ) : tenantNeedsPicker ? (
            <TenantPicker
              tenants={tenantPickerOptions}
              selectedTenantId={tenantPickerSelection}
              loading={tenantPickerLoading}
              submitting={tenantPickerSubmitting}
              error={tenantPickerErrorMessage}
              onSelectTenant={setTenantPickerSelection}
              onContinue={() => void handleConfirmTenantSelection()}
              onRetry={handleRetryTenantResolution}
              onLogout={() => {
                void signOut();
              }}
            />
          ) : tenantUnavailable ? (
            <Alert variant="destructive">
              <AlertTitle>Tenant no resuelto</AlertTitle>
              <AlertDescription>{tenantErrorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="w-full">
            <div className="mx-auto w-full max-w-6xl space-y-2">
              <DashboardToolsTabs value={activeToolsTab} onValueChange={setActiveToolsTab} />

              {activeToolsTab === 'history' ? (
                <Card className="bg-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Historial de partes</CardTitle>
                    <CardDescription>Busqueda y filtros de partes guardados.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <HistoryReportsPanel {...history} />
                  </CardContent>
                </Card>
              ) : activeToolsTab !== 'parts' ? (
                <ToolsPanelContent
                  activeToolsTab={activeToolsTab}
                  tenantUnavailable={tenantUnavailable}
                  onOpenMetrics={() => setMetricsOpen(true)}
                  onPending={handlePending}
                />
              ) : (
                <PartsTabContent
                  tenantResolving={tenantResolving}
                  tenantNeedsPicker={tenantNeedsPicker}
                  tenantUnavailable={tenantUnavailable}
                  tenantErrorMessage={tenantErrorMessage}
                  workReportsLoading={workReportsLoading}
                  workReports={workReports}
                  workReportVisibleDays={workReportVisibleDays}
                  syncing={syncing}
                  canCreateWorkReport={canCreateWorkReport}
                  workReportsReadOnlyByRole={workReportsReadOnlyByRole}
                  hasSyncPendingValidation={hasSyncPendingValidation}
                  syncSummary={syncSummary}
                  syncPanelClass={syncPanelClass}
                  syncHeadlineClass={syncHeadlineClass}
                  onSyncNow={handleSyncNow}
                  onGenerateWorkReport={() => openGenerateWorkReport()}
                  onPending={handlePending}
                  onCloneFromHistoryDialog={openCloneFromHistoryDialog}
                  onOpenExistingReport={openExistingReport}
                />
              )}
            </div>
          </div>
        </>
      )}
    </TabsContent>
  );
};
