export type WorkSearchFilters = {
  includeAllWorks: boolean;
  workNumber: string;
  workName: string;
  reportDate: string;
};

export type GroupableAnalysisRow = {
  id: string;
  workNumber: string;
  workName: string;
  reportIdentifier: string;
  reportTitle: string;
  dateKey: string;
  totalHours: number;
  isClosed: boolean;
};

export type GroupedWorkReports<T extends GroupableAnalysisRow> = {
  groupKey: string;
  normalizedWorkNumber: string;
  normalizedWorkName: string;
  displayWorkNumber: string;
  displayWorkName: string;
  count: number;
  lastDateKey: string;
  reports: T[];
};

export const EMPTY_WORK_SEARCH_FILTERS: WorkSearchFilters = {
  includeAllWorks: false,
  workNumber: '',
  workName: '',
  reportDate: '',
};

const collapseSpaces = (value: string) => value.trim().replace(/\s+/g, ' ');

export const normalizeWorkNumber = (value: string) => {
  const normalized = collapseSpaces(value);
  if (normalized.length === 0) return '';
  if (/^\d+$/.test(normalized)) {
    return normalized.replace(/^0+(?=\d)/, '');
  }
  return normalized.toLowerCase();
};

export const normalizeWorkName = (value: string) => collapseSpaces(value).toLowerCase();

const normalizeWorkDisplayNumber = (value: string) => {
  const normalized = collapseSpaces(value);
  return normalized.length > 0 ? normalized : 'Sin numero';
};

const normalizeWorkDisplayName = (value: string) => {
  const normalized = collapseSpaces(value);
  return normalized.length > 0 ? normalized : 'Sin obra';
};

export const normalizeWorkSearchFilters = (filters: WorkSearchFilters): WorkSearchFilters => ({
  includeAllWorks: Boolean(filters.includeAllWorks),
  workNumber: collapseSpaces(filters.workNumber),
  workName: collapseSpaces(filters.workName),
  reportDate: filters.reportDate.trim(),
});

export const hasWorkSearchFilters = (filters: WorkSearchFilters) =>
  filters.workNumber.length > 0 || filters.workName.length > 0 || filters.reportDate.length > 0;

const rowMatchesWorkFilters = <T extends GroupableAnalysisRow>(row: T, filters: WorkSearchFilters) => {
  const normalizedWorkNumberFilter = normalizeWorkNumber(filters.workNumber);
  const normalizedWorkNameFilter = normalizeWorkName(filters.workName);
  const normalizedRowWorkNumber = normalizeWorkNumber(row.workNumber);
  const normalizedRowWorkName = normalizeWorkName(row.workName);

  const matchesWorkNumber =
    normalizedWorkNumberFilter.length === 0 || normalizedRowWorkNumber.includes(normalizedWorkNumberFilter);
  const matchesWorkName =
    normalizedWorkNameFilter.length === 0 || normalizedRowWorkName.includes(normalizedWorkNameFilter);
  const matchesDate = filters.reportDate.length === 0 || row.dateKey === filters.reportDate;

  return matchesWorkNumber && matchesWorkName && matchesDate;
};

export const filterReportsByWorkFilters = <T extends GroupableAnalysisRow>(
  rows: T[],
  rawFilters: WorkSearchFilters,
) => {
  const filters = normalizeWorkSearchFilters(rawFilters);
  const hasAnyFilter = hasWorkSearchFilters(filters);

  if (!filters.includeAllWorks && !hasAnyFilter) {
    return [] as T[];
  }

  return rows.filter((row) => rowMatchesWorkFilters(row, filters));
};

export const buildWorkGroupKey = (workNumber: string, workName: string) => {
  const normalizedWorkNumber = normalizeWorkNumber(workNumber);
  const normalizedWorkName = normalizeWorkName(workName);
  return `${normalizedWorkNumber}::${normalizedWorkName}`;
};

export const groupReportsByWork = <T extends GroupableAnalysisRow>(rows: T[]): GroupedWorkReports<T>[] => {
  const grouped = new Map<string, GroupedWorkReports<T>>();

  rows.forEach((row) => {
    const normalizedWorkNumber = normalizeWorkNumber(row.workNumber);
    const normalizedWorkName = normalizeWorkName(row.workName);
    const groupKey = buildWorkGroupKey(row.workNumber, row.workName);
    const existingGroup = grouped.get(groupKey);

    if (!existingGroup) {
      grouped.set(groupKey, {
        groupKey,
        normalizedWorkNumber,
        normalizedWorkName,
        displayWorkNumber: normalizeWorkDisplayNumber(row.workNumber),
        displayWorkName: normalizeWorkDisplayName(row.workName),
        count: 1,
        lastDateKey: row.dateKey,
        reports: [row],
      });
      return;
    }

    existingGroup.reports.push(row);
    existingGroup.count = existingGroup.reports.length;
    if (row.dateKey.localeCompare(existingGroup.lastDateKey) > 0) {
      existingGroup.lastDateKey = row.dateKey;
    }
  });

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      reports: [...group.reports].sort(
        (left, right) => right.dateKey.localeCompare(left.dateKey) || right.id.localeCompare(left.id),
      ),
      count: group.reports.length,
    }))
    .sort(
      (left, right) =>
        right.lastDateKey.localeCompare(left.lastDateKey) ||
        left.displayWorkNumber.localeCompare(right.displayWorkNumber, 'es', {
          numeric: true,
          sensitivity: 'base',
        }) ||
        left.displayWorkName.localeCompare(right.displayWorkName, 'es', { sensitivity: 'base' }),
    );
};
