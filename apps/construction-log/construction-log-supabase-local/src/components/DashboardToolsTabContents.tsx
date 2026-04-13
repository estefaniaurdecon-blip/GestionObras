import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CirclePlus, ClipboardList, CloudUpload, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorkReport } from '@/offline-db/types';
import { useToast } from '@/hooks/use-toast';
import { PartsGroupsBrowser } from './tools-panel/parts-tab/PartsGroupsBrowser';
import { exportGroupedReportsExcel } from './tools-panel/parts-tab/exportExcel';
import {
  canExportGroupedReports,
  EMPTY_WORK_REPORTS,
  getRecentReports,
  groupReportsByForeman,
  groupReportsByMonth,
  groupReportsByWeek,
  PARTS_GROUPS_PAGE_SIZE,
  PARTS_REPORTS_PAGE_SIZE,
  type PartsExcelPeriod,
  type PartsGroupedReports,
  type PartsGroupMode,
} from './tools-panel/parts-tab/shared';

export { ToolsPanelContent } from './DashboardToolsPanelContent';
export type { ToolsPanelContentProps } from './DashboardToolsPanelContent';

type SyncSummary = {
  total: number;
  synced: number;
  pendingSync: number;
  errorSync: number;
  pendingTotal: number;
};

export type SummaryReportViewMode = 'generate' | 'analysis';

type BaseToolsProps = {
  tenantUnavailable: boolean;
  onPending: (featureName: string) => void;
};

export type OpenExistingReportOptions = {
  navigationReportIds?: string[];
  returnToSummaryAnalysis?: boolean;
};

export type PartsTabContentProps = BaseToolsProps & {
  tenantResolving: boolean;
  tenantNeedsPicker: boolean;
  tenantErrorMessage: string;
  workReportsLoading: boolean;
  workReports: WorkReport[];
  allWorkReports: WorkReport[];
  workReportVisibleDays: number;
  syncing: boolean;
  canCreateWorkReport: boolean;
  workReportsReadOnlyByRole: boolean;
  hasSyncPendingValidation: boolean;
  syncSummary: SyncSummary;
  syncPanelClass: string;
  syncHeadlineClass: string;
  onSyncNow: () => Promise<void>;
  onGenerateWorkReport: () => void;
  onCloneFromHistoryDialog: (report: WorkReport) => void;
  onOpenExistingReport: (report: WorkReport, options?: OpenExistingReportOptions) => void;
  onDeleteReport: (report: WorkReport) => void;
};

export const PartsTabContent = ({
  tenantResolving,
  tenantNeedsPicker,
  tenantUnavailable,
  tenantErrorMessage,
  workReportsLoading,
  workReports,
  workReportVisibleDays,
  syncing,
  canCreateWorkReport,
  workReportsReadOnlyByRole,
  hasSyncPendingValidation,
  syncSummary,
  syncPanelClass,
  syncHeadlineClass,
  onSyncNow,
  onGenerateWorkReport,
  onCloneFromHistoryDialog,
  onOpenExistingReport,
  onDeleteReport,
}: PartsTabContentProps) => {
  const { toast } = useToast();
  const isAndroidPlatform = Capacitor.getPlatform() === 'android';
  const generatePartButtonClass = isAndroidPlatform
    ? 'h-11 w-[158px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[16px] font-semibold text-cyan-700 hover:bg-cyan-50 hover:text-cyan-800'
    : 'h-10 w-[148px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[15px] font-semibold text-cyan-700 hover:bg-cyan-50 hover:text-cyan-800';
  const partsHeaderRowClass = isAndroidPlatform
    ? 'flex flex-col gap-3 sm:grid sm:grid-cols-[158px_1fr_158px] sm:items-center'
    : 'flex flex-col gap-3 sm:grid sm:grid-cols-[148px_1fr_148px] sm:items-center';
  const reportNameClass = isAndroidPlatform
    ? 'text-[19px] font-semibold text-slate-900 truncate leading-snug'
    : 'text-[17px] font-medium text-slate-900 truncate';
  const reportDetailClass = isAndroidPlatform
    ? 'text-[16px] text-muted-foreground leading-snug'
    : 'text-[15px] text-muted-foreground';
  const unsyncedReportsCount = useMemo(
    () => workReports.filter((report) => report.syncStatus !== 'synced').length,
    [workReports],
  );
  const reportsForGrouping = useDeferredValue(workReports);
  const [partsGroupMode, setPartsGroupMode] = useState<PartsGroupMode>('foreman');
  const [showPartsFilters, setShowPartsFilters] = useState(false);
  const [selectedPartsGroupKey, setSelectedPartsGroupKey] = useState('');
  const [openPartsGroupKey, setOpenPartsGroupKey] = useState('');
  const [visiblePartsGroupCount, setVisiblePartsGroupCount] = useState(PARTS_GROUPS_PAGE_SIZE);
  const [visibleReportsByGroup, setVisibleReportsByGroup] = useState<Record<string, number>>({});
  const [excelExportingPeriod, setExcelExportingPeriod] = useState<PartsExcelPeriod | null>(null);

  const foremanGroups = useMemo(() => groupReportsByForeman(reportsForGrouping), [reportsForGrouping]);
  const weeklyGroups = useMemo(() => groupReportsByWeek(reportsForGrouping), [reportsForGrouping]);
  const monthlyGroups = useMemo(() => groupReportsByMonth(reportsForGrouping), [reportsForGrouping]);

  const activePartsGroups = useMemo<PartsGroupedReports[]>(() => {
    if (partsGroupMode === 'weekly') return weeklyGroups;
    if (partsGroupMode === 'monthly') return monthlyGroups;
    return foremanGroups;
  }, [foremanGroups, monthlyGroups, partsGroupMode, weeklyGroups]);

  useEffect(() => {
    setOpenPartsGroupKey('');
  }, [partsGroupMode]);

  useEffect(() => {
    setVisiblePartsGroupCount(PARTS_GROUPS_PAGE_SIZE);
    setVisibleReportsByGroup({});
  }, [activePartsGroups.length, partsGroupMode]);

  useEffect(() => {
    if (selectedPartsGroupKey.length === 0) return;
    if (!activePartsGroups.some((group) => group.key === selectedPartsGroupKey)) {
      setSelectedPartsGroupKey('');
    }
  }, [activePartsGroups, selectedPartsGroupKey]);

  const selectedPartsGroup = useMemo(
    () => activePartsGroups.find((group) => group.key === selectedPartsGroupKey) ?? null,
    [activePartsGroups, selectedPartsGroupKey],
  );
  const visiblePartsGroups = useMemo(
    () => activePartsGroups.slice(0, visiblePartsGroupCount),
    [activePartsGroups, visiblePartsGroupCount],
  );
  const hiddenPartsGroupsCount = Math.max(activePartsGroups.length - visiblePartsGroupCount, 0);
  const selectedPartsGroupReports = selectedPartsGroup?.reports ?? EMPTY_WORK_REPORTS;
  const recentReportsDefault = useMemo(() => getRecentReports(reportsForGrouping), [reportsForGrouping]);
  const recentNavigationIds = useMemo(() => recentReportsDefault.map((report) => report.id), [recentReportsDefault]);
  const canExportWeekly = canExportGroupedReports(partsGroupMode, 'weekly', selectedPartsGroupReports);
  const canExportMonthly = canExportGroupedReports(partsGroupMode, 'monthly', selectedPartsGroupReports);

  const closePartsFilters = () => {
    setShowPartsFilters(false);
    setSelectedPartsGroupKey('');
    setOpenPartsGroupKey('');
  };

  const handleTogglePartsFilters = () => {
    if (showPartsFilters) {
      closePartsFilters();
      return;
    }
    setShowPartsFilters(true);
  };

  const handleTogglePartsGroupSelection = (groupKey: string) => {
    if (selectedPartsGroupKey === groupKey) {
      closePartsFilters();
      return;
    }
    setSelectedPartsGroupKey(groupKey);
  };

  const handleExport = async (period: PartsExcelPeriod) => {
    const reportsToExport = selectedPartsGroupReports;
    const canExport = period === 'weekly' ? canExportWeekly : canExportMonthly;

    if (!canExport || reportsToExport.length === 0) {
      toast({
        title: 'Seleccion requerida',
        description:
          partsGroupMode === 'weekly'
            ? 'Selecciona primero una semana para exportar su Excel semanal.'
            : partsGroupMode === 'monthly'
              ? 'Selecciona primero un mes para exportar su Excel mensual.'
              : 'Selecciona un encargado para exportar.',
        variant: 'destructive',
      });
      return;
    }

    setExcelExportingPeriod(period);
    try {
      const description = await exportGroupedReportsExcel({
        period,
        partsGroupMode,
        selectedPartsGroup,
        reportsToExport,
      });
      toast({
        title: 'Excel generado',
        description,
      });
    } catch (error) {
      console.error('[PartsTabContent] Error generando Excel agrupado:', error);
      toast({
        title: 'Error al exportar',
        description: 'No se pudo generar el Excel del grupo seleccionado.',
        variant: 'destructive',
      });
    } finally {
      setExcelExportingPeriod(null);
    }
  };

  const handleOpenPartsGroupChange = (groupKey: string) => {
    setOpenPartsGroupKey(groupKey);
    if (!groupKey) return;
    setVisibleReportsByGroup((current) => ({
      ...current,
      [groupKey]: current[groupKey] ?? PARTS_REPORTS_PAGE_SIZE,
    }));
  };

  const handleShowMoreReports = (groupKey: string, totalReports: number) => {
    setVisibleReportsByGroup((current) => ({
      ...current,
      [groupKey]: Math.min((current[groupKey] ?? PARTS_REPORTS_PAGE_SIZE) + PARTS_REPORTS_PAGE_SIZE, totalReports),
    }));
  };

  if (workReports.length === 0) {
    return (
      <div className="space-y-2">
        <Card className="bg-white">
          <CardHeader className="space-y-3">
            <div className={partsHeaderRowClass}>
              <div className="flex items-center justify-start sm:justify-self-start">
                <Button
                  className={generatePartButtonClass}
                  disabled={!canCreateWorkReport}
                  onClick={onGenerateWorkReport}
                >
                  <CirclePlus className={isAndroidPlatform ? 'h-5 w-5' : 'h-[18px] w-[18px]'} />
                  Generar parte
                </Button>
              </div>
              <div className="text-center sm:justify-self-center">
                <CardTitle>Partes recientes</CardTitle>
                <CardDescription className="text-[15px] sm:text-base">
                  {tenantResolving
                    ? 'Resolviendo tenant...'
                    : tenantNeedsPicker
                      ? 'Selecciona un tenant activo para cargar los partes offline.'
                      : tenantUnavailable
                        ? tenantErrorMessage
                        : workReportsLoading
                          ? 'Cargando partes locales...'
                          : `No hay partes de trabajo en los ultimos ${workReportVisibleDays} dias`}
                </CardDescription>
              </div>
              <div className="flex items-center justify-end sm:justify-self-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5 text-[14px] text-slate-600 hover:bg-slate-100"
                  disabled
                >
                  <Search className="h-4 w-4" />
                  Filtrar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <ClipboardList className="h-12 w-12 text-slate-400" />
            <p className="max-w-md text-center text-[15px] text-muted-foreground sm:text-base">
              No hay partes creados en los ultimos {workReportVisibleDays} dias. Puedes crear uno nuevo o sincronizar.
            </p>
            <Button variant="outline" disabled={syncing || tenantUnavailable} onClick={() => void onSyncNow()}>
              <CloudUpload className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              Sincronizar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Card className="bg-white">
        <CardHeader className="space-y-3">
          <div className={partsHeaderRowClass}>
            <div className="flex items-center justify-start sm:justify-self-start">
              <Button
                className={generatePartButtonClass}
                disabled={!canCreateWorkReport}
                onClick={onGenerateWorkReport}
              >
                <CirclePlus className={isAndroidPlatform ? 'h-5 w-5' : 'h-[18px] w-[18px]'} />
                Generar parte
              </Button>
            </div>

            <div className="text-center sm:justify-self-center">
              <CardTitle>Partes recientes</CardTitle>
              <CardDescription className="text-[15px] sm:text-base">
                {tenantResolving
                  ? 'Resolviendo tenant...'
                  : tenantNeedsPicker
                    ? 'Selecciona un tenant activo para cargar los partes offline.'
                    : tenantUnavailable
                      ? tenantErrorMessage
                      : workReportsLoading
                        ? 'Cargando partes locales...'
                        : unsyncedReportsCount > 0
                          ? `Mostrando ultimos ${workReportVisibleDays} dias + ${unsyncedReportsCount} sin sincronizar`
                          : `Mostrando partes de los ultimos ${workReportVisibleDays} dias`}
              </CardDescription>
            </div>

            <div className="flex items-center justify-end sm:justify-self-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-8 gap-1.5 px-2.5 text-[14px] ${
                  showPartsFilters
                    ? 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={handleTogglePartsFilters}
              >
                <Search className="h-4 w-4" />
                Filtrar
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className={`rounded-md border p-3 ${syncPanelClass}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className={`text-[17px] font-medium ${syncHeadlineClass}`}>
                  {hasSyncPendingValidation ? 'Partes pendientes de sincronizar' : 'Todos los partes estan sincronizados'}
                </div>
                <div className="text-[15px] text-muted-foreground">
                  {hasSyncPendingValidation
                    ? `Pendientes de validacion: ${syncSummary.pendingTotal}`
                    : `Sincronizados: ${syncSummary.synced}/${syncSummary.total}`}
                  {syncSummary.pendingSync > 0 ? ` - Pendientes: ${syncSummary.pendingSync}` : ''}
                  {syncSummary.errorSync > 0 ? ` - Con error: ${syncSummary.errorSync}` : ''}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-[15px]"
                onClick={() => void onSyncNow()}
                disabled={syncing || tenantUnavailable}
              >
                <CloudUpload className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                Sincronizar
              </Button>
            </div>
          </div>

          <PartsGroupsBrowser
            showPartsFilters={showPartsFilters}
            partsGroupMode={partsGroupMode}
            activePartsGroups={activePartsGroups}
            visiblePartsGroups={visiblePartsGroups}
            selectedPartsGroupKey={selectedPartsGroupKey}
            openPartsGroupKey={openPartsGroupKey}
            visibleReportsByGroup={visibleReportsByGroup}
            hiddenPartsGroupsCount={hiddenPartsGroupsCount}
            recentReports={recentReportsDefault}
            recentNavigationIds={recentNavigationIds}
            excelExportingPeriod={excelExportingPeriod}
            canExportWeekly={canExportWeekly}
            canExportMonthly={canExportMonthly}
            reportNameClass={reportNameClass}
            reportDetailClass={reportDetailClass}
            tenantUnavailable={tenantUnavailable}
            workReportsReadOnlyByRole={workReportsReadOnlyByRole}
            onPartsGroupModeChange={setPartsGroupMode}
            onExport={(period) => void handleExport(period)}
            onTogglePartsGroupSelection={handleTogglePartsGroupSelection}
            onOpenPartsGroupChange={handleOpenPartsGroupChange}
            onShowMoreReports={handleShowMoreReports}
            onShowMoreGroups={() =>
              setVisiblePartsGroupCount((current) => Math.min(current + PARTS_GROUPS_PAGE_SIZE, activePartsGroups.length))
            }
            onCloneFromHistoryDialog={onCloneFromHistoryDialog}
            onOpenExistingReport={onOpenExistingReport}
            onDeleteReport={onDeleteReport}
          />
        </CardContent>
      </Card>
    </div>
  );
};
