import { registerPlugin } from '@capacitor/core';

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

export type ParsedAlbaranResult = {
  supplier: string | null;
  invoiceNumber: string | null;
  requiresReview: boolean;
  reviewReason: string | null;
  headerDetected: boolean;
  items: ParsedAlbaranItem[];
  imageUris: string[];
};

type AlbaranScannerPlugin = {
  startScan: () => Promise<ParsedAlbaranResult>;
};

const AlbaranScanner = registerPlugin<AlbaranScannerPlugin>('AlbaranScanner');

export const startAlbaranScan = async (): Promise<ParsedAlbaranResult> => {
  return AlbaranScanner.startScan();
};
