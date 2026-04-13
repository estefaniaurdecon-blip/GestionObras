import { useCallback, useState } from 'react';
import {
  type ParsedAlbaranItem,
  type ParsedAlbaranResult,
  type ParsedFieldConfidence,
  type ParsedFieldWarnings,
} from '@/plugins/albaranScanner';
import type {
  DuplicateScanResolution,
  MaterialCostDifference,
  NoPriceScanResolution,
  ServiceLine,
  ServiceScanResolution,
} from '@/components/work-report/types';

export const useScanReviewState = () => {
  // ── Review dialog ──────────────────────────────────────────────────────────
  const [scanReviewDialogOpen, setScanReviewDialogOpenState] = useState(false);
  const [scanReviewReason, setScanReviewReason] = useState<string | null>(null);
  const [scanReviewSupplierState, setScanReviewSupplierState] = useState('');
  const [scanReviewInvoiceNumberState, setScanReviewInvoiceNumberState] =
    useState('');
  const [scanReviewDocumentDateState, setScanReviewDocumentDateState] =
    useState('');
  const [scanReviewDocType, setScanReviewDocType] =
    useState<ParsedAlbaranResult['docType']>('UNKNOWN');
  const [scanReviewDocSubtype, setScanReviewDocSubtype] =
    useState<ParsedAlbaranResult['docSubtype']>(null);
  const [
    scanReviewServiceDescriptionState,
    setScanReviewServiceDescriptionState,
  ] = useState('');
  const [scanReviewConfidence, setScanReviewConfidence] =
    useState<ParsedAlbaranResult['confidence']>('medium');
  const [scanReviewWarnings, setScanReviewWarnings] = useState<string[]>([]);
  const [scanReviewFieldConfidence, setScanReviewFieldConfidence] =
    useState<ParsedFieldConfidence | null>(null);
  const [scanReviewFieldWarnings, setScanReviewFieldWarnings] =
    useState<ParsedFieldWarnings | null>(null);
  const [scanReviewFieldMeta, setScanReviewFieldMeta] =
    useState<ParsedAlbaranResult['fieldMeta']>(null);
  const [scanReviewTemplateData, setScanReviewTemplateData] =
    useState<ParsedAlbaranResult['templateData']>(null);
  const [scanReviewProfileUsed, setScanReviewProfileUsed] =
    useState<ParsedAlbaranResult['profileUsed']>('ORIGINAL');
  const [scanReviewScore, setScanReviewScore] = useState(0);
  const [scanReviewItems, setScanReviewItems] = useState<ParsedAlbaranItem[]>(
    [],
  );
  const [scanReviewServiceLines, setScanReviewServiceLines] = useState<
    ServiceLine[]
  >([]);
  const [scanReviewImageUris, setScanReviewImageUris] = useState<string[]>([]);
  const [scanReviewRawText, setScanReviewRawText] = useState('');
  const [scanReviewTargetGroupId, setScanReviewTargetGroupId] = useState<
    string | null
  >(null);
  const [scanInFlightTargetGroupId, setScanInFlightTargetGroupId] = useState<
    string | null
  >(null);

  // ── Secondary dialogs ──────────────────────────────────────────────────────
  const [rescanConfirmDialogOpen, setRescanConfirmDialogOpenState] =
    useState(false);
  const [pendingRescanTargetGroupId, setPendingRescanTargetGroupId] =
    useState<string | null>(null);
  const [serviceScanDialogOpen, setServiceScanDialogOpenState] = useState(false);
  const [pendingServiceScanResolution, setPendingServiceScanResolution] =
    useState<ServiceScanResolution | null>(null);
  const [noPriceScanDialogOpen, setNoPriceScanDialogOpenState] =
    useState(false);
  const [pendingNoPriceScanResolution, setPendingNoPriceScanResolution] =
    useState<NoPriceScanResolution | null>(null);
  const [duplicateDialogOpen, setDuplicateDialogOpenState] = useState(false);
  const [pendingDuplicateResolution, setPendingDuplicateResolution] =
    useState<DuplicateScanResolution | null>(null);
  const [costDifferenceDialogOpen, setCostDifferenceDialogOpenState] =
    useState(false);
  const [pendingCostDifferences, setPendingCostDifferences] = useState<
    MaterialCostDifference[]
  >([]);

  // ── Albaran viewer ─────────────────────────────────────────────────────────
  const [albaranViewerOpen, setAlbaranViewerOpen] = useState(false);
  const [albaranViewerImageUris, setAlbaranViewerImageUris] = useState<
    string[]
  >([]);
  const [albaranViewerInitialIndex, setAlbaranViewerInitialIndex] = useState(0);
  const [albaranViewerTitle, setAlbaranViewerTitle] = useState(
    'Adjuntos del albaran',
  );

  // ── Stable setter wrappers ─────────────────────────────────────────────────
  const setScanReviewSupplier = useCallback((value: string) => {
    setScanReviewSupplierState(value);
  }, []);

  const setScanReviewInvoiceNumber = useCallback((value: string) => {
    setScanReviewInvoiceNumberState(value);
  }, []);

  const setScanReviewDocumentDate = useCallback((value: string) => {
    setScanReviewDocumentDateState(value);
  }, []);

  const setScanReviewServiceDescription = useCallback((value: string) => {
    setScanReviewServiceDescriptionState(value);
  }, []);

  const openAlbaranViewer = useCallback(
    (
      imageUris: string[],
      title = 'Adjuntos del albaran',
      initialIndex = 0,
    ) => {
      if (!Array.isArray(imageUris) || imageUris.length === 0) return;
      const sanitized = imageUris.filter(
        (uri) => typeof uri === 'string' && uri.trim().length > 0,
      );
      if (sanitized.length === 0) return;
      const safeIndex = Math.max(
        0,
        Math.min(initialIndex, sanitized.length - 1),
      );
      setAlbaranViewerImageUris(sanitized);
      setAlbaranViewerTitle(title);
      setAlbaranViewerInitialIndex(safeIndex);
      setAlbaranViewerOpen(true);
    },
    [],
  );

  const closeAlbaranViewer = useCallback(() => {
    setAlbaranViewerOpen(false);
  }, []);

  return {
    // review dialog state
    scanReviewDialogOpen,
    setScanReviewDialogOpenState,
    scanReviewReason,
    setScanReviewReason,
    scanReviewSupplierState,
    setScanReviewSupplierState,
    setScanReviewSupplier,
    scanReviewInvoiceNumberState,
    setScanReviewInvoiceNumberState,
    setScanReviewInvoiceNumber,
    scanReviewDocumentDateState,
    setScanReviewDocumentDateState,
    setScanReviewDocumentDate,
    scanReviewDocType,
    setScanReviewDocType,
    scanReviewDocSubtype,
    setScanReviewDocSubtype,
    scanReviewServiceDescriptionState,
    setScanReviewServiceDescriptionState,
    setScanReviewServiceDescription,
    scanReviewConfidence,
    setScanReviewConfidence,
    scanReviewWarnings,
    setScanReviewWarnings,
    scanReviewFieldConfidence,
    setScanReviewFieldConfidence,
    scanReviewFieldWarnings,
    setScanReviewFieldWarnings,
    scanReviewFieldMeta,
    setScanReviewFieldMeta,
    scanReviewTemplateData,
    setScanReviewTemplateData,
    scanReviewProfileUsed,
    setScanReviewProfileUsed,
    scanReviewScore,
    setScanReviewScore,
    scanReviewItems,
    setScanReviewItems,
    scanReviewServiceLines,
    setScanReviewServiceLines,
    scanReviewImageUris,
    setScanReviewImageUris,
    scanReviewRawText,
    setScanReviewRawText,
    scanReviewTargetGroupId,
    setScanReviewTargetGroupId,
    scanInFlightTargetGroupId,
    setScanInFlightTargetGroupId,
    // secondary dialog state
    rescanConfirmDialogOpen,
    setRescanConfirmDialogOpenState,
    pendingRescanTargetGroupId,
    setPendingRescanTargetGroupId,
    serviceScanDialogOpen,
    setServiceScanDialogOpenState,
    pendingServiceScanResolution,
    setPendingServiceScanResolution,
    noPriceScanDialogOpen,
    setNoPriceScanDialogOpenState,
    pendingNoPriceScanResolution,
    setPendingNoPriceScanResolution,
    duplicateDialogOpen,
    setDuplicateDialogOpenState,
    pendingDuplicateResolution,
    setPendingDuplicateResolution,
    costDifferenceDialogOpen,
    setCostDifferenceDialogOpenState,
    pendingCostDifferences,
    setPendingCostDifferences,
    // albaran viewer state
    albaranViewerOpen,
    setAlbaranViewerOpen,
    albaranViewerImageUris,
    setAlbaranViewerImageUris,
    albaranViewerInitialIndex,
    setAlbaranViewerInitialIndex,
    albaranViewerTitle,
    setAlbaranViewerTitle,
    // utility callbacks
    openAlbaranViewer,
    closeAlbaranViewer,
  };
};
