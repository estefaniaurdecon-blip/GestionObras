import { useCallback, useMemo, useState } from 'react';
import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

export type CustomExportMode = 'single-days' | 'range';
export type SinglePeriodMode = 'day' | 'week' | 'month';

export type CustomSelection = {
  id: string;
  mode: CustomExportMode;
  dateKeys: string[];
  label: string;
};

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter((value) => value.length > 0)));

export const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatDateLabel = (date: Date) => date.toLocaleDateString('es-ES');

export const normalizeSelectedDays = (selectedDays: Date[] | undefined): Date[] => {
  const deduped = new Map<string, Date>();
  (selectedDays ?? []).forEach((day) => {
    deduped.set(toDateKey(day), day);
  });
  return [...deduped.values()].sort((a, b) => a.getTime() - b.getTime());
};

export const expandRangeToDateKeys = (from: Date, to: Date): string[] => {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const limit = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const result: string[] = [];

  while (cursor <= limit) {
    result.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
};

type SinglePeriodSelectionParams = {
  mode: SinglePeriodMode;
  selectedDay?: Date;
  selectedWeek?: DateRange;
  selectedMonthAnchor?: Date;
};

export const getSinglePeriodDateKeys = (params: SinglePeriodSelectionParams) => {
  if (params.mode === 'day') return params.selectedDay ? [toDateKey(params.selectedDay)] : [];
  if (params.mode === 'week') {
    if (!params.selectedWeek?.from || !params.selectedWeek?.to) return [];
    return expandRangeToDateKeys(params.selectedWeek.from, params.selectedWeek.to);
  }
  if (!params.selectedMonthAnchor) return [];
  return expandRangeToDateKeys(startOfMonth(params.selectedMonthAnchor), endOfMonth(params.selectedMonthAnchor));
};

export const getSinglePeriodSelectionLabel = (params: SinglePeriodSelectionParams) => {
  if (params.mode === 'day') return params.selectedDay ? `Dia: ${formatDateLabel(params.selectedDay)}` : '';
  if (params.mode === 'week') {
    if (!params.selectedWeek?.from || !params.selectedWeek?.to) return '';
    return `Semana: ${formatDateLabel(params.selectedWeek.from)} - ${formatDateLabel(params.selectedWeek.to)}`;
  }
  if (!params.selectedMonthAnchor) return '';
  return `Mes: ${format(params.selectedMonthAnchor, 'MMMM yyyy', { locale: es })}`;
};

export const useCustomExportPeriodSelection = () => {
  const [mode, setMode] = useState<CustomExportMode>('single-days');
  const [selectedDays, setSelectedDays] = useState<Date[] | undefined>([]);
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(undefined);
  const [customSelections, setCustomSelections] = useState<CustomSelection[]>([]);

  const normalizedSelectedDays = useMemo(
    () => normalizeSelectedDays(selectedDays),
    [selectedDays],
  );
  const canAddRange = Boolean(selectedRange?.from && selectedRange?.to);
  const selectedDateKeys = useMemo(
    () => uniqueStrings(customSelections.flatMap((selection) => selection.dateKeys)),
    [customSelections],
  );

  const addCurrentSingleSelection = useCallback(() => {
    if (normalizedSelectedDays.length === 0) return;
    const label = normalizedSelectedDays.map((day) => formatDateLabel(day)).join(', ');
    const dateKeys = normalizedSelectedDays.map((day) => toDateKey(day));
    setCustomSelections((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        mode: 'single-days',
        dateKeys,
        label: `Dias: ${label}`,
      },
    ]);
    setSelectedDays([]);
  }, [normalizedSelectedDays]);

  const addCurrentRangeSelection = useCallback(() => {
    if (!selectedRange?.from || !selectedRange?.to) return;
    const fromDate = selectedRange.from;
    const toDate = selectedRange.to;
    const [from, to] = fromDate <= toDate ? [fromDate, toDate] : [toDate, fromDate];
    const dateKeys = expandRangeToDateKeys(from, to);
    setCustomSelections((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        mode: 'range',
        dateKeys,
        label: `Rango: ${formatDateLabel(from)} - ${formatDateLabel(to)}`,
      },
    ]);
    setSelectedRange(undefined);
  }, [selectedRange]);

  const removeSelection = useCallback((selectionId: string) => {
    setCustomSelections((previous) => previous.filter((selection) => selection.id !== selectionId));
  }, []);

  return {
    mode,
    setMode,
    selectedDays,
    setSelectedDays,
    selectedRange,
    setSelectedRange,
    customSelections,
    normalizedSelectedDays,
    canAddRange,
    selectedDateKeys,
    hasCustomSelections: customSelections.length > 0,
    addCurrentSingleSelection,
    addCurrentRangeSelection,
    removeSelection,
  };
};

export const useSinglePeriodExportSelection = (mode: SinglePeriodMode) => {
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [selectedWeek, setSelectedWeek] = useState<DateRange | undefined>(undefined);
  const [selectedMonthAnchor, setSelectedMonthAnchor] = useState<Date | undefined>(
    mode === 'month' ? new Date() : undefined,
  );

  const selectedDateKeys = useMemo(
    () =>
      getSinglePeriodDateKeys({
        mode,
        selectedDay,
        selectedWeek,
        selectedMonthAnchor,
      }),
    [mode, selectedDay, selectedWeek, selectedMonthAnchor],
  );

  const selectedLabel = useMemo(
    () =>
      getSinglePeriodSelectionLabel({
        mode,
        selectedDay,
        selectedWeek,
        selectedMonthAnchor,
      }),
    [mode, selectedDay, selectedWeek, selectedMonthAnchor],
  );

  const clearSelection = useCallback(() => {
    setSelectedDay(undefined);
    setSelectedWeek(undefined);
    setSelectedMonthAnchor(mode === 'month' ? new Date() : undefined);
  }, [mode]);

  const handleSelectWeekByDay = useCallback((day?: Date) => {
    if (!day) {
      setSelectedWeek(undefined);
      return;
    }
    const weekStart = startOfWeek(day, { locale: es, weekStartsOn: 1 });
    const weekEnd = endOfWeek(day, { locale: es, weekStartsOn: 1 });
    setSelectedWeek({ from: weekStart, to: weekEnd });
  }, []);

  const handleMonthChange = useCallback((monthValue: number) => {
    setSelectedMonthAnchor((previous) => {
      const base = previous ?? new Date();
      return new Date(base.getFullYear(), monthValue, 1);
    });
  }, []);

  const handleYearChange = useCallback((yearValue: number) => {
    setSelectedMonthAnchor((previous) => {
      const base = previous ?? new Date();
      return new Date(yearValue, base.getMonth(), 1);
    });
  }, []);

  return {
    selectedDay,
    setSelectedDay,
    selectedWeek,
    setSelectedWeek,
    selectedMonthAnchor,
    selectedDateKeys,
    selectedLabel,
    hasSelection: selectedDateKeys.length > 0,
    clearSelection,
    handleSelectWeekByDay,
    handleMonthChange,
    handleYearChange,
  };
};

export const useMultiDayExportSelection = () => {
  const [selectedDays, setSelectedDays] = useState<Date[] | undefined>([]);
  const normalizedSelectedDays = useMemo(
    () => normalizeSelectedDays(selectedDays),
    [selectedDays],
  );
  const selectedDateKeys = useMemo(
    () => normalizedSelectedDays.map((date) => toDateKey(date)),
    [normalizedSelectedDays],
  );

  const clearSelection = useCallback(() => {
    setSelectedDays([]);
  }, []);

  return {
    selectedDays,
    setSelectedDays,
    normalizedSelectedDays,
    selectedDateKeys,
    hasSelection: selectedDateKeys.length > 0,
    clearSelection,
  };
};
