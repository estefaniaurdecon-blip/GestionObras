import { useCallback, useEffect, useDeferredValue, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { WorkReport } from '@/offline-db/types';
import {
  asRecord,
  getIsoWeekKey,
  normalizeComparableText,
  parseIsoDate,
  payloadText,
  type HistoryFilterKey,
} from '@/pages/indexHelpers';

// PERFORMANCE: Custom hook for debounced state updates on text inputs
function useDebouncedState<T extends string>(initialValue: T, delayMs = 300): [T, Dispatch<SetStateAction<T>>, T] {
  const [immediateValue, setImmediateValue] = useState<T>(initialValue);
  const [debouncedValue, setDebouncedValue] = useState<T>(initialValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(immediateValue);
      timeoutRef.current = null;
    }, delayMs);

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [immediateValue, delayMs]);

  return [immediateValue, setImmediateValue, debouncedValue];
}

type UseHistoryFiltersResult = {
  historyForemanFilter: string;
  setHistoryForemanFilter: Dispatch<SetStateAction<string>>;
  historyWeekFilter: string;
  setHistoryWeekFilter: Dispatch<SetStateAction<string>>;
  historyMonthFilter: string;
  setHistoryMonthFilter: Dispatch<SetStateAction<string>>;
  historyWorkNameFilter: string;
  setHistoryWorkNameFilter: Dispatch<SetStateAction<string>>;
  historyDateFilter: string;
  setHistoryDateFilter: Dispatch<SetStateAction<string>>;
  historyDatePickerOpen: boolean;
  setHistoryDatePickerOpen: Dispatch<SetStateAction<boolean>>;
  historyEnabledFilters: HistoryFilterKey[];
  historySelectedFiltersCount: number;
  historyAppliedFiltersCount: number;
  selectedHistoryDate: Date | null;
  filteredHistoryReports: WorkReport[];
  toggleHistoryFilter: (filterKey: HistoryFilterKey) => void;
  clearHistoryFilters: () => void;
};

export const useHistoryFilters = (allWorkReports: WorkReport[]): UseHistoryFiltersResult => {
  // PERFORMANCE: Debounced text inputs to prevent recalculation on every keystroke
  const [historyForemanFilter, setHistoryForemanFilter, debouncedForemanFilter] = useDebouncedState('', 300);
  const [historyWeekFilter, setHistoryWeekFilter] = useState('');
  const [historyMonthFilter, setHistoryMonthFilter] = useState('');
  const [historyWorkNameFilter, setHistoryWorkNameFilter, debouncedWorkNameFilter] = useDebouncedState('', 300);
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  const [historyDatePickerOpen, setHistoryDatePickerOpen] = useState(false);
  const [historyEnabledFilters, setHistoryEnabledFilters] = useState<HistoryFilterKey[]>([]);
  const deferredAllWorkReports = useDeferredValue(allWorkReports);
  const deferredEnabledFilters = useDeferredValue(historyEnabledFilters);
  const deferredForemanFilter = useDeferredValue(debouncedForemanFilter);
  const deferredWeekFilter = useDeferredValue(historyWeekFilter);
  const deferredMonthFilter = useDeferredValue(historyMonthFilter);
  const deferredWorkNameFilter = useDeferredValue(debouncedWorkNameFilter);
  const deferredDateFilter = useDeferredValue(historyDateFilter);

  const sortedHistoryReports = useMemo(
    () => [...deferredAllWorkReports].sort((left, right) => right.createdAt - left.createdAt),
    [deferredAllWorkReports],
  );

  const filteredHistoryReports = useMemo(() => {
    const enabledFilters = new Set(deferredEnabledFilters);
    const normalizedForeman = normalizeComparableText(deferredForemanFilter);
    const normalizedWorkName = normalizeComparableText(deferredWorkNameFilter);
    const normalizedWeek = deferredWeekFilter.trim();
    const normalizedMonth = deferredMonthFilter.trim();
    const normalizedDate = deferredDateFilter.trim();
    const shouldFilterByForeman = enabledFilters.has('foreman') && normalizedForeman.length > 0;
    const shouldFilterByWeek = enabledFilters.has('weeks') && normalizedWeek.length > 0;
    const shouldFilterByMonth = enabledFilters.has('months') && normalizedMonth.length > 0;
    const shouldFilterByWorkName = enabledFilters.has('workName') && normalizedWorkName.length > 0;
    const shouldFilterByDate = enabledFilters.has('date') && normalizedDate.length > 0;

    return sortedHistoryReports.filter((report) => {
      const payload = asRecord(report.payload);
      const foremanName = normalizeComparableText(
        payloadText(payload, 'mainForeman') ??
          payloadText(payload, 'foreman') ??
          payloadText(payload, 'siteManager') ??
          '',
      );
      const workName = normalizeComparableText(payloadText(payload, 'workName') ?? report.title ?? '');
      const reportDate = report.date.trim();
      const reportWeek = getIsoWeekKey(reportDate);
      const reportMonth = reportDate.slice(0, 7);

      if (shouldFilterByForeman && !foremanName.includes(normalizedForeman)) return false;
      if (shouldFilterByWeek && reportWeek !== normalizedWeek) return false;
      if (shouldFilterByMonth && reportMonth !== normalizedMonth) return false;
      if (shouldFilterByWorkName && !workName.includes(normalizedWorkName)) return false;
      if (shouldFilterByDate && reportDate !== normalizedDate) return false;
      return true;
    });
  }, [
    deferredDateFilter,
    deferredEnabledFilters,
    deferredForemanFilter,
    deferredMonthFilter,
    deferredWeekFilter,
    deferredWorkNameFilter,
    sortedHistoryReports,
  ]);

  const historySelectedFiltersCount = historyEnabledFilters.length;
  const selectedHistoryDate = useMemo(() => parseIsoDate(historyDateFilter), [historyDateFilter]);

  const historyAppliedFiltersCount = useMemo(() => {
    let activeFilters = 0;
    if (historyEnabledFilters.includes('foreman') && historyForemanFilter.trim()) activeFilters += 1;
    if (historyEnabledFilters.includes('weeks') && historyWeekFilter.trim()) activeFilters += 1;
    if (historyEnabledFilters.includes('months') && historyMonthFilter.trim()) activeFilters += 1;
    if (historyEnabledFilters.includes('workName') && historyWorkNameFilter.trim()) activeFilters += 1;
    if (historyEnabledFilters.includes('date') && historyDateFilter.trim()) activeFilters += 1;
    return activeFilters;
  }, [
    historyDateFilter,
    historyEnabledFilters,
    historyForemanFilter,
    historyMonthFilter,
    historyWeekFilter,
    historyWorkNameFilter,
  ]);

  const toggleHistoryFilter = useCallback((filterKey: HistoryFilterKey) => {
    setHistoryEnabledFilters((current) =>
      current.includes(filterKey)
        ? current.filter((activeKey) => activeKey !== filterKey)
        : [...current, filterKey],
    );
  }, []);

  const clearHistoryFilters = useCallback(() => {
    setHistoryEnabledFilters([]);
    setHistoryForemanFilter('');
    setHistoryWeekFilter('');
    setHistoryMonthFilter('');
    setHistoryWorkNameFilter('');
    setHistoryDateFilter('');
  }, []);

  return {
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
  };
};
