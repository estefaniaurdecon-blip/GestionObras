import { useEffect, useMemo, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SignaturePad } from '@/components/SignaturePad';
import {
  ObservacionesIncidenciasSection,
  normalizeNoteCategory,
  type NoteCategory,
} from '@/components/ObservacionesIncidenciasSection';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  filterActiveMachines,
  getRentalMachinesByWorksite,
  normalizeDate,
  type RentalMachine,
  type RentalMachinesResult,
} from '@/services/rentalMachinerySource';
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileBadge2,
  FileWarning,
  FileSpreadsheet,
  Mic,
  Plus,
  Save,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { WorkReportStatus } from '@/offline-db/types';
import type { WorkReport } from '@/types/workReport';

type EditableRow = {
  id: string;
  name: string;
  detail: string;
  value: number;
  unit?: string;
};

type WorkforceRow = {
  id: string;
  workerName: string;
  activity: string;
  hours: number;
  total: number;
};

type WorkforceGroup = {
  id: string;
  companyName: string;
  isOwnCompany: boolean;
  rows: WorkforceRow[];
};

type SubcontractedMachineryRow = {
  id: string;
  machineType: string;
  activity: string;
  hours: number;
  total: number;
};

type SubcontractedMachineryGroup = {
  id: string;
  companyName: string;
  isOwnCompany: boolean;
  rows: SubcontractedMachineryRow[];
  documentImage?: string;
};

type MaterialRow = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

type MaterialGroup = {
  id: string;
  supplier: string;
  invoiceNumber: string;
  rows: MaterialRow[];
};

type SubcontractUnit = 'hora' | 'm2' | 'ml' | 'ud' | 'kg' | 'm3';

type SubcontractAssignedWorker = {
  id: string;
  name: string;
  hours: number;
  quantity?: number;
};

type SubcontractRow = {
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

type SubcontractGroup = {
  id: string;
  companyName: string;
  numWorkersManual: number;
  rows: SubcontractRow[];
  documentImage?: string;
};

type SubcontractGroupContext = {
  numWorkersEffective: number;
};

type SubcontractRowTotals = {
  horasHombre: number;
  produccion: number;
  importe: number;
  unit: SubcontractUnit;
  numTrabEfectivo: number;
  hasAssignedWorkers: boolean;
};

type SubcontractGroupTotals = {
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

type SubcontractPriceResolver = (row: SubcontractRow, group: SubcontractGroup) => number | null | undefined;

type ForemanResource = {
  id: string;
  name: string;
  role: string;
  hours: number;
};

type GalleryImage = {
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
  mainForemanHours: number;
  siteManager: string;
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

interface GenerateWorkReportPanelProps {
  onBack: () => void;
  onSave: (draft: GenerateWorkReportDraft) => Promise<void> | void;
  initialDate?: string;
  initialDraft?: GenerateWorkReportDraft | null;
  readOnly?: boolean;
  reportIdentifier?: string | null;
  saving?: boolean;
  works?: Array<{ id: string; number?: string | null; name?: string | null }>;
}

const ALL_SECTION_IDS = ['workforce', 'machinery', 'materials', 'subcontracts', 'rental', 'waste', 'observations', 'gallery'];

const todayDate = () => new Date().toISOString().split('T')[0];

const parseDateInputValue = (value: string): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return undefined;
  }

  return parsed;
};

const createRow = (unit?: string): EditableRow => ({
  id: crypto.randomUUID(),
  name: '',
  detail: '',
  value: 0,
  unit,
});

const createWorkforceRow = (): WorkforceRow => ({
  id: crypto.randomUUID(),
  workerName: '',
  activity: '',
  hours: 0,
  total: 0,
});

const createWorkforceGroup = (): WorkforceGroup => ({
  id: crypto.randomUUID(),
  companyName: '',
  isOwnCompany: false,
  rows: [createWorkforceRow()],
});

const createSubcontractedMachineryRow = (): SubcontractedMachineryRow => ({
  id: crypto.randomUUID(),
  machineType: '',
  activity: '',
  hours: 0,
  total: 0,
});

const createSubcontractedMachineryGroup = (): SubcontractedMachineryGroup => ({
  id: crypto.randomUUID(),
  companyName: '',
  isOwnCompany: false,
  rows: [createSubcontractedMachineryRow()],
});

const createMaterialRow = (): MaterialRow => ({
  id: crypto.randomUUID(),
  name: '',
  quantity: 0,
  unit: '',
  unitPrice: 0,
  total: 0,
});

const createMaterialGroup = (): MaterialGroup => ({
  id: crypto.randomUUID(),
  supplier: '',
  invoiceNumber: '',
  rows: [createMaterialRow()],
});

const SUBCONTRACT_UNIT_OPTIONS: Array<{ value: SubcontractUnit; label: string }> = [
  { value: 'hora', label: 'Hora' },
  { value: 'm2', label: 'm²' },
  { value: 'ml', label: 'ml' },
  { value: 'ud', label: 'ud' },
  { value: 'kg', label: 'kg' },
  { value: 'm3', label: 'm³' },
];

const MATERIAL_UNIT_OPTIONS = [
  { value: 'm2', label: 'm²' },
  { value: 'm3', label: 'm³' },
  { value: 'ml', label: 'ml' },
  { value: 'kg', label: 'kg' },
  { value: 'ud', label: 'ud' },
  { value: 'l', label: 'l' },
];

const nonNegative = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return value > 0 ? value : 0;
};

const nonNegativeInt = (value: number): number => Math.trunc(nonNegative(value));

const normalizeSubcontractUnit = (unit: string | undefined): SubcontractUnit => {
  const normalized = (unit || '').trim().toLowerCase();
  if (normalized === 'hora' || normalized === 'h' || normalized === 'hour' || normalized === 'hours') return 'hora';
  if (normalized === 'm2' || normalized === 'm²') return 'm2';
  if (normalized === 'ml') return 'ml';
  if (normalized === 'ud' || normalized === 'unidad' || normalized === 'unidades') return 'ud';
  if (normalized === 'kg' || normalized === 'kilo' || normalized === 'kilos') return 'kg';
  if (normalized === 'm3' || normalized === 'm³') return 'm3';
  return 'hora';
};

const isHourUnit = (unit: string | undefined): boolean => normalizeSubcontractUnit(unit) === 'hora';

const unitLabel = (unit: string): string => {
  const normalized = normalizeSubcontractUnit(unit);
  const found = SUBCONTRACT_UNIT_OPTIONS.find((option) => option.value === normalized);
  return found?.label || normalized;
};

const createSubcontractAssignedWorker = (): SubcontractAssignedWorker => ({
  id: crypto.randomUUID(),
  name: '',
  hours: 0,
});

const createSubcontractRow = (): SubcontractRow => ({
  id: crypto.randomUUID(),
  partida: '',
  activity: '',
  unit: 'hora',
  cantPerWorker: 0,
  hours: 0,
  workersAssigned: [],
});

const createSubcontractGroup = (): SubcontractGroup => ({
  id: crypto.randomUUID(),
  companyName: '',
  numWorkersManual: 0,
  rows: [createSubcontractRow()],
});

const workerKey = (worker: SubcontractAssignedWorker): string => {
  const normalizedName = worker.name.trim().toLowerCase();
  return normalizedName || worker.id;
};

const uniqueWorkersWithHoursInGroup = (group: SubcontractGroup): number => {
  const unique = new Set<string>();
  group.rows.forEach((row) => {
    row.workersAssigned.forEach((worker) => {
      if (nonNegative(worker.hours) <= 0) return;
      unique.add(workerKey(worker));
    });
  });
  return unique.size;
};

export const computeRowTotals = (
  row: SubcontractRow,
  groupContext: SubcontractGroupContext,
  options?: { group?: SubcontractGroup; priceUnitResolver?: SubcontractPriceResolver },
): SubcontractRowTotals => {
  const assignedWithHours = row.workersAssigned.filter((worker) => nonNegative(worker.hours) > 0);
  const hasAssignedWorkers = assignedWithHours.length > 0;

  const horasFromWorkers = assignedWithHours.reduce((sum, worker) => sum + nonNegative(worker.hours), 0);
  const horasFallback = nonNegativeInt(groupContext.numWorkersEffective) * nonNegative(row.hours);
  const horasHombre = hasAssignedWorkers ? horasFromWorkers : horasFallback;

  const numTrabEfectivo = hasAssignedWorkers
    ? assignedWithHours.length
    : nonNegativeInt(groupContext.numWorkersEffective);

  const normalizedUnit = normalizeSubcontractUnit(row.unit);
  const produccion = isHourUnit(normalizedUnit)
    ? horasHombre
    : nonNegative(row.cantPerWorker) * numTrabEfectivo;

  const unitPriceFromRow = typeof row.unitPrice === 'number' ? nonNegative(row.unitPrice) : null;
  const unitPriceFromDb =
    unitPriceFromRow === null && options?.group && options.priceUnitResolver
      ? options.priceUnitResolver(row, options.group)
      : null;
  const unitPrice = unitPriceFromRow ?? (typeof unitPriceFromDb === 'number' ? nonNegative(unitPriceFromDb) : null);
  const importe = unitPrice === null ? 0 : produccion * unitPrice;

  return {
    horasHombre,
    produccion,
    importe,
    unit: normalizedUnit,
    numTrabEfectivo,
    hasAssignedWorkers,
  };
};

export const computeGroupTotals = (
  group: SubcontractGroup,
  options?: { priceUnitResolver?: SubcontractPriceResolver },
): SubcontractGroupTotals => {
  const uniqueWorkersWithHours = uniqueWorkersWithHoursInGroup(group);
  const numWorkersEffective =
    uniqueWorkersWithHours > 0 ? uniqueWorkersWithHours : nonNegativeInt(group.numWorkersManual);

  const rowTotalsById: Record<string, SubcontractRowTotals> = {};
  const totalsByUnit: Record<string, number> = {};
  let totalHorasHombre = 0;
  let totalImporte = 0;

  group.rows.forEach((row) => {
    const rowTotals = computeRowTotals(row, { numWorkersEffective }, { group, priceUnitResolver: options?.priceUnitResolver });
    rowTotalsById[row.id] = rowTotals;

    totalHorasHombre += rowTotals.horasHombre;
    totalImporte += rowTotals.importe;
    totalsByUnit[rowTotals.unit] = (totalsByUnit[rowTotals.unit] || 0) + rowTotals.produccion;
  });

  const nonZeroUnits = Object.entries(totalsByUnit).filter(([, value]) => value > 0);
  const hasMixedUnits = nonZeroUnits.length > 1;

  let displayTotal = 0;
  let displayUnitLabel = 'h';

  if (nonZeroUnits.length === 1) {
    displayTotal = nonZeroUnits[0][1];
    displayUnitLabel = unitLabel(nonZeroUnits[0][0]);
  } else if (nonZeroUnits.length > 1) {
    displayTotal = totalHorasHombre;
    displayUnitLabel = 'h';
  } else {
    displayTotal = totalHorasHombre;
    displayUnitLabel = 'h';
  }

  return {
    rowTotalsById,
    totalHorasHombre,
    totalsByUnit,
    totalImporte,
    numWorkersEffective,
    uniqueWorkersWithHours,
    hasMixedUnits,
    displayTotal,
    displayUnitLabel,
  };
};

const createForemanResource = (): ForemanResource => ({
  id: crypto.randomUUID(),
  name: '',
  role: 'encargado',
  hours: 0,
});

const parseNumeric = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const editableNumericValue = (value: number): string | number => {
  if (!Number.isFinite(value) || value === 0) return '';
  return value;
};

const mapSubcontractUnitToReportUnit = (unit: SubcontractUnit): 'hora' | 'm3' | 'm2' | 'ml' | 'unidad' => {
  if (unit === 'hora') return 'hora';
  if (unit === 'm3') return 'm3';
  if (unit === 'm2') return 'm2';
  if (unit === 'ml') return 'ml';
  return 'unidad';
};

const mapForemanRoleForReport = (role: string): 'encargado' | 'capataz' | 'recurso_preventivo' => {
  const normalized = role.trim().toLowerCase();
  if (normalized === 'capataz') return 'capataz';
  if (normalized === 'preventivo' || normalized === 'recurso_preventivo') return 'recurso_preventivo';
  return 'encargado';
};

const normalizeSubcontractedMachineryGroups = (
  groups: SubcontractedMachineryGroup[] | undefined,
): SubcontractedMachineryGroup[] => {
  if (!groups?.length) {
    return [createSubcontractedMachineryGroup()];
  }
  return groups.map((group) => {
    const normalizedRows =
      group.rows?.length > 0
        ? group.rows.map((row) => {
            const hours = Number.isFinite(row.hours) ? row.hours : 0;
            return {
              id: row.id || crypto.randomUUID(),
              machineType: row.machineType ?? '',
              activity: row.activity ?? '',
              hours,
              total: Number.isFinite(row.total) ? row.total : hours,
            };
          })
        : [createSubcontractedMachineryRow()];
    return {
      id: group.id || crypto.randomUUID(),
      companyName: group.companyName ?? '',
      isOwnCompany: Boolean(group.isOwnCompany),
      documentImage: group.documentImage,
      rows: normalizedRows,
    };
  });
};

const normalizeMaterialGroups = (groups: MaterialGroup[] | undefined): MaterialGroup[] => {
  if (!groups?.length) {
    return [createMaterialGroup()];
  }
  return groups.map((group) => {
    const normalizedRows =
      group.rows?.length > 0
        ? group.rows.map((row) => {
            const quantity = Number.isFinite(row.quantity) ? row.quantity : 0;
            const unitPrice = Number.isFinite(row.unitPrice) ? row.unitPrice : 0;
            const total = quantity * unitPrice;
            return {
              id: row.id || crypto.randomUUID(),
              name: row.name ?? '',
              quantity,
              unit: row.unit ?? '',
              unitPrice,
              total,
            };
          })
        : [createMaterialRow()];
    return {
      id: group.id || crypto.randomUUID(),
      supplier: group.supplier ?? '',
      invoiceNumber: group.invoiceNumber ?? '',
      rows: normalizedRows,
    };
  });
};

const migrateLegacySubcontractedMachineryRows = (rows: EditableRow[] | undefined): SubcontractedMachineryGroup[] => {
  if (!rows?.length) {
    return [createSubcontractedMachineryGroup()];
  }
  return [
    {
      id: crypto.randomUUID(),
      companyName: '',
      isOwnCompany: false,
      rows: rows.map((row) => ({
        id: row.id || crypto.randomUUID(),
        machineType: row.name ?? '',
        activity: row.detail ?? '',
        hours: Number.isFinite(row.value) ? row.value : 0,
        total: Number.isFinite(row.value) ? row.value : 0,
      })),
    },
  ];
};

const migrateLegacyMaterialRows = (rows: EditableRow[] | undefined): MaterialGroup[] => {
  if (!rows?.length) {
    return [createMaterialGroup()];
  }
  return [
    {
      id: crypto.randomUUID(),
      supplier: '',
      invoiceNumber: '',
      rows: rows.map((row) => {
        const quantity = Number.isFinite(row.value) ? row.value : 0;
        return {
          id: row.id || crypto.randomUUID(),
          name: row.name || row.detail || '',
          quantity,
          unit: row.unit ?? '',
          unitPrice: 0,
          total: 0,
        };
      }),
    },
  ];
};

const normalizeSubcontractGroups = (groups: SubcontractGroup[] | undefined): SubcontractGroup[] => {
  if (!groups?.length) {
    return [createSubcontractGroup()];
  }

  return groups.map((group) => {
    const normalizedRows =
      group.rows?.length > 0
        ? group.rows.map((row) => ({
            id: row.id || crypto.randomUUID(),
            partida: row.partida ?? '',
            partidaId: row.partidaId ?? null,
            activity: row.activity ?? '',
            unit: normalizeSubcontractUnit(row.unit),
            cantPerWorker: nonNegative(row.cantPerWorker),
            hours: nonNegative(row.hours),
            unitPrice: typeof row.unitPrice === 'number' ? nonNegative(row.unitPrice) : null,
            workersAssigned:
              row.workersAssigned?.map((worker) => ({
                id: worker.id || crypto.randomUUID(),
                name: worker.name ?? '',
                hours: nonNegative(worker.hours),
                quantity:
                  typeof worker.quantity === 'number' ? nonNegative(worker.quantity) : undefined,
              })) ?? [],
          }))
        : [createSubcontractRow()];

    return {
      id: group.id || crypto.randomUUID(),
      companyName: group.companyName ?? '',
      numWorkersManual: nonNegativeInt(group.numWorkersManual),
      documentImage: group.documentImage,
      rows: normalizedRows,
    };
  });
};

const migrateLegacySubcontractRows = (rows: EditableRow[] | undefined): SubcontractGroup[] => {
  if (!rows?.length) {
    return [createSubcontractGroup()];
  }

  return [
    {
      id: crypto.randomUUID(),
      companyName: '',
      numWorkersManual: 1,
      rows: rows.map((row) => ({
        id: row.id || crypto.randomUUID(),
        partida: row.name ?? '',
        activity: row.detail ?? '',
        unit: normalizeSubcontractUnit(row.unit),
        cantPerWorker: 0,
        hours: nonNegative(row.value),
        workersAssigned: [],
      })),
    },
  ];
};

const mapSubcontractGroupsToLegacyRows = (groups: SubcontractGroup[]): EditableRow[] => {
  const mapped = groups.flatMap((group) =>
    group.rows.map((row) => ({
      id: row.id || crypto.randomUUID(),
      name: row.partida || '',
      detail: row.activity || '',
      value: nonNegative(row.hours),
      unit: row.unit,
    })),
  );

  return mapped.length > 0 ? mapped : [createRow()];
};

const mapRentalMachinesToLegacyRows = (machines: RentalMachine[]): EditableRow[] => {
  if (machines.length === 0) return [createRow()];

  return machines.map((machine) => ({
    id: machine.id,
    name: machine.name,
    detail: machine.provider || machine.description || '',
    value: typeof machine.price === 'number' ? machine.price : 0,
    unit: machine.priceUnit,
  }));
};

type RowsSectionOptions = {
  sectionName: string;
  firstPlaceholder: string;
  secondPlaceholder: string;
  secondOptions?: Array<{ value: string; label: string }>;
  valueLabel: string;
  useUnit?: boolean;
  unitOptions?: Array<{ value: string; label: string }>;
};

type SaveStatusOption = 'completed' | 'missing_data' | 'missing_delivery_notes';

export const GenerateWorkReportPanel = ({
  onBack,
  onSave,
  initialDate,
  initialDraft,
  readOnly = false,
  reportIdentifier,
  saving = false,
  works = [],
}: GenerateWorkReportPanelProps) => {
  const [workNumber, setWorkNumber] = useState('');
  const [workName, setWorkName] = useState('');
  const [date, setDate] = useState(initialDate || todayDate());
  const [workDatePickerOpen, setWorkDatePickerOpen] = useState(false);

  const [openSections, setOpenSections] = useState<string[]>([]);

  const [workforceSectionCompleted, setWorkforceSectionCompleted] = useState(false);
  const [workforceGroups, setWorkforceGroups] = useState<WorkforceGroup[]>([createWorkforceGroup()]);
  const [subcontractedMachineryGroups, setSubcontractedMachineryGroups] = useState<SubcontractedMachineryGroup[]>([
    createSubcontractedMachineryGroup(),
  ]);
  const [materialGroups, setMaterialGroups] = useState<MaterialGroup[]>([createMaterialGroup()]);
  const [openMaterialGroups, setOpenMaterialGroups] = useState<Record<string, boolean>>({});
  const [subcontractGroups, setSubcontractGroups] = useState<SubcontractGroup[]>([createSubcontractGroup()]);
  const [openSubcontractWorkers, setOpenSubcontractWorkers] = useState<Record<string, boolean>>({});
  const [rentalMachines, setRentalMachines] = useState<RentalMachine[]>([]);
  const [rentalLoading, setRentalLoading] = useState(false);
  const [rentalError, setRentalError] = useState<string | null>(null);
  const [wasteRows, setWasteRows] = useState<EditableRow[]>([createRow('kg')]);

  const [observationsCompleted, setObservationsCompleted] = useState(false);
  const [observationsCategory, setObservationsCategory] = useState<NoteCategory>(null);
  const [observationsText, setObservationsText] = useState('');
  const [dictationEnabled, setDictationEnabled] = useState(false);

  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);

  const [foremanResources, setForemanResources] = useState<ForemanResource[]>([createForemanResource()]);
  const [mainForeman, setMainForeman] = useState('');
  const [mainForemanHours, setMainForemanHours] = useState(0);
  const [siteManager, setSiteManager] = useState('');

  const [autoCloneNextDay, setAutoCloneNextDay] = useState(false);
  const [foremanSignature, setForemanSignature] = useState('');
  const [siteManagerSignature, setSiteManagerSignature] = useState('');
  const [saveStatusDialogOpen, setSaveStatusDialogOpen] = useState(false);
  const [saveStatusSelection, setSaveStatusSelection] = useState<SaveStatusOption[]>(['completed']);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const totalWorkforceHours = useMemo(
    () =>
      workforceGroups.reduce(
        (groupSum, group) => groupSum + group.rows.reduce((rowSum, row) => rowSum + row.hours, 0),
        0,
      ),
    [workforceGroups],
  );

  const totalForemanResourceHours = useMemo(
    () => foremanResources.reduce((sum, resource) => sum + nonNegative(resource.hours), 0),
    [foremanResources],
  );

  const totalForemanSectionHours = useMemo(
    () => totalForemanResourceHours + nonNegative(mainForemanHours),
    [mainForemanHours, totalForemanResourceHours],
  );

  const subcontractComputedGroups = useMemo(
    () =>
      subcontractGroups.map((group) => ({
        groupId: group.id,
        totals: computeGroupTotals(group),
      })),
    [subcontractGroups],
  );

  const subcontractTotalsByGroupId = useMemo(
    () =>
      Object.fromEntries(
        subcontractComputedGroups.map(({ groupId, totals }) => [groupId, totals]),
      ) as Record<string, SubcontractGroupTotals>,
    [subcontractComputedGroups],
  );

  const normalizedPartDate = useMemo(() => normalizeDate(date || todayDate()), [date]);
  const selectedWorkDate = useMemo(() => parseDateInputValue(date), [date]);

  const matchedWorkByInput = useMemo(() => {
    if (works.length === 0) return null;
    const normalizedNumber = workNumber.trim().toLowerCase();
    const normalizedName = workName.trim().toLowerCase();

    if (normalizedNumber) {
      const byNumber = works.find(
        (work) => (work.number || '').trim().toLowerCase() === normalizedNumber,
      );
      if (byNumber) return byNumber;
    }

    if (normalizedName) {
      const byName = works.find(
        (work) => (work.name || '').trim().toLowerCase() === normalizedName,
      );
      if (byName) return byName;
    }

    return null;
  }, [works, workNumber, workName]);

  const selectedWorkId = useMemo(
    () => matchedWorkByInput?.id ?? initialDraft?.workId ?? null,
    [matchedWorkByInput, initialDraft?.workId],
  );

  const activeRentalMachines = useMemo(
    () => (selectedWorkId ? filterActiveMachines(rentalMachines, selectedWorkId, normalizedPartDate) : []),
    [rentalMachines, selectedWorkId, normalizedPartDate],
  );

  const isClonedReport = useMemo(
    () =>
      Boolean(
        initialDraft?.cloneRequiresReview ||
        initialDraft?.cloneSourceReportId ||
        initialDraft?.cloneSourceReportIdentifier ||
        initialDraft?.cloneCreatedAt ||
        initialDraft?.cloneSourceWorkName,
      ),
    [
      initialDraft?.cloneCreatedAt,
      initialDraft?.cloneRequiresReview,
      initialDraft?.cloneSourceReportId,
      initialDraft?.cloneSourceReportIdentifier,
      initialDraft?.cloneSourceWorkName,
    ],
  );

  const cloneSourceLabel = useMemo(
    () =>
      initialDraft?.cloneSourceReportIdentifier ||
      initialDraft?.cloneSourceWorkName ||
      initialDraft?.cloneSourceReportId ||
      null,
    [
      initialDraft?.cloneSourceReportId,
      initialDraft?.cloneSourceReportIdentifier,
      initialDraft?.cloneSourceWorkName,
    ],
  );

  const rentalResult = useMemo<RentalMachinesResult>(
    () => ({
      obraId: selectedWorkId || '',
      fechaParte: normalizedPartDate,
      items: activeRentalMachines,
    }),
    [selectedWorkId, normalizedPartDate, activeRentalMachines],
  );

  useEffect(() => {
    if (readOnly) {
      setOpenSections(ALL_SECTION_IDS);
      return;
    }
    setOpenSections([]);
  }, [readOnly]);

  useEffect(() => {
    if (initialDraft) {
      const nextMachineryGroups = initialDraft.subcontractedMachineryGroups?.length
        ? normalizeSubcontractedMachineryGroups(initialDraft.subcontractedMachineryGroups)
        : migrateLegacySubcontractedMachineryRows(initialDraft.subcontractedMachineryRows);
      const nextMaterialGroups = initialDraft.materialGroups?.length
        ? normalizeMaterialGroups(initialDraft.materialGroups)
        : migrateLegacyMaterialRows(initialDraft.materialRows);
      const nextSubcontractGroups = initialDraft.subcontractGroups?.length
        ? normalizeSubcontractGroups(initialDraft.subcontractGroups)
        : migrateLegacySubcontractRows(initialDraft.subcontractRows);

      setWorkNumber(initialDraft.workNumber ?? '');
      setWorkName(initialDraft.workName ?? '');
      setDate(initialDraft.date || initialDate || todayDate());
      setWorkforceSectionCompleted(Boolean(initialDraft.workforceSectionCompleted));
      setWorkforceGroups(initialDraft.workforceGroups?.length ? initialDraft.workforceGroups : [createWorkforceGroup()]);
      setSubcontractedMachineryGroups(nextMachineryGroups);
      setMaterialGroups(nextMaterialGroups);
      setOpenMaterialGroups(
        Object.fromEntries(nextMaterialGroups.map((group) => [group.id, true])),
      );
      setSubcontractGroups(nextSubcontractGroups);
      setOpenSubcontractWorkers({});
      setRentalMachines([]);
      setRentalError(null);
      setWasteRows(initialDraft.wasteRows?.length ? initialDraft.wasteRows : [createRow('kg')]);
      setObservationsCompleted(Boolean(initialDraft.observationsCompleted));
      setObservationsCategory(normalizeNoteCategory(initialDraft.observationsCategory));
      setObservationsText(initialDraft.observationsText || '');
      setGalleryImages(initialDraft.galleryImages ?? []);
      setForemanResources(initialDraft.foremanResources?.length ? initialDraft.foremanResources : [createForemanResource()]);
      setMainForeman(initialDraft.mainForeman || '');
      setMainForemanHours(initialDraft.mainForemanHours ?? 0);
      setSiteManager(initialDraft.siteManager || '');
      setAutoCloneNextDay(Boolean(initialDraft.autoCloneNextDay));
      setForemanSignature(initialDraft.foremanSignature || '');
      setSiteManagerSignature(initialDraft.siteManagerSignature || '');
      const initialStatus = initialDraft.workReportStatus ?? (initialDraft.isClosed ? 'completed' : undefined);
      const nextStatusSelection: SaveStatusOption[] = [];
      if (initialStatus === 'completed') {
        nextStatusSelection.push('completed');
      } else {
        if (initialStatus === 'missing_data') nextStatusSelection.push('missing_data');
        if (initialStatus === 'missing_delivery_notes' || Boolean(initialDraft.missingDeliveryNotes)) {
          nextStatusSelection.push('missing_delivery_notes');
        }
      }
      if (nextStatusSelection.length === 0) {
        nextStatusSelection.push('completed');
      }
      setSaveStatusSelection(nextStatusSelection);
      return;
    }

    setWorkNumber('');
    setWorkName('');
    setDate(initialDate || todayDate());
    setWorkforceSectionCompleted(false);
    setWorkforceGroups([createWorkforceGroup()]);
    const defaultMachineryGroup = createSubcontractedMachineryGroup();
    const defaultMaterialGroup = createMaterialGroup();
    const defaultSubcontractGroup = createSubcontractGroup();
    setSubcontractedMachineryGroups([defaultMachineryGroup]);
    setMaterialGroups([defaultMaterialGroup]);
    setOpenMaterialGroups({ [defaultMaterialGroup.id]: true });
    setSubcontractGroups([defaultSubcontractGroup]);
    setOpenSubcontractWorkers({});
    setRentalMachines([]);
    setRentalError(null);
    setWasteRows([createRow('kg')]);
    setObservationsCompleted(false);
    setObservationsCategory(null);
    setObservationsText('');
    setGalleryImages([]);
    setForemanResources([createForemanResource()]);
    setMainForeman('');
    setMainForemanHours(0);
    setSiteManager('');
    setAutoCloneNextDay(false);
    setForemanSignature('');
    setSiteManagerSignature('');
    setSaveStatusSelection(['completed']);
  }, [initialDate, initialDraft]);

  useEffect(() => {
    let cancelled = false;

    const loadRentalMachines = async () => {
      if (!selectedWorkId) {
        if (!cancelled) {
          setRentalMachines([]);
          setRentalError(null);
          setRentalLoading(false);
        }
        return;
      }

      setRentalLoading(true);
      setRentalError(null);

      try {
        const machines = await getRentalMachinesByWorksite(selectedWorkId);
        if (cancelled) return;
        setRentalMachines(machines);
      } catch (error) {
        if (cancelled) return;
        console.error('[RentalMachinery] Error loading rental machinery:', error);
        setRentalMachines([]);
        setRentalError('No se pudo cargar la maquinaria de alquiler.');
      } finally {
        if (!cancelled) {
          setRentalLoading(false);
        }
      }
    };

    void loadRentalMachines();

    return () => {
      cancelled = true;
    };
  }, [selectedWorkId, normalizedPartDate]);

  const completedSections = useMemo(() => {
    const count = [
      workforceSectionCompleted,
      subcontractedMachineryGroups.some((group) => group.rows.length > 0),
      materialGroups.some((group) => group.rows.length > 0),
      subcontractGroups.some((group) => group.rows.length > 0),
      selectedWorkId !== null,
      wasteRows.length > 0,
      observationsCompleted,
    ].filter(Boolean).length;
    return `${count}/7`;
  }, [
    materialGroups,
    observationsCompleted,
    selectedWorkId,
    subcontractGroups,
    subcontractedMachineryGroups,
    wasteRows.length,
    workforceSectionCompleted,
  ]);

  const saveStatusSummaryLabel = useMemo(() => {
    if (saveStatusSelection.includes('completed')) return 'Completado';
    const parts: string[] = [];
    if (saveStatusSelection.includes('missing_data')) parts.push('Faltan datos');
    if (saveStatusSelection.includes('missing_delivery_notes')) parts.push('Faltan albaranes');
    return parts.join(' + ');
  }, [saveStatusSelection]);

  const panelTitle = readOnly ? 'Parte (solo lectura)' : initialDraft ? 'Editar Parte' : 'Nuevo Parte';

  const updateRows = (
    rows: EditableRow[],
    setRows: Dispatch<SetStateAction<EditableRow[]>>,
    rowId: string,
    patch: Partial<EditableRow>,
  ) => {
    setRows(rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  const handleGalleryUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        setGalleryImages((current) => [...current, { id: crypto.randomUUID(), name: file.name, dataUrl: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  };

  const updateWorkforceGroup = (groupId: string, patch: Partial<WorkforceGroup>) => {
    setWorkforceGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    );
  };

  const updateWorkforceRow = (groupId: string, rowId: string, patch: Partial<WorkforceRow>) => {
    setWorkforceGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const rows = group.rows.map((row) => {
          if (row.id !== rowId) return row;
          const nextHours = patch.hours ?? row.hours;
          return {
            ...row,
            ...patch,
            hours: nextHours,
            total: nextHours,
          };
        });
        return { ...group, rows };
      }),
    );
  };

  const addWorkforceGroup = () => {
    setWorkforceGroups((current) => [...current, createWorkforceGroup()]);
  };

  const removeWorkforceGroup = (groupId: string) => {
    setWorkforceGroups((current) => (current.length > 1 ? current.filter((group) => group.id !== groupId) : current));
  };

  const addWorkforceRow = (groupId: string) => {
    setWorkforceGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, rows: [...group.rows, createWorkforceRow()] } : group)),
    );
  };

  const removeWorkforceRow = (groupId: string, rowId: string) => {
    setWorkforceGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        if (group.rows.length === 1) return group;
        return { ...group, rows: group.rows.filter((row) => row.id !== rowId) };
      }),
    );
  };

  const updateSubcontractedMachineryGroup = (groupId: string, patch: Partial<SubcontractedMachineryGroup>) => {
    setSubcontractedMachineryGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    );
  };

  const updateSubcontractedMachineryRow = (
    groupId: string,
    rowId: string,
    patch: Partial<SubcontractedMachineryRow>,
  ) => {
    setSubcontractedMachineryGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const rows = group.rows.map((row) => {
          if (row.id !== rowId) return row;
          const nextHours = patch.hours ?? row.hours;
          const nextTotal = patch.total ?? nextHours;
          return {
            ...row,
            ...patch,
            hours: nextHours,
            total: nextTotal,
          };
        });
        return { ...group, rows };
      }),
    );
  };

  const addSubcontractedMachineryGroup = () => {
    setSubcontractedMachineryGroups((current) => [...current, createSubcontractedMachineryGroup()]);
  };

  const removeSubcontractedMachineryGroup = (groupId: string) => {
    setSubcontractedMachineryGroups((current) =>
      current.length === 1 ? current : current.filter((group) => group.id !== groupId),
    );
  };

  const addSubcontractedMachineryRow = (groupId: string) => {
    setSubcontractedMachineryGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, rows: [...group.rows, createSubcontractedMachineryRow()] } : group,
      ),
    );
  };

  const removeSubcontractedMachineryRow = (groupId: string, rowId: string) => {
    setSubcontractedMachineryGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        if (group.rows.length === 1) return group;
        return { ...group, rows: group.rows.filter((row) => row.id !== rowId) };
      }),
    );
  };

  const handleSubcontractedMachineryUpload = (groupId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      updateSubcontractedMachineryGroup(groupId, { documentImage: reader.result });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const updateMaterialGroup = (groupId: string, patch: Partial<MaterialGroup>) => {
    setMaterialGroups((current) => current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)));
  };

  const updateMaterialRow = (groupId: string, rowId: string, patch: Partial<MaterialRow>) => {
    setMaterialGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const rows = group.rows.map((row) => {
          if (row.id !== rowId) return row;
          const nextQuantity = patch.quantity ?? row.quantity;
          const nextUnitPrice = patch.unitPrice ?? row.unitPrice;
          const nextTotal = nextQuantity * nextUnitPrice;
          return {
            ...row,
            ...patch,
            quantity: nextQuantity,
            unitPrice: nextUnitPrice,
            total: nextTotal,
          };
        });
        return { ...group, rows };
      }),
    );
  };

  const addMaterialGroup = () => {
    const newGroup = createMaterialGroup();
    setMaterialGroups((current) => [...current, newGroup]);
    setOpenMaterialGroups((current) => ({ ...current, [newGroup.id]: true }));
  };

  const removeMaterialGroup = (groupId: string) => {
    setMaterialGroups((current) =>
      current.length === 1 ? current : current.filter((group) => group.id !== groupId),
    );
    setOpenMaterialGroups((current) => {
      if (!(groupId in current)) return current;
      const next = { ...current };
      delete next[groupId];
      return next;
    });
  };

  const addMaterialRow = (groupId: string) => {
    setMaterialGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, rows: [...group.rows, createMaterialRow()] } : group,
      ),
    );
  };

  const removeMaterialRow = (groupId: string, rowId: string) => {
    setMaterialGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        if (group.rows.length === 1) return group;
        return { ...group, rows: group.rows.filter((row) => row.id !== rowId) };
      }),
    );
  };

  const setMaterialGroupOpen = (groupId: string, isOpen: boolean) => {
    setOpenMaterialGroups((current) => ({ ...current, [groupId]: isOpen }));
  };

  const updateSubcontractGroup = (groupId: string, patch: Partial<SubcontractGroup>) => {
    setSubcontractGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    );
  };

  const updateSubcontractRow = (groupId: string, rowId: string, patch: Partial<SubcontractRow>) => {
    setSubcontractGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const rows = group.rows.map((row) => {
          if (row.id !== rowId) return row;
          return {
            ...row,
            ...patch,
            unit: normalizeSubcontractUnit(patch.unit ?? row.unit),
            cantPerWorker: patch.cantPerWorker === undefined ? row.cantPerWorker : nonNegative(patch.cantPerWorker),
            hours: patch.hours === undefined ? row.hours : nonNegative(patch.hours),
            unitPrice:
              patch.unitPrice === undefined
                ? row.unitPrice
                : typeof patch.unitPrice === 'number'
                  ? nonNegative(patch.unitPrice)
                  : null,
          };
        });
        return { ...group, rows };
      }),
    );
  };

  const addSubcontractGroup = () => {
    setSubcontractGroups((current) => [...current, createSubcontractGroup()]);
  };

  const removeSubcontractGroup = (groupId: string) => {
    setSubcontractGroups((current) =>
      current.length === 1 ? current : current.filter((group) => group.id !== groupId),
    );
  };

  const addSubcontractRow = (groupId: string) => {
    const newRow = createSubcontractRow();
    setSubcontractGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, rows: [...group.rows, newRow] } : group,
      ),
    );
    setOpenSubcontractWorkers((current) => ({ ...current, [newRow.id]: false }));
  };

  const removeSubcontractRow = (groupId: string, rowId: string) => {
    setSubcontractGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        if (group.rows.length === 1) return group;
        return { ...group, rows: group.rows.filter((row) => row.id !== rowId) };
      }),
    );
    setOpenSubcontractWorkers((current) => {
      if (!(rowId in current)) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  };

  const addSubcontractWorker = (groupId: string, rowId: string) => {
    const newWorker = createSubcontractAssignedWorker();
    setSubcontractGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          rows: group.rows.map((row) =>
            row.id === rowId
              ? { ...row, workersAssigned: [...row.workersAssigned, newWorker] }
              : row,
          ),
        };
      }),
    );
    setOpenSubcontractWorkers((current) => ({ ...current, [rowId]: true }));
  };

  const updateSubcontractWorker = (
    groupId: string,
    rowId: string,
    workerId: string,
    patch: Partial<SubcontractAssignedWorker>,
  ) => {
    setSubcontractGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          rows: group.rows.map((row) => {
            if (row.id !== rowId) return row;
            return {
              ...row,
              workersAssigned: row.workersAssigned.map((worker) =>
                worker.id === workerId
                  ? {
                      ...worker,
                      ...patch,
                      hours:
                        patch.hours === undefined
                          ? worker.hours
                          : nonNegative(patch.hours),
                    }
                  : worker,
              ),
            };
          }),
        };
      }),
    );
  };

  const removeSubcontractWorker = (groupId: string, rowId: string, workerId: string) => {
    setSubcontractGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          rows: group.rows.map((row) =>
            row.id === rowId
              ? { ...row, workersAssigned: row.workersAssigned.filter((worker) => worker.id !== workerId) }
              : row,
          ),
        };
      }),
    );
  };

  const setSubcontractWorkersOpen = (rowId: string, isOpen: boolean) => {
    setOpenSubcontractWorkers((current) => ({ ...current, [rowId]: isOpen }));
  };

  const handleSubcontractUpload = (groupId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      updateSubcontractGroup(groupId, { documentImage: reader.result });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleToggleSaveStatus = (status: SaveStatusOption) => {
    setSaveStatusSelection((current) => {
      if (status === 'completed') {
        return ['completed'];
      }

      const withoutCompleted = current.filter((item) => item !== 'completed');
      if (withoutCompleted.includes(status)) {
        const next = withoutCompleted.filter((item) => item !== status);
        return next.length > 0 ? next : ['completed'];
      }
      return [...withoutCompleted, status];
    });
  };

  const hasValidSaveInputs = () => {
    if (readOnly) {
      return false;
    }

    if (!workNumber.trim()) {
      toast({ title: 'Nº obra obligatorio', description: 'Completa el número de obra.', variant: 'destructive' });
      return false;
    }
    if (!workName.trim()) {
      toast({ title: 'Nombre de obra obligatorio', description: 'Completa el nombre de obra.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const resolveSelectedSaveStatus = (): { status: WorkReportStatus; isClosed: boolean; missingDeliveryNotes: boolean } => {
    if (saveStatusSelection.includes('completed')) {
      return {
        status: 'completed',
        isClosed: true,
        missingDeliveryNotes: false,
      };
    }

    const hasMissingData = saveStatusSelection.includes('missing_data');
    const hasMissingDeliveryNotes = saveStatusSelection.includes('missing_delivery_notes');

    if (hasMissingData) {
      return {
        status: 'missing_data',
        isClosed: false,
        missingDeliveryNotes: hasMissingDeliveryNotes,
      };
    }

    return {
      status: 'missing_delivery_notes',
      isClosed: false,
      missingDeliveryNotes: true,
    };
  };

  const handleConfirmSaveWithStatus = async () => {
    if (!hasValidSaveInputs()) {
      return;
    }

    const normalizedForemanResources = foremanResources
      .map((resource) => ({
        ...resource,
        name: resource.name.trim(),
        hours: nonNegative(resource.hours),
      }))
      .filter((resource) => resource.name.length > 0 || resource.hours > 0);

    const resolvedStatus = resolveSelectedSaveStatus();
    await onSave({
      workId: selectedWorkId,
      workNumber,
      workName,
      date,
      totalHours: totalWorkforceHours,
      isClosed: resolvedStatus.isClosed,
      workforceSectionCompleted,
      workforceGroups,
      subcontractedMachineryGroups,
      materialGroups,
      subcontractGroups,
      subcontractRows: mapSubcontractGroupsToLegacyRows(subcontractGroups),
      rentalMachineryRows: mapRentalMachinesToLegacyRows(activeRentalMachines),
      rentalMachinesSnapshot: activeRentalMachines,
      wasteRows,
      observationsCompleted,
      observationsCategory,
      observationsText,
      galleryImages,
      foremanResources: normalizedForemanResources,
      mainForeman,
      mainForemanHours,
      siteManager,
      autoCloneNextDay,
      foremanSignature,
      siteManagerSignature,
      workReportStatus: resolvedStatus.status,
      missingDeliveryNotes: resolvedStatus.missingDeliveryNotes,
      cloneSourceReportId: initialDraft?.cloneSourceReportId,
      cloneSourceReportIdentifier: initialDraft?.cloneSourceReportIdentifier,
      cloneSourceWorkName: initialDraft?.cloneSourceWorkName,
      cloneRequiresReview: initialDraft?.cloneRequiresReview,
      cloneCreatedAt: initialDraft?.cloneCreatedAt,
      cloneIncludedImages: initialDraft?.cloneIncludedImages,
      cloneIncludedSignatures: initialDraft?.cloneIncludedSignatures,
      cloneIncludedMaterials: initialDraft?.cloneIncludedMaterials,
      cloneIncludedWaste: initialDraft?.cloneIncludedWaste,
    });

    setSaveStatusDialogOpen(false);
  };

  const handleSave = () => {
    if (!hasValidSaveInputs()) {
      return;
    }
    setSaveStatusDialogOpen(true);
  };

  const buildWorkReportForExport = (): WorkReport => {
    const nowIso = new Date().toISOString();

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
          .filter((row) => row.workerName.trim().length > 0 || row.activity.trim().length > 0 || nonNegative(row.hours) > 0)
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
          .filter((row) => row.machineType.trim().length > 0 || row.activity.trim().length > 0 || nonNegative(row.hours) > 0)
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
        supplier: group.supplier.trim(),
        invoiceNumber: group.invoiceNumber.trim(),
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
      .filter((group) => group.supplier.length > 0 || group.invoiceNumber.length > 0 || group.items.length > 0);

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
            const assignedWorkersWithHours = row.workersAssigned.filter((worker) => nonNegative(worker.hours) > 0);
            const workersCount =
              rowTotals?.numTrabEfectivo ??
              (assignedWorkersWithHours.length > 0 ? assignedWorkersWithHours.length : nonNegativeInt(group.numWorkersManual));
            return {
              id: row.id,
              contractedPart: row.partida.trim(),
              company: group.companyName.trim(),
              activity: row.activity.trim(),
              workers: workersCount,
              hours: rowTotals?.horasHombre ?? nonNegative(row.hours),
              unitType: mapSubcontractUnitToReportUnit(row.unit),
              quantity: rowTotals?.produccion ?? nonNegative(row.cantPerWorker),
              unitPrice: typeof row.unitPrice === 'number' ? nonNegative(row.unitPrice) : 0,
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
          totalWorkers: totals?.numWorkersEffective ?? nonNegativeInt(group.numWorkersManual),
        };
      })
      .filter((group) => group.company.length > 0 || group.items.length > 0);

    return {
      id: reportIdentifier || crypto.randomUUID(),
      workNumber: workNumber.trim(),
      date: date || todayDate(),
      workName: workName.trim(),
      workId: selectedWorkId || undefined,
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
      status: resolveSelectedSaveStatus().status,
    };
  };

  const handleDownloadPdf = async () => {
    if (exportingPdf || exportingExcel) return;
    try {
      setExportingPdf(true);
      const report = buildWorkReportForExport();
      const { generateWorkReportPDF } = await import('@/utils/pdfGenerator');
      await generateWorkReportPDF(report, true);
      toast({
        title: 'PDF generado',
        description: 'El parte se ha descargado correctamente en PDF.',
      });
    } catch (error) {
      console.error('[WorkReport] Error exporting PDF:', error);
      toast({
        title: 'Error al descargar PDF',
        description: 'No se pudo generar el PDF del parte.',
        variant: 'destructive',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (exportingPdf || exportingExcel) return;
    try {
      setExportingExcel(true);
      const report = buildWorkReportForExport();
      const { exportSingleReportToExcel } = await import('@/utils/exportUtils');
      await exportSingleReportToExcel(report);
      toast({
        title: 'Excel generado',
        description: 'El parte se ha descargado correctamente en Excel.',
      });
    } catch (error) {
      console.error('[WorkReport] Error exporting Excel:', error);
      toast({
        title: 'Error al descargar Excel',
        description: 'No se pudo generar el Excel del parte.',
        variant: 'destructive',
      });
    } finally {
      setExportingExcel(false);
    }
  };

  const renderRowsSection = (
    rows: EditableRow[],
    setRows: Dispatch<SetStateAction<EditableRow[]>>,
    options: RowsSectionOptions,
  ) => (
    <div className="space-y-3 pt-2">
      {rows.map((row) => (
        <div key={row.id} className={`grid grid-cols-1 gap-2 ${options.useUnit ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
          <Input
            placeholder={options.firstPlaceholder}
            value={row.name}
            onChange={(event) => updateRows(rows, setRows, row.id, { name: event.target.value })}
          />
          {options.secondOptions ? (
            <Select value={row.detail || undefined} onValueChange={(value) => updateRows(rows, setRows, row.id, { detail: value })}>
              <SelectTrigger>
                <SelectValue placeholder={options.secondPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {options.secondOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder={options.secondPlaceholder}
              value={row.detail}
              onChange={(event) => updateRows(rows, setRows, row.id, { detail: event.target.value })}
            />
          )}
          <Input
            type="number"
            min={0}
            step={0.5}
            value={editableNumericValue(row.value)}
            onChange={(event) => updateRows(rows, setRows, row.id, { value: parseNumeric(event.target.value) })}
            placeholder={options.valueLabel}
          />
          {options.useUnit ? (
            <Select value={row.unit || ''} onValueChange={(value) => updateRows(rows, setRows, row.id, { unit: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Unidad" />
              </SelectTrigger>
              <SelectContent>
                {(options.unitOptions || []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button variant="outline" onClick={() => setRows(rows.filter((item) => item.id !== row.id))} disabled={rows.length === 1}>
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar
          </Button>
        </div>
      ))}
      <Button variant="outline" onClick={() => setRows([...rows, createRow(options.useUnit ? options.unitOptions?.[0]?.value : undefined)])}>
        <Plus className="mr-2 h-4 w-4" />
        Añadir fila en {options.sectionName}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
            <Button variant="outline" disabled>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Anterior
            </Button>
            <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">0 / 0</div>
            <Button variant="outline" disabled>
              Siguiente
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <h2 className="text-lg font-semibold">{panelTitle}</h2>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {reportIdentifier ? <span className="rounded-md border px-2 py-1">ID: {reportIdentifier}</span> : null}
          {readOnly ? <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1">Parte cerrado: solo visualización</span> : null}
        </div>

        {isClonedReport ? (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            <div className="text-sm font-medium">Parte clonado - Revisión necesaria</div>
            <div className="text-xs text-amber-800">
              Este parte se ha clonado. Revisa y actualiza los datos antes de guardar.
              {cloneSourceLabel ? ` Origen: ${cloneSourceLabel}.` : ''}
            </div>
          </div>
        ) : null}

        <Card className="mt-3">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 border-b md:grid-cols-2">
              <div className="border-b p-4 md:border-b-0 md:border-r">
                <Label htmlFor="work-number">Nº Obra</Label>
                <Input id="work-number" className="mt-2" value={workNumber} onChange={(event) => setWorkNumber(event.target.value)} />
              </div>
              <div className="p-4">
                <Label htmlFor="work-date">Día</Label>
                <Popover open={workDatePickerOpen} onOpenChange={setWorkDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="work-date"
                      type="button"
                      variant="outline"
                      className={`mt-2 w-full justify-between text-left font-normal ${
                        selectedWorkDate ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {selectedWorkDate
                        ? format(selectedWorkDate, 'dd/MM/yyyy', { locale: es })
                        : 'Seleccionar fecha'}
                      <CalendarDays className="ml-2 h-4 w-4 shrink-0 opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedWorkDate}
                      onSelect={(selectedDate) => {
                        if (!selectedDate) return;
                        setDate(format(selectedDate, 'yyyy-MM-dd'));
                        setWorkDatePickerOpen(false);
                      }}
                      locale={es}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="p-4">
              <Label htmlFor="work-name">Nombre de la obra</Label>
              <Input
                id="work-name"
                className="mt-2"
                value={workName}
                placeholder="Nombre de la obra"
                onChange={(event) => setWorkName(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className={readOnly ? 'pointer-events-none select-none opacity-95' : ''}>
      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-3">
        <AccordionItem value="workforce" className="rounded-md border border-[#d9e1ea] bg-white px-4">
          <AccordionTrigger className="text-sm font-semibold">Mano de obra</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <label className="inline-flex items-center gap-2 rounded-md border border-[#d9e1ea] bg-slate-50 px-3 py-2 text-sm">
              <Checkbox
                className="h-3 w-3 shrink-0"
                checked={workforceSectionCompleted}
                onCheckedChange={(checked) => setWorkforceSectionCompleted(Boolean(checked))}
              />
              Sección completada
            </label>

            <div className="rounded-md border border-[#d9e1ea] bg-white">
              <div className="border-b border-[#d9e1ea] p-4 text-center">
                <p className="text-xl font-semibold uppercase tracking-wide text-slate-700">Mano de obra</p>
                <p className="mt-1 text-sm text-slate-500">Horas totales calculadas: {totalWorkforceHours.toFixed(2)}</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      toast({
                        title: 'Dictado en preparacion',
                        description: 'El dictado de mano de obra se conectara en la siguiente fase.',
                      })
                    }
                  >
                    <Mic className="mr-2 h-4 w-4" />
                    Dictar mano de obra
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-3">
                {workforceGroups.map((group, groupIndex) => {
                  const groupHours = group.rows.reduce((sum, row) => sum + row.hours, 0);
                  return (
                    <div key={group.id} className="rounded-md border border-[#d9e1ea] bg-white">
                      <div className="space-y-3 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">Empresa:</p>
                          <div className="flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() =>
                                toast({
                                  title: 'Subida de documento en preparacion',
                                  description: 'Se conectara en la siguiente fase.',
                                })
                              }
                            >
                              <Upload className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() =>
                                toast({
                                  title: 'Carga de empresa en preparacion',
                                  description: 'Este acceso rapido se conectara a ficheros en la siguiente fase.',
                                })
                              }
                            >
                              <Camera className="h-4 w-4" />
                            </Button>
                            <span className="text-sm text-blue-700">Horas: {groupHours.toFixed(2)}</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-red-600"
                              onClick={() => removeWorkforceGroup(group.id)}
                              disabled={workforceGroups.length === 1}
                              title="Eliminar grupo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <label className="inline-flex items-center gap-2 text-sm">
                          <Checkbox
                            className="h-3 w-3 shrink-0"
                            checked={group.isOwnCompany}
                            onCheckedChange={(checked) => updateWorkforceGroup(group.id, { isOwnCompany: Boolean(checked) })}
                          />
                          Empresa propia
                        </label>

                        <Input
                          value={group.companyName}
                          placeholder="Nombre de la empresa"
                          onChange={(event) => updateWorkforceGroup(group.id, { companyName: event.target.value })}
                        />
                      </div>

                      <div className="border-t border-[#d9e1ea]">
                        <div className="hidden grid-cols-12 gap-2 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase text-slate-700 md:grid">
                          <div className="col-span-5">Nombre</div>
                          <div className="col-span-4">Actividad</div>
                          <div className="col-span-2">Horas</div>
                          <div className="col-span-1"></div>
                        </div>
                        <div className="space-y-2 p-3">
                          {group.rows.map((row) => (
                            <div key={row.id} className="rounded-md border border-[#d9e1ea] p-2 md:rounded-none md:border-0 md:p-0">
                              <div className="grid grid-cols-12 gap-2">
                                <div className="col-span-12 space-y-1 md:col-span-5 md:space-y-0">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                    Nombre
                                  </p>
                                  <Input
                                    placeholder="Nombre del trabajador"
                                    value={row.workerName}
                                    onChange={(event) => updateWorkforceRow(group.id, row.id, { workerName: event.target.value })}
                                  />
                                </div>
                                <div className="col-span-12 space-y-1 md:col-span-4 md:space-y-0">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                    Actividad
                                  </p>
                                  <Input
                                    placeholder="Actividad realizada"
                                    value={row.activity}
                                    onChange={(event) => updateWorkforceRow(group.id, row.id, { activity: event.target.value })}
                                  />
                                </div>
                                <div className="col-span-9 space-y-1 md:col-span-2 md:space-y-0">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                    Horas
                                  </p>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    placeholder="0"
                                    value={editableNumericValue(row.hours)}
                                    onChange={(event) => updateWorkforceRow(group.id, row.id, { hours: parseNumeric(event.target.value) })}
                                  />
                                </div>
                                <div className="col-span-3 flex items-end md:col-span-1 md:justify-center">
                                  <Button
                                    className="h-9 w-full md:h-10 md:w-10"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => removeWorkforceRow(group.id, row.id)}
                                    disabled={group.rows.length === 1}
                                    title="Eliminar fila"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                          <Button variant="outline" onClick={() => addWorkforceRow(group.id)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Añadir fila
                          </Button>
                        </div>
                      </div>

                      <div className="border-t border-[#d9e1ea] bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        Grupo {groupIndex + 1}
                      </div>
                    </div>
                  );
                })}
                <div className="pt-1">
                  <Button variant="outline" onClick={addWorkforceGroup}>
                    <Plus className="mr-2 h-4 w-4" />
                    Añadir grupo
                  </Button>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="machinery" className="rounded-md border border-[#d9e1ea] bg-white px-4">
          <AccordionTrigger className="text-sm font-semibold">Maquinaria subcontratas</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="rounded-md border border-[#d9e1ea] bg-white">
              <div className="border-b border-[#d9e1ea] p-4 text-center">
                <p className="text-xl font-semibold uppercase tracking-wide text-slate-700">Maquinaria</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      toast({
                        title: 'Dictado en preparación',
                        description: 'El dictado de maquinaria se conectará en la siguiente fase.',
                      })
                    }
                  >
                    <Mic className="mr-2 h-4 w-4" />
                    Dictar Maquinaria
                  </Button>
                  <Button variant="outline" onClick={addSubcontractedMachineryGroup}>
                    <Plus className="mr-2 h-4 w-4" />
                    Añadir Grupo
                  </Button>
                </div>
              </div>
              <div className="space-y-4 p-3">
                {subcontractedMachineryGroups.map((group) => {
                  const groupHours = group.rows.reduce((sum, row) => sum + row.hours, 0);
                  return (
                    <div key={group.id} className="rounded-md border border-[#d9e1ea] bg-white">
                      <div className="space-y-3 p-3">
                        <div className="flex items-center gap-4 flex-wrap px-1">
                          <div className="flex-1 min-w-[200px]">
                            <p className="text-sm font-medium">Empresa:</p>
                            <label className="mt-2 inline-flex items-center gap-2 text-sm">
                              <Checkbox
                                className="h-3 w-3 shrink-0"
                                checked={group.isOwnCompany}
                                onCheckedChange={(checked) => {
                                  const isOwnCompany = Boolean(checked);
                                  const ownCompanyName = 'Empresa propia';
                                  updateSubcontractedMachineryGroup(group.id, {
                                    isOwnCompany,
                                    companyName: isOwnCompany
                                      ? group.companyName || ownCompanyName
                                      : group.companyName === ownCompanyName
                                        ? ''
                                        : group.companyName,
                                  });
                                }}
                              />
                              Empresa propia
                            </label>
                            <Input
                              className="mt-2"
                              value={group.companyName}
                              placeholder="Nombre de la empresa"
                              onChange={(event) =>
                                updateSubcontractedMachineryGroup(group.id, { companyName: event.target.value })
                              }
                              disabled={group.isOwnCompany}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              id={`machinery-upload-${group.id}`}
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={(event) => handleSubcontractedMachineryUpload(group.id, event)}
                            />
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => document.getElementById(`machinery-upload-${group.id}`)?.click()}
                            >
                              <Upload className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() =>
                                toast({
                                  title: 'Cámara en preparación',
                                  description: 'La captura de maquinaria se conectará en la siguiente fase.',
                                })
                              }
                            >
                              <Camera className="h-4 w-4" />
                            </Button>
                            <span className="text-sm text-blue-700">Total Horas: {groupHours.toFixed(2)}</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-red-600"
                              onClick={() => removeSubcontractedMachineryGroup(group.id)}
                              disabled={subcontractedMachineryGroups.length === 1}
                              title="Eliminar grupo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-[#d9e1ea]">
                        <div className="hidden grid-cols-12 gap-2 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase text-slate-700 md:grid">
                          <div className="col-span-4">Tipo máquina</div>
                          <div className="col-span-5">Actividad</div>
                          <div className="col-span-2">H/Cant.</div>
                          <div className="col-span-1"></div>
                        </div>
                        <div className="space-y-2 p-3">
                          {group.rows.map((row) => (
                            <div key={row.id} className="rounded-md border border-[#d9e1ea] p-2 md:rounded-none md:border-0 md:p-0">
                              <div className="grid grid-cols-12 gap-2">
                                <div className="col-span-12 space-y-1 md:col-span-4 md:space-y-0">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                    Tipo máquina
                                  </p>
                                  <Input
                                    placeholder="Tipo de máquina"
                                    value={row.machineType}
                                    onChange={(event) =>
                                      updateSubcontractedMachineryRow(group.id, row.id, { machineType: event.target.value })
                                    }
                                  />
                                </div>
                                <div className="col-span-12 space-y-1 md:col-span-5 md:space-y-0">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                    Actividad
                                  </p>
                                  <Input
                                    placeholder="Actividad realizada"
                                    value={row.activity}
                                    onChange={(event) =>
                                      updateSubcontractedMachineryRow(group.id, row.id, { activity: event.target.value })
                                    }
                                  />
                                </div>
                                <div className="col-span-10 space-y-1 md:col-span-2 md:space-y-0">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                    H/Cant.
                                  </p>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={editableNumericValue(row.hours)}
                                    onChange={(event) =>
                                      updateSubcontractedMachineryRow(group.id, row.id, { hours: parseNumeric(event.target.value) })
                                    }
                                  />
                                </div>
                                <div className="col-span-2 flex items-end md:col-span-1 md:justify-center">
                                  <Button
                                    className="h-9 w-full md:h-10 md:w-10"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => removeSubcontractedMachineryRow(group.id, row.id)}
                                    disabled={group.rows.length === 1}
                                    title="Eliminar fila"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                          <Button variant="outline" onClick={() => addSubcontractedMachineryRow(group.id)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Añadir Fila
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="materials" className="rounded-md border border-[#d9e1ea] bg-white px-4">
          <AccordionTrigger className="text-sm font-semibold">Materiales</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="rounded-md border border-[#d9e1ea] bg-white">
              <div className="border-b border-[#d9e1ea] p-4 text-center">
                <p className="text-xl font-semibold uppercase tracking-wide text-slate-700">Materiales</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="default"
                    onClick={() =>
                      toast({
                        title: 'Escaneo IA en preparación',
                        description: 'El escaneo de albaranes se conectará en la siguiente fase.',
                      })
                    }
                  >
                    Escanear IA
                  </Button>
                  <Button variant="outline" onClick={addMaterialGroup}>
                    <Plus className="mr-2 h-4 w-4" />
                    Albarán
                  </Button>
                </div>
              </div>
              <div className="space-y-4 p-3">
                {materialGroups.map((group) => (
                  <Collapsible
                    key={group.id}
                    open={openMaterialGroups[group.id] ?? true}
                    onOpenChange={(isOpen) => setMaterialGroupOpen(group.id, isOpen)}
                    className="rounded-md border border-[#d9e1ea] bg-white"
                  >
                    <div className="flex items-center gap-2 border-b border-[#d9e1ea] bg-slate-50 px-3 py-2">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <ChevronDown className={`h-4 w-4 transition-transform ${(openMaterialGroups[group.id] ?? true) ? '' : '-rotate-90'}`} />
                        </Button>
                      </CollapsibleTrigger>
                      <div className="flex-1 text-sm font-medium">
                        {(group.supplier || 'Sin proveedor')} - {(group.invoiceNumber || 'Sin nº albarán')}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-600"
                        onClick={() => removeMaterialGroup(group.id)}
                        disabled={materialGroups.length === 1}
                        title="Eliminar albarán"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CollapsibleContent>
                      <div className="space-y-4 p-3">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <Label>Proveedor:</Label>
                            <Input
                              className="mt-2"
                              placeholder="Nombre del proveedor"
                              value={group.supplier}
                              onChange={(event) => updateMaterialGroup(group.id, { supplier: event.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Nº Albarán:</Label>
                            <Input
                              className="mt-2"
                              placeholder="Número de albarán"
                              value={group.invoiceNumber}
                              onChange={(event) => updateMaterialGroup(group.id, { invoiceNumber: event.target.value })}
                            />
                          </div>
                        </div>
                        <div className="rounded-md border border-[#d9e1ea]">
                          <div className="hidden grid-cols-12 gap-2 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase text-slate-700 md:grid">
                            <div className="col-span-4">Material</div>
                            <div className="col-span-2">Cantidad</div>
                            <div className="col-span-2">Unidad</div>
                            <div className="col-span-2">Precio/Ud</div>
                            <div className="col-span-1">Coste (€)</div>
                            <div className="col-span-1"></div>
                          </div>
                          <div className="space-y-2 p-3">
                            {group.rows.map((row) => (
                              <div key={row.id} className="rounded-md border border-[#d9e1ea] p-2 md:rounded-none md:border-0 md:p-0">
                                <div className="grid grid-cols-12 gap-2">
                                  <div className="col-span-12 space-y-1 md:col-span-4 md:space-y-0">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                      Material
                                    </p>
                                    <Input
                                      placeholder="Nombre del material"
                                      value={row.name}
                                      onChange={(event) => updateMaterialRow(group.id, row.id, { name: event.target.value })}
                                    />
                                  </div>
                                  <div className="col-span-4 space-y-1 md:col-span-2 md:space-y-0">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                      Cantidad
                                    </p>
                                    <Input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={editableNumericValue(row.quantity)}
                                      onChange={(event) =>
                                        updateMaterialRow(group.id, row.id, { quantity: parseNumeric(event.target.value) })
                                      }
                                    />
                                  </div>
                                  <div className="col-span-4 space-y-1 md:col-span-2 md:space-y-0">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                      Unidad
                                    </p>
                                    <Select
                                      value={row.unit || undefined}
                                      onValueChange={(value) => updateMaterialRow(group.id, row.id, { unit: value })}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Unidad" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {MATERIAL_UNIT_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="col-span-4 space-y-1 md:col-span-2 md:space-y-0">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                      Precio/Ud
                                    </p>
                                    <Input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={editableNumericValue(row.unitPrice)}
                                      onChange={(event) =>
                                        updateMaterialRow(group.id, row.id, { unitPrice: parseNumeric(event.target.value) })
                                      }
                                    />
                                  </div>
                                  <div className="col-span-9 space-y-1 md:col-span-1 md:space-y-0">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                      Coste (€)
                                    </p>
                                    <Input
                                      type="text"
                                      value={row.total.toFixed(2)}
                                      title="Coste calculado automáticamente (cantidad × precio/ud)"
                                      readOnly
                                    />
                                  </div>
                                  <div className="col-span-3 flex items-end md:col-span-1 md:justify-center">
                                    <Button
                                      className="h-9 w-full md:h-10 md:w-10"
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => removeMaterialRow(group.id, row.id)}
                                      disabled={group.rows.length === 1}
                                      title="Eliminar fila"
                                    >
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            <Button variant="outline" onClick={() => addMaterialRow(group.id)}>
                              <Plus className="mr-2 h-4 w-4" />
                              Añadir Fila
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="subcontracts" className="rounded-md border border-[#d9e1ea] bg-white px-4">
          <AccordionTrigger className="text-sm font-semibold">Subcontratas</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="rounded-md border border-[#d9e1ea] bg-white">
              <div className="border-b border-[#d9e1ea] p-4 text-center">
                <p className="text-xl font-semibold uppercase tracking-wide text-slate-700">Subcontratas</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      toast({
                        title: 'Dictado en preparación',
                        description: 'El dictado de subcontratas se conectará en la siguiente fase.',
                      })
                    }
                  >
                    <Mic className="mr-2 h-4 w-4" />
                    Dictar Subcontratas
                  </Button>
                  <Button variant="outline" onClick={addSubcontractGroup}>
                    <Plus className="mr-2 h-4 w-4" />
                    Añadir Grupo
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-3">
                {subcontractGroups.map((group, groupIndex) => {
                  const groupTotals = subcontractTotalsByGroupId[group.id] ?? computeGroupTotals(group);
                  const autoWorkersEnabled = groupTotals.uniqueWorkersWithHours > 0;
                  const effectiveNumWorkers = autoWorkersEnabled ? groupTotals.numWorkersEffective : group.numWorkersManual;
                  const unitBreakdown = Object.entries(groupTotals.totalsByUnit)
                    .filter(([, value]) => value > 0)
                    .map(([unit, value]) => `${unitLabel(unit)}: ${value.toFixed(2)}`)
                    .join(' | ');

                  return (
                    <div key={group.id} className="rounded-md border border-[#d9e1ea] bg-white">
                      <div className="space-y-3 p-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="min-w-[240px] flex-1">
                            <Label>Empresa:</Label>
                            <Input
                              className="mt-2"
                              value={group.companyName}
                              placeholder="Nombre de la empresa"
                              onChange={(event) => updateSubcontractGroup(group.id, { companyName: event.target.value })}
                            />
                          </div>

                          <div className="w-28">
                            <Label>Nº Trab:</Label>
                            <Input
                              className="mt-2"
                              type="number"
                              min={0}
                              value={autoWorkersEnabled ? effectiveNumWorkers : editableNumericValue(effectiveNumWorkers)}
                              disabled={autoWorkersEnabled}
                              onChange={(event) =>
                                updateSubcontractGroup(group.id, {
                                  numWorkersManual: nonNegativeInt(parseNumeric(event.target.value)),
                                })
                              }
                            />
                          </div>

                          <div className="flex w-full items-center gap-2 md:w-auto">
                            <input
                              id={`subcontract-upload-${group.id}`}
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={(event) => handleSubcontractUpload(group.id, event)}
                            />
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => document.getElementById(`subcontract-upload-${group.id}`)?.click()}
                            >
                              <Upload className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() =>
                                toast({
                                  title: 'Cámara en preparación',
                                  description: 'La captura de documentos se conectará en la siguiente fase.',
                                })
                              }
                            >
                              <Camera className="h-4 w-4" />
                            </Button>
                            <span className="text-sm text-blue-700">
                              Total Grupo: {groupTotals.displayTotal.toFixed(2)} {groupTotals.displayUnitLabel}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-red-600"
                              onClick={() => removeSubcontractGroup(group.id)}
                              disabled={subcontractGroups.length === 1}
                              title="Eliminar grupo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {autoWorkersEnabled ? (
                          <p className="text-xs text-slate-500">
                            Nº Trab en modo automático: se calcula por trabajadores únicos con horas &gt; 0 dentro del grupo.
                          </p>
                        ) : null}

                        {groupTotals.hasMixedUnits ? (
                          <p className="text-xs text-slate-500">
                            Producción por unidad: {unitBreakdown || '0'}
                          </p>
                        ) : null}
                      </div>

                      <div className="border-t border-[#d9e1ea]">
                        <div className="hidden grid-cols-12 gap-2 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase text-slate-700 md:grid">
                          <div className="col-span-2">Partida</div>
                          <div className="col-span-2">Actividad</div>
                          <div className="col-span-2">Unidad</div>
                          <div className="col-span-2">Cant./Trab.</div>
                          <div className="col-span-1">Trab.</div>
                          <div className="col-span-2">Horas</div>
                          <div className="col-span-1"></div>
                        </div>

                        <div className="space-y-3 p-3">
                          {group.rows.map((row) => {
                            const rowTotals =
                              groupTotals.rowTotalsById[row.id] ??
                              computeRowTotals(row, { numWorkersEffective: groupTotals.numWorkersEffective });
                            const rowWorkersOpen = openSubcontractWorkers[row.id] ?? false;

                            return (
                              <div key={row.id} className="rounded-md border border-[#d9e1ea] p-2">
                                <div className="grid grid-cols-12 gap-2">
                                  <div className="col-span-12 space-y-1 md:col-span-2 md:space-y-0">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                      Partida
                                    </p>
                                    <Input
                                      placeholder="Partida"
                                      value={row.partida}
                                      onChange={(event) =>
                                        updateSubcontractRow(group.id, row.id, { partida: event.target.value })
                                      }
                                    />
                                  </div>
                                  <div className="col-span-12 space-y-1 md:col-span-2 md:space-y-0">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                      Actividad
                                    </p>
                                    <Input
                                      placeholder="Actividad"
                                      value={row.activity}
                                      onChange={(event) =>
                                        updateSubcontractRow(group.id, row.id, { activity: event.target.value })
                                      }
                                    />
                                  </div>
                                  <div className="col-span-6 space-y-1 md:col-span-2 md:space-y-0">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                      Unidad
                                    </p>
                                    <Select
                                      value={row.unit}
                                      onValueChange={(value) =>
                                        updateSubcontractRow(group.id, row.id, { unit: normalizeSubcontractUnit(value) })
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Unidad" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {SUBCONTRACT_UNIT_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="col-span-6 space-y-1 md:col-span-2 md:space-y-0">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                      Cant./Trab.
                                    </p>
                                    <Input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={editableNumericValue(row.cantPerWorker)}
                                      onChange={(event) =>
                                        updateSubcontractRow(group.id, row.id, {
                                          cantPerWorker: nonNegative(parseNumeric(event.target.value)),
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="col-span-4 space-y-1 md:col-span-1 md:space-y-0">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                      Trab.
                                    </p>
                                    <Input
                                      type="number"
                                      readOnly
                                      value={rowTotals.numTrabEfectivo}
                                      title="Número de trabajadores efectivo para el cálculo"
                                    />
                                  </div>
                                  <div className="col-span-6 space-y-1 md:col-span-2 md:space-y-0">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                      Horas
                                    </p>
                                    <Input
                                      type="number"
                                      min={0}
                                      step={0.5}
                                      value={
                                        rowTotals.hasAssignedWorkers
                                          ? rowTotals.horasHombre.toFixed(2)
                                          : editableNumericValue(row.hours)
                                      }
                                      disabled={rowTotals.hasAssignedWorkers}
                                      title={
                                        rowTotals.hasAssignedWorkers
                                          ? 'Horas calculadas automáticamente por suma de trabajadores asignados'
                                          : 'Horas manuales de la fila'
                                      }
                                      onChange={(event) =>
                                        updateSubcontractRow(group.id, row.id, {
                                          hours: nonNegative(parseNumeric(event.target.value)),
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="col-span-2 flex items-end md:col-span-1 md:justify-center">
                                    <Button
                                      className="h-9 w-full md:h-10 md:w-10"
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => removeSubcontractRow(group.id, row.id)}
                                      disabled={group.rows.length === 1}
                                      title="Eliminar fila"
                                    >
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </div>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSubcontractWorkersOpen(row.id, !rowWorkersOpen)}
                                  >
                                    <Users className="mr-2 h-4 w-4" />
                                    Trabajadores
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => addSubcontractWorker(group.id, row.id)}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Añadir
                                  </Button>
                                  <span className="text-xs text-slate-500">
                                    HH: {rowTotals.horasHombre.toFixed(2)} | Prod: {rowTotals.produccion.toFixed(2)} {unitLabel(rowTotals.unit)}
                                    {rowTotals.hasAssignedWorkers ? ' | Horas auto' : ''}
                                  </span>
                                </div>

                                <Collapsible open={rowWorkersOpen} onOpenChange={(isOpen) => setSubcontractWorkersOpen(row.id, isOpen)}>
                                  <CollapsibleContent className="pt-2">
                                    {row.workersAssigned.length === 0 ? (
                                      <div className="rounded-md border border-dashed p-3 text-xs text-slate-500">
                                        Sin trabajadores asignados en esta fila.
                                      </div>
                                    ) : (
                                      <div className="space-y-2 rounded-md border border-[#d9e1ea] p-2">
                                        {row.workersAssigned.map((worker) => (
                                          <div key={worker.id} className="grid grid-cols-12 gap-2">
                                            <Input
                                              className="col-span-12 md:col-span-7"
                                              placeholder="Nombre del trabajador"
                                              value={worker.name}
                                              onChange={(event) =>
                                                updateSubcontractWorker(group.id, row.id, worker.id, { name: event.target.value })
                                              }
                                            />
                                            <Input
                                              className="col-span-8 md:col-span-4"
                                              type="number"
                                              min={0}
                                              step={0.5}
                                              value={editableNumericValue(worker.hours)}
                                              onChange={(event) =>
                                                updateSubcontractWorker(group.id, row.id, worker.id, {
                                                  hours: nonNegative(parseNumeric(event.target.value)),
                                                })
                                              }
                                            />
                                            <Button
                                              className="col-span-4 md:col-span-1"
                                              size="icon"
                                              variant="ghost"
                                              onClick={() => removeSubcontractWorker(group.id, row.id, worker.id)}
                                              title="Eliminar trabajador"
                                            >
                                              <Trash2 className="h-4 w-4 text-red-600" />
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </CollapsibleContent>
                                </Collapsible>
                              </div>
                            );
                          })}

                          <Button variant="outline" onClick={() => addSubcontractRow(group.id)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Añadir Fila
                          </Button>
                        </div>
                      </div>

                      <div className="border-t border-[#d9e1ea] bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        Grupo {groupIndex + 1}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="rental" className="rounded-md border border-[#d9e1ea] bg-white px-4">
          <AccordionTrigger className="text-sm font-semibold">Maquinaria alquilada</AccordionTrigger>
          <AccordionContent className="space-y-3">
            <div className="rounded-md border border-[#d9e1ea] bg-white">
              <div className="border-b border-[#d9e1ea] px-3 py-2 text-sm font-semibold text-slate-700">
                Maquinaria alquilada
              </div>

              <div className="p-4">
                {rentalLoading ? (
                  <div className="text-center text-sm text-slate-500">Cargando maquinaria de alquiler...</div>
                ) : rentalError ? (
                  <div className="text-center text-sm text-red-600">{rentalError}</div>
                ) : !selectedWorkId || rentalResult.items.length === 0 ? (
                  <div className="rounded-md bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    <div>No hay maquinaria de alquiler activa para esta fecha.</div>
                    <div>Gestiona la maquinaria de alquiler desde la pestaña de Gestión de Obras.</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rentalResult.items.map((machine) => (
                      <div key={machine.id} className="rounded-md border border-[#d9e1ea] bg-slate-50 p-3">
                        <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-5">
                          <div>
                            <div className="text-xs text-slate-500">Maquinaria</div>
                            <div className="font-medium text-slate-800">{machine.name}</div>
                            {machine.description ? (
                              <div className="text-xs text-slate-500">{machine.description}</div>
                            ) : null}
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Proveedor</div>
                            <div className="text-slate-800">{machine.provider || '-'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Fechas</div>
                            <div className="text-slate-800">
                              {normalizeDate(machine.startDate)} - {machine.endDate ? normalizeDate(machine.endDate) : 'Abierta'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Precio</div>
                            <div className="text-slate-800">
                              {typeof machine.price === 'number'
                                ? `${machine.price.toFixed(2)} €/` + machine.priceUnit
                                : '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Estado</div>
                            <div className="text-emerald-700 font-medium">{machine.status}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="waste" className="rounded-md border border-[#d9e1ea] bg-white px-4">
          <AccordionTrigger className="text-sm font-semibold">Gestión de residuos</AccordionTrigger>
          <AccordionContent>
            {renderRowsSection(wasteRows, setWasteRows, {
              sectionName: 'residuos',
              firstPlaceholder: 'Residuo',
              secondPlaceholder: 'Tipo',
              secondOptions: [
                { value: 'inertes', label: 'Inertes' },
                { value: 'madera', label: 'Madera' },
                { value: 'plastico', label: 'Plástico' },
                { value: 'metal', label: 'Metal' },
              ],
              valueLabel: 'Cantidad',
              useUnit: true,
              unitOptions: [
                { value: 'kg', label: 'Kg' },
                { value: 'm3', label: 'M3' },
                { value: 'contenedor', label: 'Contenedor' },
              ],
            })}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="observations" className="rounded-md border border-[#d9e1ea] bg-white px-4">
          <AccordionTrigger className="text-sm font-semibold">Observaciones e incidencias</AccordionTrigger>
          <AccordionContent className="pt-2">
            <ObservacionesIncidenciasSection
              showHeader={false}
              disabled={readOnly}
              dictationActive={dictationEnabled}
              onDictate={() => setDictationEnabled((current) => !current)}
              value={{
                isCompleted: observationsCompleted,
                category: observationsCategory,
                text: observationsText,
              }}
              onChange={(next) => {
                setObservationsCompleted(next.isCompleted);
                setObservationsCategory(next.category);
                setObservationsText(next.text);
              }}
            />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="gallery" className="rounded-md border border-[#d9e1ea] bg-white px-4">
          <AccordionTrigger className="text-sm font-semibold">Galería de imágenes</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm hover:bg-slate-50">
              <Camera className="mr-2 h-4 w-4" />
              Añadir imágenes
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} />
            </label>
            {galleryImages.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-slate-500">Sin imágenes cargadas</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {galleryImages.map((image) => (
                  <div key={image.id} className="rounded-md border bg-white p-2">
                    <img src={image.dataUrl} alt={image.name} className="h-24 w-full rounded object-cover" />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate text-xs">{image.name}</span>
                      <Button variant="ghost" size="icon" onClick={() => setGalleryImages(galleryImages.filter((item) => item.id !== image.id))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
              <Users className="h-4 w-4 text-slate-500" />
              Encargados, capataces y recursos preventivos
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-600">
                <span className="mr-2">Total horas:</span>
                <span className="font-semibold text-blue-700">{totalForemanSectionHours.toFixed(1)}h</span>
              </div>
              <Button
                variant="outline"
                disabled={readOnly}
                onClick={() => setForemanResources((current) => [...current, createForemanResource()])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Añadir
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-md border border-[#d9e1ea] p-2">
            {foremanResources.map((entry) => (
              <div key={entry.id} className="rounded-md border border-[#d9e1ea] p-2">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                  <div className="md:col-span-3">
                    <Label className="mb-1 block text-xs font-medium text-slate-600">Rol</Label>
                    <Select
                      value={entry.role}
                      disabled={readOnly}
                      onValueChange={(value) =>
                        setForemanResources((current) =>
                          current.map((item) => (item.id === entry.id ? { ...item, role: value } : item)),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="encargado">Encargado</SelectItem>
                        <SelectItem value="capataz">Capataz</SelectItem>
                        <SelectItem value="preventivo">Recurso preventivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-6">
                    <Label className="mb-1 block text-xs font-medium text-slate-600">Nombre</Label>
                    <Input
                      placeholder="Nombre del encargado"
                      disabled={readOnly}
                      value={entry.name}
                      onChange={(event) =>
                        setForemanResources((current) =>
                          current.map((item) => (item.id === entry.id ? { ...item, name: event.target.value } : item)),
                        )
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label className="mb-1 block text-xs font-medium text-slate-600">Horas</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      disabled={readOnly}
                      value={editableNumericValue(entry.hours)}
                      onChange={(event) =>
                        setForemanResources((current) =>
                          current.map((item) =>
                            item.id === entry.id ? { ...item, hours: nonNegative(parseNumeric(event.target.value)) } : item,
                          ),
                        )
                      }
                    />
                  </div>

                  <div className="md:col-span-1 flex items-end justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={readOnly}
                      onClick={() => setForemanResources((current) => current.filter((item) => item.id !== entry.id))}
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

          </div>

          <div className="grid grid-cols-1 divide-y divide-[#d9e1ea] rounded-md border border-[#d9e1ea] md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-3">
              <Label htmlFor="main-foreman" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Encargado principal:
              </Label>
              <Input
                id="main-foreman"
                className="mt-2"
                disabled={readOnly}
                value={mainForeman}
                onChange={(event) => setMainForeman(event.target.value)}
              />
            </div>
            <div className="p-3">
              <Label htmlFor="main-foreman-hours" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Horas encargado principal:
              </Label>
              <Input
                id="main-foreman-hours"
                className="mt-2"
                type="number"
                min={0}
                step={0.5}
                disabled={readOnly}
                value={editableNumericValue(mainForemanHours)}
                onChange={(event) => setMainForemanHours(nonNegative(parseNumeric(event.target.value)))}
              />
            </div>
            <div className="p-3">
              <Label htmlFor="site-manager" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Jefe de obra:
              </Label>
              <Input
                id="site-manager"
                className="mt-2"
                disabled={readOnly}
                value={siteManager}
                onChange={(event) => setSiteManager(event.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Clonación automática</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-start gap-3 rounded-md border bg-blue-50 p-3 text-sm">
            <Checkbox
              className="h-3 w-3 shrink-0"
              checked={autoCloneNextDay}
              onCheckedChange={(checked) => setAutoCloneNextDay(Boolean(checked))}
            />
            <div>
              <p className="font-medium">Clonar automáticamente mañana a las 06:00</p>
              <p className="text-xs text-slate-600">Si activas esta opción, este parte se clona para el siguiente día laborable.</p>
            </div>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Firmas digitales</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <SignaturePad
            label="Firma del encargado"
            value={foremanSignature}
            disabled={readOnly}
            onChange={(signature) => setForemanSignature(signature)}
          />
          <SignaturePad
            label="Firma del jefe de obra"
            value={siteManagerSignature}
            disabled={readOnly}
            onChange={(signature) => setSiteManagerSignature(signature)}
          />
        </CardContent>
      </Card>
      </div>

      <div className="flex flex-col items-start justify-between gap-3 rounded-md border bg-white p-3 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="text-sm text-slate-600">Secciones completas: {completedSections}</div>
          <div className="text-sm text-slate-600">Horas totales mano de obra: {totalWorkforceHours.toFixed(2)}</div>
          <div className="text-sm text-slate-600">Estado seleccionado: {saveStatusSummaryLabel}</div>
        </div>
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          <Button variant="outline" onClick={() => void handleDownloadPdf()} disabled={exportingPdf || exportingExcel}>
            <Download className="mr-2 h-4 w-4" />
            {exportingPdf ? 'Generando...' : 'PDF'}
          </Button>
          <Button variant="outline" onClick={() => void handleDownloadExcel()} disabled={exportingPdf || exportingExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {exportingExcel ? 'Generando...' : 'Excel'}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || readOnly}>
            <Save className="mr-2 h-4 w-4" />
            {readOnly ? 'Solo lectura' : saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      <Dialog open={saveStatusDialogOpen} onOpenChange={setSaveStatusDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Estado del Parte de Trabajo</DialogTitle>
            <DialogDescription>
              Selecciona uno o más estados según corresponda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Puedes seleccionar ambos estados de validación. <span className="font-medium">Completado</span> deselecciona el resto.
            </div>

            <button
              type="button"
              className={`w-full rounded-md border p-4 text-left transition-colors ${
                saveStatusSelection.includes('completed')
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
              onClick={() => handleToggleSaveStatus('completed')}
            >
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className={`mt-0.5 h-5 w-5 ${
                    saveStatusSelection.includes('completed') ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div className={`text-lg font-semibold ${saveStatusSelection.includes('completed') ? 'text-emerald-700' : 'text-slate-700'}`}>
                    Completado
                  </div>
                  <div className="text-sm text-muted-foreground">El parte está completo y listo.</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              className={`w-full rounded-md border p-4 text-left transition-colors ${
                saveStatusSelection.includes('missing_data')
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
              onClick={() => handleToggleSaveStatus('missing_data')}
            >
              <div className="flex items-start gap-3">
                <FileWarning
                  className={`mt-0.5 h-5 w-5 ${
                    saveStatusSelection.includes('missing_data') ? 'text-amber-600' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div className={`text-lg font-semibold ${saveStatusSelection.includes('missing_data') ? 'text-amber-700' : 'text-slate-700'}`}>
                    Faltan Datos
                  </div>
                  <div className="text-sm text-muted-foreground">Faltan datos por completar.</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              className={`w-full rounded-md border p-4 text-left transition-colors ${
                saveStatusSelection.includes('missing_delivery_notes')
                  ? 'border-rose-300 bg-rose-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
              onClick={() => handleToggleSaveStatus('missing_delivery_notes')}
            >
              <div className="flex items-start gap-3">
                <FileBadge2
                  className={`mt-0.5 h-5 w-5 ${
                    saveStatusSelection.includes('missing_delivery_notes') ? 'text-rose-600' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div className={`text-lg font-semibold ${saveStatusSelection.includes('missing_delivery_notes') ? 'text-rose-700' : 'text-slate-700'}`}>
                    Faltan Albaranes
                  </div>
                  <div className="text-sm text-muted-foreground">Faltan albaranes por adjuntar.</div>
                </div>
              </div>
            </button>

            <Button className="w-full" onClick={() => void handleConfirmSaveWithStatus()} disabled={saving || readOnly}>
              Confirmar Estado
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

