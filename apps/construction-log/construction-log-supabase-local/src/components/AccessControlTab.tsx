import { useEffect, useMemo, useState, type ChangeEvent, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TabsContent } from '@/components/ui/tabs';
import { AccessControlGenerateReportDialog } from '@/components/AccessControlGenerateReportDialog';
import {
  AccessControlCustomPeriodDialog,
  AccessControlSinglePeriodDialog,
} from '@/components/AccessControlReportPeriodDialogs';
import { AccessControlReportsList } from '@/components/AccessControlReportsList';
import type { AccessReport } from '@/types/accessControl';
import { startupPerfPoint } from '@/utils/startupPerf';
import { HISTORY_FILTER_OPTIONS, type HistoryFilterKey } from '@/pages/indexHelpers';
import { Capacitor } from '@capacitor/core';
import { FileDown, FileText, Plus, Upload } from 'lucide-react';

type AccessReportSearchFilterKey = Exclude<HistoryFilterKey, 'workName'>;
type AccessReportPeriodDialogMode = 'daily' | 'weekly' | 'monthly' | 'custom';

const ACCESS_REPORT_SEARCH_FILTER_OPTIONS = HISTORY_FILTER_OPTIONS.filter(
  (filterOption): filterOption is { key: AccessReportSearchFilterKey; label: string } => filterOption.key !== 'workName',
);
const ACCESS_REPORT_SEARCH_VALUE = '__search__';
const ACCESS_REPORT_SELECTED_VALUE = '__selected__';
const ACCESS_REPORT_SELECTED_PERIOD_VALUE = '__selected_period__';
const ACCESS_REPORT_PERIOD_LABELS: Record<AccessReportPeriodDialogMode, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  monthly: 'Mensual',
  custom: 'Personalizado',
};

const isAccessReportPeriodDialogMode = (value: string): value is AccessReportPeriodDialogMode =>
  value in ACCESS_REPORT_PERIOD_LABELS;

type AccessControlTabProps = {
  accessControlLoading: boolean;
  accessControlReports: AccessReport[];
  setAccessReportWorkFilter: (value: string) => void;
  accessReportSelectedWorks: string[];
  setAccessReportSelectedWorks: (value: string[]) => void;
  accessReportPeriodFilter: string;
  setAccessReportPeriodFilter: (value: string) => void;
  accessReportSelectedDateKeys: string[];
  setAccessReportSelectedDateKeys: (value: string[]) => void;
  accessReportPeriodSelectionLabel: string;
  setAccessReportPeriodSelectionLabel: (value: string) => void;
  accessReportEnabledFilters: AccessReportSearchFilterKey[];
  accessReportSelectedFiltersCount: number;
  accessReportAppliedFiltersCount: number;
  accessResponsibleFilter: string;
  setAccessResponsibleFilter: (value: string) => void;
  accessWeekFilter: string;
  setAccessWeekFilter: (value: string) => void;
  accessMonthFilter: string;
  setAccessMonthFilter: (value: string) => void;
  accessDateFilter: string;
  setAccessDateFilter: (value: string) => void;
  accessDatePickerOpen: boolean;
  setAccessDatePickerOpen: (value: boolean) => void;
  selectedAccessReportDate: Date | null;
  filteredAccessControlReportsForGenerate: AccessReport[];
  accessImportInputRef: RefObject<HTMLInputElement | null>;
  handleNewAccessControlRecord: () => void;
  handleEditAccessControlReport: (report: AccessReport) => void;
  handleCloneAccessControlReport: (report: AccessReport) => Promise<void> | void;
  deleteAccessControlReport: (id: string) => Promise<void> | void;
  bulkDeleteAccessControlReports: (ids: string[]) => Promise<void> | void;
  handleExportAccessControlData: () => Promise<void> | void;
  handleAccessDataFileSelected: (event: ChangeEvent<HTMLInputElement>) => Promise<void> | void;
  handleGenerateAccessControlReport: () => void;
  toggleAccessReportFilter: (filterKey: AccessReportSearchFilterKey) => void;
  clearAccessReportFilters: () => void;
};

export const AccessControlTab = ({
  accessControlLoading,
  accessControlReports,
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
  accessImportInputRef,
  handleNewAccessControlRecord,
  handleEditAccessControlReport,
  handleCloneAccessControlReport,
  deleteAccessControlReport,
  bulkDeleteAccessControlReports,
  handleExportAccessControlData,
  handleAccessDataFileSelected,
  handleGenerateAccessControlReport,
  toggleAccessReportFilter,
  clearAccessReportFilters,
}: AccessControlTabProps) => {
  const isAndroidPlatform = Capacitor.getPlatform() === 'android';
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [dataManagementOpen, setDataManagementOpen] = useState(false);
  const [generateReportOpen, setGenerateReportOpen] = useState(false);
  const [generateReportSearchOpen, setGenerateReportSearchOpen] = useState(false);
  const [periodDialogMode, setPeriodDialogMode] = useState<AccessReportPeriodDialogMode | null>(null);
  const [draftAccessReportSelectedWorks, setDraftAccessReportSelectedWorks] = useState<string[]>([]);

  const lightButtonClass =
    'h-10 px-4 justify-center border-slate-200 bg-slate-50 text-[15px] font-medium text-slate-700 shadow-none hover:bg-slate-100 hover:text-slate-900 sm:h-11 sm:text-base';
  const primaryAccessButtonClass = isAndroidPlatform
    ? 'h-11 w-[158px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[16px] font-semibold text-cyan-700 shadow-none hover:bg-cyan-50 hover:text-cyan-800'
    : 'h-10 w-[148px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[15px] font-semibold text-cyan-700 shadow-none hover:bg-cyan-50 hover:text-cyan-800';

  useEffect(() => {
    startupPerfPoint('panel:AccessControlTab mounted');
  }, []);

  const reportSiteOptions = useMemo(() => {
    const uniqueSiteNames = Array.from(
      new Set(
        filteredAccessControlReportsForGenerate
          .map((report) => report.siteName.trim())
          .filter((siteName) => siteName.length > 0),
      ),
    );

    return uniqueSiteNames.sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));
  }, [filteredAccessControlReportsForGenerate]);

  const accessReportSelectedWorksLabel =
    accessReportSelectedWorks.length === 0
      ? 'Todas las obras'
      : accessReportSelectedWorks.length === 1
        ? accessReportSelectedWorks[0]
        : `${accessReportSelectedWorks.length} obras seleccionadas`;
  const accessReportWorkSelectValue =
    accessReportSelectedWorks.length === 0 ? 'all' : ACCESS_REPORT_SELECTED_VALUE;
  const accessReportPeriodOptionLabel =
    accessReportPeriodFilter !== 'all'
      ? accessReportPeriodSelectionLabel ||
        (isAccessReportPeriodDialogMode(accessReportPeriodFilter)
          ? ACCESS_REPORT_PERIOD_LABELS[accessReportPeriodFilter]
          : 'Todo el periodo')
      : 'Todo el periodo';
  const accessReportPeriodSelectValue =
    accessReportPeriodFilter === 'all' ? 'all' : ACCESS_REPORT_SELECTED_PERIOD_VALUE;

  const reportsForPeriodSelection = useMemo(
    () =>
      accessReportSelectedWorks.length === 0
        ? accessControlReports
        : accessControlReports.filter((report) => accessReportSelectedWorks.includes(report.siteName.trim())),
    [accessControlReports, accessReportSelectedWorks],
  );

  const handleAccessReportWorkFilterChange = (value: string) => {
    if (value === ACCESS_REPORT_SEARCH_VALUE) {
      setDraftAccessReportSelectedWorks(accessReportSelectedWorks);
      setGenerateReportSearchOpen(true);
      return;
    }
    if (value === ACCESS_REPORT_SELECTED_VALUE) return;
    if (value === 'all') {
      setAccessReportSelectedWorks([]);
      setAccessReportWorkFilter('all');
    }
  };

  const toggleDraftSelectedWork = (siteName: string) => {
    setDraftAccessReportSelectedWorks((current) =>
      current.includes(siteName) ? current.filter((item) => item !== siteName) : [...current, siteName],
    );
  };

  const applyDraftSelectedWorks = () => {
    setAccessReportSelectedWorks(draftAccessReportSelectedWorks);
    setAccessReportWorkFilter(draftAccessReportSelectedWorks.length === 0 ? 'all' : ACCESS_REPORT_SELECTED_VALUE);
    setGenerateReportSearchOpen(false);
  };

  const handleApplyAccessReportPeriodSelection = (
    periodFilter: AccessReportPeriodDialogMode,
    dateKeys: string[],
    label: string,
  ) => {
    setAccessReportPeriodFilter(periodFilter);
    setAccessReportSelectedDateKeys(dateKeys);
    setAccessReportPeriodSelectionLabel(label);
  };

  const queuePeriodDialogOpen = (openDialog: () => void) => {
    globalThis.setTimeout(() => {
      openDialog();
    }, 0);
  };

  const closePeriodDialog = () => setPeriodDialogMode(null);

  const openPeriodDialog = (mode: AccessReportPeriodDialogMode) => {
    queuePeriodDialogOpen(() => setPeriodDialogMode(mode));
  };

  const handleAccessReportPeriodChange = (value: string) => {
    if (value === ACCESS_REPORT_SELECTED_PERIOD_VALUE) return;
    if (value === 'all') {
      setAccessReportPeriodFilter('all');
      setAccessReportSelectedDateKeys([]);
      setAccessReportPeriodSelectionLabel('');
      return;
    }
    if (value === 'daily') {
      openPeriodDialog('daily');
      return;
    }
    if (value === 'weekly') {
      openPeriodDialog('weekly');
      return;
    }
    if (value === 'monthly') {
      openPeriodDialog('monthly');
      return;
    }
    if (value === 'custom') {
      openPeriodDialog('custom');
    }
  };

  const handleGenerateReportOpenChange = (open: boolean) => {
    setGenerateReportOpen(open);
    if (!open) {
      setGenerateReportSearchOpen(false);
      closePeriodDialog();
    }
  };

  const toggleReportSelection = (reportId: string) => {
    setSelectedReports((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  };

  const toggleSiteSelection = (reportIds: string[], allSelected: boolean) => {
    setSelectedReports((prev) => {
      const next = new Set(prev);
      reportIds.forEach((id) => {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedReports.size === 0) return;
    void bulkDeleteAccessControlReports(Array.from(selectedReports));
    setSelectedReports(new Set());
    setSelectionMode(false);
  };

  const cancelSelection = () => {
    setSelectedReports(new Set());
    setSelectionMode(false);
  };

  return (
    <TabsContent value="access-control" className="m-0 space-y-5 text-[15px]">
      <Card className="bg-white">
        <CardHeader className="items-center space-y-2 text-center">
          <CardTitle className="text-xl font-semibold text-slate-900 sm:text-3xl">Control de accesos</CardTitle>
          <CardDescription className="text-[15px] text-muted-foreground">Supervisión de obra</CardDescription>
          <div className="mt-2 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
            <Button
              variant="outline"
              className={`w-full sm:w-auto ${primaryAccessButtonClass}`}
              onClick={handleNewAccessControlRecord}
            >
              <Plus className={isAndroidPlatform ? 'mr-2 h-5 w-5' : 'mr-2 h-[18px] w-[18px]'} />
              Nuevo registro
            </Button>
            <Button
              variant="outline"
              className={`w-full sm:w-auto ${lightButtonClass}`}
              onClick={() => setDataManagementOpen(true)}
            >
              <FileDown className="mr-2 h-4 w-4" />
              Gestión de datos
            </Button>
            <Button
              variant="outline"
              className={`w-full sm:w-auto ${lightButtonClass}`}
              onClick={() => setGenerateReportOpen(true)}
            >
              <FileText className="mr-2 h-4 w-4" />
              Generar informe
            </Button>
          </div>
        </CardHeader>
      </Card>

      <input
        ref={accessImportInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          void handleAccessDataFileSelected(event);
        }}
      />

      <AccessControlReportsList
        accessControlLoading={accessControlLoading}
        accessControlReports={accessControlReports}
        selectionMode={selectionMode}
        selectedReports={selectedReports}
        lightButtonClass={lightButtonClass}
        onEnterSelectionMode={() => setSelectionMode(true)}
        onCancelSelection={cancelSelection}
        onBulkDelete={handleBulkDelete}
        onToggleReportSelection={toggleReportSelection}
        onToggleSiteSelection={toggleSiteSelection}
        onCloneReport={handleCloneAccessControlReport}
        onEditReport={handleEditAccessControlReport}
        onDeleteReport={deleteAccessControlReport}
      />

      <Dialog open={dataManagementOpen} onOpenChange={setDataManagementOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-2xl">
          <DialogHeader className="text-center">
            <DialogTitle>Gestión de datos</DialogTitle>
            <DialogDescription>
              Guarda todos tus partes en un archivo o carga datos guardados previamente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                void handleExportAccessControlData();
              }}
              className={`w-full sm:w-auto ${lightButtonClass}`}
            >
              <FileDown className="mr-2 h-4 w-4" />
              Guardar datos
            </Button>
            <Button
              variant="outline"
              onClick={() => accessImportInputRef.current?.click()}
              className={`w-full sm:w-auto ${lightButtonClass}`}
            >
              <Upload className="mr-2 h-4 w-4" />
              Cargar datos
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AccessControlGenerateReportDialog
        open={generateReportOpen}
        onOpenChange={handleGenerateReportOpenChange}
        searchOpen={generateReportSearchOpen}
        reportSiteOptions={reportSiteOptions}
        accessReportSelectedWorks={accessReportSelectedWorks}
        accessReportSelectedWorksLabel={accessReportSelectedWorksLabel}
        accessReportWorkSelectValue={accessReportWorkSelectValue}
        accessReportPeriodFilter={accessReportPeriodFilter}
        accessReportPeriodOptionLabel={accessReportPeriodOptionLabel}
        accessReportPeriodSelectValue={accessReportPeriodSelectValue}
        accessReportPeriodSelectionLabel={accessReportPeriodSelectionLabel}
        accessReportSelectedDateKeys={accessReportSelectedDateKeys}
        accessReportEnabledFilters={accessReportEnabledFilters}
        accessReportSelectedFiltersCount={accessReportSelectedFiltersCount}
        accessReportAppliedFiltersCount={accessReportAppliedFiltersCount}
        accessResponsibleFilter={accessResponsibleFilter}
        accessWeekFilter={accessWeekFilter}
        accessMonthFilter={accessMonthFilter}
        accessDateFilter={accessDateFilter}
        accessDatePickerOpen={accessDatePickerOpen}
        selectedAccessReportDate={selectedAccessReportDate}
        filteredAccessControlReportsForGenerate={filteredAccessControlReportsForGenerate}
        searchFilterOptions={ACCESS_REPORT_SEARCH_FILTER_OPTIONS}
        draftAccessReportSelectedWorks={draftAccessReportSelectedWorks}
        lightButtonClass={lightButtonClass}
        onWorkFilterChange={handleAccessReportWorkFilterChange}
        onPeriodChange={handleAccessReportPeriodChange}
        onToggleSearchFilter={toggleAccessReportFilter}
        onResponsibleFilterChange={setAccessResponsibleFilter}
        onWeekFilterChange={setAccessWeekFilter}
        onMonthFilterChange={setAccessMonthFilter}
        onDateFilterChange={setAccessDateFilter}
        onDatePickerOpenChange={setAccessDatePickerOpen}
        onClearSearchFilters={clearAccessReportFilters}
        onToggleDraftSelectedWork={toggleDraftSelectedWork}
        onClearDraftSelectedWorks={() => setDraftAccessReportSelectedWorks([])}
        onApplySelectedWorks={applyDraftSelectedWorks}
        onGenerateReport={handleGenerateAccessControlReport}
      />

      <AccessControlSinglePeriodDialog
        open={periodDialogMode === 'daily'}
        onOpenChange={(open) => {
          if (!open) closePeriodDialog();
        }}
        mode="day"
        reports={reportsForPeriodSelection}
        applyButtonClassName={lightButtonClass}
        onApply={(dateKeys, label) => handleApplyAccessReportPeriodSelection('daily', dateKeys, label)}
      />

      <AccessControlSinglePeriodDialog
        open={periodDialogMode === 'weekly'}
        onOpenChange={(open) => {
          if (!open) closePeriodDialog();
        }}
        mode="week"
        reports={reportsForPeriodSelection}
        applyButtonClassName={lightButtonClass}
        onApply={(dateKeys, label) => handleApplyAccessReportPeriodSelection('weekly', dateKeys, label)}
      />

      <AccessControlSinglePeriodDialog
        open={periodDialogMode === 'monthly'}
        onOpenChange={(open) => {
          if (!open) closePeriodDialog();
        }}
        mode="month"
        reports={reportsForPeriodSelection}
        applyButtonClassName={lightButtonClass}
        onApply={(dateKeys, label) => handleApplyAccessReportPeriodSelection('monthly', dateKeys, label)}
      />

      <AccessControlCustomPeriodDialog
        open={periodDialogMode === 'custom'}
        onOpenChange={(open) => {
          if (!open) closePeriodDialog();
        }}
        reports={reportsForPeriodSelection}
        applyButtonClassName={lightButtonClass}
        onApply={(dateKeys, label) => handleApplyAccessReportPeriodSelection('custom', dateKeys, label)}
      />
    </TabsContent>
  );
};
