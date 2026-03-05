import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export type PeriodMode = 'day' | 'month' | 'year';

export type PeriodHoursRawRow = {
  date: Date | null;
  dateKey: string;
  hours: number;
};

export type AggregatedPeriodPoint = {
  keyDate: string;
  label: string;
  valueHours: number;
  periodEpoch: number;
};

export type WindowPoint = {
  keyDate: string;
  label: string;
  valueHours: number;
};

export type BuildWindowResult = {
  data: WindowPoint[];
  windowSize: number;
  pageOffset: number;
  maxPageOffset: number;
  canGoBack: boolean;
  canGoForward: boolean;
};

const WINDOW_SIZE_BY_MODE: Record<PeriodMode, number> = {
  day: 7,
  month: 6,
  year: 5,
};

const safeHours = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

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

const readRowDate = (row: PeriodHoursRawRow) => {
  const source = row.date ?? parseDateKey(row.dateKey);
  if (!(source instanceof Date) || Number.isNaN(source.getTime())) return null;
  return source;
};

const toPeriodStart = (date: Date, mode: PeriodMode) => {
  if (mode === 'year') return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
  if (mode === 'month') return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
};

const toPeriodKey = (date: Date, mode: PeriodMode) => {
  if (mode === 'year') return format(date, 'yyyy');
  if (mode === 'month') return format(date, 'yyyy-MM');
  return format(date, 'yyyy-MM-dd');
};

const toPeriodLabel = (date: Date, mode: PeriodMode) => {
  if (mode === 'year') return format(date, 'yyyy');
  if (mode === 'month') return format(date, 'MMMM yyyy', { locale: es });
  return format(date, 'dd/MM/yyyy');
};

const addPeriods = (date: Date, mode: PeriodMode, amount: number) => {
  if (amount === 0) return toPeriodStart(date, mode);
  if (mode === 'year') return new Date(date.getFullYear() + amount, 0, 1, 0, 0, 0, 0);
  if (mode === 'month') return new Date(date.getFullYear(), date.getMonth() + amount, 1, 0, 0, 0, 0);
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return toPeriodStart(next, mode);
};

const diffPeriods = (latest: Date, earliest: Date, mode: PeriodMode) => {
  if (mode === 'year') return latest.getFullYear() - earliest.getFullYear();
  if (mode === 'month') {
    return (latest.getFullYear() - earliest.getFullYear()) * 12 + (latest.getMonth() - earliest.getMonth());
  }
  const latestStart = toPeriodStart(latest, 'day').getTime();
  const earliestStart = toPeriodStart(earliest, 'day').getTime();
  return Math.floor((latestStart - earliestStart) / 86400000);
};

const aggregateByMode = (rows: PeriodHoursRawRow[], mode: PeriodMode): AggregatedPeriodPoint[] => {
  const byPeriod = new Map<string, { periodStart: Date; valueHours: number }>();

  rows.forEach((row) => {
    const parsedDate = readRowDate(row);
    if (!parsedDate) return;
    const valueHours = safeHours(row.hours);
    if (valueHours <= 0) return;
    const periodStart = toPeriodStart(parsedDate, mode);
    const keyDate = toPeriodKey(periodStart, mode);
    const current = byPeriod.get(keyDate);
    if (current) {
      current.valueHours += valueHours;
      return;
    }
    byPeriod.set(keyDate, { periodStart, valueHours });
  });

  return [...byPeriod.entries()]
    .map(([keyDate, value]) => ({
      keyDate,
      label: toPeriodLabel(value.periodStart, mode),
      valueHours: value.valueHours,
      periodEpoch: value.periodStart.getTime(),
    }))
    .sort((left, right) => left.periodEpoch - right.periodEpoch);
};

export const aggregateByDay = (rows: PeriodHoursRawRow[]) => aggregateByMode(rows, 'day');

export const aggregateByMonth = (rows: PeriodHoursRawRow[]) => aggregateByMode(rows, 'month');

export const aggregateByYear = (rows: PeriodHoursRawRow[]) => aggregateByMode(rows, 'year');

export const buildWindow = (
  series: AggregatedPeriodPoint[],
  mode: PeriodMode,
  pageOffset: number,
  now: Date = new Date(),
): BuildWindowResult => {
  const normalizedSeries = [...series].sort((left, right) => left.periodEpoch - right.periodEpoch);
  const windowSize = WINDOW_SIZE_BY_MODE[mode];
  const currentAnchor = toPeriodStart(now, mode);
  const latestSeriesEpoch = normalizedSeries[normalizedSeries.length - 1]?.periodEpoch;
  const latestSeriesDate =
    typeof latestSeriesEpoch === 'number' ? toPeriodStart(new Date(latestSeriesEpoch), mode) : null;
  const anchorDate = latestSeriesDate ?? currentAnchor;
  const earliestSeriesEpoch = normalizedSeries[0]?.periodEpoch;
  const earliestSeriesDate =
    typeof earliestSeriesEpoch === 'number' ? toPeriodStart(new Date(earliestSeriesEpoch), mode) : null;

  const totalPeriods =
    earliestSeriesDate === null ? 0 : Math.max(0, diffPeriods(anchorDate, earliestSeriesDate, mode)) + 1;
  const maxPageOffset = totalPeriods === 0 ? 0 : Math.max(0, Math.ceil(totalPeriods / windowSize) - 1);
  const safeOffset = Math.min(Math.max(0, pageOffset), maxPageOffset);
  const endDate = addPeriods(anchorDate, mode, -safeOffset * windowSize);
  const startDate = addPeriods(endDate, mode, -(windowSize - 1));
  const valuesByKey = new Map(normalizedSeries.map((point) => [point.keyDate, point.valueHours]));

  const data: WindowPoint[] = [];
  for (let index = 0; index < windowSize; index += 1) {
    const periodDate = addPeriods(startDate, mode, index);
    const keyDate = toPeriodKey(periodDate, mode);
    data.push({
      keyDate,
      label: toPeriodLabel(periodDate, mode),
      valueHours: valuesByKey.get(keyDate) ?? 0,
    });
  }

  return {
    data,
    windowSize,
    pageOffset: safeOffset,
    maxPageOffset,
    canGoBack: safeOffset < maxPageOffset,
    canGoForward: safeOffset > 0,
  };
};

const roundUpToNiceNumber = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const fraction = value / magnitude;
  let niceFraction = 10;
  if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 5) {
    niceFraction = 5;
  }
  return niceFraction * magnitude;
};

export const computeNiceYAxisMax = (maxValue: number) => {
  const safeMax = Number.isFinite(maxValue) ? Math.max(0, maxValue) : 0;
  if (safeMax <= 0) return 1;
  return roundUpToNiceNumber(safeMax);
};

export const computeNiceYAxisTicks = (maxValue: number, desiredTickCount = 6) => {
  const yMax = computeNiceYAxisMax(maxValue);
  const safeTickCount = Math.max(2, Math.floor(desiredTickCount));
  const rawStep = yMax / (safeTickCount - 1);
  const niceStep = roundUpToNiceNumber(rawStep);
  const ticks: number[] = [];

  for (let current = 0; current <= yMax + niceStep * 0.001; current += niceStep) {
    ticks.push(Number(current.toFixed(6)));
  }

  if (ticks[ticks.length - 1] !== yMax) {
    ticks.push(yMax);
  }

  return ticks;
};
