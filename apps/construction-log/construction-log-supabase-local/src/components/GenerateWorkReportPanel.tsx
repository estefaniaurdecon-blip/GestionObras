import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Accordion } from '@/components/ui/accordion';
import { normalizeNoteCategory, type NoteCategory } from '@/components/ObservacionesIncidenciasSection';
import { useObservacionesDictation } from '@/hooks/useObservacionesDictation';
import { useAlbaranScanController } from '@/hooks/useAlbaranScanController';
import {
  improveScanWithOllama,
  isOllamaScanEnabled,
  shouldOfferOllamaImprove,
  type OllamaScanItem,
} from '@/api/ollamaAlbaran';
import {
  type ParsedAlbaranItem,
  type ParsedAlbaranResult,
  type ParsedFieldConfidence,
  type ParsedFieldWarnings,
} from '@/plugins/albaranScanner';
import { Capacitor } from '@capacitor/core';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  filterActiveMachines,
  getRentalMachinesByWorksite,
  normalizeDate,
  type RentalMachine,
  type RentalMachinesResult,
} from '@/services/rentalMachinerySource';
import type { WorkReport } from '@/types/workReport';
import { AlbaranDocumentViewerModal } from '@/components/work-report/shared/AlbaranDocumentViewerModal';
import { WorkReportHeaderCard } from '@/components/work-report/shared/WorkReportHeaderCard';
import { ForemanResourcesCard } from '@/components/work-report/shared/ForemanResourcesCard';
import { AutoCloneSettingsCard } from '@/components/work-report/shared/AutoCloneSettingsCard';
import { SignaturesCard } from '@/components/work-report/shared/SignaturesCard';
import { SaveActionsBar } from '@/components/work-report/shared/SaveActionsBar';
import { WorkforceSection } from '@/components/work-report/sections/WorkforceSection';
import { MachinerySection } from '@/components/work-report/sections/MachinerySection';
import { MaterialsSection } from '@/components/work-report/sections/MaterialsSection';
import { SubcontractsSection } from '@/components/work-report/sections/SubcontractsSection';
import { RentalSection } from '@/components/work-report/sections/RentalSection';
import { WasteSection } from '@/components/work-report/sections/WasteSection';
import { ObservationsSection } from '@/components/work-report/sections/ObservationsSection';
import { GallerySection } from '@/components/work-report/sections/GallerySection';
import { ScanReviewDialog } from '@/components/work-report/dialogs/ScanReviewDialog';
import { ServiceScanDialog } from '@/components/work-report/dialogs/ServiceScanDialog';
import { NoPriceScanDialog } from '@/components/work-report/dialogs/NoPriceScanDialog';
import { RescanConfirmDialog } from '@/components/work-report/dialogs/RescanConfirmDialog';
import { DuplicateDialog } from '@/components/work-report/dialogs/DuplicateDialog';
import { CostDifferenceDialog } from '@/components/work-report/dialogs/CostDifferenceDialog';
import { SaveStatusDialog } from '@/components/work-report/dialogs/SaveStatusDialog';
import {
  ALL_SECTION_IDS,
  COST_DIFF_THRESHOLD,
  MATERIAL_UNIT_OPTIONS,
  SUBCONTRACT_UNIT_OPTIONS,
  buildDeliveryNoteKey,
  computeGroupTotals,
  computeRowTotals,
  createForemanResource,
  createMaterialGroup,
  createMaterialRow,
  createParsedAlbaranReviewItem,
  createServiceLine,
  createRow,
  createSubcontractAssignedWorker,
  createSubcontractGroup,
  createSubcontractRow,
  createSubcontractedMachineryGroup,
  createSubcontractedMachineryRow,
  createWorkforceGroup,
  createWorkforceRow,
  editableNumericValue,
  extractNoPriceDescription,
  hasMaterialGroupSignificantData,
  hasNoPriceColumnsWarning,
  isMaterialRowBlank,
  mapForemanRoleForReport,
  mapRentalMachinesToLegacyRows,
  mapSubcontractGroupsToLegacyRows,
  mapSubcontractUnitToReportUnit,
  migrateLegacyMaterialRows,
  migrateLegacySubcontractRows,
  migrateLegacySubcontractedMachineryRows,
  nonNegative,
  nonNegativeInt,
  normalizeMaterialGroups,
  normalizeMaterialUnitFromScan,
  normalizeServiceUnitFromScan,
  normalizeSubcontractGroups,
  normalizeSubcontractUnit,
  normalizeSubcontractedMachineryGroups,
  parseDateInputValue,
  parseNumeric,
  resolveScanImageUris,
  sanitizeText,
  todayDate,
  unitLabel,
} from '@/components/work-report/helpers';
import type {
  EditableRow,
  ForemanResource,
  GalleryImage,
  GenerateWorkReportDraft,
  MaterialCostDifference,
  MaterialGroup,
  MaterialRow,
  NoPriceScanResolution,
  SaveStatusOption,
  ServiceLine,
  ServiceScanResolution,
  SubcontractAssignedWorker,
  SubcontractGroup,
  SubcontractGroupTotals,
  SubcontractRow,
  SubcontractRowTotals,
  SubcontractUnit,
  SubcontractedMachineryGroup,
  SubcontractedMachineryRow,
  WorkforceGroup,
  WorkforceRow,
  DuplicateScanResolution,
} from '@/components/work-report/types';

export type { GenerateWorkReportDraft } from '@/components/work-report/types';

interface GenerateWorkReportPanelProps {
  onBack: () => void;
  onSave: (draft: GenerateWorkReportDraft) => Promise<void> | void;
  initialDate?: string;
  initialDraft?: GenerateWorkReportDraft | null;
  readOnly?: boolean;
  reportIdentifier?: string | null;
  saving?: boolean;
  works?: Array<{ id: string; number?: string | null; name?: string | null }>;
}

export const GenerateWorkReportPanel = ({
  onBack,
  onSave,
  initialDate,
  initialDraft,
  readOnly = false,
  reportIdentifier,
  saving = false,
  works = [],
}: GenerateWorkReportPanelProps) => {
  const [workNumber, setWorkNumber] = useState('');
  const [workName, setWorkName] = useState('');
  const [date, setDate] = useState(initialDate || todayDate());
  const [workDatePickerOpen, setWorkDatePickerOpen] = useState(false);

  const [openSections, setOpenSections] = useState<string[]>([]);

  const [workforceSectionCompleted, setWorkforceSectionCompleted] = useState(false);
  const [workforceGroups, setWorkforceGroups] = useState<WorkforceGroup[]>([createWorkforceGroup()]);
  const [subcontractedMachineryGroups, setSubcontractedMachineryGroups] = useState<SubcontractedMachineryGroup[]>([
    createSubcontractedMachineryGroup(),
  ]);
  const [materialGroups, setMaterialGroups] = useState<MaterialGroup[]>([createMaterialGroup()]);
  const [openMaterialGroups, setOpenMaterialGroups] = useState<Record<string, boolean>>({});
  const [activeMaterialGroupId, setActiveMaterialGroupId] = useState<string | null>(null);
  const [subcontractGroups, setSubcontractGroups] = useState<SubcontractGroup[]>([createSubcontractGroup()]);
  const [openSubcontractWorkers, setOpenSubcontractWorkers] = useState<Record<string, boolean>>({});
  const [rentalMachines, setRentalMachines] = useState<RentalMachine[]>([]);
  const [rentalLoading, setRentalLoading] = useState(false);
  const [rentalError, setRentalError] = useState<string | null>(null);
  const [wasteRows, setWasteRows] = useState<EditableRow[]>([createRow('kg')]);

  const [observationsCompleted, setObservationsCompleted] = useState(false);
  const [observationsCategory, setObservationsCategory] = useState<NoteCategory>(null);
  const [observationsText, setObservationsText] = useState('');

  const appendObservacionesText = useCallback((recognizedText: string) => {
    const normalized = recognizedText.trim();
    if (!normalized) return;

    setObservationsText((previous) => {
      const currentText = previous || '';
      if (!currentText) return normalized;
      const needsSpace = !/\s$/.test(currentText);
      return `${currentText}${needsSpace ? ' ' : ''}${normalized}`;
    });
  }, []);

  const {
    start: startObservacionesDictation,
    stop: stopObservacionesDictation,
    isListening: observacionesDictationActive,
    interimText: observacionesInterimText,
    error: observacionesDictationError,
  } = useObservacionesDictation({
    onFinal: appendObservacionesText,
    language: 'es-ES',
  });

  useEffect(() => {
    if (!readOnly || !observacionesDictationActive) return;
    void stopObservacionesDictation();
  }, [observacionesDictationActive, readOnly, stopObservacionesDictation]);

  const {
    startScan: startAlbaranScan,
    isProcessing: isAlbaranProcessing,
    error: albaranScanError,
    clearError: clearAlbaranScanError,
  } = useAlbaranScanController();

  const [scanReviewDialogOpen, setScanReviewDialogOpen] = useState(false);
  const [scanReviewReason, setScanReviewReason] = useState<string | null>(null);
  const [scanReviewSupplier, setScanReviewSupplier] = useState('');
  const [scanReviewInvoiceNumber, setScanReviewInvoiceNumber] = useState('');
  const [scanReviewDocumentDate, setScanReviewDocumentDate] = useState('');
  const [scanReviewDocType, setScanReviewDocType] = useState<ParsedAlbaranResult['docType']>('UNKNOWN');
  const [scanReviewDocSubtype, setScanReviewDocSubtype] = useState<ParsedAlbaranResult['docSubtype']>(null);
  const [scanReviewServiceDescription, setScanReviewServiceDescription] = useState('');
  const [scanReviewConfidence, setScanReviewConfidence] = useState<ParsedAlbaranResult['confidence']>('medium');
  const [scanReviewWarnings, setScanReviewWarnings] = useState<string[]>([]);
  const [scanReviewFieldConfidence, setScanReviewFieldConfidence] = useState<ParsedFieldConfidence | null>(null);
  const [scanReviewFieldWarnings, setScanReviewFieldWarnings] = useState<ParsedFieldWarnings | null>(null);
  const [scanReviewFieldMeta, setScanReviewFieldMeta] = useState<ParsedAlbaranResult['fieldMeta']>(null);
  const [scanReviewTemplateData, setScanReviewTemplateData] = useState<ParsedAlbaranResult['templateData']>(null);
  const [scanReviewProfileUsed, setScanReviewProfileUsed] = useState<ParsedAlbaranResult['profileUsed']>('ORIGINAL');
  const [scanReviewScore, setScanReviewScore] = useState(0);
  const [scanReviewItems, setScanReviewItems] = useState<ParsedAlbaranItem[]>([]);
  const [scanReviewServiceLines, setScanReviewServiceLines] = useState<ServiceLine[]>([]);
  const [scanReviewImageUris, setScanReviewImageUris] = useState<string[]>([]);
  const [scanReviewRawText, setScanReviewRawText] = useState('');
  const [scanReviewTargetGroupId, setScanReviewTargetGroupId] = useState<string | null>(null);
  const [scanReviewOllamaLoading, setScanReviewOllamaLoading] = useState(false);
  const [scanReviewOllamaError, setScanReviewOllamaError] = useState<string | null>(null);
  const [scanReviewOllamaProposal, setScanReviewOllamaProposal] = useState<ParsedAlbaranResult | null>(null);
  const [scanInFlightTargetGroupId, setScanInFlightTargetGroupId] = useState<string | null>(null);
  const [rescanConfirmDialogOpen, setRescanConfirmDialogOpen] = useState(false);
  const [pendingRescanTargetGroupId, setPendingRescanTargetGroupId] = useState<string | null>(null);
  const [serviceScanDialogOpen, setServiceScanDialogOpen] = useState(false);
  const [pendingServiceScanResolution, setPendingServiceScanResolution] = useState<ServiceScanResolution | null>(null);
  const [noPriceScanDialogOpen, setNoPriceScanDialogOpen] = useState(false);
  const [pendingNoPriceScanResolution, setPendingNoPriceScanResolution] = useState<NoPriceScanResolution | null>(null);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [pendingDuplicateResolution, setPendingDuplicateResolution] = useState<DuplicateScanResolution | null>(null);
  const [albaranViewerOpen, setAlbaranViewerOpen] = useState(false);
  const [albaranViewerImageUris, setAlbaranViewerImageUris] = useState<string[]>([]);
  const [albaranViewerInitialIndex, setAlbaranViewerInitialIndex] = useState(0);
  const [albaranViewerTitle, setAlbaranViewerTitle] = useState('Adjuntos del albaran');

  const [costDifferenceDialogOpen, setCostDifferenceDialogOpen] = useState(false);
  const [pendingCostDifferences, setPendingCostDifferences] = useState<MaterialCostDifference[]>([]);

  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);

  const [foremanResources, setForemanResources] = useState<ForemanResource[]>([createForemanResource()]);
  const [mainForeman, setMainForeman] = useState('');
  const [mainForemanHours, setMainForemanHours] = useState(0);
  const [siteManager, setSiteManager] = useState('');

  const [autoCloneNextDay, setAutoCloneNextDay] = useState(false);
  const [foremanSignature, setForemanSignature] = useState('');
  const [siteManagerSignature, setSiteManagerSignature] = useState('');
  const [saveStatusDialogOpen, setSaveStatusDialogOpen] = useState(false);
  const [saveStatusSelection, setSaveStatusSelection] = useState<SaveStatusOption[]>(['completed']);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const ollamaFeatureEnabled = useMemo(() => isOllamaScanEnabled(), []);
  const isAndroidPlatform = useMemo(() => Capacitor.getPlatform() === 'android', []);
  const androidTypographyClass = isAndroidPlatform
    ? [
        '[&]:text-[16px]',
        '[&_.text-xs]:text-[14px]',
        '[&_.text-sm]:text-[16px]',
        '[&_.text-base]:text-[18px]',
        '[&_.text-lg]:text-[21px]',
        '[&_.text-xl]:text-[23px]',
        '[&_label]:text-[16px]',
        '[&_input]:text-[16px]',
        '[&_textarea]:text-[16px]',
        '[&_[role=combobox]]:text-[16px]',
        '[&_button]:text-[16px]',
      ].join(' ')
    : '';
  const sectionTriggerClass = isAndroidPlatform
    ? 'text-[19px] leading-tight font-semibold [&>svg]:h-5 [&>svg]:w-5'
    : 'text-[15px] sm:text-base font-semibold';

  const totalWorkforceHours = useMemo(
    () =>
      workforceGroups.reduce(
        (groupSum, group) => groupSum + group.rows.reduce((rowSum, row) => rowSum + row.hours, 0),
        0,
      ),
    [workforceGroups],
  );

  const totalForemanResourceHours = useMemo(
    () => foremanResources.reduce((sum, resource) => sum + nonNegative(resource.hours), 0),
    [foremanResources],
  );

  const totalForemanSectionHours = useMemo(
    () => totalForemanResourceHours + nonNegative(mainForemanHours),
    [mainForemanHours, totalForemanResourceHours],
  );

  const subcontractComputedGroups = useMemo(
    () =>
      subcontractGroups.map((group) => ({
        groupId: group.id,
        totals: computeGroupTotals(group),
      })),
    [subcontractGroups],
  );

  const subcontractTotalsByGroupId = useMemo(
    () =>
      Object.fromEntries(
        subcontractComputedGroups.map(({ groupId, totals }) => [groupId, totals]),
      ) as Record<string, SubcontractGroupTotals>,
    [subcontractComputedGroups],
  );

  const normalizedPartDate = useMemo(() => normalizeDate(date || todayDate()), [date]);
  const selectedWorkDate = useMemo(() => parseDateInputValue(date), [date]);

  const matchedWorkByInput = useMemo(() => {
    if (works.length === 0) return null;
    const normalizedNumber = workNumber.trim().toLowerCase();
    const normalizedName = workName.trim().toLowerCase();

    if (normalizedNumber) {
      const byNumber = works.find(
        (work) => (work.number || '').trim().toLowerCase() === normalizedNumber,
      );
      if (byNumber) return byNumber;
    }

    if (normalizedName) {
      const byName = works.find(
        (work) => (work.name || '').trim().toLowerCase() === normalizedName,
      );
      if (byName) return byName;
    }

    return null;
  }, [works, workNumber, workName]);

  const selectedWorkId = useMemo(
    () => matchedWorkByInput?.id ?? initialDraft?.workId ?? null,
    [matchedWorkByInput, initialDraft?.workId],
  );

  const activeRentalMachines = useMemo(
    () => (selectedWorkId ? filterActiveMachines(rentalMachines, selectedWorkId, normalizedPartDate) : []),
    [rentalMachines, selectedWorkId, normalizedPartDate],
  );

  const isClonedReport = useMemo(
    () =>
      Boolean(
        initialDraft?.cloneRequiresReview ||
        initialDraft?.cloneSourceReportId ||
        initialDraft?.cloneSourceReportIdentifier ||
        initialDraft?.cloneCreatedAt ||
        initialDraft?.cloneSourceWorkName,
      ),
    [
      initialDraft?.cloneCreatedAt,
      initialDraft?.cloneRequiresReview,
      initialDraft?.cloneSourceReportId,
      initialDraft?.cloneSourceReportIdentifier,
      initialDraft?.cloneSourceWorkName,
    ],
  );

  const cloneSourceLabel = useMemo(
    () =>
      initialDraft?.cloneSourceReportIdentifier ||
      initialDraft?.cloneSourceWorkName ||
      initialDraft?.cloneSourceReportId ||
      null,
    [
      initialDraft?.cloneSourceReportId,
      initialDraft?.cloneSourceReportIdentifier,
      initialDraft?.cloneSourceWorkName,
    ],
  );

  const rentalResult = useMemo<RentalMachinesResult>(
    () => ({
      obraId: selectedWorkId || '',
      fechaParte: normalizedPartDate,
      items: activeRentalMachines,
    }),
    [selectedWorkId, normalizedPartDate, activeRentalMachines],
  );

  useEffect(() => {
    if (readOnly) {
      setOpenSections(ALL_SECTION_IDS);
      return;
    }
    setOpenSections([]);
  }, [readOnly]);

  useEffect(() => {
    if (initialDraft) {
      const nextMachineryGroups = initialDraft.subcontractedMachineryGroups?.length
        ? normalizeSubcontractedMachineryGroups(initialDraft.subcontractedMachineryGroups)
        : migrateLegacySubcontractedMachineryRows(initialDraft.subcontractedMachineryRows);
      const nextMaterialGroups = initialDraft.materialGroups?.length
        ? normalizeMaterialGroups(initialDraft.materialGroups)
        : migrateLegacyMaterialRows(initialDraft.materialRows);
      const nextSubcontractGroups = initialDraft.subcontractGroups?.length
        ? normalizeSubcontractGroups(initialDraft.subcontractGroups)
        : migrateLegacySubcontractRows(initialDraft.subcontractRows);

      setWorkNumber(initialDraft.workNumber ?? '');
      setWorkName(initialDraft.workName ?? '');
      setDate(initialDraft.date || initialDate || todayDate());
      setWorkforceSectionCompleted(Boolean(initialDraft.workforceSectionCompleted));
      setWorkforceGroups(initialDraft.workforceGroups?.length ? initialDraft.workforceGroups : [createWorkforceGroup()]);
      setSubcontractedMachineryGroups(nextMachineryGroups);
      setMaterialGroups(nextMaterialGroups);
      setOpenMaterialGroups(
        Object.fromEntries(nextMaterialGroups.map((group) => [group.id, true])),
      );
      setActiveMaterialGroupId(nextMaterialGroups[0]?.id ?? null);
      setSubcontractGroups(nextSubcontractGroups);
      setOpenSubcontractWorkers({});
      setRentalMachines([]);
      setRentalError(null);
      setWasteRows(initialDraft.wasteRows?.length ? initialDraft.wasteRows : [createRow('kg')]);
      setObservationsCompleted(Boolean(initialDraft.observationsCompleted));
      setObservationsCategory(normalizeNoteCategory(initialDraft.observationsCategory));
      setObservationsText(initialDraft.observationsText || '');
      setGalleryImages(initialDraft.galleryImages ?? []);
      setForemanResources(initialDraft.foremanResources?.length ? initialDraft.foremanResources : [createForemanResource()]);
      setMainForeman(initialDraft.mainForeman || '');
      setMainForemanHours(initialDraft.mainForemanHours ?? 0);
      setSiteManager(initialDraft.siteManager || '');
      setAutoCloneNextDay(Boolean(initialDraft.autoCloneNextDay));
      setForemanSignature(initialDraft.foremanSignature || '');
      setSiteManagerSignature(initialDraft.siteManagerSignature || '');
      const initialStatus = initialDraft.workReportStatus ?? (initialDraft.isClosed ? 'completed' : undefined);
      const nextStatusSelection: SaveStatusOption[] = [];
      if (initialStatus === 'completed') {
        nextStatusSelection.push('completed');
      } else {
        if (initialStatus === 'missing_data') nextStatusSelection.push('missing_data');
        if (initialStatus === 'missing_delivery_notes' || Boolean(initialDraft.missingDeliveryNotes)) {
          nextStatusSelection.push('missing_delivery_notes');
        }
      }
      if (nextStatusSelection.length === 0) {
        nextStatusSelection.push('completed');
      }
      setSaveStatusSelection(nextStatusSelection);
      return;
    }

    setWorkNumber('');
    setWorkName('');
    setDate(initialDate || todayDate());
    setWorkforceSectionCompleted(false);
    setWorkforceGroups([createWorkforceGroup()]);
    const defaultMachineryGroup = createSubcontractedMachineryGroup();
    const defaultMaterialGroup = createMaterialGroup();
    const defaultSubcontractGroup = createSubcontractGroup();
    setSubcontractedMachineryGroups([defaultMachineryGroup]);
    setMaterialGroups([defaultMaterialGroup]);
    setOpenMaterialGroups({ [defaultMaterialGroup.id]: true });
    setActiveMaterialGroupId(defaultMaterialGroup.id);
    setSubcontractGroups([defaultSubcontractGroup]);
    setOpenSubcontractWorkers({});
    setRentalMachines([]);
    setRentalError(null);
    setWasteRows([createRow('kg')]);
    setObservationsCompleted(false);
    setObservationsCategory(null);
    setObservationsText('');
    setGalleryImages([]);
    setForemanResources([createForemanResource()]);
    setMainForeman('');
    setMainForemanHours(0);
    setSiteManager('');
    setAutoCloneNextDay(false);
    setForemanSignature('');
    setSiteManagerSignature('');
    setSaveStatusSelection(['completed']);
  }, [initialDate, initialDraft]);

  useEffect(() => {
    setActiveMaterialGroupId((current) => {
      if (materialGroups.length === 0) return null;
      if (current && materialGroups.some((group) => group.id === current)) return current;
      return materialGroups[materialGroups.length - 1]?.id ?? materialGroups[0].id;
    });
  }, [materialGroups]);

  useEffect(() => {
    let cancelled = false;

    const loadRentalMachines = async () => {
      if (!selectedWorkId) {
        if (!cancelled) {
          setRentalMachines([]);
          setRentalError(null);
          setRentalLoading(false);
        }
        return;
      }

      setRentalLoading(true);
      setRentalError(null);

      try {
        const machines = await getRentalMachinesByWorksite(selectedWorkId);
        if (cancelled) return;
        setRentalMachines(machines);
      } catch (error) {
        if (cancelled) return;
        console.error('[RentalMachinery] Error loading rental machinery:', error);
        setRentalMachines([]);
        setRentalError('No se pudo cargar la maquinaria de alquiler.');
      } finally {
        if (!cancelled) {
          setRentalLoading(false);
        }
      }
    };

    void loadRentalMachines();

    return () => {
      cancelled = true;
    };
  }, [selectedWorkId, normalizedPartDate]);

  const completedSections = useMemo(() => {
    const count = [
      workforceSectionCompleted,
      subcontractedMachineryGroups.some((group) => group.rows.length > 0),
      materialGroups.some((group) => group.rows.length > 0),
      subcontractGroups.some((group) => group.rows.length > 0),
      selectedWorkId !== null,
      wasteRows.length > 0,
      observationsCompleted,
    ].filter(Boolean).length;
    return `${count}/7`;
  }, [
    materialGroups,
    observationsCompleted,
    selectedWorkId,
    subcontractGroups,
    subcontractedMachineryGroups,
    wasteRows.length,
    workforceSectionCompleted,
  ]);

  const saveStatusSummaryLabel = useMemo(() => {
    if (saveStatusSelection.includes('completed')) return 'Completado';
    const parts: string[] = [];
    if (saveStatusSelection.includes('missing_data')) parts.push('Faltan datos');
    if (saveStatusSelection.includes('missing_delivery_notes')) parts.push('Faltan albaranes');
    return parts.join(' + ');
  }, [saveStatusSelection]);

  const panelTitle = readOnly ? 'Parte (solo lectura)' : initialDraft ? 'Editar Parte' : 'Nuevo Parte';

  const handleGalleryUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        setGalleryImages((current) => [...current, { id: crypto.randomUUID(), name: file.name, dataUrl: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  };

  const updateWorkforceGroup = (groupId: string, patch: Partial<WorkforceGroup>) => {
    setWorkforceGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    );
  };

  const updateWorkforceRow = (groupId: string, rowId: string, patch: Partial<WorkforceRow>) => {
    setWorkforceGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const rows = group.rows.map((row) => {
          if (row.id !== rowId) return row;
          const nextHours = patch.hours ?? row.hours;
          return {
            ...row,
            ...patch,
            hours: nextHours,
            total: nextHours,
          };
        });
        return { ...group, rows };
      }),
    );
  };

  const addWorkforceGroup = () => {
    setWorkforceGroups((current) => [...current, createWorkforceGroup()]);
  };

  const removeWorkforceGroup = (groupId: string) => {
    setWorkforceGroups((current) => (current.length > 1 ? current.filter((group) => group.id !== groupId) : current));
  };

  const addWorkforceRow = (groupId: string) => {
    setWorkforceGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, rows: [...group.rows, createWorkforceRow()] } : group)),
    );
  };

  const removeWorkforceRow = (groupId: string, rowId: string) => {
    setWorkforceGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        if (group.rows.length === 1) return group;
        return { ...group, rows: group.rows.filter((row) => row.id !== rowId) };
      }),
    );
  };

  const updateSubcontractedMachineryGroup = (groupId: string, patch: Partial<SubcontractedMachineryGroup>) => {
    setSubcontractedMachineryGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    );
  };

  const updateSubcontractedMachineryRow = (
    groupId: string,
    rowId: string,
    patch: Partial<SubcontractedMachineryRow>,
  ) => {
    setSubcontractedMachineryGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const rows = group.rows.map((row) => {
          if (row.id !== rowId) return row;
          const nextHours = patch.hours ?? row.hours;
          const nextTotal = patch.total ?? nextHours;
          return {
            ...row,
            ...patch,
            hours: nextHours,
            total: nextTotal,
          };
        });
        return { ...group, rows };
      }),
    );
  };

  const addSubcontractedMachineryGroup = () => {
    setSubcontractedMachineryGroups((current) => [...current, createSubcontractedMachineryGroup()]);
  };

  const removeSubcontractedMachineryGroup = (groupId: string) => {
    setSubcontractedMachineryGroups((current) =>
      current.length === 1 ? current : current.filter((group) => group.id !== groupId),
    );
  };

  const addSubcontractedMachineryRow = (groupId: string) => {
    setSubcontractedMachineryGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, rows: [...group.rows, createSubcontractedMachineryRow()] } : group,
      ),
    );
  };

  const removeSubcontractedMachineryRow = (groupId: string, rowId: string) => {
    setSubcontractedMachineryGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        if (group.rows.length === 1) return group;
        return { ...group, rows: group.rows.filter((row) => row.id !== rowId) };
      }),
    );
  };

  const handleSubcontractedMachineryUpload = (groupId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      updateSubcontractedMachineryGroup(groupId, { documentImage: reader.result });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const scrollToMaterialGroup = useCallback((groupId: string) => {
    if (typeof document === 'undefined') return;
    window.setTimeout(() => {
      document.getElementById(`material-group-${groupId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 90);
  }, []);

  const openAlbaranViewer = useCallback((imageUris: string[], title = 'Adjuntos del albaran', initialIndex = 0) => {
    if (!Array.isArray(imageUris) || imageUris.length === 0) return;
    const sanitized = imageUris.filter((uri) => typeof uri === 'string' && uri.trim().length > 0);
    if (sanitized.length === 0) return;
    const safeIndex = Math.max(0, Math.min(initialIndex, sanitized.length - 1));
    setAlbaranViewerImageUris(sanitized);
    setAlbaranViewerTitle(title);
    setAlbaranViewerInitialIndex(safeIndex);
    setAlbaranViewerOpen(true);
  }, []);

  const closeAlbaranViewer = useCallback(() => {
    setAlbaranViewerOpen(false);
  }, []);

  const buildMaterialRowFromParsedItem = useCallback((item: ParsedAlbaranItem): MaterialRow => {
    const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? nonNegative(item.quantity) : 0;
    const unitPrice = typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) ? nonNegative(item.unitPrice) : 0;
    const costCalc = quantity * unitPrice;
    const costDoc = typeof item.costDoc === 'number' && Number.isFinite(item.costDoc) ? nonNegative(item.costDoc) : null;
    const difference = costDoc !== null ? Math.abs(costDoc - costCalc) : null;

    return {
      ...createMaterialRow(),
      name: sanitizeText(item.material),
      quantity,
      unit: normalizeMaterialUnitFromScan(item.unit),
      unitPrice,
      total: costDoc ?? costCalc,
      costDocValue: costDoc,
      costWarningDelta: difference !== null && difference > COST_DIFF_THRESHOLD ? difference : null,
    };
  }, []);

  const buildServiceLinesFromParsedResult = useCallback((parsed: ParsedAlbaranResult): ServiceLine[] => {
    const grouped = new Map<string, ServiceLine>();

    parsed.items.forEach((item, index) => {
      const description = sanitizeText(item.material);
      const quantity =
        typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? nonNegative(item.quantity) : null;
      const hintedText = sanitizeText(`${item.unit ?? ''} ${item.rowText ?? ''} ${description}`).toLowerCase();
      let unit = normalizeServiceUnitFromScan(item.unit);
      if (!unit) {
        if (hintedText.includes('hora') || /\bh\b/.test(hintedText)) unit = 'h';
        else if (hintedText.includes('viaj')) unit = 'viaje';
        else if (hintedText.includes('tonel') || /\btn\b/.test(hintedText) || /\bt\b/.test(hintedText)) unit = 't';
        else if (hintedText.includes('m3') || hintedText.includes('m³')) unit = 'm3';
      }

      if (!description && quantity === null && !unit) return;

      const key = description ? description.toLowerCase() : `__empty_${index}`;
      const current = grouped.get(key) ?? {
        ...createServiceLine(),
        description,
      };

      if (quantity !== null && unit) {
        if (unit === 'h') current.hours = nonNegative(current.hours ?? 0) + quantity;
        if (unit === 'viaje') current.trips = nonNegative(current.trips ?? 0) + quantity;
        if (unit === 't') current.tons = nonNegative(current.tons ?? 0) + quantity;
        if (unit === 'm3') current.m3 = nonNegative(current.m3 ?? 0) + quantity;
      }

      grouped.set(key, current);
    });

    const lines = Array.from(grouped.values()).filter((line) => {
      const hasDescription = sanitizeText(line.description).length > 0;
      const hasValues =
        nonNegative(line.hours ?? 0) > 0 ||
        nonNegative(line.trips ?? 0) > 0 ||
        nonNegative(line.tons ?? 0) > 0 ||
        nonNegative(line.m3 ?? 0) > 0;
      return hasDescription || hasValues;
    });

    if (lines.length > 0) return lines;

    const fallbackDescription = sanitizeText(parsed.serviceDescription);
    if (!fallbackDescription) return [];

    return [
      {
        ...createServiceLine(),
        description: fallbackDescription,
      },
    ];
  }, []);

  const buildParsedItemsFromServiceLines = useCallback((lines: ServiceLine[]): ParsedAlbaranItem[] => {
    const items: ParsedAlbaranItem[] = [];

    lines.forEach((line) => {
      const description = sanitizeText(line.description);
      const quantities: Array<{ unit: 'h' | 'viaje' | 't' | 'm3'; value: number | null | undefined }> = [
        { unit: 'h', value: line.hours },
        { unit: 'viaje', value: line.trips },
        { unit: 't', value: line.tons },
        { unit: 'm3', value: line.m3 },
      ];

      let hasMetric = false;
      quantities.forEach(({ unit, value }) => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return;
        hasMetric = true;
        items.push({
          ...createParsedAlbaranReviewItem(),
          material: description,
          quantity: nonNegative(value),
          unit,
          unitPrice: null,
          costDoc: null,
          costCalc: null,
          difference: null,
          rowText: 'SERVICE_LINE',
          missingCritical: false,
        });
      });

      if (!hasMetric && description) {
        items.push({
          ...createParsedAlbaranReviewItem(),
          material: description,
          quantity: null,
          unit: null,
          unitPrice: null,
          costDoc: null,
          costCalc: null,
          difference: null,
          rowText: 'SERVICE_LINE',
          missingCritical: false,
        });
      }
    });

    return items;
  }, []);

  const buildOthersRowFromParsedResult = useCallback((parsed: ParsedAlbaranResult): MaterialRow => {
    const description = extractNoPriceDescription(parsed);
    const materialName = description ? `OTROS - ${description}` : 'OTROS';

    return {
      ...createMaterialRow(),
      name: materialName,
      quantity: 1,
      unit: 'ud',
      unitPrice: 0,
      total: 0,
      costDocValue: null,
      costWarningDelta: null,
    };
  }, []);

  const applyParsedScanMetadataOnly = useCallback(
    (targetGroupId: string, parsed: ParsedAlbaranResult) => {
      const targetGroup = materialGroups.find((group) => group.id === targetGroupId);
      if (!targetGroup) {
        toast({
          title: 'Albaran no encontrado',
          description: 'No se pudo aplicar el resultado del escaneo al albaran seleccionado.',
          variant: 'destructive',
        });
        return;
      }

      const supplier = sanitizeText(parsed.supplier);
      const invoiceNumber = sanitizeText(parsed.invoiceNumber);
      const docType = parsed.docType === 'MATERIALS_TABLE' || parsed.docType === 'SERVICE_MACHINERY' ? parsed.docType : 'UNKNOWN';

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
      setCostDifferenceDialogOpen(false);

      toast({
        title: 'Documento aplicado sin líneas automáticas',
        description: 'Se guardaron cabecera y adjuntos. Añade filas manuales si las necesitas.',
      });
    },
    [materialGroups],
  );

  const applyParsedServiceToGroup = useCallback(
    (targetGroupId: string, parsed: ParsedAlbaranResult) => {
      const targetGroup = materialGroups.find((group) => group.id === targetGroupId);
      if (!targetGroup) {
        toast({
          title: 'Albaran no encontrado',
          description: 'No se pudo aplicar el resultado del escaneo al albaran seleccionado.',
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
      setCostDifferenceDialogOpen(false);

      const lineLabel = serviceLines.length === 1 ? 'fila' : 'filas';
      toast({
        title: 'Albaran de servicio procesado',
        description:
          serviceLines.length > 0
            ? `Se han cargado ${serviceLines.length} ${lineLabel} en el detalle de servicio.`
            : 'Se guardaron cabecera y adjuntos. Añade filas de servicio manualmente si las necesitas.',
      });
    },
    [buildServiceLinesFromParsedResult, materialGroups],
  );

  const applyNoPriceScanToMaterials = useCallback(
    (targetGroupId: string, parsed: ParsedAlbaranResult) => {
      const targetGroup = materialGroups.find((group) => group.id === targetGroupId);
      if (!targetGroup) {
        toast({
          title: 'Albaran no encontrado',
          description: 'No se pudo aplicar el resultado del escaneo al albaran seleccionado.',
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
      setCostDifferenceDialogOpen(false);

      toast({
        title: 'Albaran sin precios/importes',
        description: 'Se creó una línea OTROS para mantener el adjunto sin imputación económica automática.',
      });
    },
    [buildOthersRowFromParsedResult, materialGroups],
  );

  const applyParsedAlbaranToMaterials = useCallback(
    (targetGroupId: string, parsed: ParsedAlbaranResult) => {
      const targetGroup = materialGroups.find((group) => group.id === targetGroupId);
      if (!targetGroup) {
        toast({
          title: 'Albaran no encontrado',
          description: 'No se pudo aplicar el resultado del escaneo al albaran seleccionado.',
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
                docType: parsed.docType === 'MATERIALS_TABLE' ? 'MATERIALS_TABLE' : group.docType ?? 'MATERIALS_TABLE',
                isScanned: true,
                imageUris: resolveScanImageUris(group, parsed),
                rows: parsedRows,
                serviceLines: [],
              }
            : group,
        ),
      );

      const differences: MaterialCostDifference[] = parsedRows.flatMap((row) => {
        if (row.costWarningDelta === null || row.costWarningDelta === undefined || row.costDocValue === null || row.costDocValue === undefined) {
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
      setCostDifferenceDialogOpen(differences.length > 0);

      const rowLabel = parsedRows.length === 1 ? 'fila' : 'filas';
      toast({
        title: 'Albaran procesado',
        description: `Se han cargado ${parsedRows.length} ${rowLabel} en el albaran seleccionado.`,
      });
    },
    [buildMaterialRowFromParsedItem, materialGroups],
  );

  const openScanReview = useCallback((parsed: ParsedAlbaranResult, targetGroupId: string) => {
    setScanReviewReason(parsed.reviewReason || 'No se detecto la tabla con suficiente precision.');
    setScanReviewSupplier(sanitizeText(parsed.supplier));
    setScanReviewInvoiceNumber(sanitizeText(parsed.invoiceNumber));
    setScanReviewDocumentDate(sanitizeText(parsed.documentDate));
    setScanReviewDocType(parsed.docType || 'UNKNOWN');
    setScanReviewDocSubtype(parsed.docSubtype ?? null);
    setScanReviewServiceDescription(sanitizeText(parsed.serviceDescription));
    setScanReviewConfidence(parsed.confidence || 'medium');
    setScanReviewWarnings(parsed.warnings || []);
    setScanReviewFieldConfidence(parsed.fieldConfidence ?? null);
    setScanReviewFieldWarnings(parsed.fieldWarnings ?? null);
    setScanReviewFieldMeta(parsed.fieldMeta ?? null);
    setScanReviewTemplateData(parsed.templateData ?? null);
    setScanReviewProfileUsed(parsed.profileUsed || 'ORIGINAL');
    setScanReviewScore(typeof parsed.score === 'number' && Number.isFinite(parsed.score) ? parsed.score : 0);
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
    setScanReviewOllamaLoading(false);
    setScanReviewOllamaError(null);
    setScanReviewOllamaProposal(null);
    setScanReviewDialogOpen(true);
  }, [buildServiceLinesFromParsedResult]);

  const applyParsedScanResultToGroup = useCallback(
    (targetGroupId: string, parsed: ParsedAlbaranResult) => {
      if (parsed.docType === 'SERVICE_MACHINERY') {
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
    [applyParsedAlbaranToMaterials, applyParsedScanMetadataOnly, applyParsedServiceToGroup, openScanReview],
  );

  const resolveDuplicateForScan = useCallback(
    (targetGroupId: string, parsed: ParsedAlbaranResult) => {
      const parsedKey = buildDeliveryNoteKey(parsed.supplier, parsed.invoiceNumber);
      if (parsedKey) {
        const duplicateGroup = materialGroups.find((group) => {
          if (group.id === targetGroupId) return false;
          return buildDeliveryNoteKey(group.supplier, group.invoiceNumber) === parsedKey;
        });

        if (duplicateGroup) {
          setPendingDuplicateResolution({
            parsed,
            targetGroupId,
            duplicateGroupId: duplicateGroup.id,
            duplicateLabel: `${duplicateGroup.supplier || 'Sin proveedor'} - ${duplicateGroup.invoiceNumber || 'Sin nº albarán'}`,
          });
          setDuplicateDialogOpen(true);
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

        if (parsed.docType === 'SERVICE_MACHINERY') {
          setPendingServiceScanResolution({ parsed, targetGroupId });
          setServiceScanDialogOpen(true);
          return;
        }

        if (parsed.requiresReview || parsed.confidence === 'low') {
          openScanReview(parsed, targetGroupId);
          return;
        }

        if (hasNoPriceColumnsWarning(parsed)) {
          setPendingNoPriceScanResolution({ parsed, targetGroupId });
          setNoPriceScanDialogOpen(true);
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
        setRescanConfirmDialogOpen(true);
        return;
      }

      void executeScanForMaterialGroup(targetGroupId);
    },
    [executeScanForMaterialGroup, isAlbaranProcessing, materialGroups, readOnly],
  );

  const continueRescanForMaterialGroup = useCallback(() => {
    const targetGroupId = pendingRescanTargetGroupId;
    setRescanConfirmDialogOpen(false);
    setPendingRescanTargetGroupId(null);
    if (!targetGroupId) return;
    void executeScanForMaterialGroup(targetGroupId);
  }, [executeScanForMaterialGroup, pendingRescanTargetGroupId]);

  const cancelServiceScanResolution = useCallback(() => {
    setServiceScanDialogOpen(false);
    setPendingServiceScanResolution(null);
  }, []);

  const confirmServiceScanResolution = useCallback(() => {
    const pending = pendingServiceScanResolution;
    if (!pending) return;
    setServiceScanDialogOpen(false);
    setPendingServiceScanResolution(null);
    resolveDuplicateForScan(pending.targetGroupId, pending.parsed);
  }, [pendingServiceScanResolution, resolveDuplicateForScan]);

  const cancelNoPriceScanResolution = useCallback(() => {
    setNoPriceScanDialogOpen(false);
    setPendingNoPriceScanResolution(null);
  }, []);

  const confirmNoPriceScanResolution = useCallback(() => {
    const pending = pendingNoPriceScanResolution;
    if (!pending) return;
    setNoPriceScanDialogOpen(false);
    setPendingNoPriceScanResolution(null);
    resolveDuplicateForScan(pending.targetGroupId, pending.parsed);
  }, [pendingNoPriceScanResolution, resolveDuplicateForScan]);

  const updateScanReviewItem = useCallback((index: number, patch: Partial<ParsedAlbaranItem>) => {
    const normalizedPatch: Partial<ParsedAlbaranItem> = {
      ...patch,
      material: patch.material === undefined ? undefined : sanitizeText(patch.material),
      unit: patch.unit === undefined ? undefined : patch.unit ? sanitizeText(patch.unit) : null,
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
  }, []);

  const addScanReviewItem = useCallback(() => {
    setScanReviewItems((current) => [...current, createParsedAlbaranReviewItem()]);
  }, []);

  const updateScanReviewServiceLine = useCallback((lineId: string, patch: Partial<ServiceLine>) => {
    setScanReviewServiceLines((current) =>
      current.map((line) => {
        if (line.id !== lineId) return line;
        return {
          ...line,
          ...patch,
          description:
            patch.description === undefined ? line.description : sanitizeText(patch.description),
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
  }, []);

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
      const alreadyExists = current.some((item) => item.material.trim().toUpperCase().startsWith('OTROS'));
      if (alreadyExists) return current;
      const description = scanReviewServiceDescription.trim();
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
  }, [scanReviewServiceDescription]);

  const canImproveReviewWithOllama = useMemo(() => {
    if (!ollamaFeatureEnabled) return false;
    return shouldOfferOllamaImprove({
      confidence: scanReviewConfidence,
      docType: scanReviewDocType,
      warnings: scanReviewWarnings,
    });
  }, [ollamaFeatureEnabled, scanReviewConfidence, scanReviewDocType, scanReviewWarnings]);

  const mapOllamaItemToParsedItem = useCallback((item: OllamaScanItem): ParsedAlbaranItem => {
    const quantity =
      typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? nonNegative(item.quantity) : null;
    const unitPrice =
      typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) ? nonNegative(item.unitPrice) : null;
    const costDoc = typeof item.total === 'number' && Number.isFinite(item.total) ? nonNegative(item.total) : null;
    const costCalc = quantity !== null && unitPrice !== null ? quantity * unitPrice : null;
    const difference = costDoc !== null && costCalc !== null ? Math.abs(costDoc - costCalc) : null;
    const unit = item.unit ? normalizeMaterialUnitFromScan(item.unit) || sanitizeText(item.unit) : null;

    return {
      material: sanitizeText(item.name),
      quantity,
      unit,
      unitPrice,
      costDoc,
      costCalc,
      difference,
      rowText: 'OLLAMA',
      missingCritical: !(item.name || '').trim(),
    };
  }, []);

  const improveScanReviewWithOllama = useCallback(async () => {
    if (!canImproveReviewWithOllama || scanReviewOllamaLoading) return;

    setScanReviewOllamaLoading(true);
    setScanReviewOllamaError(null);
    setScanReviewOllamaProposal(null);

    try {
      const response = await improveScanWithOllama({
        imageUris: scanReviewImageUris,
        offlineResult: {
          supplier: scanReviewSupplier || null,
          invoiceNumber: scanReviewInvoiceNumber || null,
          documentDate: scanReviewDocumentDate || null,
          docType: scanReviewDocType,
          docSubtype: scanReviewDocSubtype ?? null,
          serviceDescription: scanReviewServiceDescription || null,
          confidence: scanReviewConfidence,
          warnings: scanReviewWarnings,
          profileUsed: scanReviewProfileUsed,
          score: scanReviewScore,
          fieldMeta: scanReviewFieldMeta ?? null,
          templateData: scanReviewTemplateData ?? null,
          items: scanReviewItems,
          imageUris: scanReviewImageUris,
          rawText: scanReviewRawText,
        },
      });

      const proposalItems = response.items.map(mapOllamaItemToParsedItem);
      const serviceDescription =
        response.docType === 'SERVICE_MACHINERY' && proposalItems.length > 0
          ? proposalItems[0].material
          : scanReviewServiceDescription;

      const proposal: ParsedAlbaranResult = {
        supplier: response.supplier,
        invoiceNumber: response.invoiceNumber,
        documentDate: response.documentDate,
        docType: response.docType,
        docSubtype: null,
        serviceDescription: serviceDescription || null,
        confidence: response.confidence,
        warnings: response.warnings,
        score: scanReviewScore,
        profileUsed: scanReviewProfileUsed,
        fieldConfidence: undefined,
        fieldWarnings: undefined,
        fieldMeta: null,
        templateData: null,
        requiresReview: true,
        reviewReason: 'Propuesta generada por IA (Ollama). Revisa y confirma antes de aplicar.',
        headerDetected: true,
        items: proposalItems,
        imageUris: scanReviewImageUris,
        rawText: scanReviewRawText,
      };

      setScanReviewOllamaProposal(proposal);
      toast({
        title: 'Propuesta IA disponible',
        description: 'Revisa la propuesta de Ollama y decide si aplicarla.',
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'No se pudo mejorar el escaneo con IA en este momento.';
      setScanReviewOllamaError(message);
      toast({
        title: 'No se pudo mejorar con IA',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setScanReviewOllamaLoading(false);
    }
  }, [
    canImproveReviewWithOllama,
    mapOllamaItemToParsedItem,
    scanReviewConfidence,
    scanReviewDocType,
    scanReviewDocSubtype,
    scanReviewDocumentDate,
    scanReviewFieldMeta,
    scanReviewImageUris,
    scanReviewInvoiceNumber,
    scanReviewItems,
    scanReviewOllamaLoading,
    scanReviewProfileUsed,
    scanReviewRawText,
    scanReviewScore,
    scanReviewServiceDescription,
    scanReviewSupplier,
    scanReviewTemplateData,
    scanReviewWarnings,
  ]);

  const applyOllamaProposalToReview = useCallback(() => {
    if (!scanReviewOllamaProposal) return;
    setScanReviewSupplier(sanitizeText(scanReviewOllamaProposal.supplier));
    setScanReviewInvoiceNumber(sanitizeText(scanReviewOllamaProposal.invoiceNumber));
    setScanReviewDocumentDate(sanitizeText(scanReviewOllamaProposal.documentDate));
    setScanReviewDocType(scanReviewOllamaProposal.docType || 'UNKNOWN');
    setScanReviewDocSubtype(scanReviewOllamaProposal.docSubtype ?? null);
    setScanReviewServiceDescription(sanitizeText(scanReviewOllamaProposal.serviceDescription));
    setScanReviewConfidence(scanReviewOllamaProposal.confidence || 'medium');
    setScanReviewWarnings(scanReviewOllamaProposal.warnings || []);
    setScanReviewItems(
      scanReviewOllamaProposal.items.map((item) => ({
        ...item,
        material: sanitizeText(item.material),
        unit: item.unit ? sanitizeText(item.unit) : item.unit,
        rowText: sanitizeText(item.rowText),
      })),
    );
    setScanReviewServiceLines(buildServiceLinesFromParsedResult(scanReviewOllamaProposal));
    setScanReviewReason(scanReviewOllamaProposal.reviewReason || null);
    setScanReviewFieldConfidence(null);
    setScanReviewFieldWarnings(null);
    setScanReviewFieldMeta(scanReviewOllamaProposal.fieldMeta ?? null);
    setScanReviewTemplateData(scanReviewOllamaProposal.templateData ?? null);
    setScanReviewOllamaError(null);
    setScanReviewOllamaProposal(null);
  }, [buildServiceLinesFromParsedResult, scanReviewOllamaProposal]);

  const keepOfflineScanReview = useCallback(() => {
    setScanReviewOllamaProposal(null);
    setScanReviewOllamaError(null);
  }, []);

  const applyScanReview = useCallback(() => {
    const normalizedServiceLines = scanReviewServiceLines
      .map((line) => ({
        ...line,
        description: sanitizeText(line.description),
        hours:
          typeof line.hours === 'number' && Number.isFinite(line.hours) ? nonNegative(line.hours) : null,
        trips:
          typeof line.trips === 'number' && Number.isFinite(line.trips) ? nonNegative(line.trips) : null,
        tons:
          typeof line.tons === 'number' && Number.isFinite(line.tons) ? nonNegative(line.tons) : null,
        m3: typeof line.m3 === 'number' && Number.isFinite(line.m3) ? nonNegative(line.m3) : null,
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

    const reviewedItems =
      scanReviewDocType === 'SERVICE_MACHINERY'
        ? buildParsedItemsFromServiceLines(normalizedServiceLines)
        : scanReviewItems.map((item) => {
            const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : null;
            const unitPrice = typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) ? item.unitPrice : null;
            const costDoc = typeof item.costDoc === 'number' && Number.isFinite(item.costDoc) ? item.costDoc : null;
            const costCalc = quantity !== null && unitPrice !== null ? quantity * unitPrice : null;
            const difference = costDoc !== null && costCalc !== null ? Math.abs(costDoc - costCalc) : null;
            const normalizedUnit = item.unit ? normalizeMaterialUnitFromScan(item.unit) : '';

            return {
              ...item,
              material: sanitizeText(item.material),
              quantity,
              unitPrice,
              costDoc,
              costCalc,
              difference,
              unit: normalizedUnit || null,
              missingCritical: !sanitizeText(item.material) || quantity === null || !normalizedUnit,
            };
          });

    const reviewedResult: ParsedAlbaranResult = {
      supplier: sanitizeText(scanReviewSupplier) || null,
      invoiceNumber: sanitizeText(scanReviewInvoiceNumber) || null,
      documentDate: sanitizeText(scanReviewDocumentDate) || null,
      docType: scanReviewDocType,
      docSubtype: scanReviewDocSubtype ?? null,
      serviceDescription:
        sanitizeText(scanReviewServiceDescription) ||
        (scanReviewDocType === 'SERVICE_MACHINERY' ? normalizedServiceLines[0]?.description ?? null : null),
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
      setScanReviewDialogOpen(false);
      setScanReviewOllamaProposal(null);
      setScanReviewOllamaError(null);
      setScanReviewServiceLines([]);
      return;
    }

    const targetGroupId = scanReviewTargetGroupId;
    setScanReviewTargetGroupId(null);
    setScanReviewDialogOpen(false);
    setScanReviewOllamaProposal(null);
    setScanReviewOllamaError(null);
    setScanReviewServiceLines([]);
    resolveDuplicateForScan(targetGroupId, reviewedResult);
  }, [
    buildParsedItemsFromServiceLines,
    resolveDuplicateForScan,
    scanReviewDocumentDate,
    scanReviewDocType,
    scanReviewDocSubtype,
    scanReviewFieldConfidence,
    scanReviewFieldMeta,
    scanReviewFieldWarnings,
    scanReviewInvoiceNumber,
    scanReviewItems,
    scanReviewImageUris,
    scanReviewProfileUsed,
    scanReviewRawText,
    scanReviewScore,
    scanReviewServiceLines,
    scanReviewServiceDescription,
    scanReviewSupplier,
    scanReviewTemplateData,
    scanReviewTargetGroupId,
    scanReviewWarnings,
  ]);

  const applyDuplicateToTargetGroup = useCallback(() => {
    if (!pendingDuplicateResolution) return;
    const resolution = pendingDuplicateResolution;
    setDuplicateDialogOpen(false);
    setPendingDuplicateResolution(null);
    applyParsedScanResultToGroup(resolution.targetGroupId, resolution.parsed);
  }, [applyParsedScanResultToGroup, pendingDuplicateResolution]);

  const overwriteExistingDuplicateGroup = useCallback(() => {
    if (!pendingDuplicateResolution) return;
    const resolution = pendingDuplicateResolution;
    setDuplicateDialogOpen(false);
    setPendingDuplicateResolution(null);
    applyParsedScanResultToGroup(resolution.duplicateGroupId, resolution.parsed);
  }, [applyParsedScanResultToGroup, pendingDuplicateResolution]);

  const cancelDuplicateResolution = useCallback(() => {
    setDuplicateDialogOpen(false);
    setPendingDuplicateResolution(null);
  }, []);

  const openCostDifferenceDialogForRow = useCallback((groupId: string, row: MaterialRow) => {
    if (row.costDocValue === null || row.costDocValue === undefined) return;
    if (row.costWarningDelta === null || row.costWarningDelta === undefined) return;

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
    setCostDifferenceDialogOpen(true);
  }, []);

  const keepDocumentCostDifferences = useCallback(() => {
    setCostDifferenceDialogOpen(false);
    setPendingCostDifferences([]);
  }, []);

  const overwriteCostDifferencesWithCalculated = useCallback(() => {
    if (pendingCostDifferences.length === 0) {
      setCostDifferenceDialogOpen(false);
      return;
    }

    const rowsByGroup = pendingCostDifferences.reduce<Record<string, Set<string>>>((acc, diff) => {
      if (!acc[diff.groupId]) acc[diff.groupId] = new Set<string>();
      acc[diff.groupId].add(diff.rowId);
      return acc;
    }, {});

    setMaterialGroups((current) =>
      current.map((group) => {
        const rowIds = rowsByGroup[group.id];
        if (!rowIds) return group;

        return {
          ...group,
          rows: group.rows.map((row) => {
            if (!rowIds.has(row.id)) return row;
            const recalculated = nonNegative(row.quantity) * nonNegative(row.unitPrice);
            return {
              ...row,
              total: recalculated,
              costWarningDelta: null,
            };
          }),
        };
      }),
    );

    setCostDifferenceDialogOpen(false);
    setPendingCostDifferences([]);
  }, [pendingCostDifferences]);

  const updateMaterialGroup = (groupId: string, patch: Partial<MaterialGroup>) => {
    const normalizedPatch: Partial<MaterialGroup> = {
      ...patch,
    };
    if (patch.supplier !== undefined) {
      normalizedPatch.supplier = sanitizeText(patch.supplier);
    }
    if (patch.invoiceNumber !== undefined) {
      normalizedPatch.invoiceNumber = sanitizeText(patch.invoiceNumber);
    }
    setMaterialGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, ...normalizedPatch } : group)),
    );
  };

  const updateMaterialRow = (groupId: string, rowId: string, patch: Partial<MaterialRow>) => {
    setMaterialGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const rows = group.rows.map((row) => {
          if (row.id !== rowId) return row;
          const nextQuantity = patch.quantity ?? row.quantity;
          const nextUnitPrice = patch.unitPrice ?? row.unitPrice;
          const nextTotal = typeof patch.total === 'number' ? patch.total : nextQuantity * nextUnitPrice;
          const hasCostInputsChanged = patch.quantity !== undefined || patch.unitPrice !== undefined;
          return {
            ...row,
            ...patch,
            quantity: nextQuantity,
            unitPrice: nextUnitPrice,
            total: nextTotal,
            costWarningDelta: hasCostInputsChanged ? null : (patch.costWarningDelta ?? row.costWarningDelta),
            costDocValue: patch.costDocValue !== undefined ? patch.costDocValue : row.costDocValue,
          };
        });
        return { ...group, rows };
      }),
    );
  };

  const updateServiceLine = (groupId: string, lineId: string, patch: Partial<ServiceLine>) => {
    setMaterialGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const serviceLines = (group.serviceLines || []).map((line) => {
          if (line.id !== lineId) return line;
          return {
            ...line,
            ...patch,
            description:
              patch.description === undefined ? line.description : sanitizeText(patch.description),
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
        });
        return { ...group, serviceLines };
      }),
    );
  };

  const addMaterialGroup = () => {
    const newGroup = createMaterialGroup();
    setMaterialGroups((current) => [...current, newGroup]);
    setOpenMaterialGroups((current) => ({ ...current, [newGroup.id]: true }));
    setActiveMaterialGroupId(newGroup.id);
    scrollToMaterialGroup(newGroup.id);
  };

  const removeMaterialGroup = (groupId: string) => {
    setMaterialGroups((current) =>
      current.length === 1 ? current : current.filter((group) => group.id !== groupId),
    );
    setOpenMaterialGroups((current) => {
      if (!(groupId in current)) return current;
      const next = { ...current };
      delete next[groupId];
      return next;
    });
    setActiveMaterialGroupId((current) => (current === groupId ? null : current));
  };

  const addMaterialRow = (groupId: string) => {
    setMaterialGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, rows: [...group.rows, createMaterialRow()] } : group,
      ),
    );
  };

  const addServiceLine = (groupId: string) => {
    setMaterialGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? { ...group, serviceLines: [...(group.serviceLines || []), createServiceLine()] }
          : group,
      ),
    );
  };

  const removeMaterialRow = (groupId: string, rowId: string) => {
    setMaterialGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        if (group.rows.length === 1) return group;
        return { ...group, rows: group.rows.filter((row) => row.id !== rowId) };
      }),
    );
  };

  const removeServiceLine = (groupId: string, lineId: string) => {
    setMaterialGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const serviceLines = group.serviceLines || [];
        if (serviceLines.length <= 1) return group;
        return { ...group, serviceLines: serviceLines.filter((line) => line.id !== lineId) };
      }),
    );
  };

  const setMaterialGroupOpen = (groupId: string, isOpen: boolean) => {
    setOpenMaterialGroups((current) => ({ ...current, [groupId]: isOpen }));
    setActiveMaterialGroupId(groupId);
  };

  const updateSubcontractGroup = (groupId: string, patch: Partial<SubcontractGroup>) => {
    setSubcontractGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    );
  };

  const updateSubcontractRow = (groupId: string, rowId: string, patch: Partial<SubcontractRow>) => {
    setSubcontractGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const rows = group.rows.map((row) => {
          if (row.id !== rowId) return row;
          return {
            ...row,
            ...patch,
            unit: normalizeSubcontractUnit(patch.unit ?? row.unit),
            cantPerWorker: patch.cantPerWorker === undefined ? row.cantPerWorker : nonNegative(patch.cantPerWorker),
            hours: patch.hours === undefined ? row.hours : nonNegative(patch.hours),
            unitPrice:
              patch.unitPrice === undefined
                ? row.unitPrice
                : typeof patch.unitPrice === 'number'
                  ? nonNegative(patch.unitPrice)
                  : null,
          };
        });
        return { ...group, rows };
      }),
    );
  };

  const addSubcontractGroup = () => {
    setSubcontractGroups((current) => [...current, createSubcontractGroup()]);
  };

  const removeSubcontractGroup = (groupId: string) => {
    setSubcontractGroups((current) =>
      current.length === 1 ? current : current.filter((group) => group.id !== groupId),
    );
  };

  const addSubcontractRow = (groupId: string) => {
    const newRow = createSubcontractRow();
    setSubcontractGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, rows: [...group.rows, newRow] } : group,
      ),
    );
    setOpenSubcontractWorkers((current) => ({ ...current, [newRow.id]: false }));
  };

  const removeSubcontractRow = (groupId: string, rowId: string) => {
    setSubcontractGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        if (group.rows.length === 1) return group;
        return { ...group, rows: group.rows.filter((row) => row.id !== rowId) };
      }),
    );
    setOpenSubcontractWorkers((current) => {
      if (!(rowId in current)) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  };

  const addSubcontractWorker = (groupId: string, rowId: string) => {
    const newWorker = createSubcontractAssignedWorker();
    setSubcontractGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          rows: group.rows.map((row) =>
            row.id === rowId
              ? { ...row, workersAssigned: [...row.workersAssigned, newWorker] }
              : row,
          ),
        };
      }),
    );
    setOpenSubcontractWorkers((current) => ({ ...current, [rowId]: true }));
  };

  const updateSubcontractWorker = (
    groupId: string,
    rowId: string,
    workerId: string,
    patch: Partial<SubcontractAssignedWorker>,
  ) => {
    setSubcontractGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          rows: group.rows.map((row) => {
            if (row.id !== rowId) return row;
            return {
              ...row,
              workersAssigned: row.workersAssigned.map((worker) =>
                worker.id === workerId
                  ? {
                      ...worker,
                      ...patch,
                      hours:
                        patch.hours === undefined
                          ? worker.hours
                          : nonNegative(patch.hours),
                    }
                  : worker,
              ),
            };
          }),
        };
      }),
    );
  };

  const removeSubcontractWorker = (groupId: string, rowId: string, workerId: string) => {
    setSubcontractGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          rows: group.rows.map((row) =>
            row.id === rowId
              ? { ...row, workersAssigned: row.workersAssigned.filter((worker) => worker.id !== workerId) }
              : row,
          ),
        };
      }),
    );
  };

  const setSubcontractWorkersOpen = (rowId: string, isOpen: boolean) => {
    setOpenSubcontractWorkers((current) => ({ ...current, [rowId]: isOpen }));
  };

  const handleSubcontractUpload = (groupId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      updateSubcontractGroup(groupId, { documentImage: reader.result });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleToggleSaveStatus = (status: SaveStatusOption) => {
    setSaveStatusSelection((current) => {
      if (status === 'completed') {
        return ['completed'];
      }

      const withoutCompleted = current.filter((item) => item !== 'completed');
      if (withoutCompleted.includes(status)) {
        const next = withoutCompleted.filter((item) => item !== status);
        return next.length > 0 ? next : ['completed'];
      }
      return [...withoutCompleted, status];
    });
  };

  const hasValidSaveInputs = () => {
    if (readOnly) {
      return false;
    }

    if (!workNumber.trim()) {
      toast({ title: 'Nº obra obligatorio', description: 'Completa el número de obra.', variant: 'destructive' });
      return false;
    }
    if (!workName.trim()) {
      toast({ title: 'Nombre de obra obligatorio', description: 'Completa el nombre de obra.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const resolveSelectedSaveStatus = (): { status: NonNullable<WorkReport['status']>; isClosed: boolean; missingDeliveryNotes: boolean } => {
    if (saveStatusSelection.includes('completed')) {
      return {
        status: 'completed',
        isClosed: true,
        missingDeliveryNotes: false,
      };
    }

    const hasMissingData = saveStatusSelection.includes('missing_data');
    const hasMissingDeliveryNotes = saveStatusSelection.includes('missing_delivery_notes');

    if (hasMissingData) {
      return {
        status: 'missing_data',
        isClosed: false,
        missingDeliveryNotes: hasMissingDeliveryNotes,
      };
    }

    return {
      status: 'missing_delivery_notes',
      isClosed: false,
      missingDeliveryNotes: true,
    };
  };

  const handleConfirmSaveWithStatus = async () => {
    if (!hasValidSaveInputs()) {
      return;
    }

    const normalizedForemanResources = foremanResources
      .map((resource) => ({
        ...resource,
        name: resource.name.trim(),
        hours: nonNegative(resource.hours),
      }))
      .filter((resource) => resource.name.length > 0 || resource.hours > 0);

    const resolvedStatus = resolveSelectedSaveStatus();
    await onSave({
      workId: selectedWorkId,
      workNumber,
      workName,
      date,
      totalHours: totalWorkforceHours,
      isClosed: resolvedStatus.isClosed,
      workforceSectionCompleted,
      workforceGroups,
      subcontractedMachineryGroups,
      materialGroups,
      subcontractGroups,
      subcontractRows: mapSubcontractGroupsToLegacyRows(subcontractGroups),
      rentalMachineryRows: mapRentalMachinesToLegacyRows(activeRentalMachines),
      rentalMachinesSnapshot: activeRentalMachines,
      wasteRows,
      observationsCompleted,
      observationsCategory,
      observationsText,
      galleryImages,
      foremanResources: normalizedForemanResources,
      mainForeman,
      mainForemanHours,
      siteManager,
      autoCloneNextDay,
      foremanSignature,
      siteManagerSignature,
      workReportStatus: resolvedStatus.status,
      missingDeliveryNotes: resolvedStatus.missingDeliveryNotes,
      cloneSourceReportId: initialDraft?.cloneSourceReportId,
      cloneSourceReportIdentifier: initialDraft?.cloneSourceReportIdentifier,
      cloneSourceWorkName: initialDraft?.cloneSourceWorkName,
      cloneRequiresReview: initialDraft?.cloneRequiresReview,
      cloneCreatedAt: initialDraft?.cloneCreatedAt,
      cloneIncludedImages: initialDraft?.cloneIncludedImages,
      cloneIncludedSignatures: initialDraft?.cloneIncludedSignatures,
      cloneIncludedMaterials: initialDraft?.cloneIncludedMaterials,
      cloneIncludedWaste: initialDraft?.cloneIncludedWaste,
    });

    setSaveStatusDialogOpen(false);
  };

  const handleSave = () => {
    if (!hasValidSaveInputs()) {
      return;
    }
    setSaveStatusDialogOpen(true);
  };

  const buildWorkReportForExport = (): WorkReport => {
    const nowIso = new Date().toISOString();

    const reportForemanEntries = foremanResources
      .map((resource) => ({
        id: resource.id || crypto.randomUUID(),
        name: resource.name.trim(),
        role: mapForemanRoleForReport(resource.role),
        hours: nonNegative(resource.hours),
      }))
      .filter((resource) => resource.name.length > 0 || resource.hours > 0);

    const reportWorkGroups = workforceGroups
      .map((group) => ({
        id: group.id,
        company: group.companyName.trim(),
        items: group.rows
          .filter((row) => row.workerName.trim().length > 0 || row.activity.trim().length > 0 || nonNegative(row.hours) > 0)
          .map((row) => ({
            id: row.id,
            name: row.workerName.trim(),
            activity: row.activity.trim(),
            hours: nonNegative(row.hours),
            total: nonNegative(row.total || row.hours),
          })),
      }))
      .filter((group) => group.company.length > 0 || group.items.length > 0);

    const reportMachineryGroups = subcontractedMachineryGroups
      .map((group) => ({
        id: group.id,
        company: group.companyName.trim(),
        items: group.rows
          .filter((row) => row.machineType.trim().length > 0 || row.activity.trim().length > 0 || nonNegative(row.hours) > 0)
          .map((row) => ({
            id: row.id,
            type: row.machineType.trim(),
            activity: row.activity.trim(),
            hours: nonNegative(row.hours),
            total: nonNegative(row.total || row.hours),
          })),
        documentImage: group.documentImage,
      }))
      .filter((group) => group.company.length > 0 || group.items.length > 0);

    const reportMaterialGroups = materialGroups
      .map((group) => ({
        id: group.id,
        supplier: sanitizeText(group.supplier),
        invoiceNumber: sanitizeText(group.invoiceNumber),
        docType: group.docType ?? null,
        serviceLines: (group.serviceLines || [])
          .map((line) => ({
            id: line.id,
            description: sanitizeText(line.description),
            hours: typeof line.hours === 'number' && Number.isFinite(line.hours) ? nonNegative(line.hours) : null,
            trips: typeof line.trips === 'number' && Number.isFinite(line.trips) ? nonNegative(line.trips) : null,
            tons: typeof line.tons === 'number' && Number.isFinite(line.tons) ? nonNegative(line.tons) : null,
            m3: typeof line.m3 === 'number' && Number.isFinite(line.m3) ? nonNegative(line.m3) : null,
          }))
          .filter((line) => {
            const hasDescription = line.description.length > 0;
            const hasValues =
              nonNegative(line.hours ?? 0) > 0 ||
              nonNegative(line.trips ?? 0) > 0 ||
              nonNegative(line.tons ?? 0) > 0 ||
              nonNegative(line.m3 ?? 0) > 0;
            return hasDescription || hasValues;
          }),
        items: group.rows
          .filter(
            (row) =>
              row.name.trim().length > 0 ||
              row.unit.trim().length > 0 ||
              nonNegative(row.quantity) > 0 ||
              nonNegative(row.unitPrice) > 0,
          )
          .map((row) => ({
            id: row.id,
            name: row.name.trim(),
            quantity: nonNegative(row.quantity),
            unit: row.unit.trim(),
            unitPrice: nonNegative(row.unitPrice),
            total: nonNegative(row.total ?? row.quantity * row.unitPrice),
          })),
      }))
      .filter(
        (group) =>
          group.supplier.length > 0 ||
          group.invoiceNumber.length > 0 ||
          group.items.length > 0 ||
          (group.serviceLines?.length ?? 0) > 0,
      );

    const reportSubcontractGroups = subcontractGroups
      .map((group) => {
        const totals = subcontractTotalsByGroupId[group.id];
        const items = group.rows
          .filter(
            (row) =>
              row.partida.trim().length > 0 ||
              row.activity.trim().length > 0 ||
              nonNegative(row.cantPerWorker) > 0 ||
              nonNegative(row.hours) > 0 ||
              row.workersAssigned.length > 0,
          )
          .map((row) => {
            const rowTotals = totals?.rowTotalsById[row.id];
            const assignedWorkersWithHours = row.workersAssigned.filter((worker) => nonNegative(worker.hours) > 0);
            const workersCount =
              rowTotals?.numTrabEfectivo ??
              (assignedWorkersWithHours.length > 0 ? assignedWorkersWithHours.length : nonNegativeInt(group.numWorkersManual));
            return {
              id: row.id,
              contractedPart: row.partida.trim(),
              company: group.companyName.trim(),
              activity: row.activity.trim(),
              workers: workersCount,
              hours: rowTotals?.horasHombre ?? nonNegative(row.hours),
              unitType: mapSubcontractUnitToReportUnit(row.unit),
              quantity: rowTotals?.produccion ?? nonNegative(row.cantPerWorker),
              unitPrice: typeof row.unitPrice === 'number' ? nonNegative(row.unitPrice) : 0,
              total: rowTotals?.importe ?? 0,
              workerDetails: row.workersAssigned.map((worker) => ({
                id: worker.id,
                name: worker.name.trim(),
                dni: '',
                category: '',
                hours: nonNegative(worker.hours),
              })),
            };
          });

        return {
          id: group.id,
          company: group.companyName.trim(),
          items,
          documentImage: group.documentImage,
          totalWorkers: totals?.numWorkersEffective ?? nonNegativeInt(group.numWorkersManual),
        };
      })
      .filter((group) => group.company.length > 0 || group.items.length > 0);

    return {
      id: reportIdentifier || crypto.randomUUID(),
      workNumber: workNumber.trim(),
      date: date || todayDate(),
      workName: workName.trim(),
      workId: selectedWorkId || undefined,
      foreman: mainForeman.trim(),
      foremanHours: nonNegative(mainForemanHours),
      foremanEntries: reportForemanEntries,
      foremanSignature: foremanSignature || undefined,
      siteManager: siteManager.trim(),
      siteManagerSignature: siteManagerSignature || undefined,
      observations: observationsText || '',
      workGroups: reportWorkGroups,
      machineryGroups: reportMachineryGroups,
      materialGroups: reportMaterialGroups,
      subcontractGroups: reportSubcontractGroups,
      createdAt: nowIso,
      updatedAt: nowIso,
      autoCloneNextDay,
      status: resolveSelectedSaveStatus().status,
    };
  };

  const handleDownloadPdf = async () => {
    if (exportingPdf || exportingExcel) return;
    try {
      setExportingPdf(true);
      const report = buildWorkReportForExport();
      const { generateWorkReportPDF } = await import('@/utils/pdfGenerator');
      await generateWorkReportPDF(report, true);
      toast({
        title: 'PDF generado',
        description: 'El parte se ha descargado correctamente en PDF.',
      });
    } catch (error) {
      console.error('[WorkReport] Error exporting PDF:', error);
      toast({
        title: 'Error al descargar PDF',
        description: 'No se pudo generar el PDF del parte.',
        variant: 'destructive',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (exportingPdf || exportingExcel) return;
    try {
      setExportingExcel(true);
      const report = buildWorkReportForExport();
      const { exportSingleReportToExcel } = await import('@/utils/exportUtils');
      await exportSingleReportToExcel(report);
      toast({
        title: 'Excel generado',
        description: 'El parte se ha descargado correctamente en Excel.',
      });
    } catch (error) {
      console.error('[WorkReport] Error exporting Excel:', error);
      toast({
        title: 'Error al descargar Excel',
        description: 'No se pudo generar el Excel del parte.',
        variant: 'destructive',
      });
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className={`space-y-4 text-[15px] ${androidTypographyClass}`}>
      <WorkReportHeaderCard
        panelTitle={panelTitle}
        onBack={onBack}
        reportIdentifier={reportIdentifier}
        readOnly={readOnly}
        isClonedReport={isClonedReport}
        cloneSourceLabel={cloneSourceLabel}
        workNumber={workNumber}
        onWorkNumberChange={setWorkNumber}
        workDatePickerOpen={workDatePickerOpen}
        onWorkDatePickerOpenChange={setWorkDatePickerOpen}
        selectedWorkDate={selectedWorkDate}
        onWorkDateSelect={(selectedDate) => {
          setDate(format(selectedDate, 'yyyy-MM-dd'));
          setWorkDatePickerOpen(false);
        }}
        workName={workName}
        onWorkNameChange={setWorkName}
      />

      <div className={readOnly ? 'pointer-events-none select-none opacity-95' : ''}>
      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-3">
        <WorkforceSection
          sectionTriggerClass={sectionTriggerClass}
          workforceSectionCompleted={workforceSectionCompleted}
          setWorkforceSectionCompleted={setWorkforceSectionCompleted}
          totalWorkforceHours={totalWorkforceHours}
          workforceGroups={workforceGroups}
          removeWorkforceGroup={removeWorkforceGroup}
          updateWorkforceGroup={updateWorkforceGroup}
          updateWorkforceRow={updateWorkforceRow}
          removeWorkforceRow={removeWorkforceRow}
          addWorkforceRow={addWorkforceRow}
          addWorkforceGroup={addWorkforceGroup}
          editableNumericValue={editableNumericValue}
          parseNumeric={parseNumeric}
        />
        <MachinerySection
          sectionTriggerClass={sectionTriggerClass}
          subcontractedMachineryGroups={subcontractedMachineryGroups}
          addSubcontractedMachineryGroup={addSubcontractedMachineryGroup}
          updateSubcontractedMachineryGroup={updateSubcontractedMachineryGroup}
          handleSubcontractedMachineryUpload={handleSubcontractedMachineryUpload}
          removeSubcontractedMachineryGroup={removeSubcontractedMachineryGroup}
          updateSubcontractedMachineryRow={updateSubcontractedMachineryRow}
          removeSubcontractedMachineryRow={removeSubcontractedMachineryRow}
          addSubcontractedMachineryRow={addSubcontractedMachineryRow}
          editableNumericValue={editableNumericValue}
          parseNumeric={parseNumeric}
        />
        <MaterialsSection
          sectionTriggerClass={sectionTriggerClass}
          addMaterialGroup={addMaterialGroup}
          readOnly={readOnly}
          isAlbaranProcessing={isAlbaranProcessing}
          albaranScanError={albaranScanError}
          materialGroups={materialGroups}
          activeMaterialGroupId={activeMaterialGroupId}
          scanInFlightTargetGroupId={scanInFlightTargetGroupId}
          openMaterialGroups={openMaterialGroups}
          setMaterialGroupOpen={setMaterialGroupOpen}
          setActiveMaterialGroupId={setActiveMaterialGroupId}
          handleScanMaterialsForGroup={handleScanMaterialsForGroup}
          removeMaterialGroup={removeMaterialGroup}
          openAlbaranViewer={openAlbaranViewer}
          updateMaterialGroup={updateMaterialGroup}
          updateMaterialRow={updateMaterialRow}
          updateServiceLine={updateServiceLine}
          editableNumericValue={editableNumericValue}
          parseNumeric={parseNumeric}
          materialUnitOptions={MATERIAL_UNIT_OPTIONS}
          openCostDifferenceDialogForRow={openCostDifferenceDialogForRow}
          removeMaterialRow={removeMaterialRow}
          addMaterialRow={addMaterialRow}
          addServiceLine={addServiceLine}
          removeServiceLine={removeServiceLine}
        />
        <SubcontractsSection
          sectionTriggerClass={sectionTriggerClass}
          subcontractGroups={subcontractGroups}
          subcontractTotalsByGroupId={subcontractTotalsByGroupId}
          computeGroupTotals={computeGroupTotals}
          unitLabel={unitLabel}
          addSubcontractGroup={addSubcontractGroup}
          updateSubcontractGroup={updateSubcontractGroup}
          handleSubcontractUpload={handleSubcontractUpload}
          removeSubcontractGroup={removeSubcontractGroup}
          openSubcontractWorkers={openSubcontractWorkers}
          setSubcontractWorkersOpen={setSubcontractWorkersOpen}
          computeRowTotals={computeRowTotals}
          updateSubcontractRow={updateSubcontractRow}
          normalizeSubcontractUnit={normalizeSubcontractUnit}
          subcontractUnitOptions={SUBCONTRACT_UNIT_OPTIONS}
          nonNegativeInt={nonNegativeInt}
          nonNegative={nonNegative}
          parseNumeric={parseNumeric}
          editableNumericValue={editableNumericValue}
          removeSubcontractRow={removeSubcontractRow}
          addSubcontractWorker={addSubcontractWorker}
          updateSubcontractWorker={updateSubcontractWorker}
          removeSubcontractWorker={removeSubcontractWorker}
          addSubcontractRow={addSubcontractRow}
        />
        <RentalSection
          sectionTriggerClass={sectionTriggerClass}
          rentalLoading={rentalLoading}
          rentalError={rentalError}
          selectedWorkId={selectedWorkId}
          rentalResult={rentalResult}
          normalizeDate={normalizeDate}
        />
        <WasteSection
          sectionTriggerClass={sectionTriggerClass}
          wasteRows={wasteRows}
          setWasteRows={setWasteRows}
          parseNumeric={parseNumeric}
          editableNumericValue={editableNumericValue}
        />
        <ObservationsSection
          sectionTriggerClass={sectionTriggerClass}
          readOnly={readOnly}
          observacionesDictationActive={observacionesDictationActive}
          observacionesInterimText={observacionesInterimText}
          observacionesDictationError={observacionesDictationError}
          stopObservacionesDictation={stopObservacionesDictation}
          startObservacionesDictation={startObservacionesDictation}
          observationsCompleted={observationsCompleted}
          observationsCategory={observationsCategory}
          observationsText={observationsText}
          setObservationsCompleted={setObservationsCompleted}
          setObservationsCategory={setObservationsCategory}
          setObservationsText={setObservationsText}
        />
        <GallerySection
          sectionTriggerClass={sectionTriggerClass}
          galleryImages={galleryImages}
          handleGalleryUpload={handleGalleryUpload}
          setGalleryImages={setGalleryImages}
        />
      </Accordion>
      <ForemanResourcesCard
        readOnly={readOnly}
        totalForemanSectionHours={totalForemanSectionHours}
        foremanResources={foremanResources}
        onAddResource={() => setForemanResources((current) => [...current, createForemanResource()])}
        onUpdateResource={(id, patch) =>
          setForemanResources((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
        }
        onRemoveResource={(id) =>
          setForemanResources((current) => current.filter((item) => item.id !== id))
        }
        mainForeman={mainForeman}
        onMainForemanChange={setMainForeman}
        mainForemanHours={mainForemanHours}
        onMainForemanHoursChange={setMainForemanHours}
        siteManager={siteManager}
        onSiteManagerChange={setSiteManager}
        editableNumericValue={editableNumericValue}
        parseNumeric={parseNumeric}
        nonNegative={nonNegative}
      />

      <AutoCloneSettingsCard
        autoCloneNextDay={autoCloneNextDay}
        onAutoCloneNextDayChange={setAutoCloneNextDay}
      />

      <SignaturesCard
        foremanSignature={foremanSignature}
        onForemanSignatureChange={setForemanSignature}
        siteManagerSignature={siteManagerSignature}
        onSiteManagerSignatureChange={setSiteManagerSignature}
        readOnly={readOnly}
      />
      </div>

      <SaveActionsBar
        completedSections={completedSections}
        totalWorkforceHours={totalWorkforceHours}
        saveStatusSummaryLabel={saveStatusSummaryLabel}
        exportingPdf={exportingPdf}
        exportingExcel={exportingExcel}
        onDownloadPdf={() => void handleDownloadPdf()}
        onDownloadExcel={() => void handleDownloadExcel()}
        onSave={() => void handleSave()}
        saving={saving}
        readOnly={readOnly}
      />
      <ScanReviewDialog
        open={scanReviewDialogOpen}
        onOpenChange={(open) => {
          setScanReviewDialogOpen(open);
          if (!open) {
            setScanReviewTargetGroupId(null);
            setScanReviewOllamaProposal(null);
            setScanReviewOllamaError(null);
            setScanReviewOllamaLoading(false);
            setScanReviewServiceLines([]);
          }
        }}
        reason={scanReviewReason}
        docType={scanReviewDocType}
        docSubtype={scanReviewDocSubtype ?? null}
        confidence={scanReviewConfidence}
        profileUsed={scanReviewProfileUsed}
        score={scanReviewScore}
        warnings={scanReviewWarnings}
        supplier={scanReviewSupplier}
        invoiceNumber={scanReviewInvoiceNumber}
        documentDate={scanReviewDocumentDate}
        serviceDescription={scanReviewServiceDescription}
        fieldConfidence={scanReviewFieldConfidence}
        fieldWarnings={scanReviewFieldWarnings}
        fieldMeta={scanReviewFieldMeta ?? null}
        templateData={scanReviewTemplateData ?? null}
        imageUris={scanReviewImageUris}
        items={scanReviewItems}
        serviceLines={scanReviewServiceLines}
        onOpenViewer={() => openAlbaranViewer(scanReviewImageUris, 'Adjuntos del albaran escaneado')}
        onSupplierChange={setScanReviewSupplier}
        onInvoiceNumberChange={setScanReviewInvoiceNumber}
        onDocumentDateChange={setScanReviewDocumentDate}
        onServiceDescriptionChange={setScanReviewServiceDescription}
        onUpdateItem={updateScanReviewItem}
        onAddItem={addScanReviewItem}
        onUpdateServiceLine={updateScanReviewServiceLine}
        onAddServiceLine={addScanReviewServiceLine}
        onRemoveServiceLine={removeScanReviewServiceLine}
        onCreateOtrosLine={createOtrosLineInScanReview}
        canImproveWithOllama={canImproveReviewWithOllama}
        ollamaLoading={scanReviewOllamaLoading}
        ollamaError={scanReviewOllamaError}
        ollamaProposal={scanReviewOllamaProposal}
        onImproveWithOllama={() => void improveScanReviewWithOllama()}
        onApplyOllamaProposal={applyOllamaProposalToReview}
        onKeepOffline={keepOfflineScanReview}
        onCancel={() => {
          setScanReviewDialogOpen(false);
          setScanReviewTargetGroupId(null);
          setScanReviewOllamaProposal(null);
          setScanReviewOllamaError(null);
          setScanReviewOllamaLoading(false);
          setScanReviewServiceLines([]);
        }}
        onApply={applyScanReview}
        parseNumeric={parseNumeric}
      />

      <ServiceScanDialog
        open={serviceScanDialogOpen}
        onOpenChange={(open) => {
          setServiceScanDialogOpen(open);
          if (!open) {
            setPendingServiceScanResolution(null);
          }
        }}
        supplier={pendingServiceScanResolution?.parsed.supplier}
        invoiceNumber={pendingServiceScanResolution?.parsed.invoiceNumber}
        serviceDescription={pendingServiceScanResolution?.parsed.serviceDescription}
        onCancel={cancelServiceScanResolution}
        onConfirm={confirmServiceScanResolution}
      />

      <NoPriceScanDialog
        open={noPriceScanDialogOpen}
        onOpenChange={(open) => {
          setNoPriceScanDialogOpen(open);
          if (!open) {
            setPendingNoPriceScanResolution(null);
          }
        }}
        supplier={pendingNoPriceScanResolution?.parsed.supplier}
        invoiceNumber={pendingNoPriceScanResolution?.parsed.invoiceNumber}
        description={pendingNoPriceScanResolution ? extractNoPriceDescription(pendingNoPriceScanResolution.parsed) || 'OTROS' : 'OTROS'}
        onCancel={cancelNoPriceScanResolution}
        onConfirm={confirmNoPriceScanResolution}
      />

      <RescanConfirmDialog
        open={rescanConfirmDialogOpen}
        onOpenChange={(open) => {
          setRescanConfirmDialogOpen(open);
          if (!open) {
            setPendingRescanTargetGroupId(null);
          }
        }}
        onCancel={() => {
          setRescanConfirmDialogOpen(false);
          setPendingRescanTargetGroupId(null);
        }}
        onContinue={continueRescanForMaterialGroup}
      />

      <DuplicateDialog
        open={duplicateDialogOpen}
        onOpenChange={(open) => {
          setDuplicateDialogOpen(open);
          if (!open) {
            setPendingDuplicateResolution(null);
          }
        }}
        duplicateLabel={pendingDuplicateResolution?.duplicateLabel}
        onApplyToTarget={applyDuplicateToTargetGroup}
        onOverwriteExisting={overwriteExistingDuplicateGroup}
        onCancel={cancelDuplicateResolution}
      />

      <CostDifferenceDialog
        open={costDifferenceDialogOpen}
        onOpenChange={(open) => {
          setCostDifferenceDialogOpen(open);
          if (!open) {
            setPendingCostDifferences([]);
          }
        }}
        differences={pendingCostDifferences}
        onKeep={keepDocumentCostDifferences}
        onOverwrite={overwriteCostDifferencesWithCalculated}
      />

      <AlbaranDocumentViewerModal
        open={albaranViewerOpen}
        imageUris={albaranViewerImageUris}
        initialIndex={albaranViewerInitialIndex}
        title={albaranViewerTitle}
        onClose={closeAlbaranViewer}
      />

      <SaveStatusDialog
        open={saveStatusDialogOpen}
        onOpenChange={setSaveStatusDialogOpen}
        selection={saveStatusSelection}
        onToggle={handleToggleSaveStatus}
        onConfirm={() => void handleConfirmSaveWithStatus()}
        saving={saving}
        readOnly={readOnly}
      />
    </div>
  );
};


