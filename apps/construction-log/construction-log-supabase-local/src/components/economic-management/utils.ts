import type {
  WorkReport,
  WorkItem,
  MachineryItem,
  MaterialItem,
  SubcontractItem,
} from '@/types/workReport';
import type { SavedEconomicReportCreatePayload } from '@/integrations/api/modules/savedEconomicReports';
import type {
  EconomicEditValues,
  EconomicEditableItem,
  EditingEconomicItem,
  EconomicItemType,
} from './types';

const cloneReport = (report: WorkReport): WorkReport => JSON.parse(JSON.stringify(report)) as WorkReport;

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculateWorkItemTotal = (item: Pick<WorkItem, 'hours' | 'hourlyRate'>) =>
  toNumber(item.hours) * toNumber(item.hourlyRate);

const calculateMachineryItemTotal = (item: Pick<MachineryItem, 'hours' | 'hourlyRate'>) =>
  toNumber(item.hours) * toNumber(item.hourlyRate);

const calculateMaterialItemTotal = (item: Pick<MaterialItem, 'quantity' | 'unitPrice'>) =>
  toNumber(item.quantity) * toNumber(item.unitPrice);

export const calculateSubcontractItemTotal = (
  item: Pick<SubcontractItem, 'unitType' | 'workers' | 'hours' | 'hourlyRate' | 'quantity' | 'unitPrice'>,
) => {
  const unitType = item.unitType || 'hora';
  if (unitType === 'hora') {
    return toNumber(item.workers) * toNumber(item.hours) * toNumber(item.hourlyRate);
  }

  return toNumber(item.quantity) * toNumber(item.unitPrice);
};

const getEditableItem = (
  report: WorkReport,
  type: EconomicItemType,
  groupIndex: number,
  itemIndex: number,
): EconomicEditableItem => {
  switch (type) {
    case 'work':
      return report.workGroups[groupIndex].items[itemIndex];
    case 'machinery':
      return report.machineryGroups[groupIndex].items[itemIndex];
    case 'material':
      return report.materialGroups[groupIndex].items[itemIndex];
    case 'subcontract':
      return report.subcontractGroups[groupIndex].items[itemIndex];
  }
};

export const duplicateWorkReport = (report: WorkReport) => cloneReport(report);

export const getReportForemanNames = (report: WorkReport) => {
  const names = new Set<string>();
  const mainForeman = String(report.foreman ?? '').trim();
  if (mainForeman) names.add(mainForeman);

  if (Array.isArray(report.foremanEntries)) {
    report.foremanEntries.forEach((entry) => {
      const entryName = String(entry?.name ?? '').trim();
      if (entryName) names.add(entryName);
    });
  }

  return Array.from(names);
};

export const updateEconomicItemRate = (
  report: WorkReport,
  type: EconomicItemType,
  groupIndex: number,
  itemIndex: number,
  rawValue: number,
) => {
  const nextReport = cloneReport(report);
  const value = Number.isFinite(rawValue) ? rawValue : 0;

  switch (type) {
    case 'work': {
      const item = nextReport.workGroups[groupIndex].items[itemIndex];
      item.hourlyRate = value;
      item.total = calculateWorkItemTotal(item);
      break;
    }
    case 'machinery': {
      const item = nextReport.machineryGroups[groupIndex].items[itemIndex];
      item.hourlyRate = value;
      item.total = calculateMachineryItemTotal(item);
      break;
    }
    case 'material': {
      const item = nextReport.materialGroups[groupIndex].items[itemIndex];
      item.unitPrice = value;
      item.total = calculateMaterialItemTotal(item);
      break;
    }
    case 'subcontract': {
      const item = nextReport.subcontractGroups[groupIndex].items[itemIndex];
      const unitType = item.unitType || 'hora';
      if (unitType === 'hora') {
        item.hourlyRate = value;
      } else {
        item.unitPrice = value;
      }
      item.total = calculateSubcontractItemTotal(item);
      break;
    }
  }

  return nextReport;
};

export const startEditingEconomicItem = (
  report: WorkReport,
  type: EconomicItemType,
  groupIndex: number,
  itemIndex: number,
): { editingItem: EditingEconomicItem; editValues: EconomicEditValues } => {
  const item = getEditableItem(report, type, groupIndex, itemIndex);
  return {
    editingItem: { type, groupIndex, itemIndex, item },
    editValues: { ...item },
  };
};

export const applyEconomicItemEdits = (
  report: WorkReport,
  editingItem: EditingEconomicItem,
  editValues: EconomicEditValues,
) => {
  const nextReport = cloneReport(report);
  const { type, groupIndex, itemIndex } = editingItem;

  switch (type) {
    case 'work': {
      const nextItem = {
        ...nextReport.workGroups[groupIndex].items[itemIndex],
        ...editValues,
      };
      nextItem.total = calculateWorkItemTotal(nextItem);
      nextReport.workGroups[groupIndex].items[itemIndex] = nextItem;
      break;
    }
    case 'machinery': {
      const nextItem = {
        ...nextReport.machineryGroups[groupIndex].items[itemIndex],
        ...editValues,
      };
      nextItem.total = calculateMachineryItemTotal(nextItem);
      nextReport.machineryGroups[groupIndex].items[itemIndex] = nextItem;
      break;
    }
    case 'material': {
      const nextItem = {
        ...nextReport.materialGroups[groupIndex].items[itemIndex],
        ...editValues,
      };
      nextItem.total = calculateMaterialItemTotal(nextItem);
      nextReport.materialGroups[groupIndex].items[itemIndex] = nextItem;
      break;
    }
    case 'subcontract': {
      const nextItem = {
        ...nextReport.subcontractGroups[groupIndex].items[itemIndex],
        ...editValues,
      };
      nextItem.total = calculateSubcontractItemTotal(nextItem);
      nextReport.subcontractGroups[groupIndex].items[itemIndex] = nextItem;
      break;
    }
  }

  return nextReport;
};

export const deleteEconomicItem = (
  report: WorkReport,
  type: EconomicItemType,
  groupIndex: number,
  itemIndex: number,
) => {
  const nextReport = cloneReport(report);

  switch (type) {
    case 'work':
      nextReport.workGroups[groupIndex].items.splice(itemIndex, 1);
      break;
    case 'machinery':
      nextReport.machineryGroups[groupIndex].items.splice(itemIndex, 1);
      break;
    case 'material':
      nextReport.materialGroups[groupIndex].items.splice(itemIndex, 1);
      break;
    case 'subcontract':
      nextReport.subcontractGroups[groupIndex].items.splice(itemIndex, 1);
      break;
  }

  return nextReport;
};

export const calculateEconomicReportTotal = (report: WorkReport) => {
  let total = 0;

  report.workGroups.forEach((group) => {
    group.items.forEach((item) => {
      const hourlyRate = toNumber(item.hourlyRate);
      if (hourlyRate > 0) {
        total += calculateWorkItemTotal(item);
      }
    });
  });

  report.machineryGroups.forEach((group) => {
    group.items.forEach((item) => {
      const hourlyRate = toNumber(item.hourlyRate);
      if (hourlyRate > 0) {
        total += calculateMachineryItemTotal(item);
      }
    });
  });

  report.materialGroups.forEach((group) => {
    group.items.forEach((item) => {
      const unitPrice = toNumber(item.unitPrice);
      if (unitPrice > 0) {
        total += calculateMaterialItemTotal(item);
      }
    });
  });

  report.subcontractGroups.forEach((group) => {
    group.items.forEach((item) => {
      const unitType = item.unitType || 'hora';
      const hasPositivePrice =
        unitType === 'hora' ? toNumber(item.hourlyRate) > 0 : toNumber(item.unitPrice) > 0;
      if (hasPositivePrice) {
        total += calculateSubcontractItemTotal(item);
      }
    });
  });

  return total;
};

export const buildSavedEconomicPayload = (
  report: WorkReport,
  totalAmount: number,
): SavedEconomicReportCreatePayload => ({
  work_report_id: String(report.id ?? '').trim(),
  work_name: String(report.workName ?? '').trim(),
  work_number: String(report.workNumber ?? '').trim(),
  date: String(report.date ?? '').trim(),
  foreman: String(report.foreman ?? '').trim(),
  site_manager: String(report.siteManager ?? '').trim(),
  work_groups: report.workGroups,
  machinery_groups: report.machineryGroups,
  material_groups: report.materialGroups,
  subcontract_groups: report.subcontractGroups,
  total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
});
