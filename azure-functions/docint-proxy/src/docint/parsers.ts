import type {
  AlbaranDocType,
  AlbaranDocSubtype,
  DocIntAnalyzeResponse,
  FieldValue,
  ProcessFieldMeta,
  ParsedDocIntOutput,
  ProcessedItem,
  ProcessedTotals,
} from '../schema';

type AnyRecord = Record<string, unknown>;

type ParseCandidate = {
  supplier: FieldValue<string>;
  invoiceNumber: FieldValue<string>;
  documentDate: FieldValue<string>;
  items: ProcessedItem[];
  totals: ProcessedTotals;
  warnings: Set<string>;
  content: string;
  model: string;
};

type TableEvidenceResult = {
  strongTable: boolean;
  evidenceScore: number;
  reasons: string[];
  headerHits: number;
  dataRows: number;
  economicRows: number;
};

type DocSubtypeContext = {
  docType: AlbaranDocType;
  materialHeaderHits: number;
  serviceHits: number;
  serviceStrongHits: number;
  tableEvidence: TableEvidenceResult;
  rowsWithQty: number;
  rowsWithEconomic: number;
};

type SubtypeRule = {
  subtype: AlbaranDocSubtype;
  threshold: number;
  signals: Array<{ term: string; weight: number }>;
  requiredAny?: string[];
};

type DocSubtypeDecision = {
  subtype: AlbaranDocSubtype | null;
  confidence: number;
  topScore: number;
  secondScore: number;
  ambiguous: boolean;
  matchedSignals: string[];
  ranked: Array<{
    subtype: AlbaranDocSubtype;
    score: number;
    isValid: boolean;
    matchedSignals: string[];
    contextNotes: string[];
  }>;
};

const SERVICE_MARKERS = [
  'HORAS TRABAJO',
  'HORAS TOTAL TRABAJADAS DE BOMBA',
  'DESGLOSE JORNADA',
  'BOMBA',
  'METROS BOMBEADOS',
  'MAQUINA',
  'OPERADOR',
  'MATRICULA',
  'VIAJES',
  'TONELADAS',
  'PARTE DE TRABAJO',
];

const SERVICE_STRONG_MARKERS = [
  'DESGLOSE JORNADA',
  'DESCRIPCION DEL TRABAJO',
  'HORAS TRABAJO',
  'METROS BOMBEADOS',
  'DESPLAZAMIENTO BOMBA',
  'SERVICIO MINIMO BOMBA',
  'PARTE DE TRABAJO',
  'BOMBA',
  'MATRICULA',
  'OPERADOR',
];

const SERVICE_LAYOUT_TERMS = [
  'DESCRIPCION DEL TRABAJO',
  'HORAS TRABAJO',
  'VIAJES',
  'TONELADAS',
  'M3',
];

const SUPPLIER_STOPWORDS = [
  'FECHA',
  'ALBARAN',
  'PARTE DE TRABAJO',
  'TOTAL',
  'OBSERVACIONES',
  'CLIENTE',
  'OBRA',
  'CIF',
  'NIF',
  'DNI',
  'TEL',
  'TELEFONO',
  'FAX',
];
const SUPPLIER_COMPANY_MARKERS = ['SL', 'S.L', 'SA', 'S.A', 'SLU', 'S.L.U', 'SCOOP', 'C.B'];
const ADDRESS_OR_CONTACT_MARKERS = [
  'C/',
  'CALLE',
  'AVENIDA',
  'TRAVESIA',
  'POL',
  'POLIGONO',
  'TEL',
  'TELEFONO',
  'FAX',
  'MOVIL',
  'MÓVIL',
  'EMAIL',
  'WWW',
  '@',
];
const MONTHS_ES: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

const DESC_HEADERS = ['DESCRIPCION', 'CONCEPTO', 'MATERIAL', 'ARTICULO', 'PRODUCTO'];
const QTY_HEADERS = ['CANTIDAD', 'CANT', 'QTY', 'UNIDADES'];
const UNIT_HEADERS = ['UNIDAD', 'UD', 'UDS', 'UN', 'ML', 'M2', 'M3', 'KG', 'L', 'H'];
const PRICE_HEADERS = ['PRECIO', 'PRECIO/UD', 'P.U', 'UNIT PRICE'];
const AMOUNT_HEADERS = ['IMPORTE', 'TOTAL', 'COSTE', 'IMPORTE LINEA'];
const MATERIAL_HEADER_TERMS = [...DESC_HEADERS, ...QTY_HEADERS, ...PRICE_HEADERS, ...AMOUNT_HEADERS];

const DOC_SUBTYPE_RULES: SubtypeRule[] = [
  {
    subtype: 'BOMBEOS_GILGIL_ALBARAN_BOMBA',
    threshold: 4.8,
    signals: [
      { term: 'BOMBEOS', weight: 2.4 },
      { term: 'GIL GIL', weight: 3.4 },
      { term: 'HORAS TOTAL TRABAJADAS DE BOMBA', weight: 1.9 },
      { term: 'METROS BOMBEADOS', weight: 1.8 },
      { term: 'DESPLAZAMIENTO BOMBA', weight: 1.8 },
      { term: 'SERVICIO MINIMO BOMBA', weight: 1.8 },
      { term: 'BOMBA', weight: 0.8 },
    ],
    requiredAny: ['GIL GIL', 'BOMBEOS'],
  },
  {
    subtype: 'RECICLESAN_ALBARAN_JORNADA_MAQUINA',
    threshold: 4.5,
    signals: [
      { term: 'RECICLESAN', weight: 3.5 },
      { term: 'DESGLOSE JORNADA', weight: 2.2 },
      { term: 'DESCRIPCION DEL TRABAJO', weight: 1.6 },
      { term: 'HORAS TRABAJO', weight: 1.6 },
      { term: 'VIAJES', weight: 1.0 },
      { term: 'TONELADAS', weight: 1.0 },
      { term: 'M3', weight: 0.8 },
      { term: 'OPERADOR', weight: 0.8 },
    ],
    requiredAny: ['RECICLESAN', 'DESGLOSE JORNADA'],
  },
  {
    subtype: 'MONTALBAN_RODRIGUEZ_ALBARAN_MATERIALES',
    threshold: 4.8,
    signals: [
      { term: 'MONTALBAN', weight: 2.3 },
      { term: 'RODRIGUEZ', weight: 2.1 },
      { term: 'DATOS FISCALES', weight: 1.4 },
      { term: 'DATOS DE ENVIO', weight: 1.2 },
      { term: 'ARTICULO', weight: 1.0 },
      { term: 'DESCRIPCION', weight: 1.0 },
      { term: 'CANTIDAD', weight: 0.9 },
      { term: 'IMPORTE', weight: 0.9 },
      { term: 'BASE IMPONIBLE', weight: 0.8 },
    ],
    requiredAny: ['MONTALBAN', 'RODRIGUEZ'],
  },
  {
    subtype: 'CONSTRUCCIONES_PARTE_TRABAJO',
    threshold: 4.4,
    signals: [
      { term: 'PARTE DE TRABAJO', weight: 2.2 },
      { term: 'CONSTRUCCIONES', weight: 1.6 },
      { term: 'CANTIDAD', weight: 1.0 },
      { term: 'CONCEPTO', weight: 1.0 },
      { term: 'OBSERVACIONES', weight: 0.8 },
      { term: 'TOWWERS', weight: 2.2 },
      { term: 'CLIENTE', weight: 0.4 },
    ],
    requiredAny: ['PARTE DE TRABAJO'],
  },
];

const SERVICE_DOC_SUBTYPES = new Set<AlbaranDocSubtype>([
  'BOMBEOS_GILGIL_ALBARAN_BOMBA',
  'RECICLESAN_ALBARAN_JORNADA_MAQUINA',
  'CONSTRUCCIONES_PARTE_TRABAJO',
]);

const MATERIAL_DOC_SUBTYPES = new Set<AlbaranDocSubtype>([
  'MONTALBAN_RODRIGUEZ_ALBARAN_MATERIALES',
]);

export const parsePrimaryInvoice = (payload: DocIntAnalyzeResponse): ParsedDocIntOutput => {
  const analyze = asRecord(payload.analyzeResult);
  const documents = asArray(analyze?.documents);
  const content = asString(analyze?.content) || '';

  const candidate: ParseCandidate = {
    supplier: emptyField(),
    invoiceNumber: emptyField(),
    documentDate: emptyField(),
    items: [],
    totals: { subtotal: null, tax: null, total: null },
    warnings: new Set<string>(),
    content,
    model: 'prebuilt-invoice',
  };

  const firstDocument = asRecord(documents[0]);
  const fields = asRecord(firstDocument?.fields);

  candidate.supplier = pickField(fields, [
    'VendorName',
    'SupplierName',
    'SellerName',
    'MerchantName',
  ]);
  candidate.invoiceNumber = pickField(fields, [
    'InvoiceId',
    'InvoiceNumber',
    'DocumentNumber',
    'ReceiptNumber',
  ]);
  candidate.documentDate = toDateField(
    pickField(fields, ['InvoiceDate', 'Date', 'DocumentDate']).value,
    pickField(fields, ['InvoiceDate', 'Date', 'DocumentDate']).confidence,
  );

  candidate.items = parseInvoiceItems(fields);
  candidate.totals = {
    subtotal: pickFieldAsNumber(fields, ['SubTotal', 'Subtotal']),
    tax: pickFieldAsNumber(fields, ['TotalTax', 'Tax', 'TaxTotal']),
    total: pickFieldAsNumber(fields, ['InvoiceTotal', 'TotalAmount', 'Total']),
  };

  return finalizeCandidate(candidate);
};

export const parseLayoutOrRead = (
  payload: DocIntAnalyzeResponse,
  modelId: string = 'prebuilt-layout',
): ParsedDocIntOutput => {
  const analyze = asRecord(payload.analyzeResult);
  const content = asString(analyze?.content) || '';
  const tables = collectTables(analyze);
  const keyValuePairs = asArray(analyze?.keyValuePairs);
  const normalizedModelId = modelId.trim().toLowerCase();
  const resolvedModel =
    normalizedModelId.includes('read')
      ? 'prebuilt-read'
      : normalizedModelId.includes('layout')
        ? 'prebuilt-layout'
        : normalizedModelId || 'prebuilt-layout';

  const candidate: ParseCandidate = {
    supplier: extractSupplierFromLayout(content),
    invoiceNumber: extractInvoiceFromLayout(content),
    documentDate: extractDateFromLayout(content),
    items: parseLayoutItems(tables),
    totals: {
      subtotal: null,
      tax: null,
      total: null,
    },
    warnings: new Set<string>(),
    content,
    model: resolvedModel,
  };

  if (!candidate.supplier.value) {
    candidate.supplier = extractSupplierFromKeyValues(keyValuePairs) || candidate.supplier;
  }
  if (!candidate.invoiceNumber.value) {
    candidate.invoiceNumber = extractInvoiceFromKeyValues(keyValuePairs) || candidate.invoiceNumber;
  }
  if (!candidate.documentDate.value) {
    candidate.documentDate = extractDateFromKeyValues(keyValuePairs) || candidate.documentDate;
  }

  return finalizeCandidate(candidate);
};

export const parseFallbackLayout = (payload: DocIntAnalyzeResponse): ParsedDocIntOutput =>
  parseLayoutOrRead(payload, 'prebuilt-layout');

export const shouldUseFallbackModel = (primary: ParsedDocIntOutput): boolean => {
  const keyScore =
    Number(Boolean(primary.supplier.value)) +
    Number(Boolean(primary.invoiceNumber.value)) +
    Number(Boolean(primary.documentDate.value));

  if (primary.warnings.includes('MATERIAL_HEADERS_DETECTED_NO_ITEMS')) return true;
  if (primary.docType === 'MATERIALS_TABLE' && primary.items.length <= 1 && primary.warnings.includes('SERVICE_LAYOUT_HEADER')) {
    return true;
  }
  if (primary.docType === 'UNKNOWN') return true;
  if (primary.docType === 'SERVICE_MACHINERY' && primary.items.length === 0 && keyScore <= 1) {
    return true;
  }
  return false;
};

const finalizeCandidate = (candidate: ParseCandidate): ParsedDocIntOutput => {
  const warnings = new Set<string>(candidate.warnings);
  const normalizedContent = normalize(candidate.content);
  const serviceHits = SERVICE_MARKERS.filter((marker) =>
    normalizedContent.includes(normalize(marker)),
  ).length;
  const serviceStrongHits = SERVICE_STRONG_MARKERS.filter((marker) =>
    normalizedContent.includes(normalize(marker)),
  ).length;
  const materialHeaderHits = MATERIAL_HEADER_TERMS.filter((term) =>
    normalizedContent.includes(normalize(term)),
  ).length;

  const rowsWithQty = candidate.items.filter((item) => item.quantity !== null).length;
  const rowsWithEconomic = candidate.items.filter(
    (item) => item.quantity !== null && (item.unitPrice !== null || item.lineTotal !== null),
  ).length;

  const hasStrongServiceEvidence = serviceStrongHits >= 2 || (serviceStrongHits >= 1 && serviceHits >= 2);
  const tableEvidence = evaluateTableEvidence({
    materialHeaderHits,
    dataRows: rowsWithQty,
    economicRows: rowsWithEconomic,
  });
  const serviceLayoutHeaderDetected = candidate.items.length > 0 && hasStrongServiceEvidence && materialHeaderHits < 4;

  let docType: AlbaranDocType = 'UNKNOWN';
  let items = [...candidate.items];

  if (serviceLayoutHeaderDetected) {
    docType = 'SERVICE_MACHINERY';
    warnings.add('SERVICE_LAYOUT_HEADER');
  } else if (tableEvidence.strongTable) {
    docType = 'MATERIALS_TABLE';
  } else if (hasStrongServiceEvidence || (serviceHits >= 3 && materialHeaderHits < 4)) {
    docType = 'SERVICE_MACHINERY';
  } else {
    docType = 'UNKNOWN';
    items = [];
  }

  if (!tableEvidence.strongTable) {
    warnings.add('NO_TABLE_STRONG');
    tableEvidence.reasons.forEach((reason) => warnings.add(reason));
    if (docType !== 'SERVICE_MACHINERY') {
      items = [];
    }
  }

  if (items.length === 0 && materialHeaderHits >= 4) {
    warnings.add('MATERIAL_HEADERS_DETECTED_NO_ITEMS');
  }

  const hasPriceData = items.some((item) => item.unitPrice !== null || item.lineTotal !== null);
  if (docType === 'MATERIALS_TABLE' && !hasPriceData) {
    items = [];
    warnings.add('NO_PRICE_COLUMNS');
  }

  if (!candidate.supplier.value || isBadSupplier(candidate.supplier.value)) {
    warnings.add('AMBIGUOUS_PROVIDER');
    candidate.supplier = {
      value: null,
      confidence: candidate.supplier.confidence * 0.4,
    };
  }

  if (!candidate.invoiceNumber.value || !isLikelyInvoiceCandidate(candidate.invoiceNumber.value)) {
    warnings.add('MISSING_INVOICE_NUMBER');
    candidate.invoiceNumber = {
      value: null,
      confidence: candidate.invoiceNumber.confidence * 0.4,
    };
  }

  if (!candidate.documentDate.value) {
    warnings.add('MISSING_DATE');
  }

  const subtypeDecision = detectDocSubtype(candidate.content, {
    docType,
    materialHeaderHits,
    serviceHits,
    serviceStrongHits,
    tableEvidence,
    rowsWithQty,
    rowsWithEconomic,
  });
  if (subtypeDecision.ambiguous) {
    warnings.add('AMBIGUOUS_DOC_SUBTYPE');
  }
  const docSubtype = subtypeDecision.subtype;
  const templateData = buildTemplateData(docSubtype, candidate, tableEvidence, items, subtypeDecision);
  const fieldMeta = buildFieldMeta(candidate, tableEvidence);

  return {
    docType,
    docSubtype,
    supplier: candidate.supplier,
    invoiceNumber: candidate.invoiceNumber,
    documentDate: candidate.documentDate,
    items,
    totals: candidate.totals,
    warnings: [...warnings],
    fieldMeta,
    templateData,
  };
};

const evaluateTableEvidence = (params: {
  materialHeaderHits: number;
  dataRows: number;
  economicRows: number;
}): TableEvidenceResult => {
  const reasons = new Set<string>();
  let evidenceScore = 0;

  if (params.materialHeaderHits >= 4) {
    evidenceScore += 35;
  } else if (params.materialHeaderHits >= 2) {
    evidenceScore += 20;
    reasons.add('WEAK_TABLE_HEADERS');
  } else {
    reasons.add('NO_HEADER');
  }

  if (params.dataRows >= 2) {
    evidenceScore += 35;
  } else if (params.dataRows === 1) {
    evidenceScore += 12;
    reasons.add('ONLY_ONE_DATA_ROW');
  } else {
    reasons.add('NO_DATA_ROWS');
  }

  if (params.economicRows >= 2) {
    evidenceScore += 30;
  } else if (params.economicRows === 1) {
    evidenceScore += 15;
    reasons.add('WEAK_ECONOMIC_EVIDENCE');
  } else {
    reasons.add('NO_ECONOMIC_COLUMNS');
  }

  const strongTable =
    params.materialHeaderHits >= 4 &&
    params.dataRows >= 2 &&
    params.economicRows >= 1;

  if (!strongTable && params.dataRows > 0 && params.economicRows === 0) {
    reasons.add('NO_PRICE_COLUMNS');
  }

  return {
    strongTable,
    evidenceScore: Math.max(0, Math.min(100, evidenceScore)),
    reasons: [...reasons],
    headerHits: params.materialHeaderHits,
    dataRows: params.dataRows,
    economicRows: params.economicRows,
  };
};

const detectDocSubtype = (content: string, context: DocSubtypeContext): DocSubtypeDecision => {
  const normalized = normalize(content);
  if (!normalized) {
    return {
      subtype: null,
      confidence: 0,
      topScore: 0,
      secondScore: 0,
      ambiguous: false,
      matchedSignals: [],
      ranked: [],
    };
  }

  const scored = DOC_SUBTYPE_RULES.map((rule) => {
    let score = 0;
    const matchedSignals: string[] = [];
    const contextNotes: string[] = [];

    for (const signal of rule.signals) {
      if (normalized.includes(normalize(signal.term))) {
        score += signal.weight;
        matchedSignals.push(signal.term);
      }
    }

    const requiredMatched =
      !rule.requiredAny ||
      rule.requiredAny.some((required) => normalized.includes(normalize(required)));
    if (!requiredMatched) {
      score *= 0.25;
      contextNotes.push('REQUIRED_SIGNAL_MISSING');
    } else if (rule.requiredAny && rule.requiredAny.length > 0) {
      score += 0.5;
      contextNotes.push('REQUIRED_SIGNAL_MATCHED');
    }

    const isServiceSubtype = SERVICE_DOC_SUBTYPES.has(rule.subtype);
    const isMaterialSubtype = MATERIAL_DOC_SUBTYPES.has(rule.subtype);

    if (isServiceSubtype) {
      if (context.docType === 'MATERIALS_TABLE') {
        score -= 1.6;
        contextNotes.push('DOC_TYPE_MISMATCH_MATERIALS');
      } else {
        score += 0.2;
        contextNotes.push('DOC_TYPE_SERVICE_COMPATIBLE');
      }
      if (context.serviceStrongHits >= 2) {
        score += 0.8;
        contextNotes.push('SERVICE_STRONG_MARKERS');
      } else if (context.serviceHits >= 3) {
        score += 0.35;
        contextNotes.push('SERVICE_MARKER_DENSITY');
      }
      if (context.tableEvidence.strongTable && context.rowsWithEconomic >= 2) {
        score -= 1.2;
        contextNotes.push('STRONG_ECONOMIC_TABLE_CONFLICT');
      }
    }

    if (isMaterialSubtype) {
      if (context.docType === 'MATERIALS_TABLE') {
        score += 0.95;
        contextNotes.push('DOC_TYPE_MATERIALS_BOOST');
      } else {
        score -= 2.1;
        contextNotes.push('DOC_TYPE_NOT_MATERIALS');
      }
      if (context.tableEvidence.strongTable) {
        score += 1.1;
        contextNotes.push('STRONG_TABLE_BOOST');
      } else {
        score -= 1.0;
        contextNotes.push('NO_STRONG_TABLE_PENALTY');
      }
      if (context.rowsWithEconomic <= 0) {
        score -= 1.2;
        contextNotes.push('NO_ECONOMIC_ROWS');
      }
      if (context.materialHeaderHits >= 4) {
        score += 0.35;
        contextNotes.push('MATERIAL_HEADERS_PRESENT');
      }
    }

    if (rule.subtype === 'CONSTRUCCIONES_PARTE_TRABAJO') {
      if (context.docType === 'UNKNOWN') {
        score += 0.45;
        contextNotes.push('UNKNOWN_DOCTYPE_COMPATIBLE');
      }
      if (context.tableEvidence.strongTable && context.rowsWithEconomic >= 2) {
        score -= 0.75;
        contextNotes.push('ECONOMIC_TABLE_NOT_EXPECTED');
      }
    }

    score = Math.max(0, score);

    return {
      rule,
      score,
      matchedSignals,
      contextNotes,
      isValid: score >= rule.threshold,
    };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  const topScore = top?.score ?? 0;
  const secondScore = second?.score ?? 0;
  let topIsValid = Boolean(top?.isValid);
  const secondIsValid = Boolean(second?.isValid);
  let ambiguous = topIsValid && secondIsValid && topScore - secondScore < 1.6;

  if (top && MATERIAL_DOC_SUBTYPES.has(top.rule.subtype)) {
    if (context.docType !== 'MATERIALS_TABLE' || !context.tableEvidence.strongTable) {
      topIsValid = false;
    }
  }

  if (top && SERVICE_DOC_SUBTYPES.has(top.rule.subtype)) {
    if (context.docType === 'MATERIALS_TABLE' && context.tableEvidence.strongTable && context.rowsWithEconomic >= 2) {
      topIsValid = false;
    }
  }

  if (!topIsValid) {
    ambiguous = false;
  }

  if (!topIsValid || ambiguous) {
    return {
      subtype: null,
      confidence: topIsValid ? clampConfidence(0.45) : 0,
      topScore,
      secondScore,
      ambiguous,
      matchedSignals: top?.matchedSignals ?? [],
      ranked: scored.slice(0, 4).map((entry) => ({
        subtype: entry.rule.subtype,
        score: Number(entry.score.toFixed(3)),
        isValid: entry.isValid,
        matchedSignals: entry.matchedSignals,
        contextNotes: entry.contextNotes,
      })),
    };
  }

  const confidence = clampConfidence(Math.min(0.95, 0.55 + topScore / 12 + (topScore - secondScore) / 24));
  return {
    subtype: top.rule.subtype,
    confidence,
    topScore,
    secondScore,
    ambiguous: false,
    matchedSignals: top.matchedSignals,
    ranked: scored.slice(0, 4).map((entry) => ({
      subtype: entry.rule.subtype,
      score: Number(entry.score.toFixed(3)),
      isValid: entry.isValid,
      matchedSignals: entry.matchedSignals,
      contextNotes: entry.contextNotes,
    })),
  };
};

const buildTemplateData = (
  docSubtype: AlbaranDocSubtype | null,
  candidate: ParseCandidate,
  tableEvidence: TableEvidenceResult,
  items: ProcessedItem[],
  subtypeDecision: DocSubtypeDecision,
): Record<string, unknown> | null => {
  const lines = splitNonEmptyLines(candidate.content);
  const base = {
    supplier: candidate.supplier.value,
    invoiceNumber: candidate.invoiceNumber.value,
    documentDate: candidate.documentDate.value,
    tableEvidence: {
      strongTable: tableEvidence.strongTable,
      evidenceScore: tableEvidence.evidenceScore,
      reasons: tableEvidence.reasons,
      headerHits: tableEvidence.headerHits,
      dataRows: tableEvidence.dataRows,
      economicRows: tableEvidence.economicRows,
    },
    docSubtypeDetection: {
      predicted: subtypeDecision.subtype,
      confidence: subtypeDecision.confidence,
      topScore: subtypeDecision.topScore,
      secondScore: subtypeDecision.secondScore,
      ambiguous: subtypeDecision.ambiguous,
      matchedSignals: subtypeDecision.matchedSignals,
      ranked: subtypeDecision.ranked,
    },
    itemsPreview: items.slice(0, 5),
  } satisfies Record<string, unknown>;

  if (!docSubtype) {
    return {
      ...base,
      template: 'GENERIC',
    };
  }

  if (docSubtype === 'BOMBEOS_GILGIL_ALBARAN_BOMBA') {
    const dateParts = splitIsoDate(candidate.documentDate.value);
    return {
      ...base,
      template: docSubtype,
      header: {
        claseDeTrabajo: extractLabelValueAny(lines, ['CLASE DE TRABAJO']),
        localizacion: extractLabelValueAny(lines, ['LOCALIZACION']),
        cliente: extractLabelValueAny(lines, ['CLIENTE']),
        domicilio: extractLabelValueAny(lines, ['DOMICILIO']),
        cifDni: extractLabelValueAny(lines, ['C.I.F. O D.N.I.', 'CIF', 'DNI']),
        localidad: extractLabelValueAny(lines, ['LOCALIDAD']),
        solicitadoPor: extractLabelValueAny(lines, ['SOLICITADO POR']),
        telefono: extractLabelValueAny(lines, ['TELEFONO']),
        albaranNumero:
          candidate.invoiceNumber.value ||
          extractLabelValueAny(lines, ['Nº', 'NUMERO', 'ALBARAN']),
        bombaId: extractLabelValueAny(lines, ['BOMBA']),
        matricula: extractLabelValueAny(lines, ['MATRICULA']),
      },
      body: {
        horasTotalTrabajadasBomba: extractLabelValueAny(lines, ['HORAS TOTAL TRABAJADAS DE BOMBA']),
        metrosBombeados: extractLabelValueAny(lines, ['METROS BOMBEADOS']),
        desplazamientoBomba: extractLabelValueAny(lines, ['DESPLAZAMIENTO BOMBA']),
        servicioMinimoBomba: extractLabelValueAny(lines, ['SERVICIO MINIMO BOMBA']),
        otros: extractLabelValueAny(lines, ['OTROS']),
        precioHoraEur: extractLabelValueAny(lines, ['PRECIO HORA EUROS', 'PRECIO HORA']),
        totalEuros: extractLabelValueAny(lines, ['TOTAL EUROS']),
        totalGeneral:
          candidate.totals.total ??
          parseDecimal(extractLabelValueAny(lines, ['TOTAL']) || ''),
      },
      footer: {
        lugarFirma: extractLabelValueAny(lines, ['MURCIA', 'LUGAR']),
        fechaDia: dateParts?.day ?? null,
        fechaMes: dateParts?.month ?? null,
        fechaAno: dateParts?.year ?? null,
        firmadoPor: extractLabelValueAny(lines, ['FIRMADO POR']),
        firmaConductorPresent: null,
        firmaClientePresent: null,
      },
    };
  }

  if (docSubtype === 'RECICLESAN_ALBARAN_JORNADA_MAQUINA') {
    const dateParts = splitIsoDate(candidate.documentDate.value);
    return {
      ...base,
      template: docSubtype,
      header: {
        empresa: extractLabelValueAny(lines, ['EMPRESA']),
        obra: extractLabelValueAny(lines, ['OBRA']),
        fecha: candidate.documentDate.value,
        fechaDia: dateParts?.day ?? null,
        fechaMes: dateParts?.month ?? null,
        fechaAno: dateParts?.year ?? null,
        albaranNumero:
          candidate.invoiceNumber.value || extractLabelValueAny(lines, ['ALBARAN', 'Nº', 'NUMERO']),
        maquina: extractLabelValueAny(lines, ['MAQUINA']),
        matricula: extractLabelValueAny(lines, ['MATRICULA']),
        operador: extractLabelValueAny(lines, ['OPERADOR']),
      },
      body: {
        horaDesde: extractLabelValueAny(lines, ['DE']),
        horaHasta: extractLabelValueAny(lines, ['A']),
        descripcionTrabajo: extractLabelValueAny(lines, ['DESCRIPCION DEL TRABAJO']),
        horasTrabajo: extractLabelValueAny(lines, ['HORAS TRABAJO']),
        viajes: extractLabelValueAny(lines, ['VIAJES']),
        toneladas: extractLabelValueAny(lines, ['TONELADAS']),
        m3: extractLabelValueAny(lines, ['M3']),
      },
      footer: {
        observaciones: extractLabelValueAny(lines, ['OBSERVACIONES']),
        totalesHorasTrabajo: candidate.totals.subtotal ?? null,
        totalesViajes: null,
        totalesToneladas: null,
        totalesM3: null,
        firmaOperadorPresent: null,
        firmaConformeObraPresent: null,
      },
    };
  }

  if (docSubtype === 'MONTALBAN_RODRIGUEZ_ALBARAN_MATERIALES') {
    return {
      ...base,
      template: docSubtype,
      datosFiscales: {
        razonSocial: candidate.supplier.value,
        direccion: extractLabelValueAny(lines, ['DIRECCION', 'CALLE', 'C/']),
        cp: extractLabelValueAny(lines, ['CP']),
        poblacion: extractLabelValueAny(lines, ['POBLACION']),
        provincia: extractLabelValueAny(lines, ['PROVINCIA']),
        telefono: extractLabelValueAny(lines, ['TEL', 'TELEFONO']),
        fax: extractLabelValueAny(lines, ['FAX']),
      },
      datosEnvio: {
        destinatario: extractLabelValueAny(lines, ['DATOS DE ENVIO', 'DESTINATARIO']),
        obra: extractLabelValueAny(lines, ['OBRA']),
        contacto: extractLabelValueAny(lines, ['CONTACTO']),
        telefonoContacto: extractLabelValueAny(lines, ['TELEFONO']),
      },
      header: {
        albaranNumero: candidate.invoiceNumber.value,
        fecha: candidate.documentDate.value,
        cif: extractLabelValueAny(lines, ['C.I.F', 'CIF']),
        clienteCodigo: extractLabelValueAny(lines, ['CLIENTE']),
        zona: extractLabelValueAny(lines, ['ZONA']),
        pagina: extractLabelValueAny(lines, ['PAGINA']),
      },
      lines: items.map((item) => ({
        articulo: item.reference,
        descripcion: item.description,
        cantidad: item.quantity,
        unidad: item.unit,
        precio: item.unitPrice,
        importe: item.lineTotal,
      })),
      totals: {
        baseImponible:
          candidate.totals.subtotal ??
          parseDecimal(extractLabelValueAny(lines, ['BASE IMPONIBLE']) || ''),
        ivaPorcentaje: parseDecimal(extractLabelValueAny(lines, ['%']) || ''),
        importeIva:
          candidate.totals.tax ?? parseDecimal(extractLabelValueAny(lines, ['IMPORTE I.V.A', 'IMPORTE IVA']) || ''),
        totalAlbaran:
          candidate.totals.total ??
          parseDecimal(extractLabelValueAny(lines, ['TOTAL']) || ''),
      },
      transporte: {
        agencia: extractLabelValueAny(lines, ['AGENCIA']),
        matriculaTransporte: extractLabelValueAny(lines, ['MATRICULA']),
        nombreTransportista: extractLabelValueAny(lines, ['NOMBRE']),
        dniTransportista: extractLabelValueAny(lines, ['D.N.I', 'DNI']),
      },
      recepcion: {
        nombreReceptor: extractLabelValueAny(lines, ['NOMBRE']),
        dniReceptor: extractLabelValueAny(lines, ['D.N.I', 'DNI']),
        firmaReceptorPresent: null,
      },
    };
  }

  if (docSubtype === 'CONSTRUCCIONES_PARTE_TRABAJO') {
    const dateParts = splitIsoDate(candidate.documentDate.value);
    return {
      ...base,
      template: docSubtype,
      header: {
        fechaDia: dateParts?.day ?? null,
        fechaMes: dateParts?.month ?? null,
        fechaAno: dateParts?.year ?? null,
        cliente: extractLabelValueAny(lines, ['CLIENTE']),
        codCliente: extractLabelValueAny(lines, ['COD. CLTE', 'COD CLIENTE']),
        dniCif: extractLabelValueAny(lines, ['D.N.I / C.I.F', 'DNI', 'CIF']),
        obra: extractLabelValueAny(lines, ['OBRA']),
        poblacion: extractLabelValueAny(lines, ['POBLACION']),
        cp: extractLabelValueAny(lines, ['C.P.', 'CP']),
      },
      lines: items.map((item) => ({
        cantidad: item.quantity,
        concepto: item.description,
        precio: item.unitPrice,
        importe: item.lineTotal,
      })),
      footer: {
        observaciones: extractLabelValueAny(lines, ['OBSERVACIONES']),
        total:
          candidate.totals.total ??
          parseDecimal(extractLabelValueAny(lines, ['TOTAL']) || ''),
      },
    };
  }

  return {
    ...base,
    template: docSubtype,
  };
};

const buildFieldMeta = (
  candidate: ParseCandidate,
  tableEvidence: TableEvidenceResult,
): ProcessFieldMeta => {
  return {
    supplier: {
      valueRaw: candidate.supplier.value,
      valueNorm: candidate.supplier.value,
      confidence: clampConfidence(candidate.supplier.confidence),
      source: 'ocr',
    },
    invoiceNumber: {
      valueRaw: candidate.invoiceNumber.value,
      valueNorm: candidate.invoiceNumber.value,
      confidence: clampConfidence(candidate.invoiceNumber.confidence),
      source: 'ocr',
    },
    documentDate: {
      valueRaw: candidate.documentDate.value,
      valueNorm: candidate.documentDate.value,
      confidence: clampConfidence(candidate.documentDate.confidence),
      source: 'ocr',
    },
    table: {
      strongTable: tableEvidence.strongTable,
      evidenceScore: tableEvidence.evidenceScore,
      reasons: tableEvidence.reasons,
      headerHits: tableEvidence.headerHits,
      dataRows: tableEvidence.dataRows,
      economicRows: tableEvidence.economicRows,
      source: 'ocr',
    },
  };
};

const extractLabelValue = (lines: string[], label: string): string | null => {
  const normalizedLabel = normalize(label);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalizedLine = normalize(line);
    const labelIndex = normalizedLine.indexOf(normalizedLabel);
    if (labelIndex < 0) continue;

    const rawAfter = line.slice(labelIndex + label.length).replace(/^[:\s.\-]+/, '').trim();
    if (rawAfter) return cleanString(rawAfter);

    const next = lines[index + 1]?.trim();
    if (next && normalize(next) !== normalizedLabel) {
      return cleanString(next);
    }
  }
  return null;
};

const extractLabelValueAny = (lines: string[], labels: string[]): string | null => {
  for (const label of labels) {
    const value = extractLabelValue(lines, label);
    if (value) return value;
  }
  return null;
};

const splitIsoDate = (date: string | null): { year: number; month: number; day: number } | null => {
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
};

const parseInvoiceItems = (fields: AnyRecord): ProcessedItem[] => {
  const itemsField = asRecord(fields.Items);
  const valueArray = asArray(itemsField.valueArray);
  return valueArray
    .map((entry) => {
      const valueObject = asRecord(asRecord(entry).valueObject);
      const description = pickStringValue(valueObject, ['Description', 'ItemDescription', 'Name']);
      const reference = pickStringValue(valueObject, ['ProductCode', 'ItemCode', 'Reference']);
      const quantityRaw = pickStringValue(valueObject, ['Quantity', 'QuantityAndUnit']);
      const unitRaw = pickStringValue(valueObject, ['Unit', 'UnitMeasure', 'UnitType']);
      const split = splitQuantityAndUnit(quantityRaw, unitRaw);
      const quantity = split.quantity ?? pickNumberValue(valueObject, ['Quantity']);
      const unit = split.unit ?? normalizeUnit(unitRaw);
      const unitPrice = pickNumberValue(valueObject, ['UnitPrice', 'Price']);
      const lineTotal = pickNumberValue(valueObject, ['Amount', 'LineTotal', 'TotalPrice']);
      const confidence = average([
        pickConfidence(valueObject, ['Description', 'ItemDescription', 'Name']),
        pickConfidence(valueObject, ['Quantity']),
        pickConfidence(valueObject, ['UnitPrice', 'Price']),
        pickConfidence(valueObject, ['Amount', 'LineTotal', 'TotalPrice']),
      ]);

      const normalizedDescription = cleanString(description);
      const normalizedReference = cleanString(reference);
      if (!normalizedDescription && !normalizedReference) return null;

      return {
        reference: normalizedReference,
        description: normalizedDescription,
        quantity,
        unit,
        unitPrice,
        lineTotal,
        confidence,
      } satisfies ProcessedItem;
    })
    .filter((item): item is ProcessedItem => Boolean(item));
};

const parseLayoutItems = (tables: AnyRecord[]): ProcessedItem[] => {
  let bestItems: ProcessedItem[] = [];
  for (const table of tables) {
    const items = parseSingleLayoutTable(table);
    if (items.length > bestItems.length) bestItems = items;
  }
  return bestItems;
};

const parseSingleLayoutTable = (table: AnyRecord): ProcessedItem[] => {
  const cells = asArray(table.cells).map((cell) => asRecord(cell));
  if (cells.length === 0) return [];

  const maxRow = Math.max(...cells.map((cell) => asNumber(cell.rowIndex) ?? 0));
  const maxCol = Math.max(...cells.map((cell) => asNumber(cell.columnIndex) ?? 0));
  const matrix: string[][] = Array.from({ length: maxRow + 1 }, () =>
    Array.from({ length: maxCol + 1 }, () => ''),
  );

  for (const cell of cells) {
    const row = asNumber(cell.rowIndex) ?? 0;
    const col = asNumber(cell.columnIndex) ?? 0;
    matrix[row][col] = asString(cell.content)?.trim() || '';
  }

  const serviceHeaders = matrix
    .map((row, index) => ({ index, detected: detectServiceHeaderIndexes(row) }))
    .filter((entry) => entry.detected.isService)
    .sort((a, b) => (b.detected.hits - a.detected.hits) || (a.index - b.index));

  if (serviceHeaders.length > 0) {
    const serviceItems = parseServiceLayoutTable(
      matrix,
      serviceHeaders[0].index,
      serviceHeaders[0].detected,
    );
    if (serviceItems.length > 0) {
      return serviceItems;
    }
  }

  const headerRow = matrix.findIndex((row) => detectHeaderIndexes(row).hits >= 2);
  if (headerRow < 0) return [];
  if (isServiceLayoutHeaderRow(matrix[headerRow])) {
    const detected = detectServiceHeaderIndexes(matrix[headerRow]);
    const serviceItems = parseServiceLayoutTable(matrix, headerRow, detected);
    if (serviceItems.length > 0) return serviceItems;
  }

  const header = detectHeaderIndexes(matrix[headerRow]);
  if (header.description === -1 || header.quantity === -1) return [];

  const items: ProcessedItem[] = [];
  for (let rowIndex = headerRow + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex];
    const description = cleanString(row[header.description]);
    const reference = header.reference >= 0 ? cleanString(row[header.reference]) : null;
    const qtyRaw = header.quantity >= 0 ? row[header.quantity] : '';
    const unitRaw = header.unit >= 0 ? row[header.unit] : '';
    const split = splitQuantityAndUnit(qtyRaw, unitRaw);
    const quantity = split.quantity;
    const unit = split.unit;
    const unitPrice = header.price >= 0 ? parseDecimal(row[header.price]) : null;
    const lineTotal = header.amount >= 0 ? parseDecimal(row[header.amount]) : null;

    if (!description && !reference) continue;
    if (isGarbageRow(description || reference || '')) continue;
    if (quantity === null && unitPrice === null && lineTotal === null) continue;

    items.push({
      reference,
      description,
      quantity,
      unit,
      unitPrice,
      lineTotal,
      confidence: 0.62,
    });
  }

  return items;
};

const detectServiceHeaderIndexes = (headerRow: string[]) => {
  const normalized = headerRow.map((cell) => normalize(cell));
  const joined = normalized.join(' ');
  const find = (terms: string[]): number =>
    normalized.findIndex((value) => terms.some((term) => value.includes(normalize(term))));

  const description = find(['DESCRIPCION DEL TRABAJO', 'DESCRIPCION', 'CONCEPTO', 'OTROS']);
  const hours = find(['HORAS TRABAJO', 'HORAS']);
  const trips = find(['VIAJES']);
  const tons = find(['TONELADAS', 'TONELADA', 'TN']);
  const m3 = find(['M3', 'M³', 'METROS BOMBEADOS', 'METROS']);
  const metricHits = [hours, trips, tons, m3].filter((idx) => idx >= 0).length;
  const serviceTermsHits = SERVICE_LAYOUT_TERMS.filter((term) =>
    joined.includes(normalize(term)),
  ).length;
  const hasMaterialPricingTerms = [...PRICE_HEADERS, ...AMOUNT_HEADERS].some((term) =>
    joined.includes(normalize(term)),
  );
  const hasDescription = description >= 0;
  const isService =
    hasDescription &&
    !hasMaterialPricingTerms &&
    (metricHits >= 1 || serviceTermsHits >= 2);

  return {
    description,
    hours,
    trips,
    tons,
    m3,
    metricHits,
    hits: metricHits + (hasDescription ? 1 : 0),
    isService,
  };
};

const parseServiceLayoutTable = (
  matrix: string[][],
  headerRowIndex: number,
  header: ReturnType<typeof detectServiceHeaderIndexes>,
): ProcessedItem[] => {
  const items: ProcessedItem[] = [];
  let lastDescription: string | null = null;
  const metrics = [
    { index: header.hours, unit: 'h', label: 'horas' },
    { index: header.trips, unit: 'viaje', label: 'viajes' },
    { index: header.tons, unit: 't', label: 'toneladas' },
    { index: header.m3, unit: 'm3', label: 'm3' },
  ].filter((metric) => metric.index >= 0);

  for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex];
    const description = header.description >= 0 ? cleanString(row[header.description]) : null;
    if (description && !isGarbageRow(description)) {
      lastDescription = description;
    }
    const baseDescription = description || lastDescription;

    for (const metric of metrics) {
      const quantity = parseDecimal(row[metric.index]);
      if (quantity === null) continue;

      const resolvedDescription = baseDescription
        ? `${baseDescription} (${metric.label})`
        : `SERVICIO (${metric.label})`;

      if (isGarbageRow(resolvedDescription)) continue;

      items.push({
        reference: null,
        description: resolvedDescription,
        quantity,
        unit: metric.unit,
        unitPrice: null,
        lineTotal: null,
        confidence: 0.58,
      });
    }
  }

  return items;
};

const isServiceLayoutHeaderRow = (headerRow: string[]): boolean => {
  const normalized = normalize(headerRow.join(' '));
  const hasServiceTerms = SERVICE_LAYOUT_TERMS.filter((term) =>
    normalized.includes(normalize(term)),
  ).length;
  const hasPriceOrAmount = [...PRICE_HEADERS, ...AMOUNT_HEADERS].some((term) =>
    normalized.includes(normalize(term)),
  );
  return hasServiceTerms >= 2 && !hasPriceOrAmount;
};

const detectHeaderIndexes = (headerRow: string[]) => {
  const normalized = headerRow.map((cell) => normalize(cell));
  const find = (terms: string[]): number =>
    normalized.findIndex((value) => terms.some((term) => value.includes(normalize(term))));

  const description = find(DESC_HEADERS);
  const quantity = find(QTY_HEADERS);
  const unit = find(UNIT_HEADERS);
  const price = find(PRICE_HEADERS);
  const amount = find(AMOUNT_HEADERS);
  const reference = normalized.findIndex((value) =>
    ['REF', 'REFERENCIA', 'CODIGO', 'ARTICULO'].some((term) =>
      value.includes(normalize(term)),
    ),
  );

  const hits = [description, quantity, price, amount].filter((idx) => idx >= 0).length;
  return { description, quantity, unit, price, amount, reference, hits };
};

const extractSupplierFromLayout = (content: string): FieldValue<string> => {
  const lines = splitNonEmptyLines(content);
  const topLines = lines.slice(0, 20);
  const footerLines = lines.slice(Math.max(0, lines.length - 14));
  const allCandidates = [...topLines, ...footerLines];

  let best: { value: string; score: number } | null = null;
  for (let index = 0; index < allCandidates.length; index += 1) {
    const line = sanitizeSupplierValue(allCandidates[index]);
    if (!line || isBadSupplier(line)) continue;

    const score = scoreSupplierCandidate(line, index);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { value: line, score };
    }
  }

  return {
    value: best?.value ?? null,
    confidence: best ? clampConfidence(Math.min(0.9, 0.5 + best.score * 0.06)) : 0.0,
  };
};

const extractInvoiceFromLayout = (content: string): FieldValue<string> => {
  const lines = splitNonEmptyLines(content);
  const labelRegex = /\b(?:ALBARAN|N(?:[º°]|O|RO)?|NUM(?:ERO)?|REF(?:ERENCIA)?|DOCUMENTO)\b/i;
  const extractRegex = /(?:ALBARAN|N(?:[º°]|O|RO)?|NUM(?:ERO)?|REF(?:ERENCIA)?|DOCUMENTO)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9\-/.]{2,})/i;

  let best: { value: string; score: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!labelRegex.test(line)) continue;
    if (hasContactOrAddressMarker(line)) continue;

    const direct = extractRegex.exec(line)?.[1] ?? null;
    const fallbackNumeric = line.match(/\b\d{4,10}[A-Z]?\b/i)?.[0] ?? null;
    const rawCandidate = (direct || fallbackNumeric || '').trim();
    const candidate = rawCandidate.replace(/[)\].,:;]+$/g, '');
    if (!candidate) continue;
    if (!isLikelyInvoiceCandidate(candidate)) continue;

    let score = 1.0;
    if (/ALBARAN/i.test(line)) score += 0.7;
    if (/N(?:[º°]|O|RO)?/i.test(line)) score += 0.45;
    if (/REF|DOCUMENTO/i.test(line)) score += 0.25;
    if (candidate.length >= 4 && candidate.length <= 10) score += 0.2;
    if (index <= 12) score += 0.2;

    if (!best || score > best.score) {
      best = { value: candidate, score };
    }
  }

  if (!best) {
    const globalMatch = /\b(?:ALBARAN|N(?:[º°]|O|RO)?|NUM(?:ERO)?|REF(?:ERENCIA)?|DOCUMENTO)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9\-/.]{2,})\b/i.exec(content);
    const candidate = globalMatch?.[1]?.trim() || '';
    if (isLikelyInvoiceCandidate(candidate)) {
      best = { value: candidate, score: 0.8 };
    }
  }

  return {
    value: best?.value ?? null,
    confidence: best ? clampConfidence(Math.min(0.9, 0.52 + best.score * 0.05)) : 0.0,
  };
};

const extractDateFromLayout = (content: string): FieldValue<string> => {
  const date = parseDate(content);
  return {
    value: date,
    confidence: date ? 0.66 : 0.0,
  };
};

const extractSupplierFromKeyValues = (keyValuePairs: unknown[]): FieldValue<string> | null => {
  for (const pair of keyValuePairs) {
    const key = normalize(asString(asRecord(asRecord(pair).key).content) || '');
    const value = cleanString(asString(asRecord(asRecord(pair).value).content));
    if (!value) continue;
    if (key.includes('PROVEEDOR') || key.includes('EMISOR') || key.includes('VENDEDOR')) {
      return { value, confidence: 0.7 };
    }
  }
  return null;
};

const extractInvoiceFromKeyValues = (keyValuePairs: unknown[]): FieldValue<string> | null => {
  for (const pair of keyValuePairs) {
    const key = normalize(asString(asRecord(asRecord(pair).key).content) || '');
    const value = cleanString(asString(asRecord(asRecord(pair).value).content));
    if (!value) continue;
    if (!isLikelyInvoiceCandidate(value)) continue;
    if (key.includes('ALBARAN') || key.includes('NUMERO') || key.includes('REF')) {
      return { value, confidence: 0.72 };
    }
  }
  return null;
};

const extractDateFromKeyValues = (keyValuePairs: unknown[]): FieldValue<string> | null => {
  for (const pair of keyValuePairs) {
    const key = normalize(asString(asRecord(asRecord(pair).key).content) || '');
    if (!key.includes('FECHA') && !key.includes('DATE')) continue;
    const value = parseDate(asString(asRecord(asRecord(pair).value).content) || '');
    if (!value) continue;
    return { value, confidence: 0.72 };
  }
  return null;
};

const pickField = (fields: AnyRecord, keys: string[]): FieldValue<string> => {
  for (const key of keys) {
    const field = asRecord(fields[key]);
    const value = cleanString(readFieldAsString(field));
    if (!value) continue;
    return {
      value,
      confidence: clampConfidence(asNumber(field.confidence) ?? 0.6),
    };
  }
  return emptyField();
};

const pickFieldAsNumber = (fields: AnyRecord, keys: string[]): number | null => {
  for (const key of keys) {
    const field = asRecord(fields[key]);
    const parsed = parseDecimal(readFieldAsString(field));
    if (parsed !== null) return parsed;
  }
  return null;
};

const pickStringValue = (obj: AnyRecord, keys: string[]): string | null => {
  for (const key of keys) {
    const field = asRecord(obj[key]);
    const value = cleanString(readFieldAsString(field));
    if (value) return value;
  }
  return null;
};

const pickNumberValue = (obj: AnyRecord, keys: string[]): number | null => {
  for (const key of keys) {
    const field = asRecord(obj[key]);
    const value = parseDecimal(readFieldAsString(field));
    if (value !== null) return value;
  }
  return null;
};

const pickConfidence = (obj: AnyRecord, keys: string[]): number | null => {
  for (const key of keys) {
    const field = asRecord(obj[key]);
    const confidence = asNumber(field.confidence);
    if (confidence !== null) return clampConfidence(confidence);
  }
  return null;
};

const readFieldAsString = (field: AnyRecord): string | null => {
  const direct =
    asString(field.valueString) ??
    asString(field.valueDate) ??
    asString(field.valueTime) ??
    asString(field.content);
  if (direct) return direct;
  const numberValue = asNumber(field.valueNumber);
  if (numberValue !== null) return String(numberValue);
  const currencyValue = asRecord(field.valueCurrency);
  const currencyAmount = asNumber(currencyValue?.amount);
  if (currencyAmount !== null) return String(currencyAmount);
  return null;
};

const toDateField = (rawValue: string | null, confidence: number): FieldValue<string> => {
  return {
    value: parseDate(rawValue || ''),
    confidence: clampConfidence(confidence),
  };
};

const parseDate = (input: string): string | null => {
  const text = input.trim();
  if (!text) return null;

  const isoMatch = /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/.exec(text);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    return safeIsoDate(y, m, d);
  }

  const esMatch = /\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2}|\d{2})\b/.exec(text);
  if (esMatch) {
    const d = Number(esMatch[1]);
    const m = Number(esMatch[2]);
    const year = Number(esMatch[3]);
    const y = year < 100 ? 2000 + year : year;
    return safeIsoDate(y, m, d);
  }

  const normalizedText = normalize(text);
  const monthWordsRegex = /\b(0?[1-9]|[12]\d|3[01])\s*(?:DE)?\s*(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s*(?:DE)?\s*(20\d{2}|\d{2})\b/;
  const monthWordMatch = monthWordsRegex.exec(normalizedText);
  if (monthWordMatch) {
    const d = Number(monthWordMatch[1]);
    const m = MONTHS_ES[monthWordMatch[2]] || 0;
    const year = Number(monthWordMatch[3]);
    const y = year < 100 ? 2000 + year : year;
    if (m > 0) return safeIsoDate(y, m, d);
  }

  return null;
};

const safeIsoDate = (y: number, m: number, d: number): string | null => {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const parseDecimal = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '').replace(/[€$]/g, '');
  if (!compact) return null;

  let normalized = compact;
  if (normalized.includes(',') && normalized.includes('.')) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeUnit = (raw: string | null): string | null => {
  if (!raw) return null;
  const normalized = normalize(raw).replace(/\./g, '').replace(/\s+/g, '');
  const map: Record<string, string> = {
    UD: 'ud',
    UDS: 'ud',
    UN: 'ud',
    UNID: 'ud',
    KG: 'kg',
    G: 'g',
    L: 'l',
    LT: 'l',
    ML: 'ml',
    M: 'm',
    M2: 'm2',
    M2_ALT: 'm2',
    M3: 'm3',
    M3_ALT: 'm3',
    H: 'h',
    TN: 'tn',
    T: 'tn',
    PAQ: 'paq',
    CAJA: 'caja',
  };
  return map[normalized] || null;
};

const splitQuantityAndUnit = (
  quantityCell: string | null | undefined,
  unitCell: string | null | undefined,
): { quantity: number | null; unit: string | null } => {
  const directQuantity = parseDecimal(quantityCell || null);
  const directUnit = normalizeUnit(cleanString(unitCell || null));
  if (directQuantity !== null && directUnit) {
    return { quantity: directQuantity, unit: directUnit };
  }

  const raw = cleanString(quantityCell || null) || '';
  if (raw) {
    const regex = /(-?\d+(?:[.,]\d+)?)(?:\s*)([A-Za-z\u00AA\u00BA\u00B2\u00B3.]{1,6})?/;
    const match = regex.exec(raw);
    if (match) {
      const quantity = parseDecimal(match[1]);
      const unit = normalizeUnit(match[2] || null) || directUnit;
      return { quantity, unit };
    }
  }

  return {
    quantity: directQuantity,
    unit: directUnit,
  };
};

const collectTables = (analyze: AnyRecord): AnyRecord[] => {
  const directTables = asArray(analyze.tables).map((table) => asRecord(table));
  if (directTables.length > 0) return directTables;

  const pages = asArray(analyze.pages);
  const nestedTables = pages
    .flatMap((page) => asArray(asRecord(page).tables))
    .map((table) => asRecord(table));
  return nestedTables;
};

const splitNonEmptyLines = (content: string): string[] => {
  return content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

const hasContactOrAddressMarker = (value: string): boolean => {
  const normalized = normalize(value);
  return ADDRESS_OR_CONTACT_MARKERS.some((marker) => normalized.includes(normalize(marker)));
};

const sanitizeSupplierValue = (value: string): string | null => {
  const collapsed = value
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:;,.#-]+|[\s:;,.#-]+$/g, '')
    .trim();
  return cleanString(collapsed);
};

const scoreSupplierCandidate = (value: string, index: number): number => {
  const normalized = normalize(value);
  if (!normalized) return 0;
  if (hasContactOrAddressMarker(value)) return -1;
  if (normalized.includes(':') && SUPPLIER_STOPWORDS.some((term) => normalized.includes(normalize(term)))) return -1;

  let score = 0.2;
  if (index <= 6) score += 0.35;
  else if (index <= 14) score += 0.2;
  else score += 0.1;

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length >= 2) score += 0.22;
  if (words.length >= 3) score += 0.08;
  if (SUPPLIER_COMPANY_MARKERS.some((marker) => normalized.includes(normalize(marker)))) score += 0.3;
  if (/(BOMBEOS|RECICLESAN|MONTALBAN|RODRIGUEZ|TOWWERS)/i.test(value)) score += 0.18;
  if (/\d{4,}/.test(value)) score -= 0.45;

  return score;
};

const isBadSupplier = (value: string): boolean => {
  const normalized = normalize(value);
  if (!normalized) return true;
  if (normalized.length < 3) return true;
  if (SUPPLIER_STOPWORDS.some((term) => normalized.includes(normalize(term)))) return true;
  if (hasContactOrAddressMarker(value) && !SUPPLIER_COMPANY_MARKERS.some((marker) => normalized.includes(normalize(marker)))) return true;
  if (/\b\d{5,}\b/.test(normalized)) return true;
  return false;
};

const looksLikePhoneOrPostalCode = (value: string): boolean => {
  const compact = value.replace(/\s+/g, '');
  return /^\d{9}$/.test(compact) || /^\d{5}$/.test(compact);
};

const isLikelyInvoiceCandidate = (value: string): boolean => {
  const trimmed = value.trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  if (!trimmed) return false;
  if (looksLikePhoneOrPostalCode(trimmed)) return false;

  const compact = trimmed.replace(/[^A-Za-z0-9]/g, '');
  if (compact.length < 3 || compact.length > 24) return false;

  const digits = compact.replace(/\D/g, '').length;
  if (digits < 3) return false;

  return true;
};

const isGarbageRow = (text: string): boolean => {
  const normalized = normalize(text);
  return (
    !normalized ||
    ['TOTAL', 'SUBTOTAL', 'IVA', 'BASE IMPONIBLE', 'OBSERVACIONES', 'DOMICILIO', 'TEL', 'CIF', 'NIF', 'EMAIL', 'WEB']
      .some((term) => normalized.includes(normalize(term)))
  );
};

const cleanString = (value: string | null | undefined): string | null => {
  const stripped = value
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  const trimmed = stripped
    ?.replace(/\s+/g, ' ')
    .replace(/^[\s:;,.#-]+|[\s:;,.#-]+$/g, '')
    .trim();
  return trimmed ? trimmed : null;
};

const average = (values: Array<number | null>): number | null => {
  const filtered = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (filtered.length === 0) return null;
  return clampConfidence(filtered.reduce((acc, value) => acc + value, 0) / filtered.length);
};

const clampConfidence = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, Number(value.toFixed(4))));
};

const emptyField = (): FieldValue<string> => ({ value: null, confidence: 0 });

const normalize = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
};

const asRecord = (value: unknown): AnyRecord => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as AnyRecord;
  }
  return {};
};

const asArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

const asString = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

