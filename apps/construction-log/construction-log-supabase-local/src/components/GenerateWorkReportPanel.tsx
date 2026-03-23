import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Accordion } from '@/components/ui/accordion';
import { normalizeNoteCategory, type NoteCategory } from '@/components/ObservacionesIncidenciasSection';
import { useObservacionesDictation } from '@/hooks/useObservacionesDictation';
import { useWorkReportScanOrchestrator } from '@/hooks/useWorkReportScanOrchestrator';
import { Capacitor } from '@capacitor/core';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { foremanCatalogRepo } from '@/offline-db/repositories/foremanCatalogRepo';
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
import { ActiveRepasosSection } from '@/components/ActiveRepasosSection';
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
import { buildWorkReportForExport } from '@/components/work-report/buildWorkReportForExport';
import {
  ALL_SECTION_IDS,
  MATERIAL_UNIT_OPTIONS,
  SUBCONTRACT_UNIT_OPTIONS,
  computeGroupTotals,
  computeRowTotals,
  createForemanResource,
  createMaterialGroup,
  createMaterialRow,
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
  mapRentalMachinesToLegacyRows,
  mapSubcontractGroupsToLegacyRows,
  migrateLegacyMaterialRows,
  migrateLegacySubcontractRows,
  migrateLegacySubcontractedMachineryRows,
  nonNegative,
  nonNegativeInt,
  normalizeMaterialGroups,
  normalizeSubcontractGroups,
  normalizeSubcontractUnit,
  normalizeSubcontractedMachineryGroups,
  parseDateInputValue,
  parseNumeric,
  sanitizeText,
  todayDate,
  unitLabel,
} from '@/components/work-report/helpers';
import type {
  EditableRow,
  ForemanResource,
  GalleryImage,
  GenerateWorkReportDraft,
  MaterialGroup,
  MaterialRow,
  SaveStatusOption,
  ServiceLine,
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
} from '@/components/work-report/types';

export type { GenerateWorkReportDraft } from '@/components/work-report/types';

interface GenerateWorkReportPanelProps {
  onBack: () => void;
  onSave: (draft: GenerateWorkReportDraft) => Promise<void> | void;
  initialDate?: string;
  initialDraft?: GenerateWorkReportDraft | null;
  readOnly?: boolean;
  reportIdentifier?: string | null;
  navigationCurrentIndex?: number;
  navigationTotalCount?: number;
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
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
  navigationCurrentIndex = 0,
  navigationTotalCount = 0,
  onNavigatePrevious,
  onNavigateNext,
  saving = false,
  works = [],
}: GenerateWorkReportPanelProps) => {
  const panelTopRef = useRef<HTMLDivElement | null>(null);
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
    isAlbaranProcessing,
    albaranScanError,
    scanReviewDialogOpen,
    scanReviewReason,
    scanReviewSupplier,
    setScanReviewSupplier,
    scanReviewInvoiceNumber,
    setScanReviewInvoiceNumber,
    scanReviewDocumentDate,
    setScanReviewDocumentDate,
    scanReviewDocType,
    scanReviewDocSubtype,
    scanReviewServiceDescription,
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
  } = useWorkReportScanOrchestrator({
    readOnly,
    materialGroups,
    setMaterialGroups,
    setOpenMaterialGroups,
    setActiveMaterialGroupId,
  });

  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);

  const [foremanResources, setForemanResources] = useState<ForemanResource[]>([createForemanResource()]);
  const [mainForeman, setMainForeman] = useState('');
  const [catalogForemanNames, setCatalogForemanNames] = useState<string[]>([]);
  const [mainForemanHours, setMainForemanHours] = useState(0);
  const [siteManager, setSiteManager] = useState('');

  const [autoCloneNextDay, setAutoCloneNextDay] = useState(false);
  const [foremanSignature, setForemanSignature] = useState('');
  const [siteManagerSignature, setSiteManagerSignature] = useState('');
  const [saveStatusDialogOpen, setSaveStatusDialogOpen] = useState(false);
  const [saveStatusSelection, setSaveStatusSelection] = useState<SaveStatusOption[]>(['completed']);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
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
  const readOnlyLockedClass = readOnly ? 'pointer-events-none select-none opacity-95' : '';

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

  const foremanNameSuggestions = useMemo(() => {
    const names = new Set<string>();
    const addName = (value: unknown) => {
      const normalized = typeof value === 'string' ? value.trim() : '';
      if (!normalized) return;
      names.add(normalized);
    };

    catalogForemanNames.forEach(addName);
    addName(mainForeman);
    foremanResources.forEach((resource) => addName(resource.name));

    return Array.from(names);
  }, [catalogForemanNames, foremanResources, mainForeman]);

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
    let cancelled = false;

    const loadForemanCatalog = async () => {
      try {
        const names = await foremanCatalogRepo.listForemanNames();
        if (cancelled) return;
        setCatalogForemanNames(names);
      } catch (error) {
        if (cancelled) return;
        console.warn('[foreman-catalog] No se pudo cargar el catalogo local de encargados', error);
      }
    };

    void loadForemanCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const panelTitle = initialDraft
    ? sanitizeText(initialDraft.workName || workName).trim() || 'Parte'
    : readOnly
      ? 'Parte (solo lectura)'
      : 'Nuevo Parte';

  useLayoutEffect(() => {
    const panelTop = panelTopRef.current;
    if (!panelTop || typeof window === 'undefined' || typeof document === 'undefined') return;

    const forceScrollToTop = () => {
      panelTop.scrollIntoView({ block: 'start' });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      if (document.scrollingElement) {
        document.scrollingElement.scrollTop = 0;
      }

      let current: HTMLElement | null = panelTop.parentElement;
      while (current) {
        if (current.scrollHeight > current.clientHeight) {
          current.scrollTop = 0;
        }
        current = current.parentElement;
      }
    };

    forceScrollToTop();

    const rafId = window.requestAnimationFrame(() => {
      forceScrollToTop();
    });
    const timeoutShort = window.setTimeout(forceScrollToTop, 80);
    const timeoutLong = window.setTimeout(forceScrollToTop, 220);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutShort);
      window.clearTimeout(timeoutLong);
    };
  }, [reportIdentifier, initialDate, initialDraft?.date]);

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

  const createExportReport = (): WorkReport =>
    buildWorkReportForExport({
      reportIdentifier,
      workNumber,
      date,
      workName,
      workId: selectedWorkId,
      mainForeman,
      mainForemanHours,
      foremanResources,
      foremanSignature,
      siteManager,
      siteManagerSignature,
      observationsText,
      workforceGroups,
      subcontractedMachineryGroups,
      materialGroups,
      subcontractGroups,
      subcontractTotalsByGroupId,
      autoCloneNextDay,
      status: resolveSelectedSaveStatus().status,
    });

  const handleDownloadPdf = async () => {
    if (exportingPdf || exportingExcel) return;
    try {
      setExportingPdf(true);
      const report = createExportReport();
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
      const report = createExportReport();
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
    <div ref={panelTopRef} className={`space-y-4 text-[15px] ${androidTypographyClass}`}>
      <WorkReportHeaderCard
        panelTitle={panelTitle}
        onBack={onBack}
        navigationCurrentIndex={navigationCurrentIndex}
        navigationTotalCount={navigationTotalCount}
        onNavigatePrevious={onNavigatePrevious}
        onNavigateNext={onNavigateNext}
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

      <div className={readOnlyLockedClass}>
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
      </div>
      <ActiveRepasosSection workId={selectedWorkId ? String(selectedWorkId) : null} />
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
        foremanNameSuggestions={foremanNameSuggestions}
        editableNumericValue={editableNumericValue}
        parseNumeric={parseNumeric}
        nonNegative={nonNegative}
      />

      <div className={readOnlyLockedClass}>
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
        onOpenChange={handleScanReviewDialogOpenChange}
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
        onCancel={cancelScanReview}
        onApply={applyScanReview}
        parseNumeric={parseNumeric}
      />

      <ServiceScanDialog
        open={serviceScanDialogOpen}
        onOpenChange={handleServiceScanDialogOpenChange}
        supplier={pendingServiceScanResolution?.parsed.supplier}
        invoiceNumber={pendingServiceScanResolution?.parsed.invoiceNumber}
        serviceDescription={pendingServiceScanResolution?.parsed.serviceDescription}
        onCancel={cancelServiceScanResolution}
        onConfirm={confirmServiceScanResolution}
      />

      <NoPriceScanDialog
        open={noPriceScanDialogOpen}
        onOpenChange={handleNoPriceScanDialogOpenChange}
        supplier={pendingNoPriceScanResolution?.parsed.supplier}
        invoiceNumber={pendingNoPriceScanResolution?.parsed.invoiceNumber}
        description={pendingNoPriceDescription}
        onCancel={cancelNoPriceScanResolution}
        onConfirm={confirmNoPriceScanResolution}
      />

      <RescanConfirmDialog
        open={rescanConfirmDialogOpen}
        onOpenChange={handleRescanConfirmDialogOpenChange}
        onCancel={cancelRescanForMaterialGroup}
        onContinue={continueRescanForMaterialGroup}
      />

      <DuplicateDialog
        open={duplicateDialogOpen}
        onOpenChange={handleDuplicateDialogOpenChange}
        duplicateLabel={pendingDuplicateResolution?.duplicateLabel}
        onApplyToTarget={applyDuplicateToTargetGroup}
        onOverwriteExisting={overwriteExistingDuplicateGroup}
        onCancel={cancelDuplicateResolution}
      />

      <CostDifferenceDialog
        open={costDifferenceDialogOpen}
        onOpenChange={handleCostDifferenceDialogOpenChange}
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



