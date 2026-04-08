import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AccessControlForm } from '@/components/AccessControlForm';
import { Tabs } from '@/components/ui/tabs';
import { IndexHeader } from '@/components/IndexHeader';
import { WorkReportsTab } from '@/components/WorkReportsTab';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveReportPanelData } from '@/hooks/useActiveReportPanelData';
import { useAccessControl } from '@/hooks/useAccessControl';
import { useHistoryFilters } from '@/hooks/useHistoryFilters';
import { useIndexUIState } from '@/hooks/useIndexUIState';
import { useTenantGate } from '@/hooks/useTenantGate';
import { useWorkReportsLifecycle } from '@/hooks/useWorkReportsLifecycle';
import { useWorkReportMutations } from '@/hooks/useWorkReportMutations';
import { useWorkReportsSummary } from '@/hooks/useWorkReportsSummary';
import { useWorks } from '@/hooks/useWorks';
import { useAppUpdates } from '@/hooks/useAppUpdates';
import { useToast } from '@/hooks/use-toast';
import { getCanonicalUserRoleLabel, getUserPrimaryCanonicalRole } from '@/lib/userRoles';
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

const ChatCenter = lazy(() =>
  import('@/components/ChatCenter').then((module) => ({
    default: module.ChatCenter,
  })),
);

const ChatBubble = lazy(() =>
  import('@/components/ChatBubble').then((module) => ({
    default: module.ChatBubble,
  })),
);

const Index = () => {
  const navigate = useNavigate();
  const { search } = useLocation();
  const initialWorkId = useMemo(() => new URLSearchParams(search).get('workId') ?? undefined, [search]);
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
    allWorkReportsLoaded,
    setAllWorkReportsLoaded,
    allWorkReportsLoading: allReportsBackgroundLoading,
    setAllWorkReportsLoading,
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

  useEffect(() => {
    if (initialWorkId) setActiveTab('works');
  }, [initialWorkId]);

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

  const roles = useMemo(() => normalizeRoles(user?.roles), [user?.roles]);
  const permissions = useMemo(
    () =>
      Array.isArray(user?.permissions)
        ? user.permissions.map((permission) => String(permission).trim().toLowerCase())
        : [],
    [user?.permissions],
  );
  const roleName = useMemo(
    () =>
      getCanonicalUserRoleLabel(
        getUserPrimaryCanonicalRole({
          isSuperAdmin: user?.is_super_admin,
          roles,
          roleName: user?.role_name,
        }),
      ),
    [roles, user?.is_super_admin, user?.role_name],
  );

  // Backwards-compatible mapping:
  // - New logical roles: super_admin | tenant_admin | user
  // - Legacy roles that we map into the new behavior for UX.
  const isSuperAdmin =
    Boolean(user?.is_super_admin) || roles.includes('super_admin') || roles.includes('master');
  const isTenantAdmin = roles.some(isTenantAdminRole);

  // Super admins and tenant admins can both manage users.
  // Tenant admins stay scoped to their own tenant.
  const showUserManagementTab = isSuperAdmin || isTenantAdmin;
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
    accessControlReports,
    accessControlLoading,
    deleteAccessControlReport,
    bulkDeleteAccessControlReports,
    activeAccessControlReport,
    setAccessReportWorkFilter,
    accessReportSelectedWorks,
    setAccessReportSelectedWorks,
    accessReportPeriodFilter,
    setAccessReportPeriodFilter,
    accessReportSelectedDateKeys,
    setAccessReportSelectedDateKeys,
    accessReportPeriodSelectionLabel,
    setAccessReportPeriodSelectionLabel,
    accessReportEnabledFilters,
    accessReportSelectedFiltersCount,
    accessReportAppliedFiltersCount,
    accessResponsibleFilter,
    setAccessResponsibleFilter,
    accessWeekFilter,
    setAccessWeekFilter,
    accessMonthFilter,
    setAccessMonthFilter,
    accessDateFilter,
    setAccessDateFilter,
    accessDatePickerOpen,
    setAccessDatePickerOpen,
    selectedAccessReportDate,
    filteredAccessControlReportsForGenerate,
    accessPersonalDialogOpen,
    accessControlFormOpen,
    accessPersonalForm,
    setAccessPersonalForm,
    accessImportInputRef,
    handleNewAccessControlRecord,
    handleEditAccessControlReport,
    handleCloneAccessControlReport,
    handleCloseAccessControlForm,
    handleSaveAccessControlForm,
    handleOpenAccessPersonalDialog,
    handleCancelAccessPersonalDialog,
    handleAccessPersonalDialogOpenChange,
    handleSaveAccessPersonal,
    handleExportAccessControlData,
    handleAccessDataFileSelected,
    handleGenerateAccessControlReport,
    toggleAccessReportFilter,
    clearAccessReportFilters,
  } = useAccessControl({ sortedWorks, resolvedTenantId, enabled: accessControlDataEnabled, user });

  const handlePending = (featureName: string) => {
    toast({
      title: 'Pendiente de migracion',
      description: `${featureName}: ${PENDING_MIGRATION_MESSAGE}`,
      variant: 'default',
    });
  };

  const { loadWorkReports, ensureAllWorkReportsLoaded, handleSyncNow } = useWorkReportsLifecycle({
    user,
    resolvedTenantId,
    tenantResolved,
    tenantUnavailable,
    tenantErrorMessage,
    allWorkReportsLoaded,
    allWorkReportsLoading: allReportsBackgroundLoading,
    workReportsLength: workReports.length,
    workReportsLoading,
    syncing,
    setWorkReports,
    setAllWorkReports,
    setAllWorkReportsLoaded,
    setAllWorkReportsLoading,
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
  const reportsForExpandedViews = allWorkReports.length > 0 ? allWorkReports : workReports;

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
              tenantId: resolvedTenantId,
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
              allWorkReportsLoaded,
              allWorkReportsLoading: allReportsBackgroundLoading,
              workReportVisibleDays: WORK_REPORT_VISIBLE_DAYS,
              syncing,
              workReportsReadOnlyByRole,
            }}
            actions={{
              handleSyncNow,
              reloadWorkReports: loadWorkReports,
              ensureAllWorkReportsLoaded,
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
              {accessControlFormOpen ? (
                <div className="mx-auto w-full max-w-7xl">
                  <AccessControlForm
                    report={activeAccessControlReport ?? undefined}
                    allReports={accessControlReports}
                    onSave={handleSaveAccessControlForm}
                    onBack={handleCloseAccessControlForm}
                    onSaved={handleCloseAccessControlForm}
                  />
                </div>
              ) : (
                <AccessControlTab
                  accessControlLoading={accessControlLoading}
                  accessControlReports={accessControlReports}
                  setAccessReportWorkFilter={setAccessReportWorkFilter}
                  accessReportSelectedWorks={accessReportSelectedWorks}
                  setAccessReportSelectedWorks={setAccessReportSelectedWorks}
                  accessReportPeriodFilter={accessReportPeriodFilter}
                  setAccessReportPeriodFilter={setAccessReportPeriodFilter}
                  accessReportSelectedDateKeys={accessReportSelectedDateKeys}
                  setAccessReportSelectedDateKeys={setAccessReportSelectedDateKeys}
                  accessReportPeriodSelectionLabel={accessReportPeriodSelectionLabel}
                  setAccessReportPeriodSelectionLabel={setAccessReportPeriodSelectionLabel}
                  accessReportEnabledFilters={accessReportEnabledFilters}
                  accessReportSelectedFiltersCount={accessReportSelectedFiltersCount}
                  accessReportAppliedFiltersCount={accessReportAppliedFiltersCount}
                  accessResponsibleFilter={accessResponsibleFilter}
                  setAccessResponsibleFilter={setAccessResponsibleFilter}
                  accessWeekFilter={accessWeekFilter}
                  setAccessWeekFilter={setAccessWeekFilter}
                  accessMonthFilter={accessMonthFilter}
                  setAccessMonthFilter={setAccessMonthFilter}
                  accessDateFilter={accessDateFilter}
                  setAccessDateFilter={setAccessDateFilter}
                  accessDatePickerOpen={accessDatePickerOpen}
                  setAccessDatePickerOpen={setAccessDatePickerOpen}
                  selectedAccessReportDate={selectedAccessReportDate}
                  filteredAccessControlReportsForGenerate={filteredAccessControlReportsForGenerate}
                  accessImportInputRef={accessImportInputRef}
                  handleNewAccessControlRecord={handleNewAccessControlRecord}
                  handleEditAccessControlReport={handleEditAccessControlReport}
                  handleCloneAccessControlReport={handleCloneAccessControlReport}
                  deleteAccessControlReport={deleteAccessControlReport}
                  bulkDeleteAccessControlReports={bulkDeleteAccessControlReports}
                  handleExportAccessControlData={handleExportAccessControlData}
                  handleAccessDataFileSelected={handleAccessDataFileSelected}
                  handleGenerateAccessControlReport={handleGenerateAccessControlReport}
                  toggleAccessReportFilter={toggleAccessReportFilter}
                  clearAccessReportFilters={clearAccessReportFilters}
                />
              )}
            </Suspense>
          ) : null}

          {shouldRenderSecondaryTabs ? (
            <Suspense fallback={<div className="min-h-[30vh] bg-slate-100" />}>
              <IndexSecondaryTabs
                sortedWorks={sortedWorks}
                worksLoading={worksLoading}
                economicSourceReports={reportsForExpandedViews}
                economicReportsLoaded={allWorkReportsLoaded}
                economicReportsLoading={allReportsBackgroundLoading}
                onOpenProjects={() => navigate('/projects')}
                onReloadWorks={loadWorks}
                initialWorkId={initialWorkId}
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
                workReports: reportsForExpandedViews,
                allWorkReportsLoaded,
                allWorkReportsLoading: allReportsBackgroundLoading,
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
                allWorkReports: reportsForExpandedViews,
                allWorkReportsLoaded,
                allWorkReportsLoading: allReportsBackgroundLoading,
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

      {tenantResolved ? (
        <>
          <Suspense fallback={null}>
            <ChatBubble />
          </Suspense>
          <Suspense fallback={null}>
            <ChatCenter />
          </Suspense>

        </>
      ) : null}
    </div>
  );
};

export default Index;
