import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { DocIntClient } from '../docint/client';
import { parseLayoutOrRead, parsePrimaryInvoice, shouldFallbackToLayout } from '../docint/parsers';
import type { ParsedDocIntOutput, ProcessAlbaranResponse } from '../schema';

const toInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = toInt(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const DEFAULT_MAX_FILE_BYTES = 12 * 1024 * 1024;

const isSupportedUploadMimeType = (mimeType: string): boolean => {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'application/pdf') return true;
  if (normalized.startsWith('image/')) return true;
  return false;
};

const isPlaceholderValue = (value: string): boolean => {
  const normalized = value.trim();
  if (!normalized) return true;
  if (normalized.includes('<') || normalized.includes('>')) return true;
  if (/^replace[-_ ]me$/i.test(normalized)) return true;
  return false;
};

const requiredEnv = (name: string, validate?: (value: string) => string): string => {
  const value = process.env[name]?.trim();
  if (!value || isPlaceholderValue(value)) {
    throw new Error(`MissingEnv:${name}`);
  }
  if (!validate) return value;
  return validate(value);
};

const validateHttpUrl = (value: string): string => {
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

const getConfig = () => {
  return {
    endpoint: requiredEnv('DOCINT_ENDPOINT', validateHttpUrl),
    apiKey: requiredEnv('DOCINT_KEY'),
    apiBaseUrl: requiredEnv('API_BASE_URL', validateHttpUrl),
    apiVersion: process.env.DOCINT_API_VERSION?.trim() || '2024-11-30',
    locale: process.env.DOCINT_LOCALE?.trim() || 'es-ES',
    modelPrimary: process.env.DOCINT_MODEL_PRIMARY?.trim() || 'prebuilt-layout',
    modelFallback: process.env.DOCINT_MODEL_FALLBACK?.trim() || 'prebuilt-read',
    pagesLimit: process.env.DOCINT_PAGES_LIMIT?.trim(),
    timeoutMs: toInt(process.env.DOCINT_TIMEOUT_MS, 60000),
    maxFileBytes: toPositiveInt(process.env.DOCINT_MAX_FILE_BYTES, DEFAULT_MAX_FILE_BYTES),
    authPathPrimary: process.env.API_AUTH_ME_PATH?.trim() || '/api/v1/users/me',
    authPathFallback: process.env.API_AUTH_ME_FALLBACK_PATH?.trim() || '/api/v1/auth/me',
    authTimeoutMs: toInt(process.env.API_AUTH_TIMEOUT_MS, 15000),
    isF0Tier: (process.env.DOCINT_IS_F0 || '').trim() === '1',
  };
};

const parseByModel = (modelId: string, raw: Parameters<typeof parsePrimaryInvoice>[0]): ParsedDocIntOutput => {
  const normalizedModel = modelId.trim().toLowerCase();
  if (normalizedModel.includes('invoice')) {
    return parsePrimaryInvoice(raw);
  }
  if (normalizedModel.includes('read')) {
    return parseLayoutOrRead(raw, 'prebuilt-read');
  }
  if (normalizedModel.includes('layout')) {
    return parseLayoutOrRead(raw, 'prebuilt-layout');
  }
  return parseLayoutOrRead(raw, normalizedModel || 'prebuilt-layout');
};

const jsonResponse = (status: number, body: unknown): HttpResponseInit => ({
  status,
  headers: {
    'Content-Type': 'application/json',
  },
  jsonBody: body,
});

const pickBetter = (
  primary: ParsedDocIntOutput,
  fallback: ParsedDocIntOutput,
) => {
  const primaryScore = scoreCandidate(primary);
  const fallbackScore = scoreCandidate(fallback);
  return fallbackScore > primaryScore ? fallback : primary;
};

const scoreCandidate = (
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

const isLikelyInvoiceValue = (value: string): boolean => {
  const cleaned = value.trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  if (!cleaned) return false;
  const compact = cleaned.replace(/[^A-Za-z0-9]/g, '');
  if (compact.length < 3 || compact.length > 24) return false;
  const digits = compact.replace(/\D/g, '').length;
  if (digits < 3) return false;
  if (/^\d{5}$/.test(compact) || /^\d{9}$/.test(compact)) return false;
  return true;
};

const processAlbaran = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
  const startedAt = Date.now();

  try {
    const config = getConfig();
    await validateBearerToken(request, config, context);

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return jsonResponse(400, {
        success: false,
        message: 'Content-Type debe ser multipart/form-data',
      });
    }

    const form = await request.formData();
    const file = form.get('file') as Blob | null;
    if (!file) {
      return jsonResponse(400, {
        success: false,
        message: 'Campo file requerido',
      });
    }

    const fileMimeType = ((file as unknown as { type?: string }).type || '').trim().toLowerCase();
    if (!isSupportedUploadMimeType(fileMimeType)) {
      return jsonResponse(400, {
        success: false,
        message: 'Tipo de archivo no soportado. Usa PDF o imagen.',
      });
    }

    const fileBytes = Buffer.from(await file.arrayBuffer());
    if (fileBytes.length === 0) {
      return jsonResponse(400, {
        success: false,
        message: 'Archivo vacio',
      });
    }

    if (fileBytes.length > config.maxFileBytes) {
      return jsonResponse(413, {
        success: false,
        message: `Archivo demasiado grande. Maximo ${config.maxFileBytes} bytes`,
      });
    }

    const client = new DocIntClient({
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      apiVersion: config.apiVersion,
      locale: config.locale,
      timeoutMs: config.timeoutMs,
      pagesLimit: config.pagesLimit,
    });

    const base64Source = fileBytes.toString('base64');

    const primaryRaw = await client.analyzeWithModel({
      modelId: config.modelPrimary,
      base64Source,
      contentType: fileMimeType,
    });
    let selected = parseByModel(config.modelPrimary, primaryRaw);

    if (shouldFallbackToLayout(selected)) {
      const fallbackRaw = await client.analyzeWithModel({
        modelId: config.modelFallback,
        base64Source,
        contentType: fileMimeType,
      });
      const fallback = parseByModel(config.modelFallback, fallbackRaw);
      selected = pickBetter(selected, fallback);
    }

    const estimatedPageCount = estimatePdfPageCount(fileBytes, fileMimeType);
    if (config.isF0Tier && estimatedPageCount !== null && estimatedPageCount > 2) {
      selected.warnings = [...new Set([...selected.warnings, 'DOCINT_F0_MAX_2_PAGES'])];
    }

    const response: ProcessAlbaranResponse = {
      success: true,
      ...selected,
      processingTimeMs: Date.now() - startedAt,
    };

    return jsonResponse(200, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UnknownError';
    context.error(`processAlbaran failed: ${message}`);

    if (message === 'Unauthorized') {
      return jsonResponse(401, {
        success: false,
        message: 'Unauthorized',
      });
    }

    if (message.startsWith('AuthValidationFailed')) {
      return jsonResponse(502, {
        success: false,
        message: 'AuthValidationFailed',
        detail: message,
      });
    }

    if (message.startsWith('MissingEnv:')) {
      return jsonResponse(500, {
        success: false,
        message,
      });
    }

    if (message.startsWith('InvalidConfig:')) {
      return jsonResponse(500, {
        success: false,
        message,
        detail: 'Revisa DOCINT_ENDPOINT / DOCINT_KEY en local.settings.json o App Settings',
      });
    }

    if (message.startsWith('DocIntRateLimited')) {
      return jsonResponse(429, {
        success: false,
        message: 'DocIntRateLimited',
        detail: message,
      });
    }

    if (
      message.includes('DocInt') ||
      message.includes('documentintelligence') ||
      message.includes('Failed to parse URL')
    ) {
      return jsonResponse(502, {
        success: false,
        message: 'DocIntFailed',
        detail: message,
      });
    }

    return jsonResponse(500, {
      success: false,
      message: 'InternalError',
      detail: message,
    });
  }
};

app.http('processAlbaran', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'v1/albaranes/process',
  handler: processAlbaran,
});

const validateBearerToken = async (
  request: HttpRequest,
  config: ReturnType<typeof getConfig>,
  context: InvocationContext,
): Promise<void> => {
  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    throw new Error('Unauthorized');
  }

  const primaryStatus = await validateTokenAgainstPath(
    config.apiBaseUrl,
    config.authPathPrimary,
    authorization,
    config.authTimeoutMs,
  );

  if (primaryStatus === 200) {
    return;
  }

  if (primaryStatus === 404 && config.authPathFallback && config.authPathFallback !== config.authPathPrimary) {
    const fallbackStatus = await validateTokenAgainstPath(
      config.apiBaseUrl,
      config.authPathFallback,
      authorization,
      config.authTimeoutMs,
    );
    if (fallbackStatus === 200) {
      return;
    }

    context.warn(
      `Token validation failed on both endpoints primary=${config.authPathPrimary}:${primaryStatus} ` +
        `fallback=${config.authPathFallback}:${fallbackStatus}`,
    );
    throw new Error('Unauthorized');
  }

  context.warn(`Token validation failed on ${config.authPathPrimary} with status ${primaryStatus}`);
  throw new Error('Unauthorized');
};

const validateTokenAgainstPath = async (
  apiBaseUrl: string,
  path: string,
  authorization: string,
  timeoutMs: number,
): Promise<number> => {
  const normalizedBase = apiBaseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${normalizedBase}${normalizedPath}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    return response.status;
  } catch (error) {
    throw new Error(`AuthValidationFailed:${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
};

const estimatePdfPageCount = (fileBytes: Buffer, mimeType: string): number | null => {
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
