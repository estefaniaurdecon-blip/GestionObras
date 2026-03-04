import type { WorkReport } from '@/offline-db/types';

export const PENDING_MIGRATION_MESSAGE = 'Pendiente de migracion a API';
export const AUTO_CLONE_CHECK_INTERVAL_MS = 60_000;
const AUTO_CLONE_HOUR = 6;
export const WORK_REPORT_VISIBLE_DAYS = 7;
export const WORK_REPORT_HISTORY_LIMIT = 5000;

export function normalizeRoles(roles: unknown): string[] {
  if (!Array.isArray(roles)) return [];
  return roles.map((role) => String(role).toLowerCase());
}

export function getRoleLabel(isSuperAdmin: boolean, isTenantAdmin: boolean): string {
  if (isSuperAdmin) return 'SUPERADMIN';
  if (isTenantAdmin) return 'ADMIN';
  return 'USUARIO';
}

export function isTenantAdminRole(role: string): boolean {
  const normalized = role.trim().toLowerCase();
  return (
    normalized === 'tenant_admin' ||
    normalized === 'tenant-admin' ||
    normalized === 'tenant admin' ||
    normalized === 'admin' ||
    normalized === 'site_manager' ||
    normalized === 'site-manager'
  );
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function payloadText(payload: unknown, key: string): string | null {
  const record = asRecord(payload);
  if (!record) return null;
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

export function payloadNumber(payload: unknown, key: string): number | null {
  const record = asRecord(payload);
  if (!record) return null;
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function payloadBoolean(payload: unknown, key: string): boolean | null {
  const record = asRecord(payload);
  if (!record) return null;
  const value = record[key];
  return typeof value === 'boolean' ? value : null;
}

export function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function toOptionalString(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized : undefined;
}

function generateReportIdentifier(date: string): string {
  const datePart = date.replace(/-/g, '');
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  return `PRT-${datePart}-${randomPart}`;
}

export function generateUniqueReportIdentifier(date: string, reserved: Set<string>): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateReportIdentifier(date);
    if (!reserved.has(candidate)) {
      return candidate;
    }
  }
  return `${generateReportIdentifier(date)}-${Date.now().toString(36).toUpperCase()}`;
}

export function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function parseIsoDate(dateValue: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatCreationDateTime(createdAt: number): string {
  const date = new Date(createdAt);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function getIsoWeekKey(dateValue: string): string | null {
  const parsed = parseIsoDate(dateValue);
  if (!parsed) return null;

  const utcDate = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  const dayOfWeek = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayOfWeek);

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function cloneSerializableValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getNextBusinessDate(dateValue: string): string | null {
  const base = parseIsoDate(dateValue);
  if (!base) return null;

  const next = new Date(base);
  do {
    next.setDate(next.getDate() + 1);
  } while (next.getDay() === 0 || next.getDay() === 6);

  return toIsoDate(next);
}

export function getCloneDueTimestamp(targetDate: string): number | null {
  const parsed = parseIsoDate(targetDate);
  if (!parsed) return null;
  parsed.setHours(AUTO_CLONE_HOUR, 0, 0, 0);
  return parsed.getTime();
}

type WorkReportIdentity = {
  workNumber: string;
  workName: string;
};

export function getWorkReportIdentity(report: WorkReport): WorkReportIdentity {
  const payload = asRecord(report.payload);
  return {
    workNumber: normalizeComparableText(payloadText(payload, 'workNumber')),
    workName: normalizeComparableText(payloadText(payload, 'workName') ?? report.title ?? ''),
  };
}

export function sameWorkIdentity(left: WorkReportIdentity, right: WorkReportIdentity): boolean {
  if (left.workNumber && right.workNumber) {
    return left.workNumber === right.workNumber;
  }
  if (left.workName && right.workName) {
    return left.workName === right.workName;
  }
  return false;
}

export function filterRecentWorkReportsByCreationDay(reports: WorkReport[], visibleDays: number): WorkReport[] {
  const normalizedVisibleDays = Math.max(1, Math.trunc(visibleDays));
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const minVisibleDay = new Date(startOfToday);
  minVisibleDay.setDate(minVisibleDay.getDate() - (normalizedVisibleDays - 1));
  const minVisibleEpoch = minVisibleDay.getTime();

  // Prefer report business day over createdAt. On sync/import flows, createdAt can be refreshed
  // and cause stale reports to appear as "recent" on some platforms.
  const reportDayCache = new Map<string, number>();
  const getReportDayEpoch = (report: WorkReport): number | null => {
    const cached = reportDayCache.get(report.id);
    if (cached !== undefined) return cached;

    const dateCandidates = [report.date, payloadText(report.payload, 'date')];
    for (const candidate of dateCandidates) {
      if (typeof candidate !== 'string') continue;
      const normalized = candidate.trim();
      if (!normalized) continue;

      const parsedIso = parseIsoDate(normalized);
      if (parsedIso) {
        const dayEpoch = parsedIso.getTime();
        reportDayCache.set(report.id, dayEpoch);
        return dayEpoch;
      }

      const parsed = new Date(normalized);
      if (!Number.isNaN(parsed.getTime())) {
        parsed.setHours(0, 0, 0, 0);
        const dayEpoch = parsed.getTime();
        reportDayCache.set(report.id, dayEpoch);
        return dayEpoch;
      }
    }

    const createdAt = Number(report.createdAt);
    if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
    const createdDay = new Date(createdAt);
    createdDay.setHours(0, 0, 0, 0);
    const dayEpoch = createdDay.getTime();
    reportDayCache.set(report.id, dayEpoch);
    return dayEpoch;
  };

  return reports
    .filter((report) => {
      const reportDayEpoch = getReportDayEpoch(report);
      return reportDayEpoch !== null && reportDayEpoch >= minVisibleEpoch;
    })
    .sort((left, right) => {
      const rightDay = getReportDayEpoch(right) ?? Number.NEGATIVE_INFINITY;
      const leftDay = getReportDayEpoch(left) ?? Number.NEGATIVE_INFINITY;
      if (rightDay !== leftDay) {
        return rightDay - leftDay;
      }
      return right.createdAt - left.createdAt;
    });
}

export type HistoryFilterKey = 'foreman' | 'weeks' | 'months' | 'workName' | 'date';

export type AccessPersonalEntry = {
  id: string;
  name: string;
  dni: string;
  company: string;
  entryTime: string;
  exitTime: string;
  activity: string;
  signature: string;
};

export type AccessPersonalFormState = Omit<AccessPersonalEntry, 'id'>;

export const HISTORY_FILTER_OPTIONS: Array<{ key: HistoryFilterKey; label: string }> = [
  { key: 'foreman', label: 'Por encargado' },
  { key: 'weeks', label: 'Por semanas' },
  { key: 'months', label: 'Por meses' },
  { key: 'workName', label: 'Por nombre de obra' },
  { key: 'date', label: 'Por fecha' },
];

export const buildInitialAccessPersonalForm = (): AccessPersonalFormState => ({
  name: '',
  dni: '',
  company: '',
  entryTime: '08:00',
  exitTime: '18:00',
  activity: '',
  signature: '',
});
