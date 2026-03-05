import { describe, expect, it } from 'vitest';
import type { WorkReport } from '../src/offline-db/types';
import type { WorkReport as ExportWorkReport } from '../src/types/workReport';
import {
  buildExportWorkReport,
  buildJsonExportFilesFromReports,
  buildPdfExportFilename,
  buildSelectedImageMapByReport,
  collectAlbaranImageCandidates,
  getOfflineReportDateKey,
  getSinglePeriodZipFilename,
  syncSelectedImageIdsWithCandidates,
} from '../src/services/workReportExportDomain';

const makeOfflineReport = (overrides: Partial<WorkReport> = {}): WorkReport => ({
  id: overrides.id ?? 'r-1',
  tenantId: overrides.tenantId ?? 'tenant-1',
  projectId: overrides.projectId ?? null,
  title: overrides.title ?? 'Parte base',
  date: overrides.date ?? '2026-03-01',
  status: overrides.status ?? 'draft',
  payload: overrides.payload ?? {},
  createdAt: overrides.createdAt ?? 10,
  updatedAt: overrides.updatedAt ?? 20,
  deletedAt: overrides.deletedAt ?? null,
  syncStatus: overrides.syncStatus ?? 'pending',
  lastSyncError: overrides.lastSyncError ?? null,
});

const makeExportReport = (overrides: Partial<ExportWorkReport> = {}): ExportWorkReport => ({
  id: overrides.id ?? 'exp-1',
  workNumber: overrides.workNumber ?? '001',
  date: overrides.date ?? '2026-03-01',
  workName: overrides.workName ?? 'Obra Norte',
  foreman: overrides.foreman ?? '',
  foremanHours: overrides.foremanHours ?? 0,
  siteManager: overrides.siteManager ?? '',
  observations: overrides.observations ?? '',
  workGroups: overrides.workGroups ?? [],
  machineryGroups: overrides.machineryGroups ?? [],
  materialGroups: overrides.materialGroups ?? [],
  subcontractGroups: overrides.subcontractGroups ?? [],
  createdAt: overrides.createdAt ?? '',
  updatedAt: overrides.updatedAt ?? '',
});

describe('workReportExportDomain', () => {
  it('prioriza fecha de payload cuando viene en formato YYYY-MM-DD', () => {
    const report = makeOfflineReport({
      date: '2026-03-01',
      payload: { date: '2026-03-05' },
    });
    expect(getOfflineReportDateKey(report)).toBe('2026-03-05');
  });

  it('extrae candidatos de imagenes de albaran sin duplicados', () => {
    const report = makeOfflineReport({
      id: 'r-1',
      date: '2026-03-01',
      payload: {
        workName: 'Obra Norte',
        materialGroups: [
          {
            id: 'g-1',
            supplier: 'Proveedor A',
            invoiceNumber: 'ALB-10',
            documentImage: 'doc://img-a',
            imageUris: ['doc://img-a', 'doc://img-b'],
          },
        ],
      },
    });

    const candidates = collectAlbaranImageCandidates(report);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.uri)).toEqual(['doc://img-a', 'doc://img-b']);
    expect(candidates[0].label).toContain('Proveedor A');
    expect(candidates[0].label).toContain('ALB-10');
  });

  it('construye ExportWorkReport aplicando fallbacks y filtro de imagenes', () => {
    const report = makeOfflineReport({
      id: 'r-build',
      title: 'Parte base',
      projectId: 'project-1',
      date: '2026-03-07',
      createdAt: Date.parse('2026-03-07T09:00:00.000Z'),
      updatedAt: Date.parse('2026-03-07T10:15:00.000Z'),
      payload: {
        date: '2026-03-08',
        workNumber: 'OB-33',
        workName: 'Obra Sur',
        mainForeman: 'Encargado 1',
        mainForemanHours: 7.5,
        foremanEntries: [
          { id: 'f1', name: 'Capataz X', role: 'capataz', hours: 6 },
          { id: 'f2', name: 'Sin rol', role: 'algo-raro', hours: 2 },
        ],
        workforceGroups: [
          {
            id: 'wg-legacy',
            companyName: 'Empresa A',
            rows: [{ workerName: 'Peon 1', activity: 'Zanja', hours: 5 }],
          },
        ],
        subcontractedMachineryGroups: [
          {
            id: 'mg-legacy',
            companyName: 'Maquinaria A',
            rows: [{ machineType: 'Retroexcavadora', activity: 'Movimiento', hours: 4 }],
          },
        ],
        materialGroups: [
          {
            id: 'mat-1',
            supplier: 'Proveedor A',
            invoiceNumber: 'ALB-90',
            documentImage: 'uri://a',
            imageUris: ['uri://a', 'uri://b'],
            rows: [{ name: 'Cemento', quantity: 2, unit: 'saco', unitPrice: 5 }],
          },
        ],
        subcontractGroups: [
          {
            id: 'sg-1',
            companyName: 'Subcontrata A',
            rows: [{ contractedPart: 'Muro', activity: 'Levantado', workersAssigned: [{ id: 'w1' }], hours: 3 }],
          },
        ],
        workReportStatus: 'missing_delivery_notes',
      },
    });

    const selectedByGroup = new Map<string, Set<string>>([['mat-1', new Set(['uri://b'])]]);
    const exportReport = buildExportWorkReport(report, selectedByGroup);

    expect(exportReport.date).toBe('2026-03-08');
    expect(exportReport.workId).toBe('project-1');
    expect(exportReport.workGroups).toHaveLength(1);
    expect(exportReport.workGroups[0].company).toBe('Empresa A');
    expect(exportReport.workGroups[0].items[0].name).toBe('Peon 1');
    expect(exportReport.machineryGroups[0].items[0].type).toBe('Retroexcavadora');
    expect(exportReport.materialGroups[0].documentImage).toBe('uri://b');
    expect(exportReport.materialGroups[0].imageUris).toEqual(['uri://b']);
    expect(exportReport.subcontractGroups[0].items[0].workers).toBe(1);
    expect(exportReport.foremanEntries?.[1].role).toBe('encargado');
    expect(exportReport.status).toBe('missing_delivery_notes');
    expect(exportReport.createdAt).toBe('2026-03-07T09:00:00.000Z');
    expect(exportReport.updatedAt).toBe('2026-03-07T10:15:00.000Z');
  });

  it('omite status no exportable en buildExportWorkReport', () => {
    const report = makeOfflineReport({
      status: 'draft',
      payload: { workReportStatus: 'draft' },
    });

    const exportReport = buildExportWorkReport(report);
    expect(exportReport.status).toBeUndefined();
  });

  it('construye mapa por parte/grupo solo con ids seleccionados', () => {
    const candidates = [
      {
        id: 'c-1',
        reportId: 'r-1',
        reportLabel: 'R1',
        groupId: 'g-1',
        supplier: 'A',
        invoiceNumber: '',
        uri: 'u-1',
        label: 'L1',
      },
      {
        id: 'c-2',
        reportId: 'r-1',
        reportLabel: 'R1',
        groupId: 'g-1',
        supplier: 'A',
        invoiceNumber: '',
        uri: 'u-2',
        label: 'L2',
      },
      {
        id: 'c-3',
        reportId: 'r-2',
        reportLabel: 'R2',
        groupId: 'g-2',
        supplier: 'B',
        invoiceNumber: '',
        uri: 'u-3',
        label: 'L3',
      },
    ];

    const map = buildSelectedImageMapByReport(candidates, ['c-2', 'c-3']);
    expect(map.get('r-1')?.get('g-1')?.has('u-2')).toBe(true);
    expect(map.get('r-1')?.get('g-1')?.has('u-1')).toBe(false);
    expect(map.get('r-2')?.get('g-2')?.has('u-3')).toBe(true);
  });

  it('sin seleccion valida aplica fallback a todas las candidatas disponibles', () => {
    const candidates = [
      { id: 'a', reportId: 'r', reportLabel: '', groupId: 'g', supplier: '', invoiceNumber: '', uri: '', label: '' },
      { id: 'b', reportId: 'r', reportLabel: '', groupId: 'g', supplier: '', invoiceNumber: '', uri: '', label: '' },
    ];
    expect(syncSelectedImageIdsWithCandidates(['x'], candidates)).toEqual(['a', 'b']);
    expect(syncSelectedImageIdsWithCandidates(['a'], candidates)).toEqual(['a']);
  });

  it('genera nombre de PDF y ZIP por periodo con formato estable', () => {
    const fileName = buildPdfExportFilename(
      makeExportReport({
        workNumber: '001/2',
        workName: 'Obra Norte: fase 1',
        date: '2026-03-01',
      }),
    );
    expect(fileName).toBe('Parte_2026-03-01_001_2_Obra_Norte_fase_1');

    const dayZip = getSinglePeriodZipFilename({
      mode: 'day',
      selectedDay: new Date('2026-03-04T00:00:00.000Z'),
    });
    expect(dayZip).toBe('Partes_dia_2026-03-04.zip');
  });

  it('genera JSON exportable con metadatos de exportacion', async () => {
    const report = makeOfflineReport({
      id: 'r-10',
      date: '2026-03-01',
      payload: {
        date: '2026-03-02',
        reportIdentifier: 'PRT-20260302-AAAA00000000',
        workName: 'Obra Norte',
      },
    });

    const files = buildJsonExportFilesFromReports([report], () => '2026-03-05T12:00:00.000Z');
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('Parte_2026-03-02_PRT-20260302-AAAA00000000_Obra_Norte.json');

    const content = JSON.parse(await files[0].blob.text()) as Record<string, unknown>;
    expect(content.exportedAt).toBe('2026-03-05T12:00:00.000Z');
    expect((content.report as Record<string, unknown>).id).toBe('r-10');
  });
});
