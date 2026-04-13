import {
  type ParsedAlbaranItem,
  type ParsedAlbaranResult,
} from '@/plugins/albaranScanner';
import type { MaterialRow, ServiceLine } from '@/components/work-report/types';
import {
  COST_DIFF_THRESHOLD,
  createMaterialRow,
  createParsedAlbaranReviewItem,
  createServiceLine,
  extractNoPriceDescription,
  nonNegative,
  normalizeMaterialUnitFromScan,
  normalizeServiceUnitFromScan,
  sanitizeText,
} from '@/components/work-report/helpers';

export const SERVICE_SCAN_SUBTYPES = new Set<
  NonNullable<ParsedAlbaranResult['docSubtype']>
>([
  'BOMBEOS_GILGIL_ALBARAN_BOMBA',
  'RECICLESAN_ALBARAN_JORNADA_MAQUINA',
  'CONSTRUCCIONES_PARTE_TRABAJO',
]);

export function buildMaterialRowFromParsedItem(item: ParsedAlbaranItem): MaterialRow {
  const quantity =
    typeof item.quantity === 'number' && Number.isFinite(item.quantity)
      ? nonNegative(item.quantity)
      : 0;
  const unitPrice =
    typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice)
      ? nonNegative(item.unitPrice)
      : 0;
  const costCalc = quantity * unitPrice;
  const costDoc =
    typeof item.costDoc === 'number' && Number.isFinite(item.costDoc)
      ? nonNegative(item.costDoc)
      : null;
  const difference =
    costDoc !== null ? Math.abs(costDoc - costCalc) : null;

  return {
    ...createMaterialRow(),
    name: sanitizeText(item.material),
    quantity,
    unit: normalizeMaterialUnitFromScan(item.unit),
    unitPrice,
    total: costDoc ?? costCalc,
    costDocValue: costDoc,
    costWarningDelta:
      difference !== null && difference > COST_DIFF_THRESHOLD
        ? difference
        : null,
  };
}

export function buildServiceLinesFromParsedResult(parsed: ParsedAlbaranResult): ServiceLine[] {
  const grouped = new Map<string, ServiceLine>();

  parsed.items.forEach((item, index) => {
    const description = sanitizeText(item.material);
    const quantity =
      typeof item.quantity === 'number' && Number.isFinite(item.quantity)
        ? nonNegative(item.quantity)
        : null;
    const hintedText = sanitizeText(
      `${item.unit ?? ''} ${item.rowText ?? ''} ${description}`,
    ).toLowerCase();
    let unit = normalizeServiceUnitFromScan(item.unit);

    if (!unit) {
      if (hintedText.includes('hora') || /\bh\b/.test(hintedText)) {
        unit = 'h';
      } else if (hintedText.includes('viaj')) {
        unit = 'viaje';
      } else if (
        hintedText.includes('tonel') ||
        /\btn\b/.test(hintedText) ||
        /\bt\b/.test(hintedText)
      ) {
        unit = 't';
      } else if (hintedText.includes('m3') || hintedText.includes('m³')) {
        unit = 'm3';
      }
    }

    if (!description && quantity === null && !unit) return;

    const key = description ? description.toLowerCase() : `__empty_${index}`;
    const current = grouped.get(key) ?? {
      ...createServiceLine(),
      description,
    };

    if (quantity !== null && unit) {
      if (unit === 'h') current.hours = nonNegative(current.hours ?? 0) + quantity;
      if (unit === 'viaje') {
        current.trips = nonNegative(current.trips ?? 0) + quantity;
      }
      if (unit === 't') current.tons = nonNegative(current.tons ?? 0) + quantity;
      if (unit === 'm3') current.m3 = nonNegative(current.m3 ?? 0) + quantity;
    }

    grouped.set(key, current);
  });

  const lines = Array.from(grouped.values()).filter((line) => {
    const hasDescription = sanitizeText(line.description).length > 0;
    const hasValues =
      nonNegative(line.hours ?? 0) > 0 ||
      nonNegative(line.trips ?? 0) > 0 ||
      nonNegative(line.tons ?? 0) > 0 ||
      nonNegative(line.m3 ?? 0) > 0;
    return hasDescription || hasValues;
  });

  if (lines.length > 0) return lines;

  const fallbackDescription = sanitizeText(parsed.serviceDescription);
  if (!fallbackDescription) return [];

  return [
    {
      ...createServiceLine(),
      description: fallbackDescription,
    },
  ];
}

export function buildParsedItemsFromServiceLines(lines: ServiceLine[]): ParsedAlbaranItem[] {
  const items: ParsedAlbaranItem[] = [];

  lines.forEach((line) => {
    const description = sanitizeText(line.description);
    const quantities: Array<{
      unit: 'h' | 'viaje' | 't' | 'm3';
      value: number | null | undefined;
    }> = [
      { unit: 'h', value: line.hours },
      { unit: 'viaje', value: line.trips },
      { unit: 't', value: line.tons },
      { unit: 'm3', value: line.m3 },
    ];

    let hasMetric = false;
    quantities.forEach(({ unit, value }) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return;
      }
      hasMetric = true;
      items.push({
        ...createParsedAlbaranReviewItem(),
        material: description,
        quantity: nonNegative(value),
        unit,
        unitPrice: null,
        costDoc: null,
        costCalc: null,
        difference: null,
        rowText: 'SERVICE_LINE',
        missingCritical: false,
      });
    });

    if (!hasMetric && description) {
      items.push({
        ...createParsedAlbaranReviewItem(),
        material: description,
        quantity: null,
        unit: null,
        unitPrice: null,
        costDoc: null,
        costCalc: null,
        difference: null,
        rowText: 'SERVICE_LINE',
        missingCritical: false,
      });
    }
  });

  return items;
}

export function isServiceLikeParsedResult(parsed: ParsedAlbaranResult): boolean {
  if (parsed.docType === 'SERVICE_MACHINERY') return true;
  if (parsed.docSubtype && SERVICE_SCAN_SUBTYPES.has(parsed.docSubtype)) {
    return true;
  }

  const warningSet = new Set(parsed.warnings || []);
  if (
    warningSet.has('SERVICE_LAYOUT_HEADER') ||
    warningSet.has('SERVICE_MARKERS_DETECTED') ||
    warningSet.has('SERVICE_TABLE_DETECTED')
  ) {
    return true;
  }

  const hasServiceUnit = parsed.items.some((item) => {
    const normalized = normalizeServiceUnitFromScan(item.unit);
    return (
      normalized === 'h' ||
      normalized === 'viaje' ||
      normalized === 't' ||
      normalized === 'm3'
    );
  });
  if (hasServiceUnit) return true;

  const hasServiceDescription = sanitizeText(parsed.serviceDescription).length > 0;
  if (
    hasServiceDescription &&
    (warningSet.has('NO_PRICE_COLUMNS') ||
      warningSet.has('NO_ECONOMIC_COLUMNS'))
  ) {
    return true;
  }

  return false;
}

export function buildOthersRowFromParsedResult(parsed: ParsedAlbaranResult): MaterialRow {
  const description = extractNoPriceDescription(parsed);
  const materialName = description ? `OTROS - ${description}` : 'OTROS';

  return {
    ...createMaterialRow(),
    name: materialName,
    quantity: 1,
    unit: 'ud',
    unitPrice: 0,
    total: 0,
    costDocValue: null,
    costWarningDelta: null,
  };
}
