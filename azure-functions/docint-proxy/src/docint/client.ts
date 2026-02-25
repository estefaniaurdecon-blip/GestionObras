import type { DocIntAnalyzeResponse } from '../schema';

export type DocIntClientConfig = {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  locale: string;
  timeoutMs: number;
  pagesLimit?: string;
};

export type AnalyzeWithModelParams = {
  modelId: string;
  base64Source: string;
  contentType: string;
};

export class DocIntClient {
  constructor(private readonly config: DocIntClientConfig) {}

  async analyzeWithModel(params: AnalyzeWithModelParams): Promise<DocIntAnalyzeResponse> {
    const analyzeUrl = this.buildAnalyzeUrl(params.modelId);
    let lastRateLimitDetail = '';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const postResponse = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': this.config.apiKey,
        },
        body: JSON.stringify({
          base64Source: params.base64Source,
        }),
      });

      if (postResponse.status === 202) {
        const operationLocation = postResponse.headers.get('operation-location');
        if (!operationLocation) {
          throw new Error('DocIntAnalyzeFailed: Missing Operation-Location');
        }
        return this.pollOperation(operationLocation);
      }

      const body = await safeText(postResponse);
      if (postResponse.status === 429) {
        const waitMs = getRetryAfterMs(postResponse, body, 25000);
        lastRateLimitDetail = body;
        await delay(waitMs);
        continue;
      }

      throw new Error(`DocIntAnalyzeFailed: HTTP ${postResponse.status} ${body}`);
    }

    throw new Error(`DocIntRateLimited: Analyze exceeded retries ${lastRateLimitDetail}`.trim());
  }

  private buildAnalyzeUrl(modelId: string): string {
    const endpoint = this.config.endpoint.replace(/\/+$/, '');
    const params = new URLSearchParams();
    params.set('api-version', this.config.apiVersion);
    params.set('locale', this.config.locale);
    params.append('features', 'ocrHighResolution');
    params.append('features', 'keyValuePairs');
    params.set('outputContentFormat', 'markdown');
    if (this.config.pagesLimit?.trim()) {
      params.set('pages', this.config.pagesLimit.trim());
    }
    return `${endpoint}/documentintelligence/documentModels/${encodeURIComponent(modelId)}:analyze?${params.toString()}`;
  }

  private async pollOperation(operationLocation: string): Promise<DocIntAnalyzeResponse> {
    const startedAt = Date.now();
    let lastStatus = 'notStarted';
    let lastRateLimitDetail = '';

    while (Date.now() - startedAt < this.config.timeoutMs) {
      const response = await fetch(operationLocation, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': this.config.apiKey,
        },
      });

      if (response.status === 429) {
        const body = await safeText(response);
        lastRateLimitDetail = body;
        const waitMs = getRetryAfterMs(response, body, 25000);
        await delay(waitMs);
        continue;
      }

      if (!response.ok) {
        const body = await safeText(response);
        throw new Error(`DocIntPollFailed: HTTP ${response.status} ${body}`);
      }

      const payload = (await response.json()) as DocIntAnalyzeResponse;
      lastStatus = payload.status || lastStatus;

      if (payload.status === 'succeeded') {
        return payload;
      }
      if (payload.status === 'failed') {
        throw new Error(`DocIntPollFailed: status=failed payload=${JSON.stringify(payload.error || {})}`);
      }

      await delay(2800);
    }

    if (lastRateLimitDetail) {
      throw new Error(`DocIntRateLimited: Poll timeout due to throttling ${lastRateLimitDetail}`.trim());
    }
    throw new Error(`DocIntTimeout: lastStatus=${lastStatus}`);
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const safeText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return '';
  }
};

const getRetryAfterMs = (response: Response, body: string, fallbackMs: number): number => {
  const header = response.headers.get('retry-after');
  const headerSeconds = header ? Number(header) : NaN;
  if (Number.isFinite(headerSeconds) && headerSeconds > 0) {
    return Math.min(120000, Math.max(1500, Math.floor(headerSeconds * 1000)));
  }

  const match = /retry after\s+(\d+)\s+seconds/i.exec(body);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(120000, Math.max(1500, seconds * 1000));
    }
  }

  return fallbackMs;
};
