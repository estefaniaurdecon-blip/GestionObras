import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PeriodHoursChart } from '@/components/PeriodHoursChart';
import type { WorkReport } from '@/offline-db/types';
import { useToast } from '@/hooks/use-toast';
import {
  downloadExportFiles,
  getExportDirectoryLabel,
} from '@/services/workReportExportInfrastructure';
import {
  buildExportWorkReport,
  getOfflineReportDateKey,
} from '@/services/workReportExportDomain';
import {
  asRecord,
  payloadBoolean,
  payloadNumber,
  payloadText,
} from '@/pages/indexHelpers';
import {
  format,
  endOfWeek,
  isAfter,
  isBefore,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ChevronDown,
  CirclePlus,
  ClipboardList,
  CloudUpload,
  Copy,
  Download,
  Eye,
  Loader2,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';

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

const EMPTY_WORK_REPORTS: WorkReport[] = [];

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

const parseDateKey = (value: string): Date | null => {
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }
  return parsed;
};

const parseReportDateValue = (value: string): Date | null => {
  const fromDateKey = parseDateKey(value);
  if (fromDateKey) return fromDateKey;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const safeText = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const safeNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const safeArray = (value: unknown) => (Array.isArray(value) ? value : []);
const firstFiniteNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};
const pickCostReference = (...values: unknown[]) => {
  const finiteValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  const firstPositive = finiteValues.find((value) => value > 0);
  if (typeof firstPositive === 'number') return firstPositive;
  return finiteValues[0] ?? 0;
};

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter((value) => value.length > 0)));
const PARTS_GROUPS_PAGE_SIZE = 20;
const PARTS_REPORTS_PAGE_SIZE = 50;

const sanitizeWorkbookSegment = (value: string) => {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();
  return cleaned.length > 0 ? cleaned : 'sin_valor';
};

type WorksheetCellStyle = {
  alignment?: {
    horizontal?: string;
    vertical?: string;
    wrapText?: boolean;
  };
};

type WorksheetCell = {
  s?: WorksheetCellStyle;
};

const applyWorksheetCenterAlignment = (
  worksheet: Record<string, unknown>,
  XLSX: typeof import('xlsx-js-style'),
) => {
  const range = XLSX.utils.decode_range(typeof worksheet['!ref'] === 'string' ? worksheet['!ref'] : 'A1');
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[address] as WorksheetCell | undefined;
      if (!cell || typeof cell !== 'object') continue;
      cell.s ??= {};
      cell.s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
    }
  }
};
type PartsGroupMode = 'foreman' | 'weekly' | 'monthly';

type PartsGroupedReports = {
  key: string;
  label: string;
  reports: WorkReport[];
  sortStamp: number;
};

export const PartsTabContent = ({
  tenantResolving,
  tenantNeedsPicker,
  tenantUnavailable,
  tenantErrorMessage,
  workReportsLoading,
  workReports,
  allWorkReports,
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
  onPending,
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
  // La vista principal no necesita recorrer todo el histórico completo.
  // Usamos solo el subconjunto visible/de trabajo y lo diferimos para no bloquear el primer render.
  const reportsForGrouping = useDeferredValue(workReports);
  const [partsGroupMode, setPartsGroupMode] = useState<PartsGroupMode>('foreman');
  const [showPartsFilters, setShowPartsFilters] = useState(false);
  const [selectedPartsGroupKey, setSelectedPartsGroupKey] = useState<string>('');
  const [openPartsGroupKey, setOpenPartsGroupKey] = useState<string>('');
  const [visiblePartsGroupCount, setVisiblePartsGroupCount] = useState(PARTS_GROUPS_PAGE_SIZE);
  const [visibleReportsByGroup, setVisibleReportsByGroup] = useState<Record<string, number>>({});
  const [excelExportingPeriod, setExcelExportingPeriod] = useState<'weekly' | 'monthly' | null>(null);

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

  const foremanGroups = useMemo<PartsGroupedReports[]>(() => {
    const grouped = new Map<string, PartsGroupedReports>();
    reportsForGrouping.forEach((report) => {
      const exportReport = buildExportWorkReport(report);
      const possibleForemen = uniqueStrings([
        payloadText(report.payload, 'mainForeman') ?? '',
        payloadText(report.payload, 'foreman') ?? '',
        safeText(exportReport.foreman),
        ...(exportReport.foremanEntries ?? [])
          .filter((entry) => entry.role === 'encargado')
          .map((entry) => safeText(entry.name)),
      ]);
      const normalizedForemen =
        possibleForemen.length > 0
          ? uniqueStrings(
              possibleForemen
                .map((name) =>
                  name
                    .trim()
                    .toLowerCase()
                    .split(' ')
                    .filter((part) => part.length > 0)
                    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                    .join(' '),
                )
                .filter((name) => name.length > 0),
            )
          : ['Sin encargado'];

      const dateKey = getOfflineReportDateKey(report);
      const dateStamp = parseReportDateValue(dateKey)?.getTime() ?? 0;

      normalizedForemen.forEach((foremanName) => {
        const groupKey = `foreman:${foremanName.toLowerCase()}`;
        const existing = grouped.get(groupKey);
        if (!existing) {
          grouped.set(groupKey, {
            key: groupKey,
            label: foremanName,
            reports: [report],
            sortStamp: dateStamp,
          });
          return;
        }
        if (!existing.reports.some((existingReport) => existingReport.id === report.id)) {
          existing.reports.push(report);
        }
        if (dateStamp > existing.sortStamp) {
          existing.sortStamp = dateStamp;
        }
      });
    });

    return [...grouped.values()]
      .map((group) => ({
        ...group,
        reports: [...group.reports].sort(
          (left, right) =>
            getOfflineReportDateKey(right).localeCompare(getOfflineReportDateKey(left)) ||
            right.id.localeCompare(left.id),
        ),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }));
  }, [reportsForGrouping]);

  const weeklyGroups = useMemo<PartsGroupedReports[]>(() => {
    const grouped = new Map<string, PartsGroupedReports>();
    reportsForGrouping.forEach((report) => {
      const reportDate = parseReportDateValue(getOfflineReportDateKey(report));
      if (!reportDate) return;
      const weekStart = startOfWeek(reportDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(reportDate, { weekStartsOn: 1 });
      const groupKey = `weekly:${format(weekStart, 'yyyy-MM-dd')}`;
      const label = `${format(weekStart, 'dd/MM')} - ${format(weekEnd, 'dd/MM/yyyy')}`;
      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, {
          key: groupKey,
          label,
          reports: [report],
          sortStamp: weekStart.getTime(),
        });
        return;
      }
      existing.reports.push(report);
    });

    return [...grouped.values()]
      .map((group) => ({
        ...group,
        reports: [...group.reports].sort(
          (left, right) =>
            getOfflineReportDateKey(right).localeCompare(getOfflineReportDateKey(left)) ||
            right.id.localeCompare(left.id),
        ),
      }))
      .sort((left, right) => right.sortStamp - left.sortStamp);
  }, [reportsForGrouping]);

  const monthlyGroups = useMemo<PartsGroupedReports[]>(() => {
    const grouped = new Map<string, PartsGroupedReports>();
    reportsForGrouping.forEach((report) => {
      const reportDate = parseReportDateValue(getOfflineReportDateKey(report));
      if (!reportDate) return;
      const monthStart = new Date(reportDate.getFullYear(), reportDate.getMonth(), 1);
      const groupKey = `monthly:${format(monthStart, 'yyyy-MM')}`;
      const monthLabel = format(monthStart, 'MMMM yyyy', { locale: es });
      const label = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, {
          key: groupKey,
          label,
          reports: [report],
          sortStamp: monthStart.getTime(),
        });
        return;
      }
      existing.reports.push(report);
    });

    return [...grouped.values()]
      .map((group) => ({
        ...group,
        reports: [...group.reports].sort(
          (left, right) =>
            getOfflineReportDateKey(right).localeCompare(getOfflineReportDateKey(left)) ||
            right.id.localeCompare(left.id),
        ),
      }))
      .sort((left, right) => right.sortStamp - left.sortStamp);
  }, [reportsForGrouping]);

  const activePartsGroups = useMemo(() => {
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
  const recentReportsDefault = useMemo(() => {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = subDays(endDate, 6);
    startDate.setHours(0, 0, 0, 0);

    return [...reportsForGrouping]
      .filter((report) => {
        const reportDate = parseReportDateValue(getOfflineReportDateKey(report));
        if (!reportDate) return false;
        return !isBefore(reportDate, startDate) && !isAfter(reportDate, endDate);
      })
      .sort(
        (left, right) =>
          getOfflineReportDateKey(right).localeCompare(getOfflineReportDateKey(left)) ||
          right.id.localeCompare(left.id),
      )
      .slice(0, 7);
  }, [reportsForGrouping]);

  const recentNavigationIds = useMemo(() => recentReportsDefault.map((report) => report.id), [recentReportsDefault]);

  const canExportWeekly =
    partsGroupMode === 'foreman'
      ? selectedPartsGroupReports.length > 0
      : partsGroupMode === 'weekly'
        ? selectedPartsGroupReports.length > 0
        : false;
  const canExportMonthly =
    partsGroupMode === 'foreman'
      ? selectedPartsGroupReports.length > 0
      : partsGroupMode === 'monthly'
        ? selectedPartsGroupReports.length > 0
        : false;

  const handleExportGroupedReportsExcel = async (period: 'weekly' | 'monthly') => {
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
      const XLSX = await import('xlsx-js-style');
      const workbook = XLSX.utils.book_new();
      const rows = reportsToExport
        .map((report) => {
          const payload = asRecord(report.payload) ?? {};
          const exportReport = buildExportWorkReport(report);
          const reportIdentifier = payloadText(report.payload, 'reportIdentifier') ?? report.id.slice(0, 8);
          const statusText = String(report.status ?? '').toLowerCase();
          const isClosed =
            (payloadBoolean(report.payload, 'isClosed') ?? false) ||
            statusText === 'completed' ||
            statusText === 'closed';

          const workersHours = exportReport.workGroups.reduce(
            (sum, group) => sum + group.items.reduce((groupSum, item) => groupSum + safeNumber(item.hours), 0),
            0,
          );
          const machineryHours = exportReport.machineryGroups.reduce(
            (sum, group) => sum + group.items.reduce((groupSum, item) => groupSum + safeNumber(item.hours), 0),
            0,
          );
          const foremanEntriesHours = (exportReport.foremanEntries ?? []).reduce((sum, entry) => {
            if (entry.role !== 'encargado') return sum;
            return sum + safeNumber(entry.hours);
          }, 0);
          const legacyForemanHours = firstFiniteNumber(payload.mainForemanHours, payload.foremanHours);
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
          const totalHours = firstFiniteNumber(payload.totalHours) ?? foremanHours + workersHours + machineryHours;

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

          const rentalRows = [...safeArray(payload.rentalMachineryRows), ...safeArray(payload.rentalMachinesSnapshot)];
          const rentalProviders = uniqueStrings(
            rentalRows
              .map((rawRow) => {
                const row = asRecord(rawRow);
                if (!row) return '';
                return safeText(row.provider, safeText(row.supplier, safeText(row.company))).trim();
              })
              .filter((provider) => provider.length > 0),
          );

          return {
            report,
            reportIdentifier,
            dateKey: getOfflineReportDateKey(report),
            workName: exportReport.workName || report.title || 'Sin obra',
            foremanName:
              payloadText(report.payload, 'mainForeman') ??
              payloadText(report.payload, 'foreman') ??
              exportReport.foreman ??
              'Sin encargado',
            isClosed,
            foremanHours,
            totalHours,
            totalCost,
            rentalProviders,
            workerRows: exportReport.workGroups.flatMap((group) =>
              group.items.map((item) => ({
                company: safeText(group.company, 'Sin empresa'),
                name: safeText(item.name, 'Sin nombre'),
                activity: safeText(item.activity),
                hours: safeNumber(item.hours),
                total: safeNumber(item.total),
              })),
            ),
            machineryRows: exportReport.machineryGroups.flatMap((group) =>
              group.items.map((item) => ({
                company: safeText(group.company, 'Sin empresa'),
                type: safeText(item.type, 'Sin tipo'),
                activity: safeText(item.activity),
                hours: safeNumber(item.hours),
                total: safeNumber(item.total),
              })),
            ),
          };
        })
        .sort((left, right) => right.dateKey.localeCompare(left.dateKey) || right.report.id.localeCompare(left.report.id));

      const totals = {
        reports: rows.length,
        foremanHours: rows.reduce((sum, row) => sum + row.foremanHours, 0),
        totalHours: rows.reduce((sum, row) => sum + row.totalHours, 0),
        totalCost: rows.reduce((sum, row) => sum + row.totalCost, 0),
      };
      const providersMap = new Map<string, number>();
      rows.forEach((row) => {
        row.rentalProviders.forEach((provider) => {
          providersMap.set(provider, (providersMap.get(provider) ?? 0) + 1);
        });
      });

      const summarySheet = XLSX.utils.json_to_sheet([
        {
          'Vista de agrupacion':
            partsGroupMode === 'foreman' ? 'Por encargado' : partsGroupMode === 'weekly' ? 'Por semanas' : 'Por meses',
          'Grupo seleccionado': selectedPartsGroup?.label ?? 'Sin seleccion',
          'Tipo de Excel': period === 'weekly' ? 'Excel semanal' : 'Excel mensual',
          'Total partes': totals.reports,
          'Horas encargado': Number(totals.foremanHours.toFixed(2)),
          'Horas totales': Number(totals.totalHours.toFixed(2)),
          'Costo total (EUR)': Number(totals.totalCost.toFixed(2)),
          'Proveedores alquiler': providersMap.size,
        },
      ]);
      summarySheet['!cols'] = [
        { wch: 22 },
        { wch: 28 },
        { wch: 18 },
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
          Encargado: row.foremanName,
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

      const workerRows = rows.flatMap((row) =>
        row.workerRows.map((worker) => ({
          Fecha: row.dateKey,
          Parte: row.reportIdentifier,
          Empresa: worker.company,
          Trabajador: worker.name,
          Actividad: worker.activity,
          Horas: Number(worker.hours.toFixed(2)),
          'Total (EUR)': Number(worker.total.toFixed(2)),
        })),
      );
      if (workerRows.length > 0) {
        const workersSheet = XLSX.utils.json_to_sheet(workerRows);
        workersSheet['!cols'] = [
          { wch: 12 },
          { wch: 20 },
          { wch: 24 },
          { wch: 22 },
          { wch: 24 },
          { wch: 10 },
          { wch: 12 },
        ];
        applyWorksheetCenterAlignment(workersSheet as Record<string, unknown>, XLSX);
        XLSX.utils.book_append_sheet(workbook, workersSheet, 'Trabajadores');
      }

      const machineryRows = rows.flatMap((row) =>
        row.machineryRows.map((machine) => ({
          Fecha: row.dateKey,
          Parte: row.reportIdentifier,
          Empresa: machine.company,
          Maquinaria: machine.type,
          Actividad: machine.activity,
          Horas: Number(machine.hours.toFixed(2)),
          'Total (EUR)': Number(machine.total.toFixed(2)),
        })),
      );
      if (machineryRows.length > 0) {
        const machinerySheet = XLSX.utils.json_to_sheet(machineryRows);
        machinerySheet['!cols'] = [
          { wch: 12 },
          { wch: 20 },
          { wch: 24 },
          { wch: 22 },
          { wch: 24 },
          { wch: 10 },
          { wch: 12 },
        ];
        applyWorksheetCenterAlignment(machinerySheet as Record<string, unknown>, XLSX);
        XLSX.utils.book_append_sheet(workbook, machinerySheet, 'Maquinaria');
      }

      if (providersMap.size > 0) {
        const providerRows = [...providersMap.entries()]
          .sort(([left], [right]) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
          .map(([provider, reportsCount]) => ({
            Proveedor: provider,
            'Partes asociados': reportsCount,
          }));
        const providersSheet = XLSX.utils.json_to_sheet(providerRows);
        providersSheet['!cols'] = [{ wch: 36 }, { wch: 16 }];
        applyWorksheetCenterAlignment(providersSheet as Record<string, unknown>, XLSX);
        XLSX.utils.book_append_sheet(workbook, providersSheet, 'Proveedores alquiler');
      }

      const workbookArray = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const workbookBlob = new Blob([workbookArray], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const filePrefix = period === 'weekly' ? 'Excel_Semanal' : 'Excel_Mensual';
      const groupSegment = sanitizeWorkbookSegment(selectedPartsGroup?.label ?? 'grupo');
      const filename = `${filePrefix}_${groupSegment}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      const downloadResult = await downloadExportFiles([{ filename, blob: workbookBlob }]);
      const description = downloadResult.directory
        ? `Se guardo en ${getExportDirectoryLabel(downloadResult.directory)}.`
        : 'Se descargo el Excel correctamente.';
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

  const renderReportCardRow = (report: WorkReport, navigationIds: string[], keyPrefix: string) => {
    const reportName = payloadText(report.payload, 'workName') ?? report.title ?? `Parte ${report.date}`;
    const reportIdentifier = payloadText(report.payload, 'reportIdentifier') ?? report.id.slice(0, 8);
    const totalHours = payloadNumber(report.payload, 'totalHours');
    const totalHoursLabel = typeof totalHours === 'number' ? totalHours.toFixed(2) : '--';
    const statusText = String(report.status ?? '').toLowerCase();
    const isClosed =
      (payloadBoolean(report.payload, 'isClosed') ?? false) ||
      statusText === 'completed' ||
      statusText === 'closed';
    const importedAt = payloadText(report.payload, 'importedAt');
    const isImportedPending =
      report.syncStatus === 'pending' &&
      typeof importedAt === 'string' &&
      importedAt.trim().length > 0;

    return (
      <div key={`${keyPrefix}-${report.id}`} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className={reportNameClass}>{reportName}</div>
          <div className={reportDetailClass}>Identificador: {reportIdentifier}</div>
          <div className={reportDetailClass}>Fecha: {getOfflineReportDateKey(report)}</div>
          <div className={reportDetailClass}>Estado: {isClosed ? 'Cerrado' : 'Abierto'}</div>
          <div className={reportDetailClass}>Horas totales: {totalHoursLabel}</div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-shrink-0 sm:items-end">
          <div className="flex flex-wrap items-center gap-0.5 px-1 py-1 sm:justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-500 hover:text-slate-800"
              title="Clonar parte"
              onClick={() => onCloneFromHistoryDialog(report)}
              disabled={tenantUnavailable || workReportsReadOnlyByRole}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-500 hover:text-slate-800"
              title={isClosed || workReportsReadOnlyByRole ? 'Ver parte' : 'Editar parte'}
              onClick={() =>
                onOpenExistingReport(report, {
                  navigationReportIds: navigationIds,
                })
              }
              disabled={tenantUnavailable}
            >
              {isClosed || workReportsReadOnlyByRole ? (
                <Eye className="h-4 w-4" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-500 hover:text-red-700"
              title="Eliminar parte"
              onClick={() => onDeleteReport(report)}
              disabled={tenantUnavailable || workReportsReadOnlyByRole}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {!isClosed ? (
            <Badge
              variant="outline"
              className="border-amber-400 bg-amber-50 text-[13px] sm:text-sm text-amber-700"
            >
              Por completar
            </Badge>
          ) : null}
          {isImportedPending ? (
            <Badge
              variant="outline"
              className="border-sky-300 bg-sky-50 text-[13px] sm:text-sm text-sky-700"
            >
              Importado
            </Badge>
          ) : null}
          <Badge
            variant="outline"
            className={
              report.syncStatus === 'synced'
                ? 'border-emerald-300 bg-emerald-50 text-[13px] sm:text-sm text-emerald-700'
                : report.syncStatus === 'error'
                  ? 'border-rose-500 bg-rose-100 text-[13px] sm:text-sm text-rose-800'
                  : 'border-red-300 bg-red-50 text-[13px] sm:text-sm text-red-700'
            }
          >
            {report.syncStatus === 'synced'
              ? 'Sincronizado'
              : report.syncStatus === 'error'
                ? 'Error de sincronizacion'
                : 'Pendiente de sincronizar'}
          </Badge>
        </div>
      </div>
    );
  };

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
                        : workReports.length === 0
                          ? `No hay partes de trabajo en los ultimos ${workReportVisibleDays} dias`
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
                disabled={workReports.length === 0}
              >
                <Search className="h-4 w-4" />
                Filtrar
              </Button>
            </div>
          </div>
        </CardHeader>
        {workReports.length === 0 ? (
          <CardContent className="py-10 flex flex-col items-center gap-4">
            <ClipboardList className="h-12 w-12 text-slate-400" />
            <p className="text-[15px] sm:text-base text-muted-foreground text-center max-w-md">
              No hay partes creados en los ultimos {workReportVisibleDays} dias. Puedes crear uno nuevo o sincronizar.
            </p>
            <Button variant="outline" disabled={syncing || tenantUnavailable} onClick={() => void onSyncNow()}>
              <CloudUpload className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sincronizar
            </Button>
          </CardContent>
        ) : (
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
                  <CloudUpload className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  Sincronizar
                </Button>
              </div>
            </div>

            <div
              className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
                showPartsFilters
                  ? 'grid-rows-[1fr] translate-y-0 opacity-100'
                  : 'pointer-events-none grid-rows-[0fr] -translate-y-1 opacity-0'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="space-y-3 pt-1">
                <div className="rounded-md border bg-slate-100 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tabs
                      value={partsGroupMode}
                      onValueChange={(value) => setPartsGroupMode(value as PartsGroupMode)}
                      className="w-full sm:w-auto"
                    >
                      <TabsList className="h-9 w-full grid-cols-3 rounded-md border border-slate-300 bg-slate-100 sm:w-auto">
                        <TabsTrigger
                          value="foreman"
                          className="text-[14px] data-[state=active]:border data-[state=active]:border-slate-400 data-[state=active]:bg-slate-300 data-[state=active]:text-slate-900 sm:text-[15px]"
                        >
                          Por Encargado
                        </TabsTrigger>
                        <TabsTrigger
                          value="weekly"
                          className="text-[14px] data-[state=active]:border data-[state=active]:border-slate-400 data-[state=active]:bg-slate-300 data-[state=active]:text-slate-900 sm:text-[15px]"
                        >
                          Por Semanas
                        </TabsTrigger>
                        <TabsTrigger
                          value="monthly"
                          className="text-[14px] data-[state=active]:border data-[state=active]:border-slate-400 data-[state=active]:bg-slate-300 data-[state=active]:text-slate-900 sm:text-[15px]"
                        >
                          Por Meses
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 text-[14px] sm:text-[15px]"
                      onClick={() => void handleExportGroupedReportsExcel('weekly')}
                      disabled={excelExportingPeriod !== null || !canExportWeekly}
                    >
                      {excelExportingPeriod === 'weekly' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generando...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Excel Semanal
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 text-[14px] sm:text-[15px]"
                      onClick={() => void handleExportGroupedReportsExcel('monthly')}
                      disabled={excelExportingPeriod !== null || !canExportMonthly}
                    >
                      {excelExportingPeriod === 'monthly' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generando...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Excel Mensual
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {activePartsGroups.length === 0 ? (
                  <div className="rounded-md border bg-slate-50 px-3 py-4 text-[15px] text-slate-500">
                    No hay partes disponibles para la agrupacion seleccionada.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Accordion
                      type="single"
                      collapsible
                      value={openPartsGroupKey}
                      onValueChange={(value) => {
                        setOpenPartsGroupKey(value);
                        if (value) {
                          setVisibleReportsByGroup((current) => ({
                            ...current,
                            [value]: current[value] ?? PARTS_REPORTS_PAGE_SIZE,
                          }));
                        }
                      }}
                      className="rounded-md border bg-slate-50"
                    >
                      {visiblePartsGroups.map((group) => {
                        const navigationIds = group.reports.map((report) => report.id);
                        const isSelectedGroup = selectedPartsGroupKey === group.key;
                        const isOpenGroup = openPartsGroupKey === group.key;
                        const visibleReportsForGroup = group.reports.slice(
                          0,
                          visibleReportsByGroup[group.key] ?? PARTS_REPORTS_PAGE_SIZE,
                        );
                        const hiddenReportsForGroup = Math.max(
                          group.reports.length - visibleReportsForGroup.length,
                          0,
                        );

                        return (
                          <AccordionItem key={group.key} value={group.key} className="last:border-b-0">
                            <div
                              className={`flex items-center gap-2 border-b px-3 py-2 ${
                                isSelectedGroup ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'
                              }`}
                            >
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2 text-left"
                                onClick={() => handleTogglePartsGroupSelection(group.key)}
                              >
                                <span className="truncate text-[16px] font-medium text-slate-900 sm:text-[17px]">
                                  {group.label}
                                </span>
                                <Badge variant="outline" className="shrink-0 border-slate-300 bg-white text-slate-700">
                                  {group.reports.length}
                                </Badge>
                              </button>
                              <AccordionPrimitive.Header className="flex shrink-0">
                                <AccordionPrimitive.Trigger className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100">
                                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpenGroup ? 'rotate-180' : ''}`} />
                                </AccordionPrimitive.Trigger>
                              </AccordionPrimitive.Header>
                            </div>
                            <AccordionContent className="border-t bg-white pb-0 pt-0">
                              <div className="divide-y">
                                {visibleReportsForGroup.map((report) =>
                                  renderReportCardRow(report, navigationIds, group.key),
                                )}
                              </div>
                              {hiddenReportsForGroup > 0 ? (
                                <div className="border-t px-3 py-3 text-center">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setVisibleReportsByGroup((current) => ({
                                        ...current,
                                        [group.key]: Math.min(
                                          (current[group.key] ?? PARTS_REPORTS_PAGE_SIZE) + PARTS_REPORTS_PAGE_SIZE,
                                          group.reports.length,
                                        ),
                                      }))
                                    }
                                  >
                                    Mostrar {Math.min(PARTS_REPORTS_PAGE_SIZE, hiddenReportsForGroup)} mas
                                  </Button>
                                </div>
                              ) : null}
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                    {hiddenPartsGroupsCount > 0 ? (
                      <div className="flex items-center justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setVisiblePartsGroupCount((current) =>
                              Math.min(current + PARTS_GROUPS_PAGE_SIZE, activePartsGroups.length),
                            )
                          }
                        >
                          Mostrar {Math.min(PARTS_GROUPS_PAGE_SIZE, hiddenPartsGroupsCount)} grupos mas
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
                </div>
              </div>
            </div>

            {!showPartsFilters ? (
              <div className="rounded-md border bg-slate-50">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
                  <p className="text-[14px] font-medium text-slate-700 sm:text-[15px]">
                    {`Mostrando ${recentReportsDefault.length} parte(s) recientes (ultimos 7 dias)`}
                  </p>
                </div>
                {recentReportsDefault.length === 0 ? (
                  <div className="px-3 py-4 text-[15px] text-slate-500">
                    No hay partes para la seleccion actual.
                  </div>
                ) : (
                  <div className="divide-y">
                    {recentReportsDefault.map((report) => renderReportCardRow(report, recentNavigationIds, 'display'))}
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        )}
      </Card>
    </div>
  );
};




