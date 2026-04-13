import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useAlbaranScanController } from '@/hooks/useAlbaranScanController';
import {
  normalizeDocType,
  type ParsedAlbaranItem,
  type ParsedAlbaranResult,
} from '@/plugins/albaranScanner';
import { toast } from '@/hooks/use-toast';
import {
  buildDeliveryNoteKey,
  createMaterialRow,
  createParsedAlbaranReviewItem,
  createServiceLine,
  extractNoPriceDescription,
  hasMaterialGroupSignificantData,
  hasNoPriceColumnsWarning,
  isMaterialRowBlank,
  nonNegative,
  normalizeMaterialUnitFromScan,
  normalizeServiceUnitFromScan,
  resolveScanImageUris,
  sanitizeText,
} from '@/components/work-report/helpers';
import type {
  MaterialCostDifference,
  MaterialGroup,
  MaterialRow,
  ServiceLine,
} from '@/components/work-report/types';
import {
  SERVICE_SCAN_SUBTYPES,
  buildMaterialRowFromParsedItem,
  buildServiceLinesFromParsedResult,
  buildParsedItemsFromServiceLines,
  isServiceLikeParsedResult,
  buildOthersRowFromParsedResult,
} from './scanParsingUtils';
import { useScanReviewState } from './useScanReviewState';

type UseWorkReportScanOrchestratorParams = {
  readOnly: boolean;
  materialGroups: MaterialGroup[];
  setMaterialGroups: Dispatch<SetStateAction<MaterialGroup[]>>;
  setOpenMaterialGroups: Dispatch<
    SetStateAction<Record<string, boolean>>
  >;
  setActiveMaterialGroupId: Dispatch<SetStateAction<string | null>>;
};

export const useWorkReportScanOrchestrator = ({
  readOnly,
  materialGroups,
  setMaterialGroups,
  setOpenMaterialGroups,
  setActiveMaterialGroupId,
}: UseWorkReportScanOrchestratorParams) => {
  const {
    startScan: startAlbaranScan,
    isProcessing: isAlbaranProcessing,
    error: albaranScanError,
    clearError: clearAlbaranScanError,
  } = useAlbaranScanController();

  const {
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
    albaranViewerOpen,
    albaranViewerImageUris,
    albaranViewerInitialIndex,
    albaranViewerTitle,
    openAlbaranViewer,
    closeAlbaranViewer,
  } = useScanReviewState();

  const applyParsedScanMetadataOnly = useCallback(
    (targetGroupId: string, parsed: ParsedAlbaranResult) => {
      const targetGroup = materialGroups.find((group) => group.id === targetGroupId);
      if (!targetGroup) {
        toast({
          title: 'Albaran no encontrado',
          description:
            'No se pudo aplicar el resultado del escaneo al albaran seleccionado.',
          variant: 'destructive',
        });
        return;
      }

      const supplier = sanitizeText(parsed.supplier);
      const invoiceNumber = sanitizeText(parsed.invoiceNumber);
      const docType =
        parsed.docType === 'MATERIALS_TABLE' ||
        parsed.docType === 'SERVICE_MACHINERY'
          ? parsed.docType
          : 'UNKNOWN';

      setMaterialGroups((current) =>
        current.map((group) =>
          group.id === targetGroupId
            ? {
                ...group,
                supplier: supplier || group.supplier,
                invoiceNumber: invoiceNumber || group.invoiceNumber,
                docType,
                isScanned: true,
                imageUris: resolveScanImageUris(group, parsed),
              }
            : group,
        ),
      );

      setOpenMaterialGroups((current) => ({ ...current, [targetGroupId]: true }));
      setActiveMaterialGroupId(targetGroupId);
      setPendingCostDifferences([]);
      setCostDifferenceDialogOpenState(false);

      toast({
        title: 'Documento aplicado sin lineas automaticas',
        description:
          'Se guardaron cabecera y adjuntos. Añade filas manuales si las necesitas.',
      });
    },
    [
      materialGroups,
      setActiveMaterialGroupId,
      setMaterialGroups,
      setOpenMaterialGroups,
    ],
  );

  const applyParsedServiceToGroup = useCallback(
    (targetGroupId: string, parsed: ParsedAlbaranResult) => {
      const targetGroup = materialGroups.find((group) => group.id === targetGroupId);
      if (!targetGroup) {
        toast({
          title: 'Albaran no encontrado',
          description:
            'No se pudo aplicar el resultado del escaneo al albaran seleccionado.',
          variant: 'destructive',
        });
        return;
      }

      const supplier = sanitizeText(parsed.supplier);
      const invoiceNumber = sanitizeText(parsed.invoiceNumber);
      const serviceLines = buildServiceLinesFromParsedResult(parsed);

      setMaterialGroups((current) =>
        current.map((group) =>
          group.id === targetGroupId
            ? {
                ...group,
                supplier: supplier || group.supplier,
                invoiceNumber: invoiceNumber || group.invoiceNumber,
                docType: 'SERVICE_MACHINERY',
                isScanned: true,
                imageUris: resolveScanImageUris(group, parsed),
                rows: [createMaterialRow()],
                serviceLines,
              }
            : group,
        ),
      );

      setOpenMaterialGroups((current) => ({ ...current, [targetGroupId]: true }));
      setActiveMaterialGroupId(targetGroupId);
      setPendingCostDifferences([]);
      setCostDifferenceDialogOpenState(false);

      const lineLabel = serviceLines.length === 1 ? 'fila' : 'filas';
      toast({
        title: 'Albaran de servicio procesado',
        description:
          serviceLines.length > 0
            ? `Se han cargado ${serviceLines.length} ${lineLabel} en el detalle de servicio.`
            : 'Se guardaron cabecera y adjuntos. Añade filas de servicio manualmente si las necesitas.',
      });
    },
    [
      materialGroups,
      setActiveMaterialGroupId,
      setMaterialGroups,
      setOpenMaterialGroups,
    ],
  );

  const applyNoPriceScanToMaterials = useCallback(
    (targetGroupId: string, parsed: ParsedAlbaranResult) => {
      const targetGroup = materialGroups.find((group) => group.id === targetGroupId);
      if (!targetGroup) {
        toast({
          title: 'Albaran no encontrado',
          description:
            'No se pudo aplicar el resultado del escaneo al albaran seleccionado.',
          variant: 'destructive',
        });
        return;
      }

      const supplier = sanitizeText(parsed.supplier);
      const invoiceNumber = sanitizeText(parsed.invoiceNumber);
      const otherRow = buildOthersRowFromParsedResult(parsed);

      setMaterialGroups((current) =>
        current.map((group) =>
          group.id === targetGroupId
            ? {
                ...group,
                supplier: supplier || group.supplier,
                invoiceNumber: invoiceNumber || group.invoiceNumber,
                docType: 'MATERIALS_TABLE',
                isScanned: true,
                imageUris: resolveScanImageUris(group, parsed),
                rows: [otherRow],
                serviceLines: [],
              }
            : group,
        ),
      );

      setOpenMaterialGroups((current) => ({ ...current, [targetGroupId]: true }));
      setActiveMaterialGroupId(targetGroupId);
      setPendingCostDifferences([]);
      setCostDifferenceDialogOpenState(false);

      toast({
        title: 'Albaran sin precios/importes',
        description:
          'Se creó una linea OTROS para mantener el adjunto sin imputación económica automática.',
      });
    },
    [
      materialGroups,
      setActiveMaterialGroupId,
      setMaterialGroups,
      setOpenMaterialGroups,
    ],
  );

  const applyParsedAlbaranToMaterials = useCallback(
    (targetGroupId: string, parsed: ParsedAlbaranResult) => {
      const targetGroup = materialGroups.find((group) => group.id === targetGroupId);
      if (!targetGroup) {
        toast({
          title: 'Albaran no encontrado',
          description:
            'No se pudo aplicar el resultado del escaneo al albaran seleccionado.',
          variant: 'destructive',
        });
        return;
      }

      const parsedRows = parsed.items
        .map(buildMaterialRowFromParsedItem)
        .filter((row) => !isMaterialRowBlank(row));

      if (!parsedRows.length) {
        toast({
          title: 'Sin lineas detectadas',
          description: 'No se han detectado materiales utiles en el albaran.',
        });
        return;
      }

      const supplier = sanitizeText(parsed.supplier);
      const invoiceNumber = sanitizeText(parsed.invoiceNumber);

      setMaterialGroups((current) =>
        current.map((group) =>
          group.id === targetGroupId
            ? {
                ...group,
                supplier: supplier || group.supplier,
                invoiceNumber: invoiceNumber || group.invoiceNumber,
                docType:
                  parsed.docType === 'SERVICE_MACHINERY'
                    ? 'SERVICE_MACHINERY'
                    : parsed.docType === 'MATERIALS_TABLE'
                      ? 'MATERIALS_TABLE'
                      : group.docType ?? 'MATERIALS_TABLE',
                isScanned: true,
                imageUris: resolveScanImageUris(group, parsed),
                rows: parsedRows,
                serviceLines: [],
              }
            : group,
        ),
      );

      const differences: MaterialCostDifference[] = parsedRows.flatMap((row) => {
        if (
          row.costWarningDelta === null ||
          row.costWarningDelta === undefined ||
          row.costDocValue === null ||
          row.costDocValue === undefined
        ) {
          return [];
        }

        return [
          {
            groupId: targetGroupId,
            rowId: row.id,
            material: row.name || 'Material',
            costDoc: row.costDocValue,
            costCalc: nonNegative(row.quantity) * nonNegative(row.unitPrice),
            difference: row.costWarningDelta,
          },
        ];
      });

      setOpenMaterialGroups((current) => ({ ...current, [targetGroupId]: true }));
      setActiveMaterialGroupId(targetGroupId);
      setPendingCostDifferences(differences);
      setCostDifferenceDialogOpenState(differences.length > 0);

      const rowLabel = parsedRows.length === 1 ? 'fila' : 'filas';
      toast({
        title: 'Albaran procesado',
        description: `Se han cargado ${parsedRows.length} ${rowLabel} en el albaran seleccionado.`,
      });
    },
    [
      materialGroups,
      setActiveMaterialGroupId,
      setMaterialGroups,
      setOpenMaterialGroups,
    ],
  );

  const openScanReview = useCallback(
    (parsed: ParsedAlbaranResult, targetGroupId: string) => {
      const serviceLike = isServiceLikeParsedResult(parsed);
      const normalizedDocType = normalizeDocType(parsed.docType);

      setScanReviewReason(
        parsed.reviewReason || 'No se detecto la tabla con suficiente precision.',
      );
      setScanReviewSupplierState(sanitizeText(parsed.supplier));
      setScanReviewInvoiceNumberState(sanitizeText(parsed.invoiceNumber));
      setScanReviewDocumentDateState(sanitizeText(parsed.documentDate));
      setScanReviewDocType(
        serviceLike ? 'SERVICE_MACHINERY' : normalizedDocType,
      );
      setScanReviewDocSubtype(parsed.docSubtype ?? null);
      setScanReviewServiceDescriptionState(
        sanitizeText(parsed.serviceDescription),
      );
      setScanReviewConfidence(parsed.confidence || 'medium');
      setScanReviewWarnings(parsed.warnings || []);
      setScanReviewFieldConfidence(parsed.fieldConfidence ?? null);
      setScanReviewFieldWarnings(parsed.fieldWarnings ?? null);
      setScanReviewFieldMeta(parsed.fieldMeta ?? null);
      setScanReviewTemplateData(parsed.templateData ?? null);
      setScanReviewProfileUsed(parsed.profileUsed || 'ORIGINAL');
      setScanReviewScore(
        typeof parsed.score === 'number' && Number.isFinite(parsed.score)
          ? parsed.score
          : 0,
      );
      setScanReviewItems(
        parsed.items.map((item) => ({
          ...item,
          material: sanitizeText(item.material),
          unit: item.unit ? sanitizeText(item.unit) : item.unit,
          rowText: sanitizeText(item.rowText),
        })),
      );
      setScanReviewServiceLines(buildServiceLinesFromParsedResult(parsed));
      setScanReviewImageUris(parsed.imageUris || []);
      setScanReviewRawText(sanitizeText(parsed.rawText));
      setScanReviewTargetGroupId(targetGroupId);
      setScanReviewDialogOpenState(true);
    },
    [],
  );

  const applyParsedScanResultToGroup = useCallback(
    (targetGroupId: string, parsed: ParsedAlbaranResult) => {
      if (isServiceLikeParsedResult(parsed)) {
        if (parsed.requiresReview || parsed.confidence === 'low') {
          openScanReview(parsed, targetGroupId);
          return;
        }
        applyParsedServiceToGroup(targetGroupId, parsed);
        return;
      }

      if (hasNoPriceColumnsWarning(parsed)) {
        if (parsed.items.length > 0) {
          applyParsedAlbaranToMaterials(targetGroupId, parsed);
          return;
        }
        applyParsedScanMetadataOnly(targetGroupId, parsed);
        return;
      }

      applyParsedAlbaranToMaterials(targetGroupId, parsed);
    },
    [
      applyParsedAlbaranToMaterials,
      applyParsedScanMetadataOnly,
      applyParsedServiceToGroup,
      openScanReview,
    ],
  );

  const resolveDuplicateForScan = useCallback(
    (targetGroupId: string, parsed: ParsedAlbaranResult) => {
      const parsedKey = buildDeliveryNoteKey(parsed.supplier, parsed.invoiceNumber);
      if (parsedKey) {
        const duplicateGroup = materialGroups.find((group) => {
          if (group.id === targetGroupId) return false;
          return (
            buildDeliveryNoteKey(group.supplier, group.invoiceNumber) === parsedKey
          );
        });

        if (duplicateGroup) {
          setPendingDuplicateResolution({
            parsed,
            targetGroupId,
            duplicateGroupId: duplicateGroup.id,
            duplicateLabel: `${duplicateGroup.supplier || 'Sin proveedor'} - ${duplicateGroup.invoiceNumber || 'Sin nº albarán'}`,
          });
          setDuplicateDialogOpenState(true);
          return;
        }
      }

      applyParsedScanResultToGroup(targetGroupId, parsed);
    },
    [applyParsedScanResultToGroup, materialGroups],
  );

  const executeScanForMaterialGroup = useCallback(
    async (targetGroupId: string) => {
      if (readOnly || isAlbaranProcessing) return;

      clearAlbaranScanError();
      setScanInFlightTargetGroupId(targetGroupId);

      try {
        const parsed = await startAlbaranScan();
        if (!parsed) return;

        if (isServiceLikeParsedResult(parsed)) {
          setPendingServiceScanResolution({ parsed, targetGroupId });
          setServiceScanDialogOpenState(true);
          return;
        }

        if (parsed.requiresReview || parsed.confidence === 'low') {
          openScanReview(parsed, targetGroupId);
          return;
        }

        if (hasNoPriceColumnsWarning(parsed)) {
          setPendingNoPriceScanResolution({ parsed, targetGroupId });
          setNoPriceScanDialogOpenState(true);
          return;
        }

        if (!parsed.items.length) {
          toast({
            title: 'Sin resultados',
            description: 'No se detectaron materiales en el albaran escaneado.',
          });
          return;
        }

        resolveDuplicateForScan(targetGroupId, parsed);
      } finally {
        setScanInFlightTargetGroupId(null);
      }
    },
    [
      clearAlbaranScanError,
      isAlbaranProcessing,
      openScanReview,
      readOnly,
      resolveDuplicateForScan,
      startAlbaranScan,
    ],
  );

  const handleScanMaterialsForGroup = useCallback(
    (targetGroupId: string) => {
      if (readOnly || isAlbaranProcessing) return;

      const targetGroup = materialGroups.find((group) => group.id === targetGroupId);
      if (!targetGroup) return;

      setActiveMaterialGroupId(targetGroupId);

      if (hasMaterialGroupSignificantData(targetGroup)) {
        setPendingRescanTargetGroupId(targetGroupId);
        setRescanConfirmDialogOpenState(true);
        return;
      }

      void executeScanForMaterialGroup(targetGroupId);
    },
    [
      executeScanForMaterialGroup,
      isAlbaranProcessing,
      materialGroups,
      readOnly,
      setActiveMaterialGroupId,
    ],
  );

  const continueRescanForMaterialGroup = useCallback(() => {
    const targetGroupId = pendingRescanTargetGroupId;
    setRescanConfirmDialogOpenState(false);
    setPendingRescanTargetGroupId(null);
    if (!targetGroupId) return;
    void executeScanForMaterialGroup(targetGroupId);
  }, [executeScanForMaterialGroup, pendingRescanTargetGroupId]);

  const cancelServiceScanResolution = useCallback(() => {
    setServiceScanDialogOpenState(false);
    setPendingServiceScanResolution(null);
  }, []);

  const confirmServiceScanResolution = useCallback(() => {
    const pending = pendingServiceScanResolution;
    if (!pending) return;
    setServiceScanDialogOpenState(false);
    setPendingServiceScanResolution(null);
    resolveDuplicateForScan(pending.targetGroupId, pending.parsed);
  }, [pendingServiceScanResolution, resolveDuplicateForScan]);

  const cancelNoPriceScanResolution = useCallback(() => {
    setNoPriceScanDialogOpenState(false);
    setPendingNoPriceScanResolution(null);
  }, []);

  const confirmNoPriceScanResolution = useCallback(() => {
    const pending = pendingNoPriceScanResolution;
    if (!pending) return;
    setNoPriceScanDialogOpenState(false);
    setPendingNoPriceScanResolution(null);
    resolveDuplicateForScan(pending.targetGroupId, pending.parsed);
  }, [pendingNoPriceScanResolution, resolveDuplicateForScan]);

  const updateScanReviewItem = useCallback(
    (index: number, patch: Partial<ParsedAlbaranItem>) => {
      const normalizedPatch: Partial<ParsedAlbaranItem> = {
        ...patch,
        material:
          patch.material === undefined ? undefined : sanitizeText(patch.material),
        unit:
          patch.unit === undefined
            ? undefined
            : patch.unit
              ? sanitizeText(patch.unit)
              : null,
      };

      setScanReviewItems((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                ...normalizedPatch,
              }
            : item,
        ),
      );
    },
    [],
  );

  const addScanReviewItem = useCallback(() => {
    setScanReviewItems((current) => [...current, createParsedAlbaranReviewItem()]);
  }, []);

  const updateScanReviewServiceLine = useCallback(
    (lineId: string, patch: Partial<ServiceLine>) => {
      setScanReviewServiceLines((current) =>
        current.map((line) => {
          if (line.id !== lineId) return line;
          return {
            ...line,
            ...patch,
            description:
              patch.description === undefined
                ? line.description
                : sanitizeText(patch.description),
            hours:
              patch.hours === undefined
                ? line.hours
                : typeof patch.hours === 'number' && Number.isFinite(patch.hours)
                  ? nonNegative(patch.hours)
                  : null,
            trips:
              patch.trips === undefined
                ? line.trips
                : typeof patch.trips === 'number' && Number.isFinite(patch.trips)
                  ? nonNegative(patch.trips)
                  : null,
            tons:
              patch.tons === undefined
                ? line.tons
                : typeof patch.tons === 'number' && Number.isFinite(patch.tons)
                  ? nonNegative(patch.tons)
                  : null,
            m3:
              patch.m3 === undefined
                ? line.m3
                : typeof patch.m3 === 'number' && Number.isFinite(patch.m3)
                  ? nonNegative(patch.m3)
                  : null,
          };
        }),
      );
    },
    [],
  );

  const addScanReviewServiceLine = useCallback(() => {
    setScanReviewServiceLines((current) => [...current, createServiceLine()]);
  }, []);

  const removeScanReviewServiceLine = useCallback((lineId: string) => {
    setScanReviewServiceLines((current) => {
      if (current.length <= 1) return current;
      return current.filter((line) => line.id !== lineId);
    });
  }, []);

  const createOtrosLineInScanReview = useCallback(() => {
    setScanReviewItems((current) => {
      const alreadyExists = current.some((item) =>
        item.material.trim().toUpperCase().startsWith('OTROS'),
      );
      if (alreadyExists) return current;

      const description = scanReviewServiceDescriptionState.trim();
      const material = description ? `OTROS - ${description}` : 'OTROS';
      return [
        ...current,
        {
          ...createParsedAlbaranReviewItem(),
          material,
          quantity: 1,
          unit: 'ud',
          rowText: material,
          missingCritical: false,
        },
      ];
    });
  }, [scanReviewServiceDescriptionState]);

  const applyScanReview = useCallback(() => {
    const normalizedServiceLines = scanReviewServiceLines
      .map((line) => ({
        ...line,
        description: sanitizeText(line.description),
        hours:
          typeof line.hours === 'number' && Number.isFinite(line.hours)
            ? nonNegative(line.hours)
            : null,
        trips:
          typeof line.trips === 'number' && Number.isFinite(line.trips)
            ? nonNegative(line.trips)
            : null,
        tons:
          typeof line.tons === 'number' && Number.isFinite(line.tons)
            ? nonNegative(line.tons)
            : null,
        m3:
          typeof line.m3 === 'number' && Number.isFinite(line.m3)
            ? nonNegative(line.m3)
            : null,
      }))
      .filter((line) => {
        const hasDescription = line.description.length > 0;
        const hasValues =
          nonNegative(line.hours ?? 0) > 0 ||
          nonNegative(line.trips ?? 0) > 0 ||
          nonNegative(line.tons ?? 0) > 0 ||
          nonNegative(line.m3 ?? 0) > 0;
        return hasDescription || hasValues;
      });

    const warningSet = new Set(scanReviewWarnings);
    const hasServiceWarning =
      warningSet.has('SERVICE_LAYOUT_HEADER') ||
      warningSet.has('SERVICE_MARKERS_DETECTED') ||
      warningSet.has('SERVICE_TABLE_DETECTED');
    const hasServiceSubtype = scanReviewDocSubtype
      ? SERVICE_SCAN_SUBTYPES.has(scanReviewDocSubtype)
      : false;
    const hasServiceUnitInReviewItems = scanReviewItems.some((item) => {
      const normalized = normalizeServiceUnitFromScan(item.unit);
      return (
        normalized === 'h' ||
        normalized === 'viaje' ||
        normalized === 't' ||
        normalized === 'm3'
      );
    });
    const isServiceReview =
      scanReviewDocType === 'SERVICE_MACHINERY' ||
      hasServiceWarning ||
      hasServiceSubtype ||
      hasServiceUnitInReviewItems ||
      normalizedServiceLines.length > 0 ||
      (sanitizeText(scanReviewServiceDescriptionState).length > 0 &&
        scanReviewDocType !== 'MATERIALS_TABLE');

    const reviewedItems = isServiceReview
      ? buildParsedItemsFromServiceLines(normalizedServiceLines)
      : scanReviewItems.map((item) => {
          const quantity =
            typeof item.quantity === 'number' && Number.isFinite(item.quantity)
              ? item.quantity
              : null;
          const unitPrice =
            typeof item.unitPrice === 'number' &&
            Number.isFinite(item.unitPrice)
              ? item.unitPrice
              : null;
          const costDoc =
            typeof item.costDoc === 'number' && Number.isFinite(item.costDoc)
              ? item.costDoc
              : null;
          const costCalc =
            quantity !== null && unitPrice !== null
              ? quantity * unitPrice
              : null;
          const difference =
            costDoc !== null && costCalc !== null
              ? Math.abs(costDoc - costCalc)
              : null;
          const normalizedUnit = item.unit
            ? normalizeMaterialUnitFromScan(item.unit)
            : '';

          return {
            ...item,
            material: sanitizeText(item.material),
            quantity,
            unitPrice,
            costDoc,
            costCalc,
            difference,
            unit: normalizedUnit || null,
            missingCritical:
              !sanitizeText(item.material) ||
              quantity === null ||
              !normalizedUnit,
          };
        });

    const reviewedResult: ParsedAlbaranResult = {
      supplier: sanitizeText(scanReviewSupplierState) || null,
      invoiceNumber: sanitizeText(scanReviewInvoiceNumberState) || null,
      documentDate: sanitizeText(scanReviewDocumentDateState) || null,
      docType: isServiceReview
        ? 'SERVICE_MACHINERY'
        : normalizeDocType(scanReviewDocType),
      docSubtype: scanReviewDocSubtype ?? null,
      serviceDescription:
        sanitizeText(scanReviewServiceDescriptionState) ||
        (isServiceReview ? normalizedServiceLines[0]?.description ?? null : null),
      confidence: 'medium',
      warnings: scanReviewWarnings,
      score: scanReviewScore,
      profileUsed: scanReviewProfileUsed,
      fieldConfidence: scanReviewFieldConfidence ?? undefined,
      fieldWarnings: scanReviewFieldWarnings ?? undefined,
      fieldMeta: scanReviewFieldMeta ?? null,
      templateData: scanReviewTemplateData ?? null,
      requiresReview: false,
      reviewReason: null,
      headerDetected: true,
      items: reviewedItems,
      imageUris: scanReviewImageUris,
      rawText: scanReviewRawText,
    };

    if (!scanReviewTargetGroupId) {
      setScanReviewDialogOpenState(false);
      setScanReviewServiceLines([]);
      return;
    }

    const targetGroupId = scanReviewTargetGroupId;
    setScanReviewTargetGroupId(null);
    setScanReviewDialogOpenState(false);
    setScanReviewServiceLines([]);
    resolveDuplicateForScan(targetGroupId, reviewedResult);
  }, [
    resolveDuplicateForScan,
    scanReviewDocumentDateState,
    scanReviewDocType,
    scanReviewDocSubtype,
    scanReviewFieldConfidence,
    scanReviewFieldMeta,
    scanReviewFieldWarnings,
    scanReviewImageUris,
    scanReviewInvoiceNumberState,
    scanReviewItems,
    scanReviewProfileUsed,
    scanReviewRawText,
    scanReviewScore,
    scanReviewServiceDescriptionState,
    scanReviewServiceLines,
    scanReviewSupplierState,
    scanReviewTargetGroupId,
    scanReviewTemplateData,
    scanReviewWarnings,
  ]);

  const applyDuplicateToTargetGroup = useCallback(() => {
    if (!pendingDuplicateResolution) return;
    const resolution = pendingDuplicateResolution;
    setDuplicateDialogOpenState(false);
    setPendingDuplicateResolution(null);
    applyParsedScanResultToGroup(resolution.targetGroupId, resolution.parsed);
  }, [applyParsedScanResultToGroup, pendingDuplicateResolution]);

  const overwriteExistingDuplicateGroup = useCallback(() => {
    if (!pendingDuplicateResolution) return;
    const resolution = pendingDuplicateResolution;
    setDuplicateDialogOpenState(false);
    setPendingDuplicateResolution(null);
    applyParsedScanResultToGroup(resolution.duplicateGroupId, resolution.parsed);
  }, [applyParsedScanResultToGroup, pendingDuplicateResolution]);

  const cancelDuplicateResolution = useCallback(() => {
    setDuplicateDialogOpenState(false);
    setPendingDuplicateResolution(null);
  }, []);

  const openCostDifferenceDialogForRow = useCallback(
    (groupId: string, row: MaterialRow) => {
      if (row.costDocValue === null || row.costDocValue === undefined) return;
      if (row.costWarningDelta === null || row.costWarningDelta === undefined) {
        return;
      }

      setPendingCostDifferences([
        {
          groupId,
          rowId: row.id,
          material: row.name || 'Material',
          costDoc: row.costDocValue,
          costCalc: nonNegative(row.quantity) * nonNegative(row.unitPrice),
          difference: row.costWarningDelta,
        },
      ]);
      setCostDifferenceDialogOpenState(true);
    },
    [],
  );

  const keepDocumentCostDifferences = useCallback(() => {
    setCostDifferenceDialogOpenState(false);
    setPendingCostDifferences([]);
  }, []);

  const overwriteCostDifferencesWithCalculated = useCallback(() => {
    if (pendingCostDifferences.length === 0) {
      setCostDifferenceDialogOpenState(false);
      return;
    }

    const rowsByGroup = pendingCostDifferences.reduce<Record<string, Set<string>>>(
      (acc, diff) => {
        if (!acc[diff.groupId]) acc[diff.groupId] = new Set<string>();
        acc[diff.groupId].add(diff.rowId);
        return acc;
      },
      {},
    );

    setMaterialGroups((current) =>
      current.map((group) => {
        const rowIds = rowsByGroup[group.id];
        if (!rowIds) return group;

        return {
          ...group,
          rows: group.rows.map((row) => {
            if (!rowIds.has(row.id)) return row;
            const recalculated =
              nonNegative(row.quantity) * nonNegative(row.unitPrice);
            return {
              ...row,
              total: recalculated,
              costWarningDelta: null,
            };
          }),
        };
      }),
    );

    setCostDifferenceDialogOpenState(false);
    setPendingCostDifferences([]);
  }, [pendingCostDifferences, setMaterialGroups]);

  const handleScanReviewDialogOpenChange = useCallback((open: boolean) => {
    setScanReviewDialogOpenState(open);
    if (!open) {
      setScanReviewTargetGroupId(null);
      setScanReviewServiceLines([]);
    }
  }, []);

  const cancelScanReview = useCallback(() => {
    setScanReviewDialogOpenState(false);
    setScanReviewTargetGroupId(null);
    setScanReviewServiceLines([]);
  }, []);

  const handleServiceScanDialogOpenChange = useCallback((open: boolean) => {
    setServiceScanDialogOpenState(open);
    if (!open) {
      setPendingServiceScanResolution(null);
    }
  }, []);

  const pendingNoPriceDescription = pendingNoPriceScanResolution
    ? extractNoPriceDescription(pendingNoPriceScanResolution.parsed) || 'OTROS'
    : 'OTROS';

  const handleNoPriceScanDialogOpenChange = useCallback((open: boolean) => {
    setNoPriceScanDialogOpenState(open);
    if (!open) {
      setPendingNoPriceScanResolution(null);
    }
  }, []);

  const handleRescanConfirmDialogOpenChange = useCallback((open: boolean) => {
    setRescanConfirmDialogOpenState(open);
    if (!open) {
      setPendingRescanTargetGroupId(null);
    }
  }, []);

  const cancelRescanForMaterialGroup = useCallback(() => {
    setRescanConfirmDialogOpenState(false);
    setPendingRescanTargetGroupId(null);
  }, []);

  const handleDuplicateDialogOpenChange = useCallback((open: boolean) => {
    setDuplicateDialogOpenState(open);
    if (!open) {
      setPendingDuplicateResolution(null);
    }
  }, []);

  const handleCostDifferenceDialogOpenChange = useCallback((open: boolean) => {
    setCostDifferenceDialogOpenState(open);
    if (!open) {
      setPendingCostDifferences([]);
    }
  }, []);

  return {
    isAlbaranProcessing,
    albaranScanError,
    scanReviewDialogOpen,
    scanReviewReason,
    scanReviewSupplier: scanReviewSupplierState,
    setScanReviewSupplier,
    scanReviewInvoiceNumber: scanReviewInvoiceNumberState,
    setScanReviewInvoiceNumber,
    scanReviewDocumentDate: scanReviewDocumentDateState,
    setScanReviewDocumentDate,
    scanReviewDocType,
    scanReviewDocSubtype,
    scanReviewServiceDescription: scanReviewServiceDescriptionState,
    setScanReviewServiceDescription,
    scanReviewConfidence,
    scanReviewWarnings,
    scanReviewFieldConfidence,
    scanReviewFieldWarnings,
    scanReviewFieldMeta,
    scanReviewTemplateData,
    scanReviewProfileUsed,
    scanReviewScore,
    scanReviewItems,
    scanReviewServiceLines,
    scanReviewImageUris,
    scanInFlightTargetGroupId,
    serviceScanDialogOpen,
    pendingServiceScanResolution,
    noPriceScanDialogOpen,
    pendingNoPriceScanResolution,
    pendingNoPriceDescription,
    rescanConfirmDialogOpen,
    duplicateDialogOpen,
    pendingDuplicateResolution,
    albaranViewerOpen,
    albaranViewerImageUris,
    albaranViewerInitialIndex,
    albaranViewerTitle,
    costDifferenceDialogOpen,
    pendingCostDifferences,
    openAlbaranViewer,
    closeAlbaranViewer,
    handleScanMaterialsForGroup,
    updateScanReviewItem,
    addScanReviewItem,
    updateScanReviewServiceLine,
    addScanReviewServiceLine,
    removeScanReviewServiceLine,
    createOtrosLineInScanReview,
    applyScanReview,
    handleScanReviewDialogOpenChange,
    cancelScanReview,
    handleServiceScanDialogOpenChange,
    cancelServiceScanResolution,
    confirmServiceScanResolution,
    handleNoPriceScanDialogOpenChange,
    cancelNoPriceScanResolution,
    confirmNoPriceScanResolution,
    handleRescanConfirmDialogOpenChange,
    cancelRescanForMaterialGroup,
    continueRescanForMaterialGroup,
    handleDuplicateDialogOpenChange,
    applyDuplicateToTargetGroup,
    overwriteExistingDuplicateGroup,
    cancelDuplicateResolution,
    openCostDifferenceDialogForRow,
    handleCostDifferenceDialogOpenChange,
    keepDocumentCostDifferences,
    overwriteCostDifferencesWithCalculated,
  };
};
