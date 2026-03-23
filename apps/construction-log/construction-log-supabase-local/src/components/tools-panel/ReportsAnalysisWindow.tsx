import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { PeriodHoursChart } from '@/components/PeriodHoursChart';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { WorkReport } from '@/offline-db/types';
import { useToast } from '@/hooks/use-toast';
import {
  formatDateLabel,
  toDateKey,
} from '@/hooks/useWorkReportExportPeriodSelection';
import {
  asRecord,
  payloadBoolean,
  payloadNumber,
  payloadText,
} from '@/pages/indexHelpers';
import {
  EMPTY_WORK_SEARCH_FILTERS,
  filterReportsByWorkFilters,
  groupReportsByWork,
  normalizeWorkSearchFilters,
  type GroupedWorkReports,
  type WorkSearchFilters,
} from '@/components/reportsAnalysisWorkGrouping';
import {
  format,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { OpenExistingReportOptions, SummaryReportViewMode } from '@/components/DashboardToolsTabContents';
import {
  Brain,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Euro,
  Eye,
  FileText,
  Loader2,
  Search,
  Truck,
} from 'lucide-react';
import {
  firstFiniteNumber,
  parseDateKey,
  parseReportDateValue,
  pickCostReference,
  safeArray,
  safeNumber,
  safeText,
} from '@/utils/valueNormalization';
import {
  buildExportWorkReport,
} from '@/services/workReportExportDomain';
import {
  downloadExportFiles,
  getExportDirectoryLabel,
} from '@/services/workReportExportInfrastructure';
import {
  AnalysisMetricCard,
  type AnalysisPeriod,
  type AnalysisRow,
  type AnalysisTabValue,
  type MachineryAnalysisEntry,
  type WorkerAnalysisEntry,
  WORKER_ROWS_PAGE_SIZE,
  applyWorksheetCenterAlignment,
  createDefaultWorkSearchFilters,
  isDateWithinPeriod,
  sanitizeWorkbookSegment,
} from './analysisTypes';
import { normalizePersonDisplayName, uniqueStrings } from './toolsPanelShared';
import { getOfflineReportDateKey } from '@/services/workReportExportDomain';

export const ReportsAnalysisWindow = ({
  reports,
  tenantUnavailable,
  onPending,
  onOpenExistingReport,
  mode,
}: {
  reports: WorkReport[];
  tenantUnavailable: boolean;
  onPending: (featureName: string) => void;
  onOpenExistingReport: (report: WorkReport, options?: OpenExistingReportOptions) => void;
  mode: SummaryReportViewMode;
}) => {
  const { toast } = useToast();
  const isAdvancedMode = mode === 'analysis';
  const [selectedPeriod, setSelectedPeriod] = useState<AnalysisPeriod>('all');
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<AnalysisTabValue>(
    mode === 'analysis' ? 'foreman' : 'reports',
  );
  const [workerRowsPage, setWorkerRowsPage] = useState(0);
  const [workDatePickerOpen, setWorkDatePickerOpen] = useState(false);
  const [exportingGroupKey, setExportingGroupKey] = useState<string | null>(null);
  const [draftWorkSearchFilters, setDraftWorkSearchFilters] = useState<WorkSearchFilters>(
    createDefaultWorkSearchFilters,
  );
  const [appliedWorkSearchFilters, setAppliedWorkSearchFilters] = useState<WorkSearchFilters | null>(
    createDefaultWorkSearchFilters,
  );
  const [workSearchValidationMessage, setWorkSearchValidationMessage] = useState<string | null>(null);
  const [workSearchHasExecuted, setWorkSearchHasExecuted] = useState(true);
  const selectedWorkSearchDate = useMemo(
    () => parseDateKey(draftWorkSearchFilters.reportDate),
    [draftWorkSearchFilters.reportDate],
  );

  useEffect(() => {
    setActiveAnalysisTab(isAdvancedMode ? 'foreman' : 'reports');
  }, [isAdvancedMode]);

  const analysisRows = useMemo<AnalysisRow[]>(() => {
    return reports.map((report) => {
      const payload = asRecord(report.payload) ?? {};
      const exportReport = buildExportWorkReport(report);
      const dateKey = getOfflineReportDateKey(report);
      const parsedDate = parseReportDateValue(dateKey);
      const reportIdentifier = payloadText(report.payload, 'reportIdentifier') ?? report.id.slice(0, 8);
      const statusText = String(report.status ?? '').toLowerCase();
      const isClosed =
        (payloadBoolean(report.payload, 'isClosed') ?? false) ||
        statusText === 'completed' ||
        statusText === 'closed';
      const foremanDisplayName =
        normalizePersonDisplayName(
          payloadText(report.payload, 'mainForeman') ??
            payloadText(report.payload, 'foreman') ??
            safeText(exportReport.foreman, 'Sin encargado'),
        ) || 'Sin encargado';

      const workerEntries = exportReport.workGroups.flatMap((group, groupIndex) =>
        group.items
          .map((item, itemIndex) => {
            const name = safeText(item.name).trim();
            const company = safeText(group.company, 'Sin empresa').trim();
            const hours = safeNumber(item.hours, safeNumber(item.total));
            if (name.length === 0 && hours <= 0) return null;
            return {
              id: `${report.id}-worker-${groupIndex}-${itemIndex}`,
              company: company.length > 0 ? company : 'Sin empresa',
              name: name.length > 0 ? name : 'Sin nombre',
              hours,
            };
          })
          .filter((entry): entry is WorkerAnalysisEntry => entry !== null),
      );

      const machineryEntries = exportReport.machineryGroups.flatMap((group, groupIndex) =>
        group.items
          .map((item, itemIndex) => {
            const type = safeText(item.type).trim();
            const company = safeText(group.company, 'Sin empresa').trim();
            const hours = safeNumber(item.hours, safeNumber(item.total));
            if (type.length === 0 && hours <= 0) return null;
            return {
              id: `${report.id}-machinery-${groupIndex}-${itemIndex}`,
              company: company.length > 0 ? company : 'Sin empresa',
              type: type.length > 0 ? type : 'Sin tipo',
              hours,
            };
          })
          .filter((entry): entry is MachineryAnalysisEntry => entry !== null),
      );

      const rentalRows = [...safeArray(payload.rentalMachineryRows), ...safeArray(payload.rentalMachinesSnapshot)];
      const rentalProviders = uniqueStrings(
        rentalRows
          .map((rawRow) => {
            const row = asRecord(rawRow);
            if (!row) return '';
            return safeText(row.provider, safeText(row.supplier, safeText(row.company)));
          })
          .filter((provider) => provider.trim().length > 0),
      );

      const foremanEntriesHours = safeArray(payload.foremanEntries).reduce((sum, rawEntry) => {
        const entry = asRecord(rawEntry);
        if (!entry) return sum;
        const role = safeText(entry.role).trim().toLowerCase();
        if (role !== 'encargado') return sum;
        return sum + safeNumber(entry.hours);
      }, 0);
      const workersHours = workerEntries.reduce((sum, entry) => sum + entry.hours, 0);
      const machineryHours = machineryEntries.reduce((sum, entry) => sum + entry.hours, 0);
      const legacyForemanHours = firstFiniteNumber(payload.foremanHours);
      const totalHoursInPayload = firstFiniteNumber(payload.totalHours);
      const legacyLooksLikeTotalHours =
        typeof legacyForemanHours === 'number' &&
        typeof totalHoursInPayload === 'number' &&
        Math.abs(legacyForemanHours - totalHoursInPayload) < 0.01 &&
        (workersHours > 0 || machineryHours > 0);
      const foremanHours =
        firstFiniteNumber(payload.mainForemanHours) ??
        (foremanEntriesHours > 0 ? foremanEntriesHours : null) ??
        (typeof legacyForemanHours === 'number' && !legacyLooksLikeTotalHours ? legacyForemanHours : null) ??
        0;
      const totalHours = safeNumber(payload.totalHours, foremanHours);
      const materialsCostFromReport = exportReport.materialGroups.reduce(
        (sum, group) =>
          sum +
          group.items.reduce(
            (groupSum, item) =>
              groupSum + safeNumber(item.total, safeNumber(item.quantity) * safeNumber(item.unitPrice)),
            0,
          ),
        0,
      );
      const totalCost =
        materialsCostFromReport > 0
          ? materialsCostFromReport
          : pickCostReference(
              payload.materialTotal,
              payload.materialTotals,
              payload.materialsTotal,
              payload.materialCost,
              payload.materialsCost,
              payload.materialCostTotal,
              payload.materialTotalCost,
              payload.totalCost,
              payload.totalCostAmount,
              payload.costTotal,
            );

      return {
        id: report.id,
        sourceReport: report,
        workNumber: exportReport.workNumber || '',
        workId: exportReport.workId ?? '',
        workName: exportReport.workName || report.title || 'Sin obra',
        reportTitle: report.title ?? exportReport.workName,
        reportIdentifier,
        date: parsedDate,
        dateKey,
        isClosed,
        foremanDisplayName,
        foremanHours,
        totalHours,
        totalCost,
        rentalProviders,
        workerEntries,
        machineryEntries,
      };
    });
  }, [reports]);

  const updateDraftWorkSearchFilter = <K extends keyof WorkSearchFilters>(
    key: K,
    value: WorkSearchFilters[K],
  ) => {
    setDraftWorkSearchFilters((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleSearchReports = () => {
    const normalizedFilters = normalizeWorkSearchFilters({
      ...draftWorkSearchFilters,
      includeAllWorks: true,
    });
    setWorkSearchValidationMessage(null);
    setWorkSearchHasExecuted(true);
    setAppliedWorkSearchFilters(normalizedFilters);
  };

  const handleClearSearch = () => {
    const clearedFilters = createDefaultWorkSearchFilters();
    setDraftWorkSearchFilters(clearedFilters);
    setAppliedWorkSearchFilters(clearedFilters);
    setWorkSearchHasExecuted(true);
    setWorkSearchValidationMessage(null);
    setWorkDatePickerOpen(false);
    setSelectedPeriod('all');
  };

  const rowsWithinPeriod = useMemo(
    () => analysisRows.filter((row) => isDateWithinPeriod(row.date, selectedPeriod)),
    [analysisRows, selectedPeriod],
  );

  const filteredRows = useMemo(() => {
    const effectiveFilters = appliedWorkSearchFilters ?? createDefaultWorkSearchFilters();
    return filterReportsByWorkFilters(rowsWithinPeriod, effectiveFilters);
  }, [appliedWorkSearchFilters, rowsWithinPeriod]);

  const groupedFilteredRows = useMemo(() => groupReportsByWork(filteredRows), [filteredRows]);

  const totals = useMemo(() => {
    const totalParts = filteredRows.length;
    const foremanHours = filteredRows.reduce((sum, row) => sum + row.foremanHours, 0);
    const totalCost = filteredRows.reduce((sum, row) => sum + row.totalCost, 0);
    const providerCount = new Set(filteredRows.flatMap((row) => row.rentalProviders)).size;
    return { totalParts, foremanHours, totalCost, providerCount };
  }, [filteredRows]);

  const foremanChartRows = useMemo(
    () =>
      filteredRows.map((row) => ({
        date: row.date,
        dateKey: row.dateKey,
        hours: row.foremanHours,
      })),
    [filteredRows],
  );

  const workerRows = useMemo(
    () =>
      filteredRows
        .flatMap((row) =>
          row.workerEntries.map((entry) => ({
            ...entry,
            reportId: row.id,
            reportIdentifier: row.reportIdentifier,
            workName: row.workName,
            date: row.date,
            dateKey: row.dateKey,
          })),
        )
        .sort(
          (left, right) =>
            right.dateKey.localeCompare(left.dateKey) ||
            left.company.localeCompare(right.company) ||
            left.name.localeCompare(right.name),
        ),
    [filteredRows],
  );

  const machineryRows = useMemo(
    () =>
      filteredRows
        .flatMap((row) =>
          row.machineryEntries.map((entry) => ({
            ...entry,
            reportId: row.id,
            reportIdentifier: row.reportIdentifier,
            workName: row.workName,
            date: row.date,
            dateKey: row.dateKey,
          })),
        )
        .sort(
          (left, right) =>
            right.dateKey.localeCompare(left.dateKey) ||
            left.company.localeCompare(right.company) ||
            left.type.localeCompare(right.type),
        ),
    [filteredRows],
  );

  const workerChartRows = useMemo(
    () =>
      workerRows.map((row) => ({
        date: row.date,
        dateKey: row.dateKey,
        hours: row.hours,
      })),
    [workerRows],
  );

  const workerRowsPageCount = useMemo(
    () => Math.max(1, Math.ceil(workerRows.length / WORKER_ROWS_PAGE_SIZE)),
    [workerRows.length],
  );

  useEffect(() => {
    setWorkerRowsPage((previous) => Math.min(previous, workerRowsPageCount - 1));
  }, [workerRowsPageCount]);

  useEffect(() => {
    setWorkerRowsPage(0);
  }, [appliedWorkSearchFilters, selectedPeriod]);

  const paginatedWorkerRows = useMemo(() => {
    const startIndex = workerRowsPage * WORKER_ROWS_PAGE_SIZE;
    return workerRows.slice(startIndex, startIndex + WORKER_ROWS_PAGE_SIZE);
  }, [workerRows, workerRowsPage]);

  const workerRowsPageStart = workerRows.length === 0 ? 0 : workerRowsPage * WORKER_ROWS_PAGE_SIZE + 1;
  const workerRowsPageEnd = Math.min((workerRowsPage + 1) * WORKER_ROWS_PAGE_SIZE, workerRows.length);
  const canGoWorkerRowsPrevious = workerRowsPage > 0;
  const canGoWorkerRowsNext = workerRowsPage < workerRowsPageCount - 1;

  const machineryChartRows = useMemo(
    () =>
      machineryRows.map((row) => ({
        date: row.date,
        dateKey: row.dateKey,
        hours: row.hours,
      })),
    [machineryRows],
  );

  const workerSummary = useMemo(() => {
    const totalHours = workerRows.reduce((sum, row) => sum + row.hours, 0);
    const uniqueWorkers = new Set(
      workerRows.map((row) => `${row.company.toLowerCase()}::${row.name.toLowerCase()}`),
    ).size;
    return { totalHours, uniqueWorkers };
  }, [workerRows]);

  const machinerySummary = useMemo(() => {
    const totalHours = machineryRows.reduce((sum, row) => sum + row.hours, 0);
    const uniqueMachines = new Set(
      machineryRows.map((row) => `${row.company.toLowerCase()}::${row.type.toLowerCase()}`),
    ).size;
    return { totalHours, uniqueMachines };
  }, [machineryRows]);

  const sortedFilteredRows = useMemo(
    () =>
      [...filteredRows].sort((left, right) => {
        const leftStamp = parseReportDateValue(left.dateKey)?.getTime() ?? 0;
        const rightStamp = parseReportDateValue(right.dateKey)?.getTime() ?? 0;
        return rightStamp - leftStamp || right.id.localeCompare(left.id);
      }),
    [filteredRows],
  );
  const filteredNavigationReportIds = useMemo(
    () => sortedFilteredRows.map((row) => row.sourceReport.id),
    [sortedFilteredRows],
  );

  const handleExportWorkGroupExcel = async (group: GroupedWorkReports<AnalysisRow>) => {
    if (tenantUnavailable || exportingGroupKey !== null) return;
    setExportingGroupKey(group.groupKey);

    try {
      const XLSX = await import('xlsx-js-style');
      const workbook = XLSX.utils.book_new();
      const rows = [...group.reports].sort((left, right) => {
        const leftStamp = parseReportDateValue(left.dateKey)?.getTime() ?? 0;
        const rightStamp = parseReportDateValue(right.dateKey)?.getTime() ?? 0;
        return rightStamp - leftStamp || right.id.localeCompare(left.id);
      });
      const providerMap = new Map<string, number>();
      rows.forEach((row) => {
        uniqueStrings(row.rentalProviders.map((provider) => provider.trim()).filter(Boolean)).forEach((provider) => {
          providerMap.set(provider, (providerMap.get(provider) ?? 0) + 1);
        });
      });

      const summarySheet = XLSX.utils.json_to_sheet([
        {
          'Numero de obra': group.displayWorkNumber,
          'Nombre de obra': group.displayWorkName,
          'Total partes': rows.length,
          'Horas encargado': Number(rows.reduce((sum, row) => sum + row.foremanHours, 0).toFixed(2)),
          'Horas totales': Number(rows.reduce((sum, row) => sum + row.totalHours, 0).toFixed(2)),
          'Costo total (EUR)': Number(rows.reduce((sum, row) => sum + row.totalCost, 0).toFixed(2)),
          'Proveedores alquiler': providerMap.size,
        },
      ]);
      summarySheet['!cols'] = [
        { wch: 18 },
        { wch: 28 },
        { wch: 12 },
        { wch: 16 },
        { wch: 14 },
        { wch: 16 },
        { wch: 20 },
      ];
      applyWorksheetCenterAlignment(summarySheet as Record<string, unknown>, XLSX);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

      const partsSheet = XLSX.utils.json_to_sheet(
        rows.map((row) => ({
          Fecha: row.dateKey,
          Parte: row.reportIdentifier,
          Obra: row.workName,
          Encargado: row.foremanDisplayName,
          Estado: row.isClosed ? 'Cerrado' : 'Abierto',
          'Horas encargado': Number(row.foremanHours.toFixed(2)),
          'Horas totales': Number(row.totalHours.toFixed(2)),
          'Costo total (EUR)': Number(row.totalCost.toFixed(2)),
          'Proveedores alquiler': row.rentalProviders.length > 0 ? row.rentalProviders.join(', ') : 'Sin proveedores',
        })),
      );
      partsSheet['!cols'] = [
        { wch: 12 },
        { wch: 20 },
        { wch: 24 },
        { wch: 20 },
        { wch: 12 },
        { wch: 15 },
        { wch: 14 },
        { wch: 16 },
        { wch: 38 },
      ];
      applyWorksheetCenterAlignment(partsSheet as Record<string, unknown>, XLSX);
      XLSX.utils.book_append_sheet(workbook, partsSheet, 'Partes');

      const workersRows = rows.flatMap((row) =>
        row.workerEntries.map((worker) => ({
          Fecha: row.dateKey,
          Parte: row.reportIdentifier,
          Empresa: worker.company,
          Trabajador: worker.name,
          Horas: Number(worker.hours.toFixed(2)),
        })),
      );
      if (workersRows.length > 0) {
        const workersSheet = XLSX.utils.json_to_sheet(workersRows);
        workersSheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 10 }];
        applyWorksheetCenterAlignment(workersSheet as Record<string, unknown>, XLSX);
        XLSX.utils.book_append_sheet(workbook, workersSheet, 'Trabajadores');
      }

      const machineryRowsForSheet = rows.flatMap((row) =>
        row.machineryEntries.map((machine) => ({
          Fecha: row.dateKey,
          Parte: row.reportIdentifier,
          Empresa: machine.company,
          Maquinaria: machine.type,
          Horas: Number(machine.hours.toFixed(2)),
        })),
      );
      if (machineryRowsForSheet.length > 0) {
        const machinerySheet = XLSX.utils.json_to_sheet(machineryRowsForSheet);
        machinerySheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 10 }];
        applyWorksheetCenterAlignment(machinerySheet as Record<string, unknown>, XLSX);
        XLSX.utils.book_append_sheet(workbook, machinerySheet, 'Maquinaria');
      }

      if (providerMap.size > 0) {
        const providerRows = [...providerMap.entries()]
          .sort(([left], [right]) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
          .map(([provider, reportsCount]) => ({
            Proveedor: provider,
            'Partes asociados': reportsCount,
          }));
        const providerSheet = XLSX.utils.json_to_sheet(providerRows);
        providerSheet['!cols'] = [{ wch: 36 }, { wch: 16 }];
        applyWorksheetCenterAlignment(providerSheet as Record<string, unknown>, XLSX);
        XLSX.utils.book_append_sheet(workbook, providerSheet, 'Proveedores alquiler');
      }

      const workbookArray = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const workbookBlob = new Blob([workbookArray], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const safeWorkNumber = sanitizeWorkbookSegment(group.displayWorkNumber);
      const safeWorkName = sanitizeWorkbookSegment(group.displayWorkName);
      const filename = `Informe_Obra_${safeWorkNumber}_${safeWorkName}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      const downloadResult = await downloadExportFiles([{ filename, blob: workbookBlob }]);
      const description = downloadResult.directory
        ? `Se guardo en ${getExportDirectoryLabel(downloadResult.directory)}.`
        : 'Se descargo el Excel correctamente.';
      toast({
        title: 'Excel generado',
        description,
      });
    } catch (error) {
      console.error('[ReportsAnalysisWindow] Error exportando informe por obra:', error);
      toast({
        title: 'Error al exportar',
        description: 'No se pudo generar el Excel de la obra seleccionada.',
        variant: 'destructive',
      });
    } finally {
      setExportingGroupKey(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="mb-5">
        <div>
          <h3 className="text-3xl font-semibold text-slate-800 sm:text-4xl">
            {isAdvancedMode ? 'Analisis de informes' : 'Generar informe resumen'}
          </h3>
          <p className="mt-1 text-[15px] text-slate-500 sm:text-[16px]">
            {isAdvancedMode
              ? 'Analisis detallado de partes de trabajo'
              : 'Filtra las obras y exporta un Excel resumido por obra.'}
          </p>
        </div>
      </div>

      <div className="mb-5 space-y-4 rounded-xl bg-slate-100 p-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="analysis-all-works"
            checked={draftWorkSearchFilters.includeAllWorks}
            onCheckedChange={(checked) => updateDraftWorkSearchFilter('includeAllWorks', checked === true)}
          />
          <label htmlFor="analysis-all-works" className="text-[15px] font-medium text-slate-700 sm:text-[16px]">
            Todas las obras
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <label
              htmlFor="analysis-work-number-filter"
              className="text-[15px] font-semibold text-slate-700 sm:text-[16px]"
            >
              Numero de obra
            </label>
            <Input
              id="analysis-work-number-filter"
              value={draftWorkSearchFilters.workNumber}
              onChange={(event) => updateDraftWorkSearchFilter('workNumber', event.target.value)}
              placeholder="Ej. 1234"
              className="h-11 text-[15px] sm:text-[16px]"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="analysis-work-name-filter"
              className="text-[15px] font-semibold text-slate-700 sm:text-[16px]"
            >
              Nombre de obra
            </label>
            <Input
              id="analysis-work-name-filter"
              value={draftWorkSearchFilters.workName}
              onChange={(event) => updateDraftWorkSearchFilter('workName', event.target.value)}
              placeholder="Ej. Torre Norte"
              className="h-11 text-[15px] sm:text-[16px]"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="analysis-report-date-filter"
              className="text-[15px] font-semibold text-slate-700 sm:text-[16px]"
            >
              Fecha del parte
            </label>
            <Popover open={workDatePickerOpen} onOpenChange={setWorkDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="analysis-report-date-filter"
                  type="button"
                  variant="outline"
                  className={`h-11 w-full justify-between text-left text-[15px] font-normal sm:text-[16px] ${
                    selectedWorkSearchDate ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {selectedWorkSearchDate
                    ? format(selectedWorkSearchDate, 'dd/MM/yyyy', { locale: es })
                    : 'Seleccionar fecha'}
                  <CalendarDays className="ml-2 h-4 w-4 shrink-0 opacity-70" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedWorkSearchDate ?? undefined}
                  onSelect={(selectedDate) => {
                    if (!selectedDate) {
                      updateDraftWorkSearchFilter('reportDate', '');
                      return;
                    }
                    updateDraftWorkSearchFilter('reportDate', toDateKey(selectedDate));
                    setWorkDatePickerOpen(false);
                  }}
                  locale={es}
                  weekStartsOn={1}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label className="text-[15px] font-semibold text-slate-700 sm:text-[16px]">Periodo</label>
            <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as AnalysisPeriod)}>
              <SelectTrigger className="h-11 text-[15px] sm:text-[16px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los datos</SelectItem>
                <SelectItem value="weekly">Esta semana</SelectItem>
                <SelectItem value="monthly">Este mes</SelectItem>
                <SelectItem value="quarterly">Ultimos 3 meses</SelectItem>
                <SelectItem value="yearly">Por año</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-11 min-w-[140px] bg-slate-700 px-4 text-[15px] text-white hover:bg-slate-800 sm:text-[16px]"
            onClick={handleSearchReports}
          >
            <Search className="mr-2 h-4 w-4" />
            Buscar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 min-w-[140px] text-[15px] sm:text-[16px]"
            onClick={handleClearSearch}
          >
            Limpiar
          </Button>
        </div>

        {workSearchValidationMessage ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {workSearchValidationMessage}
          </div>
        ) : null}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <AnalysisMetricCard icon={<FileText />} value={`${totals.totalParts}`} label="Total Partes" />
        <AnalysisMetricCard icon={<Clock3 />} value={totals.foremanHours.toFixed(1)} label="Horas Encargado" />
        <AnalysisMetricCard
          icon={<Euro />}
          value={totals.totalCost.toLocaleString('es-ES', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
          label="Costo Total"
        />
        <AnalysisMetricCard icon={<Truck />} value={`${totals.providerCount}`} label="Proveedores Alquiler" />
      </div>

      <Tabs value={activeAnalysisTab} onValueChange={(value) => setActiveAnalysisTab(value as AnalysisTabValue)}>
        <TabsList className="mb-4 h-auto w-full justify-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-2 text-slate-600">
          <TabsTrigger value="foreman" className="app-btn-soft min-w-[148px] rounded-lg border-transparent data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900">
            Encargado
          </TabsTrigger>
          <TabsTrigger value="workers" className="app-btn-soft min-w-[148px] rounded-lg border-transparent data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900">
            Trabajadores
          </TabsTrigger>
          <TabsTrigger value="machinery" className="app-btn-soft min-w-[148px] rounded-lg border-transparent data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900">
            Maquinaria
          </TabsTrigger>
          <TabsTrigger value="rental" className="app-btn-soft min-w-[148px] rounded-lg border-transparent data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900">
            Alquiler
          </TabsTrigger>
          <TabsTrigger value="reports" className="app-btn-soft min-w-[148px] rounded-lg border-transparent data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900">
            Partes/Obra
          </TabsTrigger>
          <TabsTrigger value="economic" className="app-btn-soft min-w-[148px] rounded-lg border-transparent data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900">
            Economico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="foreman">
          <Card className="border-slate-200">
            <CardHeader className="text-center">
              <CardTitle className="app-page-title">Horas del encargado por período</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <PeriodHoursChart
                title="Horas del Encargado por Periodo"
                rawRows={foremanChartRows}
                seriesType="encargado"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workers">
          <Card className="border-slate-200">
            <CardHeader className="text-center">
              <CardTitle className="app-page-title">Trabajadores por período</CardTitle>
              <CardDescription className="app-page-subtitle">
                Horas y detalle de trabajadores por empresa para los partes filtrados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-500">Trabajadores unicos</p>
                  <p className="text-2xl font-semibold text-slate-800">{workerSummary.uniqueWorkers}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-500">Horas de trabajadores</p>
                  <p className="text-2xl font-semibold text-slate-800">{workerSummary.totalHours.toFixed(1)} h</p>
                </div>
              </div>

              <PeriodHoursChart title="Trabajadores por Periodo" rawRows={workerChartRows} seriesType="trabajadores" />

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-800">Detalle de trabajadores</h3>
                {workerRows.length === 0 ? (
                  <div className="rounded-md border bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    No hay trabajadores para los filtros seleccionados.
                  </div>
                ) : (
                  <div className="overflow-auto rounded-md border">
                    <table className="w-full min-w-[620px] border-collapse text-sm">
                      <thead className="sticky top-0 bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                          <th className="px-3 py-2 text-left font-semibold">Parte</th>
                          <th className="px-3 py-2 text-left font-semibold">Empresa</th>
                          <th className="px-3 py-2 text-left font-semibold">Trabajador</th>
                          <th className="px-3 py-2 text-right font-semibold">Horas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {paginatedWorkerRows.map((row) => (
                          <tr key={row.id} className="bg-white">
                            <td className="px-3 py-2 text-slate-600">
                              {row.date ? formatDateLabel(row.date) : row.dateKey}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{row.reportIdentifier}</td>
                            <td className="px-3 py-2 text-slate-700">{row.company}</td>
                            <td className="px-3 py-2 text-slate-800">{row.name}</td>
                            <td className="px-3 py-2 text-right font-medium text-slate-800">
                              {row.hours.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center justify-between border-t bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">
                        Mostrando {workerRowsPageStart}-{workerRowsPageEnd} de {workerRows.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => setWorkerRowsPage((previous) => Math.max(0, previous - 1))}
                          disabled={!canGoWorkerRowsPrevious}
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          Anterior
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() =>
                            setWorkerRowsPage((previous) => Math.min(workerRowsPageCount - 1, previous + 1))
                          }
                          disabled={!canGoWorkerRowsNext}
                        >
                          Siguiente
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="machinery">
          <Card className="border-slate-200">
            <CardHeader className="text-center">
              <CardTitle className="app-page-title">Maquinaria por período</CardTitle>
              <CardDescription className="app-page-subtitle">
                Horas y detalle de maquinaria por empresa para los partes filtrados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-500">Maquinas unicas</p>
                  <p className="text-2xl font-semibold text-slate-800">{machinerySummary.uniqueMachines}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-500">Horas de maquinaria</p>
                  <p className="text-2xl font-semibold text-slate-800">{machinerySummary.totalHours.toFixed(1)} h</p>
                </div>
              </div>

              <PeriodHoursChart title="Maquinaria por Periodo" rawRows={machineryChartRows} seriesType="maquinaria" />

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-800">Detalle de maquinaria</h3>
                {machineryRows.length === 0 ? (
                  <div className="rounded-md border bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    No hay maquinaria para los filtros seleccionados.
                  </div>
                ) : (
                  <div className="max-h-[360px] overflow-auto rounded-md border">
                    <table className="w-full min-w-[620px] border-collapse text-sm">
                      <thead className="sticky top-0 bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                          <th className="px-3 py-2 text-left font-semibold">Parte</th>
                          <th className="px-3 py-2 text-left font-semibold">Empresa</th>
                          <th className="px-3 py-2 text-left font-semibold">Maquinaria</th>
                          <th className="px-3 py-2 text-right font-semibold">Horas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {machineryRows.map((row) => (
                          <tr key={row.id} className="bg-white">
                            <td className="px-3 py-2 text-slate-600">
                              {row.date ? formatDateLabel(row.date) : row.dateKey}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{row.reportIdentifier}</td>
                            <td className="px-3 py-2 text-slate-700">{row.company}</td>
                            <td className="px-3 py-2 text-slate-800">{row.type}</td>
                            <td className="px-3 py-2 text-right font-medium text-slate-800">
                              {row.hours.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="rental">
          <Card className="border-slate-200">
            <CardContent className="py-10 text-center text-[18px] text-slate-500 sm:text-base">
              Vista de alquiler en preparacion.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="reports">
          <Card className="border-slate-200">
            <CardHeader className="text-center">
              <CardTitle className="app-page-title">Partes por obra</CardTitle>
              <CardDescription className="app-page-subtitle">
                {isAdvancedMode
                  ? 'Haz clic en un parte para abrirlo o exporta un Excel resumido por obra.'
                  : 'Selecciona una obra y genera su Excel resumido.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!workSearchHasExecuted ? (
                <div className="rounded-md border bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  Aplica los filtros y pulsa Buscar para ver resultados.
                </div>
              ) : groupedFilteredRows.length === 0 ? (
                <div className="rounded-md border bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No hay partes para los filtros seleccionados.
                </div>
              ) : (
                <Accordion type="multiple" className="rounded-md border bg-slate-50">
                  {groupedFilteredRows.map((group) => (
                    <AccordionItem key={group.groupKey} value={group.groupKey} className="last:border-b-0">
                      <AccordionTrigger className="px-3 py-3 hover:no-underline">
                        <div className="flex w-full items-center justify-between gap-3 pr-2">
                          <span className="truncate text-base font-medium text-slate-900">
                            {group.displayWorkNumber} - {group.displayWorkName}
                          </span>
                          <Badge
                            variant="outline"
                            className="shrink-0 border-slate-300 bg-white text-slate-700"
                          >
                            {group.count}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="border-t bg-white pb-0 pt-0">
                        <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-3 py-2.5">
                          <div className="text-xs text-slate-600">
                            Horas totales: {group.reports.reduce((sum, row) => sum + row.totalHours, 0).toFixed(2)}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-[13px] sm:text-[14px]"
                            onClick={() => void handleExportWorkGroupExcel(group)}
                            disabled={tenantUnavailable || (exportingGroupKey !== null && exportingGroupKey !== group.groupKey)}
                          >
                            {exportingGroupKey === group.groupKey ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Generando...
                              </>
                            ) : (
                              <>
                                <Download className="mr-2 h-4 w-4" />
                                Exportar Excel
                              </>
                            )}
                          </Button>
                        </div>
                        <div className="divide-y">
                          {group.reports.map((row) => (
                            <button
                              key={row.id}
                              type="button"
                              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                              onClick={() =>
                                onOpenExistingReport(row.sourceReport, {
                                  navigationReportIds: filteredNavigationReportIds,
                                  returnToSummaryAnalysis: true,
                                })
                              }
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="truncate text-sm font-medium text-slate-900">
                                  Parte: {row.reportIdentifier}
                                </div>
                                <div className="text-xs text-slate-600">Fecha: {row.dateKey}</div>
                                <div className="text-xs text-slate-600">Encargado: {row.foremanDisplayName}</div>
                                <div className="text-xs text-slate-600">Horas: {row.totalHours.toFixed(2)}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={
                                    row.isClosed
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                      : 'border-amber-300 bg-amber-50 text-amber-700'
                                  }
                                >
                                  {row.isClosed ? 'Cerrado' : 'Abierto'}
                                </Badge>
                                <Eye className="h-4 w-4 text-slate-500" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="economic">
          <Card className="border-slate-200">
            <CardContent className="py-10 text-center text-[18px] text-slate-500 sm:text-base">
              Vista economica en preparacion.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-5 flex flex-wrap items-center justify-start gap-2">
        <Button
          type="button"
          className="h-11 min-w-[240px] bg-slate-700 px-4 text-[15px] text-white hover:bg-slate-800 sm:text-[16px]"
          disabled={tenantUnavailable}
        >
          <Brain className="mr-2 h-4 w-4" />
          Generar Informe Resumen IA
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-11 min-w-[220px] justify-between text-[15px] sm:text-[16px]"
              disabled={tenantUnavailable}
            >
              <span className="inline-flex items-center">
                <Download className="mr-2 h-4 w-4" />
                Exportacion Excel
              </span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[220px]">
            <DropdownMenuItem onClick={() => onPending('Excel semanal')}>Semanal</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPending('Excel mensual')}>Mensual</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPending('Excel general')}>General</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

    </div>
  );
};
