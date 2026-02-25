import {
  normalizeDocType,
  type ParsedAlbaranItem,
  type ParsedAlbaranResult,
  type ParsedDocType,
} from '@/plugins/albaranScanner';
import type { RentalMachine } from '@/services/rentalMachinerySource';
import type {
  EditableRow,
  ForemanResource,
  MaterialGroup,
  MaterialRow,
  ServiceLine,
  SubcontractAssignedWorker,
  SubcontractGroup,
  SubcontractGroupContext,
  SubcontractGroupTotals,
  SubcontractPriceResolver,
  SubcontractRow,
  SubcontractRowTotals,
  SubcontractUnit,
  SubcontractedMachineryGroup,
  SubcontractedMachineryRow,
  WorkforceGroup,
  WorkforceRow,
} from '@/components/work-report/types';

export const ALL_SECTION_IDS = [
  'workforce',
  'machinery',
  'materials',
  'subcontracts',
  'rental',
  'waste',
  'observations',
  'gallery',
];

export const todayDate = () => new Date().toISOString().split('T')[0];

export const parseDateInputValue = (value: string): Date | undefined => {
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

export const createRow = (unit?: string): EditableRow => ({
  id: crypto.randomUUID(),
  name: '',
  detail: '',
  value: 0,
  unit,
});

export const createWorkforceRow = (): WorkforceRow => ({
  id: crypto.randomUUID(),
  workerName: '',
  activity: '',
  hours: 0,
  total: 0,
});

export const createWorkforceGroup = (): WorkforceGroup => ({
  id: crypto.randomUUID(),
  companyName: '',
  isOwnCompany: false,
  rows: [createWorkforceRow()],
});

export const createSubcontractedMachineryRow = (): SubcontractedMachineryRow => ({
  id: crypto.randomUUID(),
  machineType: '',
  activity: '',
  hours: 0,
  total: 0,
});

export const createSubcontractedMachineryGroup = (): SubcontractedMachineryGroup => ({
  id: crypto.randomUUID(),
  companyName: '',
  isOwnCompany: false,
  rows: [createSubcontractedMachineryRow()],
});

export const createMaterialRow = (): MaterialRow => ({
  id: crypto.randomUUID(),
  name: '',
  quantity: 0,
  unit: '',
  unitPrice: 0,
  total: 0,
  costDocValue: null,
  costWarningDelta: null,
});

export const createMaterialGroup = (): MaterialGroup => ({
  id: crypto.randomUUID(),
  supplier: '',
  invoiceNumber: '',
  docType: null,
  isScanned: false,
  imageUris: [],
  rows: [createMaterialRow()],
  serviceLines: [],
});

export const createServiceLine = (): ServiceLine => ({
  id: crypto.randomUUID(),
  description: '',
  hours: null,
  trips: null,
  tons: null,
  m3: null,
});

export const SUBCONTRACT_UNIT_OPTIONS: Array<{ value: SubcontractUnit; label: string }> = [
  { value: 'hora', label: 'Hora' },
  { value: 'm2', label: 'm²' },
  { value: 'ml', label: 'ml' },
  { value: 'ud', label: 'ud' },
  { value: 'kg', label: 'kg' },
  { value: 'm3', label: 'm³' },
];

export const MATERIAL_UNIT_OPTIONS = [
  { value: 'm2', label: 'm²' },
  { value: 'm3', label: 'm³' },
  { value: 'ml', label: 'ml' },
  { value: 'kg', label: 'kg' },
  { value: 'h', label: 'h' },
  { value: 'ud', label: 'ud' },
  { value: 'l', label: 'l' },
];

export const COST_DIFF_THRESHOLD = 0.02;

export const nonNegative = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return value > 0 ? value : 0;
};

export const nonNegativeInt = (value: number): number => Math.trunc(nonNegative(value));

export const sanitizeText = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const normalizeSubcontractUnit = (unit: string | undefined): SubcontractUnit => {
  const normalized = (unit || '').trim().toLowerCase();
  if (normalized === 'hora' || normalized === 'h' || normalized === 'hour' || normalized === 'hours') return 'hora';
  if (normalized === 'm2' || normalized === 'm²') return 'm2';
  if (normalized === 'ml') return 'ml';
  if (normalized === 'ud' || normalized === 'unidad' || normalized === 'unidades') return 'ud';
  if (normalized === 'kg' || normalized === 'kilo' || normalized === 'kilos') return 'kg';
  if (normalized === 'm3' || normalized === 'm³') return 'm3';
  return 'hora';
};

export const isHourUnit = (unit: string | undefined): boolean => normalizeSubcontractUnit(unit) === 'hora';

export const unitLabel = (unit: string): string => {
  const normalized = normalizeSubcontractUnit(unit);
  const found = SUBCONTRACT_UNIT_OPTIONS.find((option) => option.value === normalized);
  return found?.label || normalized;
};

export const createSubcontractAssignedWorker = (): SubcontractAssignedWorker => ({
  id: crypto.randomUUID(),
  name: '',
  hours: 0,
});

export const createSubcontractRow = (): SubcontractRow => ({
  id: crypto.randomUUID(),
  partida: '',
  activity: '',
  unit: 'hora',
  cantPerWorker: 0,
  hours: 0,
  workersAssigned: [],
});

export const createSubcontractGroup = (): SubcontractGroup => ({
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

export const createForemanResource = (): ForemanResource => ({
  id: crypto.randomUUID(),
  name: '',
  role: 'encargado',
  hours: 0,
});

export const parseNumeric = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const extractServiceQuantity = (description: string): number => {
  const normalized = description.trim();
  if (!normalized) return 1;

  const hoursMatch =
    normalized.match(/(?:horas?|h)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i) ||
    normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:horas?|h)\b/i);
  if (hoursMatch?.[1]) {
    const parsed = Number(hoursMatch[1].replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 1;
};

export const editableNumericValue = (value: number): string | number => {
  if (!Number.isFinite(value) || value === 0) return '';
  return value;
};

export const normalizeMaterialUnitFromScan = (rawUnit: string | null | undefined): string => {
  const normalized = (rawUnit || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'm2' || normalized === 'm²') return 'm2';
  if (normalized === 'm3' || normalized === 'm³') return 'm3';
  if (normalized === 'h' || normalized === 'hr' || normalized === 'hora' || normalized === 'horas') return 'h';
  if (normalized === 'ud' || normalized === 'uds' || normalized === 'un' || normalized === 'unidad') return 'ud';
  if (normalized === 'lt' || normalized === 'l') return 'l';
  if (normalized === 'ml') return 'ml';
  if (normalized === 'kg') return 'kg';
  return normalized;
};

export const normalizeServiceUnitFromScan = (
  rawUnit: string | null | undefined,
): 'h' | 'viaje' | 't' | 'm3' | null => {
  const normalized = sanitizeText(rawUnit).toLowerCase();
  if (!normalized) return null;
  if (normalized === 'h' || normalized === 'hr' || normalized === 'hrs' || normalized === 'hora' || normalized === 'horas') {
    return 'h';
  }
  if (normalized === 'viaje' || normalized === 'viajes') {
    return 'viaje';
  }
  if (normalized === 't' || normalized === 'tn' || normalized === 'ton' || normalized === 'tonelada' || normalized === 'toneladas') {
    return 't';
  }
  if (normalized === 'm3' || normalized === 'm³') {
    return 'm3';
  }
  return null;
};

export const isMaterialRowBlank = (row: MaterialRow): boolean => {
  return (
    !row.name.trim() &&
    nonNegative(row.quantity) === 0 &&
    !row.unit.trim() &&
    nonNegative(row.unitPrice) === 0 &&
    nonNegative(row.total) === 0
  );
};

export const hasNoPriceColumnsWarning = (parsed: ParsedAlbaranResult): boolean => {
  if (parsed.warnings.includes('NO_PRICE_COLUMNS')) return true;
  return (parsed.fieldWarnings?.table || []).includes('NO_PRICE_COLUMNS');
};

export const extractNoPriceDescription = (parsed: ParsedAlbaranResult): string => {
  const rowDescription = parsed.items
    .map((item) => item.material.trim())
    .find((material) => material.length > 0);
  if (rowDescription) return rowDescription;
  return (parsed.serviceDescription || '').trim();
};

export const resolveScanImageUris = (group: MaterialGroup, parsed: ParsedAlbaranResult): string[] => {
  const parsedUris = (parsed.imageUris || []).filter((uri) => typeof uri === 'string' && uri.trim().length > 0);
  if (parsedUris.length > 0) return Array.from(new Set(parsedUris));
  return Array.isArray(group.imageUris) ? group.imageUris : [];
};

export const createParsedAlbaranReviewItem = (): ParsedAlbaranItem => ({
  material: '',
  quantity: null,
  unit: null,
  unitPrice: null,
  costDoc: null,
  costCalc: null,
  difference: null,
  rowText: '',
  missingCritical: true,
});

export const normalizeDeliveryNoteKeyPart = (value: string | null | undefined): string => {
  return (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(s\.?\s*l\.?\s*u?\.?|s\.?\s*a\.?)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const buildDeliveryNoteKey = (
  supplier: string | null | undefined,
  invoiceNumber: string | null | undefined,
): string | null => {
  const normalizedSupplier = normalizeDeliveryNoteKeyPart(supplier);
  const normalizedInvoice = normalizeDeliveryNoteKeyPart(invoiceNumber);
  if (!normalizedSupplier || !normalizedInvoice) return null;
  return `${normalizedSupplier}::${normalizedInvoice}`;
};

export const hasMaterialGroupSignificantData = (group: MaterialGroup): boolean => {
  if (group.isScanned) return true;
  if (sanitizeText(group.supplier) || sanitizeText(group.invoiceNumber)) return true;
  if ((group.serviceLines || []).some((line) => {
    const hasDescription = sanitizeText(line.description).length > 0;
    const hasValues =
      nonNegative(line.hours ?? 0) > 0 ||
      nonNegative(line.trips ?? 0) > 0 ||
      nonNegative(line.tons ?? 0) > 0 ||
      nonNegative(line.m3 ?? 0) > 0;
    return hasDescription || hasValues;
  })) return true;
  return group.rows.some((row) => !isMaterialRowBlank(row));
};

export const mapSubcontractUnitToReportUnit = (
  unit: SubcontractUnit,
): 'hora' | 'm3' | 'm2' | 'ml' | 'unidad' => {
  if (unit === 'hora') return 'hora';
  if (unit === 'm3') return 'm3';
  if (unit === 'm2') return 'm2';
  if (unit === 'ml') return 'ml';
  return 'unidad';
};

export const mapForemanRoleForReport = (
  role: string,
): 'encargado' | 'capataz' | 'recurso_preventivo' => {
  const normalized = role.trim().toLowerCase();
  if (normalized === 'capataz') return 'capataz';
  if (normalized === 'preventivo' || normalized === 'recurso_preventivo') return 'recurso_preventivo';
  return 'encargado';
};

export const normalizeSubcontractedMachineryGroups = (
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

export const normalizeMaterialGroups = (groups: MaterialGroup[] | undefined): MaterialGroup[] => {
  if (!groups?.length) {
    return [createMaterialGroup()];
  }
  return groups.map((group) => {
    const normalizedImageUris = Array.isArray(group.imageUris)
      ? group.imageUris.filter((uri) => typeof uri === 'string' && uri.trim().length > 0)
      : [];
    const normalizedRows =
      group.rows?.length > 0
        ? group.rows.map((row) => {
            const quantity = Number.isFinite(row.quantity) ? row.quantity : 0;
            const unitPrice = Number.isFinite(row.unitPrice) ? row.unitPrice : 0;
            const total = Number.isFinite(row.total) ? row.total : quantity * unitPrice;
            const costDocValue =
              typeof row.costDocValue === 'number' && Number.isFinite(row.costDocValue) ? row.costDocValue : null;
            const costWarningDelta =
              typeof row.costWarningDelta === 'number' && Number.isFinite(row.costWarningDelta)
                ? row.costWarningDelta
                : null;
            return {
              id: row.id || crypto.randomUUID(),
              name: row.name ?? '',
              quantity,
              unit: row.unit ?? '',
              unitPrice,
              total,
              costDocValue,
              costWarningDelta,
            };
          })
        : [createMaterialRow()];
    const normalizedServiceLines =
      group.serviceLines?.length > 0
        ? group.serviceLines.map((line) => ({
            id: line.id || crypto.randomUUID(),
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
        : [];
    const docType: ParsedDocType | null = group.docType == null ? null : normalizeDocType(group.docType);
    return {
      id: group.id || crypto.randomUUID(),
      supplier: sanitizeText(group.supplier),
      invoiceNumber: sanitizeText(group.invoiceNumber),
      docType,
      isScanned: Boolean(group.isScanned),
      imageUris: normalizedImageUris,
      rows: normalizedRows,
      serviceLines: normalizedServiceLines,
    };
  });
};

export const migrateLegacySubcontractedMachineryRows = (
  rows: EditableRow[] | undefined,
): SubcontractedMachineryGroup[] => {
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

export const migrateLegacyMaterialRows = (rows: EditableRow[] | undefined): MaterialGroup[] => {
  if (!rows?.length) {
    return [createMaterialGroup()];
  }
  return [
    {
      id: crypto.randomUUID(),
      supplier: '',
      invoiceNumber: '',
      docType: null,
      isScanned: false,
      serviceLines: [],
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

export const normalizeSubcontractGroups = (groups: SubcontractGroup[] | undefined): SubcontractGroup[] => {
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

export const migrateLegacySubcontractRows = (rows: EditableRow[] | undefined): SubcontractGroup[] => {
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

export const mapSubcontractGroupsToLegacyRows = (groups: SubcontractGroup[]): EditableRow[] => {
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

export const mapRentalMachinesToLegacyRows = (machines: RentalMachine[]): EditableRow[] => {
  if (machines.length === 0) return [createRow()];

  return machines.map((machine) => ({
    id: machine.id,
    name: machine.name,
    detail: machine.provider || machine.description || '',
    value: typeof machine.price === 'number' ? machine.price : 0,
    unit: machine.priceUnit,
  }));
};
