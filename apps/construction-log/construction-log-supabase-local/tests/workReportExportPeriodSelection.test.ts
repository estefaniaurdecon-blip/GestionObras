import { describe, expect, it } from 'vitest';
import {
  expandRangeToDateKeys,
  getSinglePeriodDateKeys,
  getSinglePeriodSelectionLabel,
  normalizeSelectedDays,
  toDateKey,
} from '../src/hooks/useWorkReportExportPeriodSelection';

describe('workReportExportPeriodSelection', () => {
  it('normaliza fechas y elimina duplicados por dia', () => {
    const normalized = normalizeSelectedDays([
      new Date(2026, 2, 2, 10, 0, 0, 0),
      new Date(2026, 2, 1, 8, 0, 0, 0),
      new Date(2026, 2, 1, 16, 30, 0, 0),
    ]);

    expect(normalized.map((date) => toDateKey(date))).toEqual(['2026-03-01', '2026-03-02']);
  });

  it('expande rangos de forma inclusiva aunque lleguen invertidos', () => {
    const keys = expandRangeToDateKeys(new Date(2026, 2, 5), new Date(2026, 2, 3));
    expect(keys).toEqual(['2026-03-03', '2026-03-04', '2026-03-05']);
  });

  it('calcula date keys para seleccion diaria, semanal y mensual', () => {
    const dayKeys = getSinglePeriodDateKeys({
      mode: 'day',
      selectedDay: new Date(2026, 2, 9),
    });
    expect(dayKeys).toEqual(['2026-03-09']);

    const weekKeys = getSinglePeriodDateKeys({
      mode: 'week',
      selectedWeek: { from: new Date(2026, 2, 2), to: new Date(2026, 2, 4) },
    });
    expect(weekKeys).toEqual(['2026-03-02', '2026-03-03', '2026-03-04']);

    const monthKeys = getSinglePeriodDateKeys({
      mode: 'month',
      selectedMonthAnchor: new Date(2024, 1, 10),
    });
    expect(monthKeys).toHaveLength(29);
    expect(monthKeys[0]).toBe('2024-02-01');
    expect(monthKeys[28]).toBe('2024-02-29');
  });

  it('genera etiqueta legible para cada modo de periodo', () => {
    const dayLabel = getSinglePeriodSelectionLabel({
      mode: 'day',
      selectedDay: new Date(2026, 2, 9),
    });
    expect(dayLabel.startsWith('Dia:')).toBe(true);
    expect(dayLabel).toContain('2026');

    const weekLabel = getSinglePeriodSelectionLabel({
      mode: 'week',
      selectedWeek: { from: new Date(2026, 2, 2), to: new Date(2026, 2, 8) },
    });
    expect(weekLabel.startsWith('Semana:')).toBe(true);
    expect(weekLabel).toContain(' - ');
    expect(weekLabel).toContain('2026');

    const monthLabel = getSinglePeriodSelectionLabel({
      mode: 'month',
      selectedMonthAnchor: new Date(2026, 2, 1),
    });
    expect(monthLabel.startsWith('Mes:')).toBe(true);
    expect(monthLabel).toContain('2026');
  });
});
