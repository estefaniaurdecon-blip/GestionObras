import type { HttpResponseInit } from '@azure/functions';
import type { ParsedDocIntOutput } from '../schema';

export const DEFAULT_MAX_FILE_BYTES = 12 * 1024 * 1024;

export const toInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = toInt(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

export const isSupportedUploadMimeType = (mimeType: string): boolean => {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'application/pdf') return true;
  if (normalized.startsWith('image/')) return true;
  return false;
};

export const isPlaceholderValue = (value: string): boolean => {
  const normalized = value.trim();
  if (!normalized) return true;
  if (normalized.includes('<') || normalized.includes('>')) return true;
  if (/^replace[-_ ]me$/i.test(normalized)) return true;
  return false;
};

export const requiredEnv = (name: string, validate?: (value: string) => string): string => {
  const value = process.env[name]?.trim();
  if (!value || isPlaceholderValue(value)) {
    throw new Error(`MissingEnv:${name}`);
  }
  if (!validate) return value;
  return validate(value);
};

export const validateHttpUrl = (value: string): string => {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error('InvalidConfig:DOCINT_ENDPOINT');
  }
};

export const jsonResponse = (status: number, body: unknown): HttpResponseInit => ({
  status,
  headers: {
    'Content-Type': 'application/json',
  },
  jsonBody: body,
});

export const scoreCandidate = (
  candidate: ParsedDocIntOutput,
): number => {
  let score = 0;

  if (candidate.docType === 'MATERIALS_TABLE') {
    score += candidate.items.length > 0 ? 5 : -3;
  } else if (candidate.docType === 'SERVICE_MACHINERY') {
    score += 2;
  }

  if (candidate.supplier.value) score += 2;
  if (candidate.documentDate.value) score += 1;

  if (candidate.invoiceNumber.value) {
    score += isLikelyInvoiceValue(candidate.invoiceNumber.value) ? 2 : -3;
  } else {
    score -= 1;
  }

  score += Math.min(candidate.items.length, 3);

  for (const warning of candidate.warnings) {
    if (
      warning === 'MISSING_INVOICE_NUMBER' ||
      warning === 'AMBIGUOUS_PROVIDER' ||
      warning === 'NO_TABLE_STRONG' ||
      warning === 'AMBIGUOUS_TABLE'
    ) {
      score -= 2;
    } else if (warning === 'MATERIAL_HEADERS_DETECTED_NO_ITEMS') {
      score -= 1.5;
    } else if (warning === 'NO_PRICE_COLUMNS') {
      score -= 1;
    }
  }

  return score;
};

export const pickBetter = (
  primary: ParsedDocIntOutput,
  fallback: ParsedDocIntOutput,
): ParsedDocIntOutput => {
  const primaryScore = scoreCandidate(primary);
  const fallbackScore = scoreCandidate(fallback);
  return fallbackScore > primaryScore ? fallback : primary;
};

export const isLikelyInvoiceValue = (value: string): boolean => {
  const cleaned = value.trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  if (!cleaned) return false;
  const compact = cleaned.replace(/[^A-Za-z0-9]/g, '');
  if (compact.length < 3 || compact.length > 24) return false;
  const digits = compact.replace(/\D/g, '').length;
  if (digits < 3) return false;
  if (/^\d{5}$/.test(compact) || /^\d{9}$/.test(compact)) return false;
  return true;
};

export const estimatePdfPageCount = (fileBytes: Buffer, mimeType: string): number | null => {
  if (!mimeType.toLowerCase().includes('pdf')) {
    return null;
  }

  try {
    const sample = fileBytes.subarray(0, Math.min(fileBytes.length, 1024 * 1024)).toString('latin1');
    const matches = [...sample.matchAll(/\/Count\s+(\d+)/g)];
    if (matches.length === 0) return null;
    const counts = matches
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (counts.length === 0) return null;
    return Math.max(...counts);
  } catch {
    return null;
  }
};
