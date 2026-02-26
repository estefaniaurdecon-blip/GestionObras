import { registerPlugin } from '@capacitor/core';

export type ParsedDocType = 'MATERIALS_TABLE' | 'SERVICE_MACHINERY' | 'UNKNOWN';
export type ParsedDocSubtype =
  | 'BOMBEOS_GILGIL_ALBARAN_BOMBA'
  | 'RECICLESAN_ALBARAN_JORNADA_MAQUINA'
  | 'MONTALBAN_RODRIGUEZ_ALBARAN_MATERIALES'
  | 'CONSTRUCCIONES_PARTE_TRABAJO';
export type ParsedConfidence = 'high' | 'medium' | 'low';
export type ParsedProfileUsed = 'ORIGINAL' | 'ENHANCED_GRAY' | 'ENHANCED_SHARP';
export type ParsedJsonValue =
  | string
  | number
  | boolean
  | null
  | ParsedJsonValue[]
  | { [key: string]: ParsedJsonValue };

export type ParsedFieldConfidence = {
  supplier?: number;
  invoiceNumber?: number;
  documentDate?: number;
  table?: number;
};

export type ParsedFieldWarnings = {
  supplier?: string[];
  invoiceNumber?: string[];
  documentDate?: string[];
  table?: string[];
};

export type ParsedAlbaranItem = {
  material: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  costDoc: number | null;
  costCalc: number | null;
  difference: number | null;
  rowText: string;
  missingCritical: boolean;
};

export type ParsedOcrLine = {
  text: string;
  page: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ParsedAlbaranResult = {
  supplier: string | null;
  supplierNormalized?: string | null;
  invoiceNumber: string | null;
  documentDate: string | null;
  docType: ParsedDocType;
  docSubtype?: ParsedDocSubtype | null;
  serviceDescription: string | null;
  confidence: ParsedConfidence;
  warnings: string[];
  rawText?: string;
  score: number;
  profileUsed: ParsedProfileUsed;
  fieldConfidence?: ParsedFieldConfidence;
  fieldWarnings?: ParsedFieldWarnings;
  fieldMeta?: { [key: string]: ParsedJsonValue } | null;
  templateData?: { [key: string]: ParsedJsonValue } | null;
  requiresReview: boolean;
  reviewReason: string | null;
  headerDetected: boolean;
  items: ParsedAlbaranItem[];
  imageUris: string[];
  ocrLines?: ParsedOcrLine[];
};

export type StartAlbaranScanOptions = {
  authToken?: string | null;
  tokenType?: string | null;
  docIntBaseUrl?: string | null;
};

type AlbaranScannerPlugin = {
  startScan: (options?: StartAlbaranScanOptions) => Promise<ParsedAlbaranResult>;
};

const AlbaranScanner = registerPlugin<AlbaranScannerPlugin>('AlbaranScanner');

const DOC_TYPES = new Set<ParsedDocType>(['MATERIALS_TABLE', 'SERVICE_MACHINERY', 'UNKNOWN']);
const DOC_SUBTYPES = new Set<ParsedDocSubtype>([
  'BOMBEOS_GILGIL_ALBARAN_BOMBA',
  'RECICLESAN_ALBARAN_JORNADA_MAQUINA',
  'MONTALBAN_RODRIGUEZ_ALBARAN_MATERIALES',
  'CONSTRUCCIONES_PARTE_TRABAJO',
]);
const CONFIDENCE_LEVELS = new Set<ParsedConfidence>(['high', 'medium', 'low']);
const PROFILE_LEVELS = new Set<ParsedProfileUsed>(['ORIGINAL', 'ENHANCED_GRAY', 'ENHANCED_SHARP']);

export const normalizeDocType = (value: unknown): ParsedDocType => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (DOC_TYPES.has(normalized as ParsedDocType)) return normalized as ParsedDocType;
  if (normalized.includes('SERVICE')) return 'SERVICE_MACHINERY';
  if (normalized.includes('MATERIAL')) return 'MATERIALS_TABLE';
  return 'UNKNOWN';
};

const normalizeDocSubtype = (value: unknown): ParsedDocSubtype | null => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (DOC_SUBTYPES.has(normalized as ParsedDocSubtype)) return normalized as ParsedDocSubtype;
  return null;
};

const normalizeConfidence = (value: unknown): ParsedConfidence => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (CONFIDENCE_LEVELS.has(normalized as ParsedConfidence)) return normalized as ParsedConfidence;
  return 'low';
};

const normalizeProfileUsed = (value: unknown): ParsedProfileUsed => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (PROFILE_LEVELS.has(normalized as ParsedProfileUsed)) return normalized as ParsedProfileUsed;
  return 'ORIGINAL';
};

const sanitizeWarnings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((warning) => (typeof warning === 'string' ? warning.trim() : ''))
    .filter((warning) => warning.length > 0);
};

export const startAlbaranScan = async (
  options?: StartAlbaranScanOptions,
): Promise<ParsedAlbaranResult> => {
  const result = await AlbaranScanner.startScan(options);
  return {
    ...result,
    docType: normalizeDocType(result.docType),
    docSubtype: normalizeDocSubtype(result.docSubtype),
    confidence: normalizeConfidence(result.confidence),
    profileUsed: normalizeProfileUsed(result.profileUsed),
    warnings: sanitizeWarnings(result.warnings),
    items: Array.isArray(result.items) ? result.items : [],
    imageUris: Array.isArray(result.imageUris) ? result.imageUris : [],
  };
};
