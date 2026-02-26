export type AlbaranDocType = 'MATERIALS_TABLE' | 'SERVICE_MACHINERY' | 'UNKNOWN';

export type AlbaranDocSubtype =
  | 'BOMBEOS_GILGIL_ALBARAN_BOMBA'
  | 'RECICLESAN_ALBARAN_JORNADA_MAQUINA'
  | 'MONTALBAN_RODRIGUEZ_ALBARAN_MATERIALES'
  | 'CONSTRUCCIONES_PARTE_TRABAJO';

export type FieldValue<T> = {
  value: T | null;
  confidence: number;
};

export type FieldSource = 'ocr' | 'llm';

export type FieldMetaValue = {
  valueRaw: string | null;
  valueNorm: string | number | null;
  confidence: number;
  source: FieldSource;
};

export type TableMetaValue = {
  strongTable: boolean;
  evidenceScore: number;
  reasons: string[];
  headerHits: number;
  dataRows: number;
  economicRows: number;
  source: FieldSource;
};

export type ProcessFieldMeta = {
  supplier?: FieldMetaValue;
  invoiceNumber?: FieldMetaValue;
  documentDate?: FieldMetaValue;
  table?: TableMetaValue;
};

export type ProcessedItem = {
  reference: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  confidence: number | null;
};

export type ProcessedTotals = {
  subtotal: number | null;
  tax: number | null;
  total: number | null;
};

export type ProcessAlbaranResponse = {
  success: true;
  docType: AlbaranDocType;
  docSubtype?: AlbaranDocSubtype | null;
  supplier: FieldValue<string>;
  invoiceNumber: FieldValue<string>;
  documentDate: FieldValue<string>;
  items: ProcessedItem[];
  totals: ProcessedTotals;
  fieldMeta?: ProcessFieldMeta;
  templateData?: Record<string, unknown> | null;
  warnings: string[];
  processingTimeMs: number;
};

export type DocIntPollStatus = 'notStarted' | 'running' | 'succeeded' | 'failed';

export type DocIntAnalyzeResponse = {
  status: DocIntPollStatus;
  createdDateTime?: string;
  lastUpdatedDateTime?: string;
  analyzeResult?: Record<string, unknown>;
  error?: Record<string, unknown>;
};

export type ParsedDocIntOutput = Omit<ProcessAlbaranResponse, 'success' | 'processingTimeMs'>;
