import {
  mapForemanRoleForReport,
  mapSubcontractUnitToReportUnit,
  nonNegative,
  nonNegativeInt,
  sanitizeText,
  todayDate,
} from '@/components/work-report/helpers';
import type {
  ForemanResource,
  MaterialGroup,
  SubcontractGroup,
  SubcontractGroupTotals,
  SubcontractedMachineryGroup,
  WorkforceGroup,
} from '@/components/work-report/types';
import type { WorkReport } from '@/types/workReport';

export type BuildWorkReportForExportParams = {
  reportIdentifier?: string | null;
  workNumber: string;
  date: string;
  workName: string;
  workId?: string | null;
  mainForeman: string;
  mainForemanHours: number;
  foremanResources: ForemanResource[];
  foremanSignature: string;
  siteManager: string;
  siteManagerSignature: string;
  observationsText: string;
  workforceGroups: WorkforceGroup[];
  subcontractedMachineryGroups: SubcontractedMachineryGroup[];
  materialGroups: MaterialGroup[];
  subcontractGroups: SubcontractGroup[];
  subcontractTotalsByGroupId: Record<string, SubcontractGroupTotals>;
  autoCloneNextDay: boolean;
  status: NonNullable<WorkReport['status']>;
  nowIso?: string;
};

export const buildWorkReportForExport = ({
  reportIdentifier,
  workNumber,
  date,
  workName,
  workId,
  mainForeman,
  mainForemanHours,
  foremanResources,
  foremanSignature,
  siteManager,
  siteManagerSignature,
  observationsText,
  workforceGroups,
  subcontractedMachineryGroups,
  materialGroups,
  subcontractGroups,
  subcontractTotalsByGroupId,
  autoCloneNextDay,
  status,
  nowIso = new Date().toISOString(),
}: BuildWorkReportForExportParams): WorkReport => {
  const reportForemanEntries = foremanResources
    .map((resource) => ({
      id: resource.id || crypto.randomUUID(),
      name: resource.name.trim(),
      role: mapForemanRoleForReport(resource.role),
      hours: nonNegative(resource.hours),
    }))
    .filter((resource) => resource.name.length > 0 || resource.hours > 0);

  const reportWorkGroups = workforceGroups
    .map((group) => ({
      id: group.id,
      company: group.companyName.trim(),
      items: group.rows
        .filter(
          (row) =>
            row.workerName.trim().length > 0 ||
            row.activity.trim().length > 0 ||
            nonNegative(row.hours) > 0,
        )
        .map((row) => ({
          id: row.id,
          name: row.workerName.trim(),
          activity: row.activity.trim(),
          hours: nonNegative(row.hours),
          total: nonNegative(row.total || row.hours),
        })),
    }))
    .filter((group) => group.company.length > 0 || group.items.length > 0);

  const reportMachineryGroups = subcontractedMachineryGroups
    .map((group) => ({
      id: group.id,
      company: group.companyName.trim(),
      items: group.rows
        .filter(
          (row) =>
            row.machineType.trim().length > 0 ||
            row.activity.trim().length > 0 ||
            nonNegative(row.hours) > 0,
        )
        .map((row) => ({
          id: row.id,
          type: row.machineType.trim(),
          activity: row.activity.trim(),
          hours: nonNegative(row.hours),
          total: nonNegative(row.total || row.hours),
        })),
      documentImage: group.documentImage,
    }))
    .filter((group) => group.company.length > 0 || group.items.length > 0);

  const reportMaterialGroups = materialGroups
    .map((group) => ({
      id: group.id,
      supplier: sanitizeText(group.supplier),
      invoiceNumber: sanitizeText(group.invoiceNumber),
      docType: group.docType ?? null,
      serviceLines: (group.serviceLines || [])
        .map((line) => ({
          id: line.id,
          description: sanitizeText(line.description),
          hours:
            typeof line.hours === 'number' && Number.isFinite(line.hours)
              ? nonNegative(line.hours)
              : null,
          trips:
            typeof line.trips === 'number' && Number.isFinite(line.trips)
              ? nonNegative(line.trips)
              : null,
          tons:
            typeof line.tons === 'number' && Number.isFinite(line.tons)
              ? nonNegative(line.tons)
              : null,
          m3:
            typeof line.m3 === 'number' && Number.isFinite(line.m3)
              ? nonNegative(line.m3)
              : null,
        }))
        .filter((line) => {
          const hasDescription = line.description.length > 0;
          const hasValues =
            nonNegative(line.hours ?? 0) > 0 ||
            nonNegative(line.trips ?? 0) > 0 ||
            nonNegative(line.tons ?? 0) > 0 ||
            nonNegative(line.m3 ?? 0) > 0;
          return hasDescription || hasValues;
        }),
      items: group.rows
        .filter(
          (row) =>
            row.name.trim().length > 0 ||
            row.unit.trim().length > 0 ||
            nonNegative(row.quantity) > 0 ||
            nonNegative(row.unitPrice) > 0,
        )
        .map((row) => ({
          id: row.id,
          name: row.name.trim(),
          quantity: nonNegative(row.quantity),
          unit: row.unit.trim(),
          unitPrice: nonNegative(row.unitPrice),
          total: nonNegative(row.total ?? row.quantity * row.unitPrice),
        })),
    }))
    .filter(
      (group) =>
        group.supplier.length > 0 ||
        group.invoiceNumber.length > 0 ||
        group.items.length > 0 ||
        (group.serviceLines?.length ?? 0) > 0,
    );

  const reportSubcontractGroups = subcontractGroups
    .map((group) => {
      const totals = subcontractTotalsByGroupId[group.id];
      const items = group.rows
        .filter(
          (row) =>
            row.partida.trim().length > 0 ||
            row.activity.trim().length > 0 ||
            nonNegative(row.cantPerWorker) > 0 ||
            nonNegative(row.hours) > 0 ||
            row.workersAssigned.length > 0,
        )
        .map((row) => {
          const rowTotals = totals?.rowTotalsById[row.id];
          const assignedWorkersWithHours = row.workersAssigned.filter(
            (worker) => nonNegative(worker.hours) > 0,
          );
          const workersCount =
            rowTotals?.numTrabEfectivo ??
            (assignedWorkersWithHours.length > 0
              ? assignedWorkersWithHours.length
              : nonNegativeInt(group.numWorkersManual));

          return {
            id: row.id,
            contractedPart: row.partida.trim(),
            company: group.companyName.trim(),
            activity: row.activity.trim(),
            workers: workersCount,
            hours: rowTotals?.horasHombre ?? nonNegative(row.hours),
            unitType: mapSubcontractUnitToReportUnit(row.unit),
            quantity: rowTotals?.produccion ?? nonNegative(row.cantPerWorker),
            unitPrice:
              typeof row.unitPrice === 'number' ? nonNegative(row.unitPrice) : 0,
            total: rowTotals?.importe ?? 0,
            workerDetails: row.workersAssigned.map((worker) => ({
              id: worker.id,
              name: worker.name.trim(),
              dni: '',
              category: '',
              hours: nonNegative(worker.hours),
            })),
          };
        });

      return {
        id: group.id,
        company: group.companyName.trim(),
        items,
        documentImage: group.documentImage,
        totalWorkers:
          totals?.numWorkersEffective ?? nonNegativeInt(group.numWorkersManual),
      };
    })
    .filter((group) => group.company.length > 0 || group.items.length > 0);

  return {
    id: reportIdentifier || crypto.randomUUID(),
    workNumber: workNumber.trim(),
    date: date || todayDate(),
    workName: workName.trim(),
    workId: workId || undefined,
    foreman: mainForeman.trim(),
    foremanHours: nonNegative(mainForemanHours),
    foremanEntries: reportForemanEntries,
    foremanSignature: foremanSignature || undefined,
    siteManager: siteManager.trim(),
    siteManagerSignature: siteManagerSignature || undefined,
    observations: observationsText || '',
    workGroups: reportWorkGroups,
    machineryGroups: reportMachineryGroups,
    materialGroups: reportMaterialGroups,
    subcontractGroups: reportSubcontractGroups,
    createdAt: nowIso,
    updatedAt: nowIso,
    autoCloneNextDay,
    status,
  };
};
