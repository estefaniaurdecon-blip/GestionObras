import {
  endOfWeek,
  format,
  isAfter,
  isBefore,
  startOfWeek,
  subDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { WorkReport } from '@/offline-db/types';
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
import { parseReportDateValue, safeText } from '@/utils/valueNormalization';

export type PartsGroupMode = 'foreman' | 'weekly' | 'monthly';

export type PartsGroupedReports = {
  key: string;
  label: string;
  reports: WorkReport[];
  sortStamp: number;
};

export type PartsExcelPeriod = 'weekly' | 'monthly';

export type WorksheetCellStyle = {
  alignment?: {
    horizontal?: string;
    vertical?: string;
    wrapText?: boolean;
  };
};

type WorksheetCell = {
  s?: WorksheetCellStyle;
};

export const EMPTY_WORK_REPORTS: WorkReport[] = [];
export const PARTS_GROUPS_PAGE_SIZE = 20;
export const PARTS_REPORTS_PAGE_SIZE = 50;

export const firstFiniteNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

export const pickCostReference = (...values: unknown[]) => {
  const finiteValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  const firstPositive = finiteValues.find((value) => value > 0);
  if (typeof firstPositive === 'number') return firstPositive;
  return finiteValues[0] ?? 0;
};

export const uniqueStrings = (values: string[]) =>
  Array.from(new Set(values.filter((value) => value.length > 0)));

export const sanitizeWorkbookSegment = (value: string) => {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();
  return cleaned.length > 0 ? cleaned : 'sin_valor';
};

export const applyWorksheetCenterAlignment = (
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

const sortReportsDesc = (reports: WorkReport[]) =>
  [...reports].sort(
    (left, right) =>
      getOfflineReportDateKey(right).localeCompare(getOfflineReportDateKey(left)) ||
      right.id.localeCompare(left.id),
  );

const normalizeForemanName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .split(' ')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const groupReportsByForeman = (reports: WorkReport[]): PartsGroupedReports[] => {
  const grouped = new Map<string, PartsGroupedReports>();

  reports.forEach((report) => {
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
        ? uniqueStrings(possibleForemen.map(normalizeForemanName).filter((name) => name.length > 0))
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
    .map((group) => ({ ...group, reports: sortReportsDesc(group.reports) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }));
};

export const groupReportsByWeek = (reports: WorkReport[]): PartsGroupedReports[] => {
  const grouped = new Map<string, PartsGroupedReports>();

  reports.forEach((report) => {
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
    .map((group) => ({ ...group, reports: sortReportsDesc(group.reports) }))
    .sort((left, right) => right.sortStamp - left.sortStamp);
};

export const groupReportsByMonth = (reports: WorkReport[]): PartsGroupedReports[] => {
  const grouped = new Map<string, PartsGroupedReports>();

  reports.forEach((report) => {
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
    .map((group) => ({ ...group, reports: sortReportsDesc(group.reports) }))
    .sort((left, right) => right.sortStamp - left.sortStamp);
};

export const getRecentReports = (reports: WorkReport[]) => {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = subDays(endDate, 6);
  startDate.setHours(0, 0, 0, 0);

  return sortReportsDesc(
    reports.filter((report) => {
      const reportDate = parseReportDateValue(getOfflineReportDateKey(report));
      if (!reportDate) return false;
      return !isBefore(reportDate, startDate) && !isAfter(reportDate, endDate);
    }),
  ).slice(0, 7);
};

export const canExportGroupedReports = (
  mode: PartsGroupMode,
  period: PartsExcelPeriod,
  reports: WorkReport[],
) => {
  if (period === 'weekly') {
    return (mode === 'foreman' || mode === 'weekly') && reports.length > 0;
  }

  return (mode === 'foreman' || mode === 'monthly') && reports.length > 0;
};

export const getReportListItemMeta = (report: WorkReport) => {
  const reportName = payloadText(report.payload, 'workName') ?? report.title ?? `Parte ${report.date}`;
  const reportIdentifier = payloadText(report.payload, 'reportIdentifier') ?? report.id.slice(0, 8);
  const totalHours = payloadNumber(report.payload, 'totalHours');
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

  return {
    reportName,
    reportIdentifier,
    dateKey: getOfflineReportDateKey(report),
    totalHoursLabel: typeof totalHours === 'number' ? totalHours.toFixed(2) : '--',
    isClosed,
    isImportedPending,
  };
};

export const getRentalProvidersFromPayload = (payload: unknown) => {
  const record = asRecord(payload) ?? {};
  const rentalRows = [record.rentalMachineryRows, record.rentalMachinesSnapshot].flatMap((value) =>
    Array.isArray(value) ? value : [],
  );

  return uniqueStrings(
    rentalRows
      .map((rawRow) => {
        const row = asRecord(rawRow);
        if (!row) return '';
        return safeText(row.provider, safeText(row.supplier, safeText(row.company))).trim();
      })
      .filter((provider) => provider.length > 0),
  );
};
