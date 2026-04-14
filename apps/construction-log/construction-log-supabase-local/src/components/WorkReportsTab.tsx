import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Capacitor } from '@capacitor/core';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TabsContent } from '@/components/ui/tabs';
import { DashboardToolsTabs, type DashboardToolsTab } from '@/components/DashboardToolsTabs';
import {
  PartsTabContent,
  type OpenExistingReportOptions,
  type SummaryReportViewMode,
} from '@/components/DashboardToolsTabContents';
import type { GenerateWorkReportDraft } from '@/components/GenerateWorkReportPanel';
import type { HistoryReportsPanelProps } from '@/components/HistoryReportsPanel';
import { TenantPicker } from '@/components/TenantPicker';
import { startupPerfEnd, startupPerfPoint, startupPerfStart } from '@/utils/startupPerf';
import { apiFetch } from '@/integrations/api/client';
import type { ApiTenant } from '@/integrations/api/client';
import type { WorkReport } from '@/offline-db/types';
import {
  CheckCircle2,
  ChevronLeft,
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

const LazyToolsPanelContent = lazy(() =>
  import('@/components/DashboardToolsPanelContent').then((module) => ({
    default: module.ToolsPanelContent,
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
  tenantId?: string | number | null;
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
  allWorkReportsLoaded: boolean;
  allWorkReportsLoading: boolean;
  workReportVisibleDays: number;
  syncing: boolean;
  workReportsReadOnlyByRole: boolean;
};

type WorkReportsActionsConfig = {
  handleSyncNow: () => Promise<void>;
  reloadWorkReports: () => Promise<void>;
  ensureAllWorkReportsLoaded: () => Promise<void>;
  openGenerateWorkReport: (targetDate?: string) => void;
  setMetricsOpen: Dispatch<SetStateAction<boolean>>;
  handlePending: (featureName: string) => void;
  openCloneFromHistoryDialog: (report: WorkReport) => void;
  openExistingReport: (report: WorkReport) => void;
  deleteWorkReportPermanently: (report: WorkReport) => Promise<boolean>;
  reopenReport?: (report: WorkReport) => Promise<void>;
  isSuperAdmin?: boolean;
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
  // PERFORMANCE: Reduced polling frequency for mobile to avoid main thread stress
  // Desktop: 60s initial, 120s interval | Mobile: 30s initial, 180s interval
  const INITIAL_HEALTH_CHECK_DELAY_MS = Capacitor.isNativePlatform() ? 30000 : 60000;
  const HEALTH_CHECK_INTERVAL_MS = Capacitor.isNativePlatform() ? 180000 : 120000;

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
    allWorkReportsLoaded,
    allWorkReportsLoading,
    workReportVisibleDays,
    syncing,
    workReportsReadOnlyByRole,
  } = reports;
  const {
    handleSyncNow,
    reloadWorkReports,
    ensureAllWorkReportsLoaded,
    openGenerateWorkReport,
    setMetricsOpen,
    handlePending,
    openCloneFromHistoryDialog,
    openExistingReport,
    deleteWorkReportPermanently,
    reopenReport,
    isSuperAdmin = false,
  } = actions;
  const [activeToolsTab, setActiveToolsTab] = useState<DashboardToolsTab>('parts');
  const [summaryReportAnalysisOpen, setSummaryReportAnalysisOpen] = useState(false);
  const [summaryReportViewMode, setSummaryReportViewMode] = useState<SummaryReportViewMode>('generate');
  const [reportNavigationIds, setReportNavigationIds] = useState<string[]>([]);
  const [openedReportId, setOpenedReportId] = useState<string | null>(null);
  const [isSyncOnline, setIsSyncOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [reportToDelete, setReportToDelete] = useState<WorkReport | null>(null);
  const [deletingReport, setDeletingReport] = useState(false);

  useEffect(() => {
    startupPerfPoint('panel:WorkReportsTab mounted');
  }, []);

  useEffect(() => {
    if (activeToolsTab !== 'summary-report') {
      setSummaryReportAnalysisOpen(false);
      setSummaryReportViewMode('generate');
    }
  }, [activeToolsTab]);

  useEffect(() => {
    if (activeToolsTab === 'parts') return;
    void ensureAllWorkReportsLoaded();
  }, [activeToolsTab, ensureAllWorkReportsLoaded]);

  useEffect(() => {
    if (generatePanelOpen) return;
    setOpenedReportId(null);
    setReportNavigationIds([]);
  }, [generatePanelOpen]);

  const reportsById = useMemo(() => new Map(allWorkReports.map((report) => [report.id, report])), [allWorkReports]);
  const reportsForSummary = useMemo(
    () => (allWorkReports.length > 0 ? allWorkReports : workReports),
    [allWorkReports, workReports],
  );
  const historyDataPending = activeToolsTab !== 'parts' && (!allWorkReportsLoaded || allWorkReportsLoading);

  const effectiveNavigationIds = useMemo(() => {
    if (!openedReportId) return [];

    const seenIds = new Set<string>();
    const validIds: string[] = [];

    reportNavigationIds.forEach((reportId) => {
      if (seenIds.has(reportId)) return;
      if (!reportsById.has(reportId)) return;
      seenIds.add(reportId);
      validIds.push(reportId);
    });

    if (reportsById.has(openedReportId) && !seenIds.has(openedReportId)) {
      validIds.unshift(openedReportId);
    }

    return validIds;
  }, [openedReportId, reportNavigationIds, reportsById]);

  const currentNavigationIndex = useMemo(() => {
    if (!openedReportId) return -1;
    return effectiveNavigationIds.indexOf(openedReportId);
  }, [effectiveNavigationIds, openedReportId]);

  const navigationIndex = currentNavigationIndex >= 0 ? currentNavigationIndex : 0;
  const navigationTotalCount = effectiveNavigationIds.length;
  const canNavigatePrevious = navigationTotalCount > 0 && navigationIndex > 0;
  const canNavigateNext = navigationTotalCount > 0 && navigationIndex < navigationTotalCount - 1;

  const openExistingReportWithContext = useCallback(
    (report: WorkReport, options?: OpenExistingReportOptions) => {
      setOpenedReportId(report.id);
      if (options?.navigationReportIds?.length) {
        setReportNavigationIds(options.navigationReportIds);
      } else {
        setReportNavigationIds([report.id]);
      }
      if (options?.returnToSummaryAnalysis) {
        setSummaryReportAnalysisOpen(true);
      }
      openExistingReport(report);
    },
    [openExistingReport],
  );

  const navigateToReportByIndex = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= navigationTotalCount) return;
      const nextReportId = effectiveNavigationIds[nextIndex];
      const nextReport = reportsById.get(nextReportId);
      if (!nextReport) return;
      setOpenedReportId(nextReport.id);
      openExistingReport(nextReport);
    },
    [effectiveNavigationIds, navigationTotalCount, openExistingReport, reportsById],
  );

  useEffect(() => {
    let disposed = false;

    const checkSyncConnectivity = async () => {
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
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
    
    // PERFORMANCE: Use requestIdleCallback to defer health check to idle periods
    let initialTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let initialIdleId: number | null = null;
    initialTimeoutId = globalThis.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        initialIdleId = window.requestIdleCallback(() => {
          void checkSyncConnectivity();
        }, { timeout: 5000 });
        return;
      }

      void checkSyncConnectivity();
    }, INITIAL_HEALTH_CHECK_DELAY_MS);
    
    // PERFORMANCE: Interval handler with idle callback deferral
    let intervalIdleId: number | null = null;
    const intervalId = window.setInterval(() => {
      // Skip if page is hidden or idle callback available
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      if (typeof window.requestIdleCallback === 'function') {
        if (intervalIdleId !== null) {
          window.cancelIdleCallback(intervalIdleId);
        }
        intervalIdleId = window.requestIdleCallback(() => {
          void checkSyncConnectivity();
          intervalIdleId = null;
        }, { timeout: 10000 });
      } else {
        void checkSyncConnectivity();
      }
    }, HEALTH_CHECK_INTERVAL_MS);

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
      if (intervalIdleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(intervalIdleId);
      }
    };
  }, [HEALTH_CHECK_INTERVAL_MS, INITIAL_HEALTH_CHECK_DELAY_MS]);

  const connectionPanelClass = isSyncOnline
    ? 'border-emerald-200 bg-emerald-50/60'
    : 'border-rose-200 bg-rose-50/60';
  const connectionTitleClass = isSyncOnline ? 'text-emerald-800' : 'text-rose-800';
  const connectionBadgeClass = isSyncOnline
    ? 'border-emerald-300 bg-emerald-100 text-xs sm:text-sm text-emerald-700'
    : 'border-rose-300 bg-rose-100 text-xs sm:text-sm text-rose-700';
  const connectionIconBubbleClass = isSyncOnline
    ? 'bg-emerald-100 text-emerald-600'
    : 'bg-rose-100 text-rose-600';
  const connectionStatusLabel = isSyncOnline ? 'Online' : 'Offline';

  const handleConfirmDeleteReport = async () => {
    if (!reportToDelete || deletingReport) return;
    setDeletingReport(true);
    try {
      const deleted = await deleteWorkReportPermanently(reportToDelete);
      if (deleted) {
        setReportToDelete(null);
      }
    } finally {
      setDeletingReport(false);
    }
  };

  return (
    <TabsContent value="work-reports" className="m-0 space-y-5">
      {generatePanelOpen ? (
        <Suspense fallback={<div className="min-h-[50vh] bg-slate-100" />}>
          <GenerateWorkReportPanel
            key={`${panelReportIdentifier ?? generatePanelDate ?? manualCloneDraft?.date ?? panelInitialDraft?.date ?? 'new-report'}`}
            initialDate={generatePanelDate}
            initialDraft={manualCloneDraft ?? panelInitialDraft}
            readOnly={panelReadOnly}
            reportIdentifier={panelReportIdentifier}
            navigationCurrentIndex={navigationIndex}
            navigationTotalCount={navigationTotalCount}
            onNavigatePrevious={canNavigatePrevious ? () => navigateToReportByIndex(navigationIndex - 1) : undefined}
            onNavigateNext={canNavigateNext ? () => navigateToReportByIndex(navigationIndex + 1) : undefined}
            saving={generatePanelSaving}
            tenantId={panel.tenantId}
            works={sortedWorks.map((work) => ({ id: String(work.id), number: work.number, name: work.name }))}
            onBack={() => {
              setGeneratePanelOpen(false);
              setActiveReport(null);
              setManualCloneDraft(null);
              setOpenedReportId(null);
              setReportNavigationIds([]);
            }}
            onSave={handleSaveGeneratedWorkReport}
          />
        </Suspense>
      ) : (
        <>
          <div className="text-center space-y-1">
            <h2 className="text-xl font-semibold text-slate-900 sm:text-3xl">Partes de trabajo</h2>
            <p className="text-[15px] text-muted-foreground">Gestiona tus partes diarios</p>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <Card className="border-emerald-200 bg-emerald-50/60">
              <CardContent className="p-2.5">
                <div className="flex min-h-[74px] flex-col items-center justify-center gap-1.5 text-center">
                  <div className="rounded-full bg-emerald-100 p-1.5 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                  <div className="text-[15px] sm:text-base font-medium text-emerald-800">Completados</div>
                  <div className="text-xl font-semibold text-emerald-700">{workReportsSummary.completed}</div>
                  <Badge
                    variant="outline"
                    className="border-emerald-300 bg-emerald-100 text-xs sm:text-sm text-emerald-700"
                  >
                    {workReportsSummary.completedPctTotal}% Total
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/60">
              <CardContent className="p-2.5">
                <div className="flex min-h-[74px] flex-col items-center justify-center gap-1.5 text-center">
                  <div className="rounded-full bg-amber-100 p-1.5 text-amber-600">
                    <Clock3 className="h-3.5 w-3.5" />
                  </div>
                  <div className="text-[15px] sm:text-base font-medium text-amber-800">Pendientes</div>
                  <div className="text-xl font-semibold text-amber-700">{workReportsSummary.pending}</div>
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-100 text-xs sm:text-sm text-amber-700"
                  >
                    {workReportsSummary.pending > 0 ? 'Por completar' : 'Sin pendientes'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50/60">
              <CardContent className="p-2.5">
                <div className="flex min-h-[74px] flex-col items-center justify-center gap-1.5 text-center">
                  <div className="rounded-full bg-blue-100 p-1.5 text-blue-600">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </div>
                  <div className="text-[15px] sm:text-base font-medium text-blue-800">Aprobados</div>
                  <div className="text-xl font-semibold text-blue-700">{workReportsSummary.approved}</div>
                  <Badge
                    variant="outline"
                    className="border-blue-300 bg-blue-100 text-xs sm:text-sm text-blue-700"
                  >
                    {workReportsSummary.approvedPctCompleted}% de completados
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className={connectionPanelClass}>
              <CardContent className="p-2.5">
                <div className="flex min-h-[74px] flex-col items-center justify-center gap-1.5 text-center">
                  <div className={`rounded-full p-1.5 ${connectionIconBubbleClass}`}>
                    {isSyncOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  </div>
                  <div className={`text-[15px] sm:text-base font-medium ${connectionTitleClass}`}>
                    Estado de conexion
                  </div>
                  <div aria-hidden className="invisible select-none text-xl font-semibold leading-tight">
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
              <AlertDescription>Esperando contexto de tenant para habilitar el mÃ³dulo offline.</AlertDescription>
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
                    <div className="grid grid-cols-[88px_1fr_88px] items-start">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveToolsTab('parts')}
                        className="mt-0.5 h-8 w-[88px] justify-start px-2 text-slate-600 hover:text-slate-900"
                      >
                        <ChevronLeft className="mr-1 h-5 w-5" strokeWidth={3} />
                        Volver
                      </Button>
                      <div className="space-y-1 text-center">
                        <CardTitle>Historial de partes</CardTitle>
                        <CardDescription>Busqueda y filtros de partes guardados.</CardDescription>
                      </div>
                      <div aria-hidden className="h-8 w-[88px]" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {historyDataPending ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        Cargando historial completo...
                      </div>
                    ) : history ? (
                      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
                        <HistoryReportsPanel {...history} onDeleteReport={setReportToDelete} isSuperAdmin={isSuperAdmin} onReopenReport={reopenReport} />
                      </Suspense>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Historial no disponible en esta vista.
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : activeToolsTab !== 'parts' ? (
                historyDataPending ? (
                  <Card className="bg-white">
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                      Cargando historial completo...
                    </CardContent>
                  </Card>
                ) : (
                <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando herramientas...</div>}>
                  <LazyToolsPanelContent
                    activeToolsTab={activeToolsTab}
                    workReports={reportsForSummary}
                    tenantUnavailable={tenantUnavailable}
                    summaryReportAnalysisOpen={summaryReportAnalysisOpen}
                    summaryReportViewMode={summaryReportViewMode}
                    onSummaryReportViewModeChange={setSummaryReportViewMode}
                    onSummaryReportAnalysisOpenChange={setSummaryReportAnalysisOpen}
                    onOpenMetrics={() => setMetricsOpen(true)}
                    onOpenExistingReport={openExistingReportWithContext}
                    onPending={handlePending}
                    onDataChanged={reloadWorkReports}
                    onBackToParts={() => {
                      if (activeToolsTab === 'summary-report' && summaryReportAnalysisOpen) {
                        setSummaryReportAnalysisOpen(false);
                        return;
                      }
                      setActiveToolsTab('parts');
                    }}
                  />
                </Suspense>
                )
              ) : (
                <PartsTabContent
                  tenantResolving={tenantResolving}
                  tenantNeedsPicker={tenantNeedsPicker}
                  tenantUnavailable={tenantUnavailable}
                  tenantErrorMessage={tenantErrorMessage}
                  workReportsLoading={workReportsLoading}
                  workReports={workReports}
                  allWorkReports={allWorkReports}
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
                  onOpenExistingReport={openExistingReportWithContext}
                  onDeleteReport={setReportToDelete}
                  isSuperAdmin={isSuperAdmin}
                  onReopenReport={reopenReport}
                />
              )}
            </div>
          </div>

          <AlertDialog
            open={Boolean(reportToDelete)}
            onOpenChange={(open) => {
              if (!open && !deletingReport) {
                setReportToDelete(null);
              }
            }}
          >
              <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar parte de forma permanente?</AlertDialogTitle>
                <AlertDialogDescription>
                  ¿Deseas eliminar de forma permanente este parte? Esta accion lo elimina tambien de base de datos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletingReport}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    void handleConfirmDeleteReport();
                  }}
                  disabled={deletingReport}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deletingReport ? 'Eliminando...' : 'Aceptar'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </TabsContent>
  );
};
