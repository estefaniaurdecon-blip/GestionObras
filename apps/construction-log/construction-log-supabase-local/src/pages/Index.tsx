import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs } from '@/components/ui/tabs';
import { IndexHeader } from '@/components/IndexHeader';
import { WorkReportsTab } from '@/components/WorkReportsTab';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveReportPanelData } from '@/hooks/useActiveReportPanelData';
import { useAccessControlManager } from '@/hooks/useAccessControlManager';
import { useAccessControlReports } from '@/hooks/useAccessControlReports';
import { useHistoryFilters } from '@/hooks/useHistoryFilters';
import { useIndexUIState } from '@/hooks/useIndexUIState';
import { useTenantGate } from '@/hooks/useTenantGate';
import { useWorkReportsLifecycle } from '@/hooks/useWorkReportsLifecycle';
import { useWorkReportMutations } from '@/hooks/useWorkReportMutations';
import { useWorkReportsSummary } from '@/hooks/useWorkReportsSummary';
import { useWorks } from '@/hooks/useWorks';
import { useAppUpdates } from '@/hooks/useAppUpdates';
import { useToast } from '@/hooks/use-toast';
import { startupPerfEnd, startupPerfPoint, startupPerfStart } from '@/utils/startupPerf';
import {
  PENDING_MIGRATION_MESSAGE,
  WORK_REPORT_VISIBLE_DAYS,
  getRoleLabel,
  isTenantAdminRole,
  normalizeRoles,
} from './indexHelpers';

const AccessControlTab = lazy(() =>
  import('@/components/AccessControlTab').then((module) => ({
    default: module.AccessControlTab,
  })),
);

const IndexSecondaryTabs = lazy(() =>
  import('@/components/IndexSecondaryTabs').then((module) => ({
    default: module.IndexSecondaryTabs,
  })),
);

const IndexDialogs = lazy(() =>
  import('@/components/IndexDialogs').then((module) => ({
    default: module.IndexDialogs,
  })),
);

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading, signOut, refreshUser } = useAuth();
  const indexFirstRenderMeasuredRef = useRef(false);
  const authReadyLoggedRef = useRef(false);

  if (!indexFirstRenderMeasuredRef.current) {
    indexFirstRenderMeasuredRef.current = true;
    startupPerfStart('index:first-render-to-commit');
    startupPerfPoint('Index first render');
  }

  const { works, loading: worksLoading, loadWorks } = useWorks();
  const {
    activeTab,
    setActiveTab,
    settingsOpen,
    setSettingsOpen,
    metricsOpen,
    setMetricsOpen,
    workReports,
    setWorkReports,
    allWorkReports,
    setAllWorkReports,
    workReportsLoading,
    setWorkReportsLoading,
    generatePanelOpen,
    setGeneratePanelOpen,
    generatePanelSaving,
    setGeneratePanelSaving,
    generatePanelDate,
    setGeneratePanelDate,
    activeReport,
    setActiveReport,
    historyOpen,
    setHistoryOpen,
    cloneDialogOpen,
    setCloneDialogOpen,
    cloneSourceReport,
    setCloneSourceReport,
    manualCloneDraft,
    setManualCloneDraft,
    pendingOverwrite,
    setPendingOverwrite,
    syncing,
    setSyncing,
  } = useIndexUIState();
  const [accessControlDataEnabled, setAccessControlDataEnabled] = useState(false);

  useEffect(() => {
    if (activeTab !== 'access-control') return;
    setAccessControlDataEnabled(true);
  }, [activeTab]);

  const {
    resolvedTenantId,
    tenantPickerOptions,
    tenantPickerSelection,
    tenantPickerLoading,
    tenantPickerSubmitting,
    tenantResolving,
    tenantResolved,
    tenantUnavailable,
    tenantNeedsPicker,
    tenantErrorMessage,
    tenantPickerErrorMessage,
    setTenantPickerSelection,
    handleRetryTenantResolution,
    handleConfirmTenantSelection,
  } = useTenantGate(user);

  const {
    reports: accessControlReports,
    loading: accessControlLoading,
    saveReport: saveAccessControlReport,
    reloadReports: reloadAccessControlReports,
  } = useAccessControlReports({ tenantId: resolvedTenantId, enabled: accessControlDataEnabled });

  const roles = useMemo(() => normalizeRoles(user?.roles), [user?.roles]);
  const permissions = useMemo(
    () =>
      Array.isArray(user?.permissions)
        ? user.permissions.map((permission) => String(permission).trim().toLowerCase())
        : [],
    [user?.permissions],
  );
  const roleName = roles[0] || '';

  // Backwards-compatible mapping:
  // - New logical roles: super_admin | tenant_admin | user
  // - Legacy roles that we map into the new behavior for UX.
  const isSuperAdmin =
    Boolean(user?.is_super_admin) || roles.includes('super_admin') || roles.includes('master');
  const isTenantAdmin = roles.some(isTenantAdminRole);

  // Per requirement: hide user management for tenant admin and user.
  // We keep it only for superadmin (system managers).
  const showUserManagementTab = isSuperAdmin;
  const showUpdatesTab = isSuperAdmin || isTenantAdmin;
  const canCreateTimeReports =
    isSuperAdmin ||
    permissions.includes('can_create_time_reports') ||
    permissions.includes('work_reports:create') ||
    permissions.includes('work_reports:write');
  const workReportsReadOnlyByRole = tenantResolved && isTenantAdmin && !canCreateTimeReports;
  const canCreateWorkReport = tenantResolved && !workReportsReadOnlyByRole;

  const roleLabel = useMemo(() => getRoleLabel(isSuperAdmin, isTenantAdmin), [isSuperAdmin, isTenantAdmin]);

  const sortedWorks = useMemo(() => {
    return [...works].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [works]);
  const {
    historyForemanFilter,
    setHistoryForemanFilter,
    historyWeekFilter,
    setHistoryWeekFilter,
    historyMonthFilter,
    setHistoryMonthFilter,
    historyWorkNameFilter,
    setHistoryWorkNameFilter,
    historyDateFilter,
    setHistoryDateFilter,
    historyDatePickerOpen,
    setHistoryDatePickerOpen,
    historyEnabledFilters,
    historySelectedFiltersCount,
    historyAppliedFiltersCount,
    selectedHistoryDate,
    filteredHistoryReports,
    toggleHistoryFilter,
    clearHistoryFilters,
  } = useHistoryFilters(allWorkReports);

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
  } = useWorkReportsSummary(workReports);
  const { updateInfo } = useAppUpdates();
  const hasPendingUpdate = showUpdatesTab && Boolean(updateInfo?.updateAvailable);

  const { panelReadOnly, panelReportIdentifier, panelInitialDraft } = useActiveReportPanelData(
    activeReport,
    workReportsReadOnlyByRole,
  );

  const {
    accessReportWorkFilter,
    setAccessReportWorkFilter,
    accessReportPeriodFilter,
    setAccessReportPeriodFilter,
    accessObservations,
    setAccessObservations,
    accessAdditionalTasks,
    setAccessAdditionalTasks,
    accessPersonalEntries,
    accessPersonalDialogOpen,
    accessPersonalForm,
    setAccessPersonalForm,
    accessImportInputRef,
    handleNewAccessControlRecord,
    handleOpenAccessPersonalDialog,
    handleCancelAccessPersonalDialog,
    handleAccessPersonalDialogOpenChange,
    handleSaveAccessPersonal,
    handleSaveAccessControl,
    handleExportAccessControlData,
    handleAccessDataFileSelected,
    handleGenerateAccessControlReport,
  } = useAccessControlManager({
    sortedWorks,
    resolvedTenantId,
    accessControlReports,
    saveAccessControlReport,
    reloadAccessControlReports,
    user,
  });

  const handlePending = (featureName: string) => {
    toast({
      title: 'Pendiente de migracion',
      description: `${featureName}: ${PENDING_MIGRATION_MESSAGE}`,
      variant: 'default',
    });
  };

  const { loadWorkReports, handleSyncNow } = useWorkReportsLifecycle({
    user,
    resolvedTenantId,
    tenantResolved,
    tenantUnavailable,
    tenantErrorMessage,
    workReportsLength: workReports.length,
    workReportsLoading,
    syncing,
    setWorkReports,
    setAllWorkReports,
    setWorkReportsLoading,
    setSyncing,
  });

  const {
    openGenerateWorkReport,
    openExistingReport,
    openHistoryReport,
    openCloneFromHistoryDialog,
    handleDeleteWorkReportPermanently,
    handleCloneFromHistory,
    handleSaveGeneratedWorkReport,
    handleConfirmOverwrite,
  } = useWorkReportMutations({
    user,
    resolvedTenantId,
    tenantUnavailable,
    tenantErrorMessage,
    workReportsReadOnlyByRole,
    cloneSourceReport,
    pendingOverwrite,
    loadWorkReports,
    setGeneratePanelOpen,
    setGeneratePanelSaving,
    setGeneratePanelDate,
    setActiveReport,
    setHistoryOpen,
    setCloneDialogOpen,
    setCloneSourceReport,
    setManualCloneDraft,
    setPendingOverwrite,
    setWorkReportsLoading,
  });

  useEffect(() => {
    startupPerfEnd('index:first-render-to-commit');
    startupPerfPoint('Index mounted');
  }, []);

  useEffect(() => {
    if (authLoading || !user || authReadyLoggedRef.current) return;
    authReadyLoggedRef.current = true;
    startupPerfPoint('Index auth/usuario resuelto');
  }, [authLoading, user]);

  useEffect(() => {
    if (!tenantUnavailable) return;
    setGeneratePanelOpen(false);
    setActiveReport(null);
    setPendingOverwrite(null);
  }, [setActiveReport, setGeneratePanelOpen, setPendingOverwrite, tenantUnavailable]);

  const shouldRenderAccessControlTab = activeTab === 'access-control';
  const shouldRenderSecondaryTabs =
    activeTab === 'works' ||
    activeTab === 'economics' ||
    activeTab === 'help';
  const shouldRenderDialogs =
    settingsOpen ||
    metricsOpen ||
    accessPersonalDialogOpen ||
    historyOpen ||
    cloneDialogOpen ||
    Boolean(pendingOverwrite);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <IndexHeader
          roleLabel={roleLabel}
          userEmail={user.email}
          roleName={roleName}
          worksLoading={worksLoading}
          syncing={syncing}
          tenantUnavailable={tenantUnavailable}
          tenantErrorMessage={tenantErrorMessage}
          hasPendingUpdate={hasPendingUpdate}
          onReloadWorks={loadWorks}
          onSyncNow={handleSyncNow}
          onOpenSettings={() => setSettingsOpen(true)}
          onSignOut={signOut}
        />

        <main className="w-full px-2 sm:px-4 lg:px-6 py-5 sm:py-7">
          <WorkReportsTab
            panel={{
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
            }}
            summary={{
              workReportsSummary,
              syncSummary,
              hasSyncPendingValidation,
              syncPanelClass,
              syncTitleClass,
              syncHeadlineClass,
              syncBadgeClass,
              syncIconBubbleClass,
              syncStatusBadgeLabel,
            }}
            tenant={{
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
            }}
            reports={{
              workReportsLoading,
              workReports,
              allWorkReports,
              workReportVisibleDays: WORK_REPORT_VISIBLE_DAYS,
              syncing,
              workReportsReadOnlyByRole,
            }}
            actions={{
              handleSyncNow,
              reloadWorkReports: loadWorkReports,
              openGenerateWorkReport,
              setMetricsOpen,
              handlePending,
              openCloneFromHistoryDialog,
              openExistingReport,
              deleteWorkReportPermanently: handleDeleteWorkReportPermanently,
            }}
            history={{
              historyEnabledFilters,
              toggleHistoryFilter,
              historySelectedFiltersCount,
              historyForemanFilter,
              setHistoryForemanFilter,
              historyWeekFilter,
              setHistoryWeekFilter,
              historyMonthFilter,
              setHistoryMonthFilter,
              historyWorkNameFilter,
              setHistoryWorkNameFilter,
              historyDateFilter,
              setHistoryDateFilter,
              historyDatePickerOpen,
              setHistoryDatePickerOpen,
              selectedHistoryDate,
              allWorkReports,
              filteredHistoryReports,
              historyAppliedFiltersCount,
              clearHistoryFilters,
              tenantUnavailable,
              workReportsReadOnlyByRole,
              onPending: handlePending,
              onOpenCloneFromHistoryDialog: openCloneFromHistoryDialog,
              onOpenHistoryReport: openHistoryReport,
            }}
          />

          {shouldRenderAccessControlTab ? (
            <Suspense fallback={<div className="min-h-[30vh] bg-slate-100" />}>
              <AccessControlTab
                accessControlLoading={accessControlLoading}
                accessControlReports={accessControlReports}
                accessReportWorkFilter={accessReportWorkFilter}
                setAccessReportWorkFilter={setAccessReportWorkFilter}
                accessReportPeriodFilter={accessReportPeriodFilter}
                setAccessReportPeriodFilter={setAccessReportPeriodFilter}
                sortedWorks={sortedWorks}
                accessImportInputRef={accessImportInputRef}
                handleNewAccessControlRecord={handleNewAccessControlRecord}
                handleExportAccessControlData={handleExportAccessControlData}
                handleAccessDataFileSelected={handleAccessDataFileSelected}
                handleGenerateAccessControlReport={handleGenerateAccessControlReport}
                accessPersonalEntries={accessPersonalEntries}
                handleOpenAccessPersonalDialog={handleOpenAccessPersonalDialog}
                handlePending={handlePending}
                accessObservations={accessObservations}
                setAccessObservations={setAccessObservations}
                accessAdditionalTasks={accessAdditionalTasks}
                setAccessAdditionalTasks={setAccessAdditionalTasks}
                handleSaveAccessControl={handleSaveAccessControl}
              />
            </Suspense>
          ) : null}

          {shouldRenderSecondaryTabs ? (
            <Suspense fallback={<div className="min-h-[30vh] bg-slate-100" />}>
              <IndexSecondaryTabs
                sortedWorks={sortedWorks}
                worksLoading={worksLoading}
                onOpenProjects={() => navigate('/projects')}
                onReloadWorks={loadWorks}
              />
            </Suspense>
          ) : null}
        </main>
        {shouldRenderDialogs ? (
          <Suspense fallback={null}>
            <IndexDialogs
              settings={{
                open: settingsOpen,
                setOpen: setSettingsOpen,
                user,
                onProfileUpdated: refreshUser,
                showUserManagementTab,
                showUpdatesTab,
                hasPendingUpdate,
              }}
              metrics={{
                open: metricsOpen,
                setOpen: setMetricsOpen,
                workReports: allWorkReports,
              }}
              accessPersonal={{
                open: accessPersonalDialogOpen,
                onOpenChange: handleAccessPersonalDialogOpenChange,
                form: accessPersonalForm,
                setForm: setAccessPersonalForm,
                onSave: handleSaveAccessPersonal,
                onCancel: handleCancelAccessPersonalDialog,
              }}
              history={{
                open: historyOpen,
                onOpenChange: setHistoryOpen,
                historyEnabledFilters,
                toggleHistoryFilter,
                historySelectedFiltersCount,
                historyForemanFilter,
                setHistoryForemanFilter,
                historyWeekFilter,
                setHistoryWeekFilter,
                historyMonthFilter,
                setHistoryMonthFilter,
                historyWorkNameFilter,
                setHistoryWorkNameFilter,
                historyDateFilter,
                setHistoryDateFilter,
                historyDatePickerOpen,
                setHistoryDatePickerOpen,
                selectedHistoryDate,
                allWorkReports,
                filteredHistoryReports,
                historyAppliedFiltersCount,
                clearHistoryFilters,
                tenantUnavailable,
                workReportsReadOnlyByRole,
                onPending: handlePending,
                onOpenCloneFromHistoryDialog: openCloneFromHistoryDialog,
                onOpenHistoryReport: openHistoryReport,
              }}
              clone={{
                open: cloneDialogOpen,
                setOpen: setCloneDialogOpen,
                sourceReport: cloneSourceReport,
                setSourceReport: setCloneSourceReport,
                onConfirm: handleCloneFromHistory,
              }}
              overwrite={{
                pendingOverwrite,
                setPendingOverwrite,
                generatePanelSaving,
                onConfirmOverwrite: handleConfirmOverwrite,
              }}
            />
          </Suspense>
        ) : null}
      </Tabs>
    </div>
  );
};

export default Index;

