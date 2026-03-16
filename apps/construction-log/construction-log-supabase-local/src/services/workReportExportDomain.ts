import type { DateRange } from 'react-day-picker';
import type { WorkReport } from '@/offline-db/types';
import { asRecord, payloadText } from '@/pages/indexHelpers';
import type { WorkReport as ExportWorkReport } from '@/types/workReport';

export type ReportImageCandidate = {
  id: string;
  reportId: string;
  reportLabel: string;
  groupId: string;
  supplier: string;
  invoiceNumber: string;
  uri: string;
  label: string;
};

export type SinglePeriodExportMode = 'day' | 'week' | 'month';

type SinglePeriodZipFilenameParams = {
  mode: SinglePeriodExportMode;
  selectedDay?: Date;
  selectedWeek?: DateRange;
  selectedMonthAnchor?: Date;
  now?: Date;
};

const safeText = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const safeNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const safeArray = (value: unknown) => (Array.isArray(value) ? value : []);
const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter((value) => value.length > 0)));

const sanitizeFilenameSegment = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toYearMonth = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export const getOfflineReportDateKey = (report: WorkReport) => {
  const payload = asRecord(report.payload);
  const payloadDate = payload ? safeText(payload.date) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(payloadDate)) return payloadDate;
  return report.date;
};

const buildReportLabel = (report: WorkReport) => {
  const workName = payloadText(report.payload, 'workName') ?? report.title ?? 'Parte';
  return `${getOfflineReportDateKey(report)} - ${workName}`;
};

export const collectAlbaranImageCandidates = (report: WorkReport): ReportImageCandidate[] => {
  const payload = asRecord(report.payload);
  const reportLabel = buildReportLabel(report);
  if (!payload) return [];

  const materialGroups = safeArray(payload.materialGroups);
  return materialGroups.flatMap((rawGroup, groupIndex) => {
    const group = asRecord(rawGroup);
    if (!group) return [];

    const groupId = safeText(group.id, `group-${groupIndex}`);
    const supplier = safeText(group.supplier, 'Proveedor');
    const invoiceNumber = safeText(group.invoiceNumber);
    const fromImageUris = safeArray(group.imageUris).map((uri) => safeText(uri)).filter(Boolean);
    const documentImage = safeText(group.documentImage);
    const allUris = uniqueStrings(documentImage ? [documentImage, ...fromImageUris] : fromImageUris);

    return allUris.map((uri, imageIndex) => {
      const id = `${report.id}::${groupId}::${imageIndex}`;
      const invoiceLabel = invoiceNumber ? ` - Alb. ${invoiceNumber}` : '';
      return {
        id,
        reportId: report.id,
        reportLabel,
        groupId,
        supplier,
        invoiceNumber,
        uri,
        label: `${reportLabel} - ${supplier}${invoiceLabel}`,
      };
    });
  });
};

export const buildSelectedImageMapByReport = (
  imageCandidates: ReportImageCandidate[],
  selectedImageIds: string[],
) => {
  const selectedIds = new Set(selectedImageIds);
  const byReport = new Map<string, Map<string, Set<string>>>();

  imageCandidates.forEach((candidate) => {
    if (!selectedIds.has(candidate.id)) return;
    const reportMap = byReport.get(candidate.reportId) ?? new Map<string, Set<string>>();
    const groupSet = reportMap.get(candidate.groupId) ?? new Set<string>();
    groupSet.add(candidate.uri);
    reportMap.set(candidate.groupId, groupSet);
    byReport.set(candidate.reportId, reportMap);
  });

  return byReport;
};

export const syncSelectedImageIdsWithCandidates = (
  previousSelectedImageIds: string[],
  imageCandidates: ReportImageCandidate[],
) => {
  const currentCandidateIds = new Set(imageCandidates.map((candidate) => candidate.id));
  const kept = previousSelectedImageIds.filter((id) => currentCandidateIds.has(id));
  if (kept.length > 0 || imageCandidates.length === 0) return kept;
  return imageCandidates.map((candidate) => candidate.id);
};

export const buildExportWorkReport = (
  report: WorkReport,
  selectedImageUrisByGroup?: Map<string, Set<string>>,
): ExportWorkReport => {
  const payload = asRecord(report.payload) ?? {};
  const workGroupsSource =
    safeArray(payload.workGroups).length > 0 ? safeArray(payload.workGroups) : safeArray(payload.workforceGroups);
  const machineryGroupsSource =
    safeArray(payload.machineryGroups).length > 0
      ? safeArray(payload.machineryGroups)
      : safeArray(payload.subcontractedMachineryGroups);

  const workGroups = workGroupsSource
    .map((rawGroup, groupIndex) => {
      const group = asRecord(rawGroup);
      if (!group) return null;
      const rows = safeArray(group.items).length > 0 ? safeArray(group.items) : safeArray(group.rows);
      const items = rows
        .map((rawRow, rowIndex) => {
          const row = asRecord(rawRow);
          if (!row) return null;
          return {
            id: safeText(row.id, `w-${groupIndex}-${rowIndex}`),
            name: safeText(row.name, safeText(row.workerName)),
            activity: safeText(row.activity),
            hours: safeNumber(row.hours),
            total: safeNumber(row.total, safeNumber(row.hours)),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      return {
        id: safeText(group.id, `wg-${groupIndex}`),
        company: safeText(group.company, safeText(group.companyName)),
        items,
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);

  const machineryGroups = machineryGroupsSource
    .map((rawGroup, groupIndex) => {
      const group = asRecord(rawGroup);
      if (!group) return null;
      const rows = safeArray(group.items).length > 0 ? safeArray(group.items) : safeArray(group.rows);
      const items = rows
        .map((rawRow, rowIndex) => {
          const row = asRecord(rawRow);
          if (!row) return null;
          return {
            id: safeText(row.id, `m-${groupIndex}-${rowIndex}`),
            type: safeText(row.type, safeText(row.machineType)),
            activity: safeText(row.activity),
            hours: safeNumber(row.hours),
            total: safeNumber(row.total, safeNumber(row.hours)),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      return {
        id: safeText(group.id, `mg-${groupIndex}`),
        company: safeText(group.company, safeText(group.companyName)),
        documentImage: safeText(group.documentImage) || undefined,
        items,
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);

  const materialGroups = safeArray(payload.materialGroups)
    .map((rawGroup, groupIndex) => {
      const group = asRecord(rawGroup);
      if (!group) return null;
      const groupId = safeText(group.id, `mat-${groupIndex}`);
      const rows = safeArray(group.items).length > 0 ? safeArray(group.items) : safeArray(group.rows);
      const items = rows
        .map((rawRow, rowIndex) => {
          const row = asRecord(rawRow);
          if (!row) return null;
          return {
            id: safeText(row.id, `mat-row-${groupIndex}-${rowIndex}`),
            name: safeText(row.name),
            quantity: safeNumber(row.quantity),
            unit: safeText(row.unit),
            unitPrice: safeNumber(row.unitPrice),
            total: safeNumber(row.total, safeNumber(row.quantity) * safeNumber(row.unitPrice)),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      const fromImageUris = safeArray(group.imageUris).map((uri) => safeText(uri)).filter(Boolean);
      const fromDocumentImage = safeText(group.documentImage);
      const allUris = uniqueStrings(fromDocumentImage ? [fromDocumentImage, ...fromImageUris] : fromImageUris);
      const allowedUris = selectedImageUrisByGroup?.get(groupId);
      const filteredUris = allowedUris ? allUris.filter((uri) => allowedUris.has(uri)) : allUris;

      return {
        id: groupId,
        supplier: safeText(group.supplier),
        invoiceNumber: safeText(group.invoiceNumber),
        items,
        documentImage: filteredUris[0] || undefined,
        imageUris: filteredUris,
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);

  const subcontractGroups = safeArray(payload.subcontractGroups)
    .map((rawGroup, groupIndex) => {
      const group = asRecord(rawGroup);
      if (!group) return null;
      const rows = safeArray(group.items).length > 0 ? safeArray(group.items) : safeArray(group.rows);
      const items = rows
        .map((rawRow, rowIndex) => {
          const row = asRecord(rawRow);
          if (!row) return null;
          return {
            id: safeText(row.id, `s-${groupIndex}-${rowIndex}`),
            contractedPart: safeText(row.contractedPart, safeText(row.partida)),
            company: safeText(row.company, safeText(group.company, safeText(group.companyName))),
            activity: safeText(row.activity),
            workers: safeNumber(row.workers, safeArray(row.workersAssigned).length),
            hours: safeNumber(row.hours),
            unitType: safeText(row.unitType, safeText(row.unit)) as
              | 'hora'
              | 'm3'
              | 'm2'
              | 'ml'
              | 'unidad'
              | undefined,
            quantity: safeNumber(row.quantity, safeNumber(row.cantPerWorker)),
            unitPrice: safeNumber(row.unitPrice),
            total: safeNumber(row.total),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      return {
        id: safeText(group.id, `sg-${groupIndex}`),
        company: safeText(group.company, safeText(group.companyName)),
        items,
        documentImage: safeText(group.documentImage) || undefined,
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);

  const createdAtIso = new Date(report.createdAt || Date.now()).toISOString();
  const updatedAtIso = new Date(report.updatedAt || Date.now()).toISOString();
  const workDate = getOfflineReportDateKey(report);
  const statusText = safeText(payload.workReportStatus, report.status);
  const exportStatus: ExportWorkReport['status'] =
    statusText === 'missing_data' || statusText === 'missing_delivery_notes' || statusText === 'completed'
      ? statusText
      : undefined;

  return {
    id: report.id,
    workNumber: safeText(payload.workNumber),
    date: workDate,
    workName: safeText(payload.workName, report.title ?? 'Parte'),
    workId: safeText(payload.workId, report.projectId ?? '') || undefined,
    foreman: safeText(
      payload.mainForeman,
      safeText(payload.main_foreman, safeText(payload.foreman))
    ),
    foremanHours: safeNumber(
      payload.mainForemanHours,
      safeNumber(payload.main_foreman_hours, safeNumber(payload.foremanHours))
    ),
    foremanEntries: (
      safeArray(payload.foremanEntries).length > 0
        ? safeArray(payload.foremanEntries)
        : safeArray(payload.foreman_entries).length > 0
          ? safeArray(payload.foreman_entries)
          : safeArray(payload.foremanResources).length > 0
            ? safeArray(payload.foremanResources)
            : safeArray(payload.foreman_resources)
    )
      .map((rawEntry, entryIndex) => {
        const entry = asRecord(rawEntry);
        if (!entry) return null;
        const rawRole = safeText(entry.role).toLowerCase();
        const role: 'encargado' | 'capataz' | 'recurso_preventivo' =
          rawRole === 'capataz' || rawRole === 'recurso_preventivo' ? rawRole : 'encargado';
        return {
          id: safeText(entry.id, `f-${entryIndex}`),
          name: safeText(entry.name),
          role,
          hours: safeNumber(entry.hours),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    foremanSignature: safeText(payload.foremanSignature, safeText(payload.foreman_signature)) || undefined,
    siteManager: safeText(payload.siteManager, safeText(payload.site_manager)),
    siteManagerSignature:
      safeText(payload.siteManagerSignature, safeText(payload.site_manager_signature)) || undefined,
    observations: safeText(payload.observationsText, safeText(payload.observations)),
    workGroups,
    machineryGroups,
    materialGroups,
    subcontractGroups,
    createdAt: createdAtIso,
    updatedAt: updatedAtIso,
    status: exportStatus,
  };
};

export const buildPdfExportFilename = (report: ExportWorkReport) => {
  const workNumber = sanitizeFilenameSegment(report.workNumber || 'sin_numero');
  const workName = sanitizeFilenameSegment(report.workName || 'sin_obra');
  const date = sanitizeFilenameSegment(report.date || 'sin_fecha');
  return `Parte_${date}_${workNumber}_${workName}`;
};

export const getSinglePeriodZipFilename = (params: SinglePeriodZipFilenameParams) => {
  if (params.mode === 'day' && params.selectedDay) {
    return `Partes_dia_${toDateKey(params.selectedDay)}.zip`;
  }
  if (params.mode === 'week' && params.selectedWeek?.from && params.selectedWeek?.to) {
    return `Partes_semana_${toDateKey(params.selectedWeek.from)}_a_${toDateKey(params.selectedWeek.to)}.zip`;
  }
  if (params.mode === 'month' && params.selectedMonthAnchor) {
    return `Partes_mes_${toYearMonth(params.selectedMonthAnchor)}.zip`;
  }
  const stamp = (params.now ?? new Date()).toISOString().slice(0, 10);
  return `Partes_${stamp}.zip`;
};

export const buildJsonExportFilesFromReports = (
  reports: WorkReport[],
  nowIso: () => string = () => new Date().toISOString(),
) => {
  return reports.map((report) => {
    const date = getOfflineReportDateKey(report);
    const identifier = sanitizeFilenameSegment(
      payloadText(report.payload, 'reportIdentifier') ?? report.id.slice(0, 8),
    );
    const workName = sanitizeFilenameSegment(
      payloadText(report.payload, 'workName') ?? report.title ?? 'sin_obra',
    );
    const filename = `Parte_${date}_${identifier}_${workName}.json`;
    const content = JSON.stringify(
      {
        version: 1,
        exportedAt: nowIso(),
        format: 'work-report-json',
        report: {
          id: report.id,
          title: report.title,
          date,
          status: report.status,
          projectId: report.projectId,
          payload: report.payload,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
        },
      },
      null,
      2,
    );

    return {
      filename,
      blob: new Blob([content], { type: 'application/json;charset=utf-8' }),
    };
  });
};
