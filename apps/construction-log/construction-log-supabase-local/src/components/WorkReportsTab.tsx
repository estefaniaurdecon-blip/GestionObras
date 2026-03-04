import { lazy, Suspense, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { DashboardToolsTabs, type DashboardToolsTab } from '@/components/DashboardToolsTabs';
import { PartsTabContent, ToolsPanelContent } from '@/components/DashboardToolsTabContents';
import type { GenerateWorkReportDraft } from '@/components/GenerateWorkReportPanel';
import type { HistoryReportsPanelProps } from '@/components/HistoryReportsPanel';
import { TenantPicker } from '@/components/TenantPicker';
import { startupPerfEnd, startupPerfPoint, startupPerfStart } from '@/utils/startupPerf';
import { apiFetch } from '@/integrations/api/client';
import type { ApiTenant } from '@/integrations/api/client';
import type { WorkReport } from '@/offline-db/types';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';

const GenerateWorkReportPanel = lazy(() =>
  import('@/components/GenerateWorkReportPanel').then((module) => ({
    default: module.GenerateWorkReportPanel,
  })),
);

const HistoryReportsPanel = lazy(() =>
  import('@/components/HistoryReportsPanel').then((module) => ({
    default: module.HistoryReportsPanel,
  })),
);

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
  allWorkReports: WorkReport[];
  workReportVisibleDays: number;
  syncing: boolean;
  workReportsReadOnlyByRole: boolean;
};

type WorkReportsActionsConfig = {
  handleSyncNow: () => Promise<void>;
  reloadWorkReports: () => Promise<void>;
  openGenerateWorkReport: (targetDate?: string) => void;
  setMetricsOpen: Dispatch<SetStateAction<boolean>>;
  handlePending: (featureName: string) => void;
  openCloneFromHistoryDialog: (report: WorkReport) => void;
  openExistingReport: (report: WorkReport) => void;
  // Optional for backwards compatibility with old Index action wiring.
  setHistoryOpen?: Dispatch<SetStateAction<boolean>>;
};

type WorkReportsHistoryConfig = HistoryReportsPanelProps;

type WorkReportsTabProps = {
  panel: WorkReportsPanelConfig;
  summary: WorkReportsSummaryConfig;
  tenant: WorkReportsTenantConfig;
  reports: WorkReportsListConfig;
  actions: WorkReportsActionsConfig;
  history?: WorkReportsHistoryConfig;
};

export const WorkReportsTab = ({
  panel,
  summary,
  tenant,
  reports,
  actions,
  history,
}: WorkReportsTabProps) => {
  const INITIAL_HEALTH_CHECK_DELAY_MS = 12000;

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
    syncHeadlineClass,
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
    allWorkReports,
    workReportVisibleDays,
    syncing,
    workReportsReadOnlyByRole,
  } = reports;
  const {
    handleSyncNow,
    reloadWorkReports,
    openGenerateWorkReport,
    setMetricsOpen,
    handlePending,
    openCloneFromHistoryDialog,
    openExistingReport,
  } = actions;
  const [activeToolsTab, setActiveToolsTab] = useState<DashboardToolsTab>('parts');
  const [isSyncOnline, setIsSyncOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    startupPerfPoint('panel:WorkReportsTab mounted');
  }, []);

  useEffect(() => {
    let disposed = false;

    const checkSyncConnectivity = async () => {
      startupPerfStart('component:WorkReportsTab.checkSyncConnectivity');
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (!disposed) setIsSyncOnline(false);
        startupPerfEnd('component:WorkReportsTab.checkSyncConnectivity', 'navigator.offline');
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 4000);
        const response = await apiFetch('/api/v1/health', {
          method: 'GET',
          skipAuth: true,
          signal: controller.signal,
        });
        window.clearTimeout(timeoutId);
        if (!disposed) setIsSyncOnline(response.ok);
        startupPerfEnd(
          'component:WorkReportsTab.checkSyncConnectivity',
          `response.ok=${response.ok}`,
        );
      } catch {
        if (!disposed) setIsSyncOnline(false);
        startupPerfEnd('component:WorkReportsTab.checkSyncConnectivity', 'error');
      }
    };

    const handleOnline = () => {
      void checkSyncConnectivity();
    };
    const handleOffline = () => {
      setIsSyncOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    let initialTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let initialIdleId: number | null = null;
    initialTimeoutId = globalThis.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        initialIdleId = window.requestIdleCallback(() => {
          void checkSyncConnectivity();
        }, { timeout: 2000 });
        return;
      }

      void checkSyncConnectivity();
    }, INITIAL_HEALTH_CHECK_DELAY_MS);
    const intervalId = window.setInterval(() => {
      void checkSyncConnectivity();
    }, 10000);

    return () => {
      disposed = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(intervalId);
      if (initialTimeoutId !== null) {
        globalThis.clearTimeout(initialTimeoutId);
      }
      if (initialIdleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(initialIdleId);
      }
    };
  }, [INITIAL_HEALTH_CHECK_DELAY_MS]);

  const connectionPanelClass = isSyncOnline
    ? 'border-emerald-200 bg-emerald-50/60'
    : 'border-rose-200 bg-rose-50/60';
  const connectionTitleClass = isSyncOnline ? 'text-emerald-800' : 'text-rose-800';
  const connectionBadgeClass = isSyncOnline
    ? 'border-emerald-300 bg-emerald-100 text-[15px] sm:text-[16px] text-emerald-700'
    : 'border-rose-300 bg-rose-100 text-[15px] sm:text-[16px] text-rose-700';
  const connectionIconBubbleClass = isSyncOnline
    ? 'bg-emerald-100 text-emerald-600'
    : 'bg-rose-100 text-rose-600';
  const connectionStatusLabel = isSyncOnline ? 'Online' : 'Offline';

  return (
    <TabsContent value="work-reports" className="m-0 space-y-5">
      {generatePanelOpen ? (
        <Suspense fallback={<div className="min-h-[50vh] bg-slate-100" />}>
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
        </Suspense>
      ) : (
        <>
          <div className="text-center space-y-1">
            <h2 className="text-xl sm:text-3xl font-semibold text-slate-900">Partes de Trabajo</h2>
            <p className="text-[15px] text-muted-foreground">Gestiona tus partes diarios</p>
          </div>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <Card className="border-emerald-200 bg-emerald-50/60">
              <CardContent className="p-3">
                <div className="flex min-h-[88px] flex-col items-center justify-center gap-2 text-center">
                  <div className="rounded-full bg-emerald-100 p-2 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="text-[17px] sm:text-[18px] font-medium text-emerald-800">Completados</div>
                  <div className="text-2xl font-semibold text-emerald-700">{workReportsSummary.completed}</div>
                  <Badge
                    variant="outline"
                    className="border-emerald-300 bg-emerald-100 text-[15px] sm:text-[16px] text-emerald-700"
                  >
                    {workReportsSummary.completedPctTotal}% Total
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/60">
              <CardContent className="p-3">
                <div className="flex min-h-[88px] flex-col items-center justify-center gap-2 text-center">
                  <div className="rounded-full bg-amber-100 p-2 text-amber-600">
                    <Clock3 className="h-4 w-4" />
                  </div>
                  <div className="text-[17px] sm:text-[18px] font-medium text-amber-800">Pendientes</div>
                  <div className="text-2xl font-semibold text-amber-700">{workReportsSummary.pending}</div>
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-100 text-[15px] sm:text-[16px] text-amber-700"
                  >
                    {workReportsSummary.pending > 0 ? 'Por completar' : 'Sin pendientes'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50/60">
              <CardContent className="p-3">
                <div className="flex min-h-[88px] flex-col items-center justify-center gap-2 text-center">
                  <div className="rounded-full bg-blue-100 p-2 text-blue-600">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="text-[17px] sm:text-[18px] font-medium text-blue-800">Aprobados</div>
                  <div className="text-2xl font-semibold text-blue-700">{workReportsSummary.approved}</div>
                  <Badge
                    variant="outline"
                    className="border-blue-300 bg-blue-100 text-[15px] sm:text-[16px] text-blue-700"
                  >
                    {workReportsSummary.approvedPctCompleted}% de completados
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className={connectionPanelClass}>
              <CardContent className="p-3">
                <div className="flex min-h-[88px] flex-col items-center justify-center gap-2 text-center">
                  <div className={`rounded-full p-2 ${connectionIconBubbleClass}`}>
                    {isSyncOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                  </div>
                  <div className={`text-[17px] sm:text-[18px] font-medium ${connectionTitleClass}`}>
                    Estado de conexion
                  </div>
                  <div aria-hidden className="invisible select-none text-2xl font-semibold leading-tight">
                    0
                  </div>
                  <Badge variant="outline" className={connectionBadgeClass}>
                    {connectionStatusLabel}
                  </Badge>
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
              <DashboardToolsTabs
                value={activeToolsTab}
                onValueChange={setActiveToolsTab}
              />

              {activeToolsTab === 'history' ? (
                <Card className="bg-white">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-start">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveToolsTab('parts')}
                        className="h-8 px-2 text-slate-600 hover:text-slate-900"
                      >
                        <ArrowLeft className="mr-1 h-4 w-4" />
                        Volver
                      </Button>
                    </div>
                    <div className="space-y-1 text-center">
                      <CardTitle>Historial de partes</CardTitle>
                      <CardDescription>Busqueda y filtros de partes guardados.</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {history ? (
                      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
                        <HistoryReportsPanel {...history} />
                      </Suspense>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Historial no disponible en esta vista.
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : activeToolsTab !== 'parts' ? (
                <ToolsPanelContent
                  activeToolsTab={activeToolsTab}
                  workReports={allWorkReports}
                  tenantUnavailable={tenantUnavailable}
                  onOpenMetrics={() => setMetricsOpen(true)}
                  onPending={handlePending}
                  onDataChanged={reloadWorkReports}
                  onBackToParts={() => setActiveToolsTab('parts')}
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

