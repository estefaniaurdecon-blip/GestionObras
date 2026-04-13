import { format } from 'date-fns';
import type { WorkReport } from '@/offline-db/types';
import {
  downloadExportFiles,
  getExportDirectoryLabel,
} from '@/services/workReportExportInfrastructure';
import {
  buildExportWorkReport,
  getOfflineReportDateKey,
} from '@/services/workReportExportDomain';
import { asRecord, payloadBoolean, payloadText } from '@/pages/indexHelpers';
import { safeNumber, safeText } from '@/utils/valueNormalization';
import type { PartsExcelPeriod, PartsGroupedReports, PartsGroupMode } from './shared';
import {
  applyWorksheetCenterAlignment,
  firstFiniteNumber,
  getRentalProvidersFromPayload,
  pickCostReference,
  sanitizeWorkbookSegment,
} from './shared';

type ExportGroupedReportsExcelParams = {
  period: PartsExcelPeriod;
  partsGroupMode: PartsGroupMode;
  selectedPartsGroup: PartsGroupedReports | null;
  reportsToExport: WorkReport[];
};

export const exportGroupedReportsExcel = async ({
  period,
  partsGroupMode,
  selectedPartsGroup,
  reportsToExport,
}: ExportGroupedReportsExcelParams) => {
  const XLSX = await import('xlsx-js-style');
  const workbook = XLSX.utils.book_new();
  const rows = reportsToExport
    .map((report) => {
      const payload = asRecord(report.payload) ?? {};
      const exportReport = buildExportWorkReport(report);
      const reportIdentifier = payloadText(report.payload, 'reportIdentifier') ?? report.id.slice(0, 8);
      const statusText = String(report.status ?? '').toLowerCase();
      const isClosed =
        (payloadBoolean(report.payload, 'isClosed') ?? false) ||
        statusText === 'completed' ||
        statusText === 'closed';

      const workersHours = exportReport.workGroups.reduce(
        (sum, group) => sum + group.items.reduce((groupSum, item) => groupSum + safeNumber(item.hours), 0),
        0,
      );
      const machineryHours = exportReport.machineryGroups.reduce(
        (sum, group) => sum + group.items.reduce((groupSum, item) => groupSum + safeNumber(item.hours), 0),
        0,
      );
      const foremanEntriesHours = (exportReport.foremanEntries ?? []).reduce((sum, entry) => {
        if (entry.role !== 'encargado') return sum;
        return sum + safeNumber(entry.hours);
      }, 0);
      const legacyForemanHours = firstFiniteNumber(payload.mainForemanHours, payload.foremanHours);
      const totalHoursInPayload = firstFiniteNumber(payload.totalHours);
      const legacyLooksLikeTotalHours =
        typeof legacyForemanHours === 'number' &&
        typeof totalHoursInPayload === 'number' &&
        Math.abs(legacyForemanHours - totalHoursInPayload) < 0.01 &&
        (workersHours > 0 || machineryHours > 0);
      const foremanHours =
        firstFiniteNumber(payload.mainForemanHours) ??
        (foremanEntriesHours > 0 ? foremanEntriesHours : null) ??
        (typeof legacyForemanHours === 'number' && !legacyLooksLikeTotalHours ? legacyForemanHours : null) ??
        0;
      const totalHours = firstFiniteNumber(payload.totalHours) ?? foremanHours + workersHours + machineryHours;

      const materialsCostFromReport = exportReport.materialGroups.reduce(
        (sum, group) =>
          sum +
          group.items.reduce(
            (groupSum, item) => groupSum + safeNumber(item.total, safeNumber(item.quantity) * safeNumber(item.unitPrice)),
            0,
          ),
        0,
      );
      const totalCost =
        materialsCostFromReport > 0
          ? materialsCostFromReport
          : pickCostReference(
              payload.materialTotal,
              payload.materialTotals,
              payload.materialsTotal,
              payload.materialCost,
              payload.materialsCost,
              payload.materialCostTotal,
              payload.materialTotalCost,
              payload.totalCost,
              payload.totalCostAmount,
              payload.costTotal,
            );

      const rentalProviders = getRentalProvidersFromPayload(report.payload);

      return {
        report,
        reportIdentifier,
        dateKey: getOfflineReportDateKey(report),
        workName: exportReport.workName || report.title || 'Sin obra',
        foremanName:
          payloadText(report.payload, 'mainForeman') ??
          payloadText(report.payload, 'foreman') ??
          exportReport.foreman ??
          'Sin encargado',
        isClosed,
        foremanHours,
        totalHours,
        totalCost,
        rentalProviders,
        workerRows: exportReport.workGroups.flatMap((group) =>
          group.items.map((item) => ({
            company: safeText(group.company, 'Sin empresa'),
            name: safeText(item.name, 'Sin nombre'),
            activity: safeText(item.activity),
            hours: safeNumber(item.hours),
            total: safeNumber(item.total),
          })),
        ),
        machineryRows: exportReport.machineryGroups.flatMap((group) =>
          group.items.map((item) => ({
            company: safeText(group.company, 'Sin empresa'),
            type: safeText(item.type, 'Sin tipo'),
            activity: safeText(item.activity),
            hours: safeNumber(item.hours),
            total: safeNumber(item.total),
          })),
        ),
      };
    })
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey) || right.report.id.localeCompare(left.report.id));

  const totals = {
    reports: rows.length,
    foremanHours: rows.reduce((sum, row) => sum + row.foremanHours, 0),
    totalHours: rows.reduce((sum, row) => sum + row.totalHours, 0),
    totalCost: rows.reduce((sum, row) => sum + row.totalCost, 0),
  };
  const providersMap = new Map<string, number>();
  rows.forEach((row) => {
    row.rentalProviders.forEach((provider) => {
      providersMap.set(provider, (providersMap.get(provider) ?? 0) + 1);
    });
  });

  const summarySheet = XLSX.utils.json_to_sheet([
    {
      'Vista de agrupacion':
        partsGroupMode === 'foreman' ? 'Por encargado' : partsGroupMode === 'weekly' ? 'Por semanas' : 'Por meses',
      'Grupo seleccionado': selectedPartsGroup?.label ?? 'Sin seleccion',
      'Tipo de Excel': period === 'weekly' ? 'Excel semanal' : 'Excel mensual',
      'Total partes': totals.reports,
      'Horas encargado': Number(totals.foremanHours.toFixed(2)),
      'Horas totales': Number(totals.totalHours.toFixed(2)),
      'Costo total (EUR)': Number(totals.totalCost.toFixed(2)),
      'Proveedores alquiler': providersMap.size,
    },
  ]);
  summarySheet['!cols'] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 18 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 20 },
  ];
  applyWorksheetCenterAlignment(summarySheet as Record<string, unknown>, XLSX);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

  const partsSheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      Fecha: row.dateKey,
      Parte: row.reportIdentifier,
      Obra: row.workName,
      Encargado: row.foremanName,
      Estado: row.isClosed ? 'Cerrado' : 'Abierto',
      'Horas encargado': Number(row.foremanHours.toFixed(2)),
      'Horas totales': Number(row.totalHours.toFixed(2)),
      'Costo total (EUR)': Number(row.totalCost.toFixed(2)),
      'Proveedores alquiler': row.rentalProviders.length > 0 ? row.rentalProviders.join(', ') : 'Sin proveedores',
    })),
  );
  partsSheet['!cols'] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 24 },
    { wch: 20 },
    { wch: 12 },
    { wch: 15 },
    { wch: 14 },
    { wch: 16 },
    { wch: 38 },
  ];
  applyWorksheetCenterAlignment(partsSheet as Record<string, unknown>, XLSX);
  XLSX.utils.book_append_sheet(workbook, partsSheet, 'Partes');

  const workerRows = rows.flatMap((row) =>
    row.workerRows.map((worker) => ({
      Fecha: row.dateKey,
      Parte: row.reportIdentifier,
      Empresa: worker.company,
      Trabajador: worker.name,
      Actividad: worker.activity,
      Horas: Number(worker.hours.toFixed(2)),
      'Total (EUR)': Number(worker.total.toFixed(2)),
    })),
  );
  if (workerRows.length > 0) {
    const workersSheet = XLSX.utils.json_to_sheet(workerRows);
    workersSheet['!cols'] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 24 },
      { wch: 22 },
      { wch: 24 },
      { wch: 10 },
      { wch: 12 },
    ];
    applyWorksheetCenterAlignment(workersSheet as Record<string, unknown>, XLSX);
    XLSX.utils.book_append_sheet(workbook, workersSheet, 'Trabajadores');
  }

  const machineryRows = rows.flatMap((row) =>
    row.machineryRows.map((machine) => ({
      Fecha: row.dateKey,
      Parte: row.reportIdentifier,
      Empresa: machine.company,
      Maquinaria: machine.type,
      Actividad: machine.activity,
      Horas: Number(machine.hours.toFixed(2)),
      'Total (EUR)': Number(machine.total.toFixed(2)),
    })),
  );
  if (machineryRows.length > 0) {
    const machinerySheet = XLSX.utils.json_to_sheet(machineryRows);
    machinerySheet['!cols'] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 24 },
      { wch: 22 },
      { wch: 24 },
      { wch: 10 },
      { wch: 12 },
    ];
    applyWorksheetCenterAlignment(machinerySheet as Record<string, unknown>, XLSX);
    XLSX.utils.book_append_sheet(workbook, machinerySheet, 'Maquinaria');
  }

  if (providersMap.size > 0) {
    const providerRows = [...providersMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
      .map(([provider, reportsCount]) => ({
        Proveedor: provider,
        'Partes asociados': reportsCount,
      }));
    const providersSheet = XLSX.utils.json_to_sheet(providerRows);
    providersSheet['!cols'] = [{ wch: 36 }, { wch: 16 }];
    applyWorksheetCenterAlignment(providersSheet as Record<string, unknown>, XLSX);
    XLSX.utils.book_append_sheet(workbook, providersSheet, 'Proveedores alquiler');
  }

  const workbookArray = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const workbookBlob = new Blob([workbookArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filePrefix = period === 'weekly' ? 'Excel_Semanal' : 'Excel_Mensual';
  const groupSegment = sanitizeWorkbookSegment(selectedPartsGroup?.label ?? 'grupo');
  const filename = `${filePrefix}_${groupSegment}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  const downloadResult = await downloadExportFiles([{ filename, blob: workbookBlob }]);

  return downloadResult.directory
    ? `Se guardo en ${getExportDirectoryLabel(downloadResult.directory)}.`
    : 'Se descargo el Excel correctamente.';
};
