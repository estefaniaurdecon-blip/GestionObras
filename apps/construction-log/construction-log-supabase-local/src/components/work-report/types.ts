import type { NoteCategory } from '@/components/ObservacionesIncidenciasSection';
import type {
  ParsedDocType,
  ParsedAlbaranResult,
} from '@/plugins/albaranScanner';
import type { WorkReportStatus } from '@/offline-db/types';
import type { RentalMachine } from '@/services/rentalMachinerySource';

export type EditableRow = {
  id: string;
  name: string;
  detail: string;
  value: number;
  unit?: string;
};

export type WorkforceRow = {
  id: string;
  workerName: string;
  activity: string;
  hours: number;
  total: number;
};

export type WorkforceGroup = {
  id: string;
  companyName: string;
  isOwnCompany: boolean;
  rows: WorkforceRow[];
};

export type SubcontractedMachineryRow = {
  id: string;
  machineType: string;
  activity: string;
  hours: number;
  total: number;
};

export type SubcontractedMachineryGroup = {
  id: string;
  companyName: string;
  isOwnCompany: boolean;
  rows: SubcontractedMachineryRow[];
  documentImage?: string;
};

export type MaterialRow = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  costDocValue?: number | null;
  costWarningDelta?: number | null;
};

export type ServiceLine = {
  id: string;
  description: string;
  hours?: number | null;
  trips?: number | null;
  tons?: number | null;
  m3?: number | null;
};

export type MaterialGroup = {
  id: string;
  supplier: string;
  invoiceNumber: string;
  docType?: ParsedDocType | null;
  isScanned?: boolean;
  imageUris?: string[];
  rows: MaterialRow[];
  serviceLines?: ServiceLine[];
};

export type MaterialCostDifference = {
  groupId: string;
  rowId: string;
  material: string;
  costDoc: number;
  costCalc: number;
  difference: number;
};

export type DuplicateScanResolution = {
  parsed: ParsedAlbaranResult;
  targetGroupId: string;
  duplicateGroupId: string;
  duplicateLabel: string;
};

export type ServiceScanResolution = {
  parsed: ParsedAlbaranResult;
  targetGroupId: string;
};

export type NoPriceScanResolution = {
  parsed: ParsedAlbaranResult;
  targetGroupId: string;
};

export type SubcontractUnit = 'hora' | 'm2' | 'ml' | 'ud' | 'kg' | 'm3';

export type SubcontractAssignedWorker = {
  id: string;
  name: string;
  hours: number;
  quantity?: number;
};

export type SubcontractRow = {
  id: string;
  partida: string;
  partidaId?: string | null;
  activity: string;
  unit: SubcontractUnit;
  cantPerWorker: number;
  hours: number;
  workersAssigned: SubcontractAssignedWorker[];
  unitPrice?: number | null;
};

export type SubcontractGroup = {
  id: string;
  companyName: string;
  numWorkersManual: number;
  rows: SubcontractRow[];
  documentImage?: string;
};

export type SubcontractGroupContext = {
  numWorkersEffective: number;
};

export type SubcontractRowTotals = {
  horasHombre: number;
  produccion: number;
  importe: number;
  unit: SubcontractUnit;
  numTrabEfectivo: number;
  hasAssignedWorkers: boolean;
};

export type SubcontractGroupTotals = {
  rowTotalsById: Record<string, SubcontractRowTotals>;
  totalHorasHombre: number;
  totalsByUnit: Record<string, number>;
  totalImporte: number;
  numWorkersEffective: number;
  uniqueWorkersWithHours: number;
  hasMixedUnits: boolean;
  displayTotal: number;
  displayUnitLabel: string;
};

export type SubcontractPriceResolver = (
  row: SubcontractRow,
  group: SubcontractGroup,
) => number | null | undefined;

export type ForemanResource = {
  id: string;
  name: string;
  role: string;
  hours: number;
};

export type GalleryImage = {
  id: string;
  name: string;
  dataUrl: string;
};

export type GenerateWorkReportDraft = {
  workId?: string | null;
  workNumber: string;
  workName: string;
  date: string;
  totalHours: number;
  isClosed: boolean;
  workforceSectionCompleted: boolean;
  workforceGroups: WorkforceGroup[];
  subcontractedMachineryGroups: SubcontractedMachineryGroup[];
  materialGroups: MaterialGroup[];
  subcontractGroups: SubcontractGroup[];
  subcontractedMachineryRows?: EditableRow[];
  materialRows?: EditableRow[];
  subcontractRows?: EditableRow[];
  rentalMachineryRows?: EditableRow[];
  rentalMachinesSnapshot?: RentalMachine[];
  wasteRows: EditableRow[];
  observationsCompleted: boolean;
  observationsCategory: NoteCategory;
  observationsText: string;
  galleryImages: GalleryImage[];
  foremanResources: ForemanResource[];
  mainForeman: string;
  mainForemanUserId?: number | null;
  mainForemanHours: number;
  siteManager: string;
  siteManagerUserId?: number | null;
  autoCloneNextDay: boolean;
  foremanSignature: string;
  siteManagerSignature: string;
  workReportStatus?: WorkReportStatus;
  missingDeliveryNotes?: boolean;
  cloneSourceReportId?: string;
  cloneSourceReportIdentifier?: string;
  cloneSourceWorkName?: string;
  cloneRequiresReview?: boolean;
  cloneCreatedAt?: string;
  cloneIncludedImages?: boolean;
  cloneIncludedSignatures?: boolean;
  cloneIncludedMaterials?: boolean;
  cloneIncludedWaste?: boolean;
};

export type RowsSectionOptions = {
  sectionName: string;
  firstPlaceholder: string;
  secondPlaceholder: string;
  secondOptions?: Array<{ value: string; label: string }>;
  valueLabel: string;
  useUnit?: boolean;
  unitOptions?: Array<{ value: string; label: string }>;
};

export type SaveStatusOption = 'completed' | 'missing_data' | 'missing_delivery_notes';
