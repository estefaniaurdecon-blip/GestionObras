import { describe, expect, it, vi } from 'vitest';
import type { WorkReport } from '../src/offline-db/types';
import {
  executeWorkReportImport,
  extractImportableReports,
  type ImportSourceFile,
} from '../src/services/workReportImportService';

const makeWorkReport = (overrides: Partial<WorkReport> = {}): WorkReport => ({
  id: overrides.id ?? 'report-1',
  tenantId: overrides.tenantId ?? 'tenant-1',
  projectId: overrides.projectId ?? null,
  title: overrides.title ?? 'Parte base',
  date: overrides.date ?? '2026-03-01',
  status: overrides.status ?? 'draft',
  payload: overrides.payload ?? {},
  createdAt: overrides.createdAt ?? 1,
  updatedAt: overrides.updatedAt ?? 1,
  deletedAt: overrides.deletedAt ?? null,
  syncStatus: overrides.syncStatus ?? 'pending',
  lastSyncError: overrides.lastSyncError ?? null,
});

const makeImportFile = (name: string, content: unknown): ImportSourceFile => ({
  name,
  text: async () => JSON.stringify(content),
});

describe('workReportImportService', () => {
  it('extrae partes importables desde estructura anidada', () => {
    const parsed = extractImportableReports([
      {
        report: {
          id: 'source-1',
          date: '2026-03-01',
          status: 'completed',
          workName: 'Obra Norte',
          payload: { reportIdentifier: 'PRT-20260301-AAAA00000000' },
        },
      },
      {
        report: {
          id: 'source-2',
          date: 'not-a-date',
          status: 'draft',
        },
      },
    ]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].date).toBe('2026-03-01');
    expect(parsed[0].status).toBe('completed');
    expect(parsed[0].title).toBe('Obra Norte');
  });

  it('detecta conflictos y pide resolucion si no se define politica', async () => {
    const existingReports = [
      makeWorkReport({
        id: 'existing-1',
        payload: { reportIdentifier: 'PRT-20260301-AAAA00000000' },
      }),
    ];
    const files = [
      makeImportFile('parte.json', {
        report: {
          id: 'source-1',
          date: '2026-03-01',
          status: 'draft',
          payload: { reportIdentifier: 'PRT-20260301-AAAA00000000' },
        },
      }),
    ];

    const createReport = vi.fn();
    const updateReport = vi.fn();

    const result = await executeWorkReportImport({
      tenantId: 'tenant-1',
      existingReports,
      files,
      createReport,
      updateReport,
    });

    expect(result.requiresConflictResolution).toBe(true);
    expect(result.conflictMatchesCount).toBe(1);
    expect(result.importedCount).toBe(0);
    expect(createReport).not.toHaveBeenCalled();
    expect(updateReport).not.toHaveBeenCalled();
  });

  it('sobrescribe cuando hay conflicto y politica overwrite', async () => {
    const existingReports = [
      makeWorkReport({
        id: 'existing-1',
        payload: { reportIdentifier: 'PRT-20260301-AAAA00000000' },
      }),
    ];
    const files = [
      makeImportFile('parte.json', {
        report: {
          id: 'source-1',
          date: '2026-03-01',
          status: 'pending',
          projectId: 'project-10',
          payload: { reportIdentifier: 'PRT-20260301-AAAA00000000', workName: 'Obra Norte' },
        },
      }),
    ];

    const createReport = vi.fn();
    const updateReport = vi.fn(async () => existingReports[0]);

    const result = await executeWorkReportImport({
      tenantId: 'tenant-1',
      existingReports,
      files,
      selectedConflictPolicy: 'overwrite',
      createReport,
      updateReport,
      nowIso: () => '2026-03-05T12:00:00.000Z',
    });

    expect(result.requiresConflictResolution).toBe(false);
    expect(result.importedCount).toBe(1);
    expect(result.overwrittenCount).toBe(1);
    expect(result.createdCount).toBe(0);
    expect(updateReport).toHaveBeenCalledTimes(1);
    expect(createReport).not.toHaveBeenCalled();

    const [, patch] = updateReport.mock.calls[0];
    const payload = patch.payload as Record<string, unknown>;
    expect(payload.importConflictPolicy).toBe('overwrite');
    expect(payload.importedAt).toBe('2026-03-05T12:00:00.000Z');
    expect(payload.importedFromFile).toBe('parte.json');
  });

  it('renumera cuando hay conflicto y politica renumber', async () => {
    const existingReports = [
      makeWorkReport({
        id: 'existing-1',
        payload: { reportIdentifier: 'PRT-20260301-AAAA00000000' },
      }),
    ];
    const files = [
      makeImportFile('parte.json', {
        report: {
          id: 'source-1',
          date: '2026-03-01',
          status: 'pending',
          projectId: 'project-10',
          payload: { reportIdentifier: 'PRT-20260301-AAAA00000000', workName: 'Obra Norte' },
        },
      }),
    ];

    const createReport = vi.fn(async (draft) =>
      makeWorkReport({
        id: 'created-1',
        tenantId: draft.tenantId,
        projectId: draft.projectId,
        title: draft.title,
        date: draft.date,
        status: draft.status,
        payload: draft.payload,
      }),
    );
    const updateReport = vi.fn();

    const result = await executeWorkReportImport({
      tenantId: 'tenant-1',
      existingReports,
      files,
      selectedConflictPolicy: 'renumber',
      createReport,
      updateReport,
      nowIso: () => '2026-03-05T12:00:00.000Z',
    });

    expect(result.requiresConflictResolution).toBe(false);
    expect(result.importedCount).toBe(1);
    expect(result.createdCount).toBe(1);
    expect(result.overwrittenCount).toBe(0);
    expect(result.renumberedCount).toBe(1);
    expect(updateReport).not.toHaveBeenCalled();
    expect(createReport).toHaveBeenCalledTimes(1);

    const [draft] = createReport.mock.calls[0];
    const payload = draft.payload as Record<string, unknown>;
    expect(payload.reportIdentifier).not.toBe('PRT-20260301-AAAA00000000');
    expect(String(payload.reportIdentifier)).toMatch(/^PRT-20260301-/);
    expect(payload.importConflictPolicy).toBe('renumber');
  });
});
