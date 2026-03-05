import { describe, expect, it } from 'vitest';
import {
  EMPTY_WORK_SEARCH_FILTERS,
  filterReportsByWorkFilters,
  groupReportsByWork,
  normalizeWorkName,
  normalizeWorkNumber,
} from '../src/components/reportsAnalysisWorkGrouping';

type MockRow = {
  id: string;
  workNumber: string;
  workName: string;
  reportIdentifier: string;
  reportTitle: string;
  dateKey: string;
  totalHours: number;
  isClosed: boolean;
};

const makeRow = (row: Partial<MockRow> & Pick<MockRow, 'id'>): MockRow => ({
  id: row.id,
  workNumber: row.workNumber ?? '',
  workName: row.workName ?? '',
  reportIdentifier: row.reportIdentifier ?? row.id,
  reportTitle: row.reportTitle ?? row.id,
  dateKey: row.dateKey ?? '2026-01-01',
  totalHours: row.totalHours ?? 0,
  isClosed: row.isClosed ?? false,
});

describe('reportsAnalysisWorkGrouping', () => {
  it('normaliza numero de obra numerico eliminando ceros iniciales', () => {
    expect(normalizeWorkNumber(' 00123 ')).toBe('123');
    expect(normalizeWorkNumber('000')).toBe('0');
  });

  it('normaliza nombre de obra con trim y case-insensitive', () => {
    expect(normalizeWorkName('  Obra   Norte  ')).toBe('obra norte');
    expect(normalizeWorkName('OBRA NORTE')).toBe('obra norte');
  });

  it('agrupa por numero+nombre normalizados y cuenta partes', () => {
    const rows: MockRow[] = [
      makeRow({ id: 'a', workNumber: '0012', workName: 'Obra X', dateKey: '2026-02-04' }),
      makeRow({ id: 'b', workNumber: '12', workName: 'obra x', dateKey: '2026-02-05' }),
      makeRow({ id: 'c', workNumber: '77', workName: 'Obra Y', dateKey: '2026-02-03' }),
    ];

    const groups = groupReportsByWork(rows);

    expect(groups).toHaveLength(2);
    expect(groups[0].normalizedWorkNumber).toBe('12');
    expect(groups[0].normalizedWorkName).toBe('obra x');
    expect(groups[0].count).toBe(2);
    expect(groups[0].reports.map((report) => report.id)).toEqual(['b', 'a']);
  });

  it('filtra por numero, nombre y fecha en AND', () => {
    const rows: MockRow[] = [
      makeRow({ id: 'a', workNumber: '100', workName: 'Obra Norte', dateKey: '2026-03-01' }),
      makeRow({ id: 'b', workNumber: '100', workName: 'Obra Sur', dateKey: '2026-03-01' }),
      makeRow({ id: 'c', workNumber: '200', workName: 'Obra Norte', dateKey: '2026-03-02' }),
    ];

    const filtered = filterReportsByWorkFilters(rows, {
      includeAllWorks: true,
      workNumber: '100',
      workName: 'norte',
      reportDate: '2026-03-01',
    });

    expect(filtered.map((row) => row.id)).toEqual(['a']);
  });

  it('con todas las obras activado y sin filtros devuelve todo', () => {
    const rows: MockRow[] = [
      makeRow({ id: 'a', workNumber: '100', workName: 'Obra A' }),
      makeRow({ id: 'b', workNumber: '200', workName: 'Obra B' }),
    ];

    const filtered = filterReportsByWorkFilters(rows, {
      ...EMPTY_WORK_SEARCH_FILTERS,
      includeAllWorks: true,
    });

    expect(filtered).toHaveLength(2);
  });

  it('sin filtros y sin todas las obras devuelve vacio', () => {
    const rows: MockRow[] = [
      makeRow({ id: 'a', workNumber: '100', workName: 'Obra A' }),
      makeRow({ id: 'b', workNumber: '200', workName: 'Obra B' }),
    ];

    const filtered = filterReportsByWorkFilters(rows, EMPTY_WORK_SEARCH_FILTERS);

    expect(filtered).toHaveLength(0);
  });
});
