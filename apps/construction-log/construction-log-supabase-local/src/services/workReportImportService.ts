import type { WorkReport, WorkReportStatus } from '@/offline-db/types';
import { asRecord, generateUniqueReportIdentifier } from '@/pages/indexHelpers';

export type ImportConflictPolicy = 'renumber' | 'overwrite';

export type ImportableReportPayload = {
  date: string;
  title: string | null;
  status: WorkReportStatus;
  projectId: string | null;
  payload: unknown;
  sourceId?: string;
};

type ImportQueueEntry = {
  fileName: string;
  report: ImportableReportPayload;
};

export type ImportSourceFile = {
  name: string;
  text: () => Promise<string>;
};

export type WorkReportCreateInput = {
  tenantId: string;
  projectId: string | null;
  title: string | null;
  date: string;
  status: WorkReportStatus;
  payload: unknown;
};

export type WorkReportUpdateInput = {
  projectId: string | null;
  title: string | null;
  date: string;
  status: WorkReportStatus;
  payload: unknown;
};

export type ExecuteWorkReportImportParams = {
  tenantId: string;
  existingReports: WorkReport[];
  files: ImportSourceFile[];
  selectedConflictPolicy?: ImportConflictPolicy;
  createReport: (draft: WorkReportCreateInput) => Promise<WorkReport>;
  updateReport: (id: string, patch: WorkReportUpdateInput) => Promise<WorkReport | null>;
  nowIso?: () => string;
};

export type ExecuteWorkReportImportResult = {
  reportsToImportCount: number;
  importedCount: number;
  createdCount: number;
  overwrittenCount: number;
  renumberedCount: number;
  invalidFilesCount: number;
  invalidReportsCount: number;
  conflictMatchesCount: number;
  requiresConflictResolution: boolean;
};

import { safeText } from '@/utils/valueNormalization';

export const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeWorkReportStatus = (value: unknown): WorkReportStatus => {
  const normalized = safeText(value).trim().toLowerCase();
  if (
    normalized === 'draft' ||
    normalized === 'pending' ||
    normalized === 'approved' ||
    normalized === 'completed' ||
    normalized === 'missing_data' ||
    normalized === 'missing_delivery_notes'
  ) {
    return normalized;
  }
  return 'draft';
};

export const normalizeReportIdentifierKey = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized;
};

export const getReportIdentifierFromPayload = (payload: unknown): string | null => {
  const payloadRecord = asRecord(payload);
  if (!payloadRecord) return null;
  const candidate = safeText(payloadRecord.reportIdentifier) || safeText(payloadRecord.report_identifier);
  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : null;
};

const toImportableReportFromRecord = (record: Record<string, unknown>): ImportableReportPayload | null => {
  const nestedReport = asRecord(record.report);
  const source = nestedReport ?? record;
  const sourcePayload = source.payload;
  const payloadRecord = asRecord(sourcePayload) ?? asRecord(source);

  const dateCandidate = safeText(source.date) || safeText(payloadRecord?.date);
  if (!isDateKey(dateCandidate)) return null;

  const titleCandidate =
    safeText(source.title) ||
    safeText(source.workName) ||
    safeText(payloadRecord?.workName) ||
    safeText(payloadRecord?.title) ||
    null;

  const projectIdCandidate =
    safeText(source.projectId) ||
    safeText(source.workId) ||
    safeText(payloadRecord?.projectId) ||
    safeText(payloadRecord?.workId) ||
    null;

  const statusCandidate =
    source.status ??
    source.workReportStatus ??
    payloadRecord?.workReportStatus ??
    payloadRecord?.status;

  const payload =
    sourcePayload !== undefined
      ? sourcePayload
      : payloadRecord
        ? payloadRecord
        : source;

  return {
    date: dateCandidate,
    title: titleCandidate,
    status: normalizeWorkReportStatus(statusCandidate),
    projectId: projectIdCandidate,
    payload,
    sourceId: safeText(source.id),
  };
};

export const extractImportableReports = (value: unknown): ImportableReportPayload[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractImportableReports(item));
  }

  const record = asRecord(value);
  if (!record) return [];

  const parsed = toImportableReportFromRecord(record);
  return parsed ? [parsed] : [];
};

const collectReportsToImport = async (
  files: ImportSourceFile[],
): Promise<{
  reportsToImport: ImportQueueEntry[];
  invalidFilesCount: number;
  invalidReportsCount: number;
}> => {
  let invalidFilesCount = 0;
  let invalidReportsCount = 0;
  const reportsToImport: ImportQueueEntry[] = [];

  for (const file of files) {
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as unknown;
      const importableReports = extractImportableReports(parsed);

      if (importableReports.length === 0) {
        invalidFilesCount += 1;
        continue;
      }

      for (const importable of importableReports) {
        if (!isDateKey(importable.date)) {
          invalidReportsCount += 1;
          continue;
        }
        reportsToImport.push({ fileName: file.name, report: importable });
      }
    } catch {
      invalidFilesCount += 1;
    }
  }

  return {
    reportsToImport,
    invalidFilesCount,
    invalidReportsCount,
  };
};

const buildExistingIdentifierLookup = (existingReports: WorkReport[]) => {
  const existingByIdentifier = new Map<string, WorkReport>();
  const reservedIdentifiers = new Set<string>();

  existingReports.forEach((report) => {
    const identifier = getReportIdentifierFromPayload(report.payload);
    if (!identifier) return;
    const key = normalizeReportIdentifierKey(identifier);
    if (!key) return;
    reservedIdentifiers.add(identifier);
    if (!existingByIdentifier.has(key)) {
      existingByIdentifier.set(key, report);
    }
  });

  return { existingByIdentifier, reservedIdentifiers };
};

const countIdentifierConflicts = (
  reportsToImport: ImportQueueEntry[],
  existingByIdentifier: Map<string, WorkReport>,
) => {
  return reportsToImport.reduce((count, entry) => {
    const sourceIdentifier = getReportIdentifierFromPayload(entry.report.payload);
    const targetIdentifier = sourceIdentifier ?? '';
    const identifierKey = normalizeReportIdentifierKey(targetIdentifier);
    if (!identifierKey) return count;
    return existingByIdentifier.has(identifierKey) ? count + 1 : count;
  }, 0);
};

export async function executeWorkReportImport(
  params: ExecuteWorkReportImportParams,
): Promise<ExecuteWorkReportImportResult> {
  const collected = await collectReportsToImport(params.files);
  const { existingByIdentifier, reservedIdentifiers } = buildExistingIdentifierLookup(params.existingReports);
  const conflictMatchesCount = countIdentifierConflicts(collected.reportsToImport, existingByIdentifier);

  if (conflictMatchesCount > 0 && !params.selectedConflictPolicy) {
    return {
      reportsToImportCount: collected.reportsToImport.length,
      importedCount: 0,
      createdCount: 0,
      overwrittenCount: 0,
      renumberedCount: 0,
      invalidFilesCount: collected.invalidFilesCount,
      invalidReportsCount: collected.invalidReportsCount,
      conflictMatchesCount,
      requiresConflictResolution: true,
    };
  }

  const conflictPolicy = params.selectedConflictPolicy ?? 'overwrite';
  const nowIso = params.nowIso ?? (() => new Date().toISOString());

  let createdCount = 0;
  let overwrittenCount = 0;
  let renumberedCount = 0;

  for (const { fileName, report: importable } of collected.reportsToImport) {
    const payloadRecord = asRecord(importable.payload);
    const sourceIdentifier = getReportIdentifierFromPayload(importable.payload);
    let targetIdentifier = sourceIdentifier ?? generateUniqueReportIdentifier(importable.date, reservedIdentifiers);
    let identifierKey = normalizeReportIdentifierKey(targetIdentifier);
    const existingMatch = identifierKey ? existingByIdentifier.get(identifierKey) : undefined;
    const hasConflict = Boolean(existingMatch);

    if (hasConflict && conflictPolicy === 'renumber') {
      targetIdentifier = generateUniqueReportIdentifier(importable.date, reservedIdentifiers);
      identifierKey = normalizeReportIdentifierKey(targetIdentifier);
      renumberedCount += 1;
    }

    const importTimestamp = nowIso();
    const payloadWithImportMeta = payloadRecord
      ? {
          ...payloadRecord,
          reportIdentifier: targetIdentifier,
          importedAt: importTimestamp,
          importedFromFile: fileName,
          importedOriginalReportId: importable.sourceId ?? null,
          importConflictPolicy: conflictPolicy,
        }
      : {
          value: importable.payload,
          reportIdentifier: targetIdentifier,
          importedAt: importTimestamp,
          importedFromFile: fileName,
          importedOriginalReportId: importable.sourceId ?? null,
          importConflictPolicy: conflictPolicy,
        };

    if (hasConflict && conflictPolicy === 'overwrite' && existingMatch) {
      await params.updateReport(existingMatch.id, {
        projectId: importable.projectId,
        title: importable.title ?? `Parte ${importable.date}`,
        date: importable.date,
        status: importable.status,
        payload: payloadWithImportMeta,
      });
      overwrittenCount += 1;
    } else {
      const createdReport = await params.createReport({
        tenantId: params.tenantId,
        projectId: importable.projectId,
        title: importable.title ?? `Parte ${importable.date}`,
        date: importable.date,
        status: importable.status,
        payload: payloadWithImportMeta,
      });
      createdCount += 1;
      if (identifierKey) {
        existingByIdentifier.set(identifierKey, createdReport);
      }
    }

    reservedIdentifiers.add(targetIdentifier);
  }

  return {
    reportsToImportCount: collected.reportsToImport.length,
    importedCount: createdCount + overwrittenCount,
    createdCount,
    overwrittenCount,
    renumberedCount,
    invalidFilesCount: collected.invalidFilesCount,
    invalidReportsCount: collected.invalidReportsCount,
    conflictMatchesCount,
    requiresConflictResolution: false,
  };
}
