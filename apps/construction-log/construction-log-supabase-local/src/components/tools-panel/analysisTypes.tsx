import { type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  isAfter,
  isBefore,
  startOfMonth,
  subDays,
} from 'date-fns';
import type { WorkReport } from '@/offline-db/types';
import {
  EMPTY_WORK_SEARCH_FILTERS,
  type WorkSearchFilters,
} from '@/components/reportsAnalysisWorkGrouping';

export type AnalysisPeriod = 'all' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type AnalysisTabValue = 'foreman' | 'workers' | 'machinery' | 'rental' | 'reports' | 'economic';

export type WorkerAnalysisEntry = {
  id: string;
  company: string;
  name: string;
  hours: number;
};

export type MachineryAnalysisEntry = {
  id: string;
  company: string;
  type: string;
  hours: number;
};

export type AnalysisRow = {
  id: string;
  sourceReport: WorkReport;
  workNumber: string;
  workId: string;
  workName: string;
  reportTitle: string;
  reportIdentifier: string;
  date: Date | null;
  dateKey: string;
  isClosed: boolean;
  foremanDisplayName: string;
  foremanHours: number;
  totalHours: number;
  totalCost: number;
  rentalProviders: string[];
  workerEntries: WorkerAnalysisEntry[];
  machineryEntries: MachineryAnalysisEntry[];
};

export const WORKER_ROWS_PAGE_SIZE = 10;

export const sanitizeWorkbookSegment = (value: string) => {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();
  return cleaned.length > 0 ? cleaned : 'sin_valor';
};

export type WorksheetCellStyle = {
  alignment?: {
    horizontal?: string;
    vertical?: string;
    wrapText?: boolean;
  };
};

export type WorksheetCell = {
  s?: WorksheetCellStyle;
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

export const isDateWithinPeriod = (date: Date | null, period: AnalysisPeriod) => {
  if (period === 'all') return true;
  if (!date) return false;

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  let start = new Date(end);
  if (period === 'weekly') {
    start = subDays(end, 6);
  } else if (period === 'monthly') {
    start = startOfMonth(end);
  } else if (period === 'quarterly') {
    start = subDays(end, 89);
  } else if (period === 'yearly') {
    start = subDays(end, 364);
  }
  start.setHours(0, 0, 0, 0);

  return !isBefore(date, start) && !isAfter(date, end);
};

export const AnalysisMetricCard = ({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) => (
  <Card className="border-slate-200">
    <CardContent className="flex min-h-[132px] flex-col items-center justify-center gap-1.5 p-3 text-center sm:min-h-[148px] sm:gap-2 sm:p-4">
      <span className="text-slate-800 [&_svg]:h-9 [&_svg]:w-9 sm:[&_svg]:h-10 sm:[&_svg]:w-10">{icon}</span>
      <div className="max-w-full break-all text-[1.15rem] font-bold leading-[1.05] text-slate-800 [font-variant-numeric:tabular-nums] sm:text-[1.3rem] md:text-[1.45rem]">
        {value}
      </div>
      <p className="text-[14px] leading-tight text-slate-600 sm:text-[15px]">{label}</p>
    </CardContent>
  </Card>
);

export const createDefaultWorkSearchFilters = (): WorkSearchFilters => ({
  ...EMPTY_WORK_SEARCH_FILTERS,
  includeAllWorks: true,
});
