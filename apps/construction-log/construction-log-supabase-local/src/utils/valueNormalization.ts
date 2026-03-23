/**
 * Shared value-normalization helpers used across reports, exports, imports and dashboard.
 * Keep these pure (no side effects, no imports from app modules).
 */

export const parseDateKey = (value: string): Date | null => {
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

export const parseReportDateValue = (value: string): Date | null => {
  const fromDateKey = parseDateKey(value);
  if (fromDateKey) return fromDateKey;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

export const safeText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

/** Strict safe number — does NOT coerce strings. Use erpBudget.safeNumber when coercion is needed. */
export const safeNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const safeArray = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

export const firstFiniteNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
};

export const pickCostReference = (...values: unknown[]): number => {
  const finiteValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  const firstPositive = finiteValues.find((value) => value > 0);
  if (typeof firstPositive === 'number') return firstPositive;
  return finiteValues[0] ?? 0;
};
