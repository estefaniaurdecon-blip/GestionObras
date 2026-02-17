import { useCallback, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { startAlbaranScan, type ParsedAlbaranResult } from '@/plugins/albaranScanner';

type UseAlbaranScanControllerResult = {
  startScan: () => Promise<ParsedAlbaranResult | null>;
  isProcessing: boolean;
  error: string | null;
  clearError: () => void;
};

const isAndroidNative = (): boolean => Capacitor.isNativePlatform?.() === true && Capacitor.getPlatform() === 'android';

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
      return await startAlbaranScan();
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
