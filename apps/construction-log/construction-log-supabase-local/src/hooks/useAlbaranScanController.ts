import { useCallback, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { startAlbaranScan, type ParsedAlbaranResult } from '@/plugins/albaranScanner';
import { getApiBaseUrl, getToken } from '@/integrations/api/client';

type UseAlbaranScanControllerResult = {
  startScan: () => Promise<ParsedAlbaranResult | null>;
  isProcessing: boolean;
  error: string | null;
  clearError: () => void;
};

const isAndroidNative = (): boolean => Capacitor.isNativePlatform?.() === true && Capacitor.getPlatform() === 'android';

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

const toAbsoluteUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const resolveDocIntBaseUrl = (): string | null => {
  const nativeOverride = (import.meta.env.VITE_NATIVE_DOCINT_BASE_URL || '').trim();
  if (nativeOverride) return normalizeBaseUrl(nativeOverride);

  const defaultOverride = (import.meta.env.VITE_DOCINT_BASE_URL || '').trim();
  if (defaultOverride && !defaultOverride.startsWith('/')) {
    return normalizeBaseUrl(defaultOverride);
  }

  const apiBaseUrl = getApiBaseUrl().trim();
  const parsedApiBase = toAbsoluteUrl(apiBaseUrl);
  if (!parsedApiBase) return null;

  const parsedDefaultDocInt = toAbsoluteUrl(defaultOverride);
  const docIntPort = (
    parsedDefaultDocInt?.port ||
    (import.meta.env.VITE_DOCINT_PORT || '').trim() ||
    '7071'
  ).trim();

  const protocol = parsedDefaultDocInt?.protocol || parsedApiBase.protocol || 'http:';
  let host = parsedDefaultDocInt?.hostname || parsedApiBase.hostname;
  const isLocalHost = host === '127.0.0.1' || host === 'localhost';
  if (isLocalHost) {
    const browserHost = window.location.hostname?.trim();
    const canUseBrowserHost =
      browserHost &&
      browserHost !== '127.0.0.1' &&
      browserHost !== 'localhost';
    if (canUseBrowserHost) {
      host = browserHost;
    }
  }

  if (!host) return null;

  return normalizeBaseUrl(`${protocol}//${host}:${docIntPort}`);
};

const toErrorMessage = (error: unknown): string => {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return 'No se pudo escanear el albaran';
};

export function useAlbaranScanController(): UseAlbaranScanControllerResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const startScan = useCallback(async (): Promise<ParsedAlbaranResult | null> => {
    if (!isAndroidNative()) {
      setError('Escanear IA solo esta disponible en Android');
      return null;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const tokenData = await getToken();
      const docIntBaseUrl = resolveDocIntBaseUrl();
      return await startAlbaranScan({
        authToken: tokenData?.access_token ?? null,
        tokenType: tokenData?.token_type ?? 'Bearer',
        docIntBaseUrl,
      });
    } catch (scanError) {
      setError(toErrorMessage(scanError));
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    startScan,
    isProcessing,
    error,
    clearError,
  };
}
