import type {
  MachineryItem,
  MaterialItem,
  SubcontractItem,
  WorkItem,
} from '@/types/workReport';

export type EconomicItemType = 'work' | 'machinery' | 'material' | 'subcontract';

export type EconomicEditableItem = WorkItem | MachineryItem | MaterialItem | SubcontractItem;

export type EconomicEditValues = Partial<WorkItem & MachineryItem & MaterialItem & SubcontractItem>;

export type EditingEconomicItem = {
  type: EconomicItemType;
  groupIndex: number;
  itemIndex: number;
  item: EconomicEditableItem;
};
