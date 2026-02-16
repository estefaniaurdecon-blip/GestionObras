import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CloneOptions } from '@/components/CloneOptionsDialog';
import type { GenerateWorkReportDraft } from '@/components/GenerateWorkReportPanel';
import { normalizeNoteCategory } from '@/components/ObservacionesIncidenciasSection';
import { toast } from '@/hooks/use-toast';
import type { ApiUser } from '@/integrations/api/client';
import { workReportsRepo } from '@/offline-db/repositories/workReportsRepo';
import {
  isTenantResolutionError,
  prepareOfflineTenantScope,
} from '@/offline-db/tenantScope';
import type { WorkReport, WorkReportStatus } from '@/offline-db/types';
import {
  asRecord,
  cloneSerializableValue,
  payloadBoolean,
  payloadText,
} from '@/pages/indexHelpers';

export type PendingOverwrite = {
  draft: GenerateWorkReportDraft;
  reportIdentifier: string;
};

type UseWorkReportMutationsParams = {
  user: ApiUser | null;
  resolvedTenantId: string | null;
  tenantUnavailable: boolean;
  tenantErrorMessage: string;
  workReportsReadOnlyByRole: boolean;
  cloneSourceReport: WorkReport | null;
  pendingOverwrite: PendingOverwrite | null;
  loadWorkReports: () => Promise<void>;
  setGeneratePanelOpen: Dispatch<SetStateAction<boolean>>;
  setGeneratePanelSaving: Dispatch<SetStateAction<boolean>>;
  setGeneratePanelDate: Dispatch<SetStateAction<string | undefined>>;
  setActiveReport: Dispatch<SetStateAction<WorkReport | null>>;
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
  setCloneDialogOpen: Dispatch<SetStateAction<boolean>>;
  setCloneSourceReport: Dispatch<SetStateAction<WorkReport | null>>;
  setManualCloneDraft: Dispatch<SetStateAction<GenerateWorkReportDraft | null>>;
  setPendingOverwrite: Dispatch<SetStateAction<PendingOverwrite | null>>;
  setWorkReportsLoading: Dispatch<SetStateAction<boolean>>;
};

type UseWorkReportMutationsResult = {
  openGenerateWorkReport: (targetDate?: string) => void;
  openExistingReport: (report: WorkReport) => void;
  openHistoryReport: (report: WorkReport) => void;
  openCloneFromHistoryDialog: (report: WorkReport) => void;
  handleCloneFromHistory: (options: CloneOptions) => void;
  handleSaveGeneratedWorkReport: (draft: GenerateWorkReportDraft) => Promise<void>;
  handleConfirmOverwrite: () => Promise<void>;
};

export const useWorkReportMutations = ({
  user,
  resolvedTenantId,
  tenantUnavailable,
  tenantErrorMessage,
  workReportsReadOnlyByRole,
  cloneSourceReport,
  pendingOverwrite,
  loadWorkReports,
  setGeneratePanelOpen,
  setGeneratePanelSaving,
  setGeneratePanelDate,
  setActiveReport,
  setHistoryOpen,
  setCloneDialogOpen,
  setCloneSourceReport,
  setManualCloneDraft,
  setPendingOverwrite,
  setWorkReportsLoading,
}: UseWorkReportMutationsParams): UseWorkReportMutationsResult => {
  const generateReportIdentifier = useCallback((date: string) => {
    const compactDate = date.replace(/-/g, '');
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    return `PRT-${compactDate}-${suffix}`;
  }, []);

  const openGenerateWorkReport = useCallback(
    (targetDate?: string) => {
      if (tenantUnavailable) {
        toast({
          title: 'Operación bloqueada',
          description: tenantErrorMessage,
          variant: 'destructive',
        });
        return;
      }
      if (workReportsReadOnlyByRole) {
        toast({
          title: 'Solo lectura',
          description: 'Este perfil solo puede visualizar partes. La creación está reservada al usuario encargado de obra.',
          variant: 'destructive',
        });
        return;
      }

      setActiveReport(null);
      setManualCloneDraft(null);
      setGeneratePanelDate(targetDate);
      setGeneratePanelOpen(true);
    },
    [
      setActiveReport,
      setGeneratePanelDate,
      setGeneratePanelOpen,
      setManualCloneDraft,
      tenantErrorMessage,
      tenantUnavailable,
      workReportsReadOnlyByRole,
    ],
  );

  const openExistingReport = useCallback(
    (report: WorkReport) => {
      if (tenantUnavailable) {
        toast({
          title: 'Operación bloqueada',
          description: tenantErrorMessage,
          variant: 'destructive',
        });
        return;
      }

      setActiveReport(report);
      setManualCloneDraft(null);
      setGeneratePanelDate(report.date);
      setGeneratePanelOpen(true);
    },
    [
      setActiveReport,
      setGeneratePanelDate,
      setGeneratePanelOpen,
      setManualCloneDraft,
      tenantErrorMessage,
      tenantUnavailable,
    ],
  );

  const openHistoryReport = useCallback(
    (report: WorkReport) => {
      setHistoryOpen(false);
      openExistingReport(report);
    },
    [openExistingReport, setHistoryOpen],
  );

  const openCloneFromHistoryDialog = useCallback(
    (report: WorkReport) => {
      if (tenantUnavailable) {
        toast({
          title: 'Operación bloqueada',
          description: tenantErrorMessage,
          variant: 'destructive',
        });
        return;
      }
      if (workReportsReadOnlyByRole) {
        toast({
          title: 'Solo lectura',
          description: 'Este perfil no puede clonar partes.',
          variant: 'destructive',
        });
        return;
      }

      setCloneSourceReport(report);
      setCloneDialogOpen(true);
    },
    [
      setCloneDialogOpen,
      setCloneSourceReport,
      tenantErrorMessage,
      tenantUnavailable,
      workReportsReadOnlyByRole,
    ],
  );

  const handleCloneFromHistory = useCallback(
    (options: CloneOptions) => {
      if (!cloneSourceReport) return;

      const payload = asRecord(cloneSourceReport.payload) ?? {};
      const valueString = (key: string, fallback = '') => {
        const value = payload[key];
        return typeof value === 'string' ? value : fallback;
      };
      const valueNumber = (key: string, fallback = 0) => {
        const value = payload[key];
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
      };
      const valueBoolean = (key: string, fallback = false) => {
        const value = payload[key];
        return typeof value === 'boolean' ? value : fallback;
      };
      const valueArray = (key: string) => {
        const value = payload[key];
        if (!Array.isArray(value)) return [];
        return cloneSerializableValue(value);
      };
      const sourceIdentifier = payloadText(payload, 'reportIdentifier') ?? cloneSourceReport.id.slice(0, 8);
      const sourceWorkName = valueString('workName', cloneSourceReport.title ?? '');

      const nextMachineryGroups = valueArray('subcontractedMachineryGroups') as GenerateWorkReportDraft['subcontractedMachineryGroups'];
      const nextMaterialGroups = options.includeMaterials
        ? (valueArray('materialGroups') as GenerateWorkReportDraft['materialGroups'])
        : [];
      const nextSubcontractGroups = valueArray('subcontractGroups') as GenerateWorkReportDraft['subcontractGroups'];

      const stripGroupDocumentImages = <T extends { documentImage?: string }>(groups: T[]): T[] => {
        if (options.includeImages) return groups;
        return groups.map((group) => ({ ...group, documentImage: undefined }));
      };

      const cloneDraft: GenerateWorkReportDraft = {
        workId: valueString('workId', cloneSourceReport.projectId ?? '') || null,
        workNumber: valueString('workNumber'),
        workName: sourceWorkName,
        date: options.targetDate,
        totalHours: valueNumber('totalHours', 0),
        isClosed: false,
        workforceSectionCompleted: valueBoolean('workforceSectionCompleted'),
        workforceGroups: valueArray('workforceGroups') as GenerateWorkReportDraft['workforceGroups'],
        subcontractedMachineryGroups: stripGroupDocumentImages(nextMachineryGroups),
        materialGroups: nextMaterialGroups,
        subcontractGroups: stripGroupDocumentImages(nextSubcontractGroups),
        subcontractedMachineryRows: valueArray('subcontractedMachineryRows') as GenerateWorkReportDraft['subcontractedMachineryRows'],
        materialRows: options.includeMaterials
          ? (valueArray('materialRows') as GenerateWorkReportDraft['materialRows'])
          : [],
        subcontractRows: valueArray('subcontractRows') as GenerateWorkReportDraft['subcontractRows'],
        rentalMachineryRows: valueArray('rentalMachineryRows') as GenerateWorkReportDraft['rentalMachineryRows'],
        rentalMachinesSnapshot: valueArray('rentalMachinesSnapshot') as GenerateWorkReportDraft['rentalMachinesSnapshot'],
        wasteRows: options.includeWaste ? (valueArray('wasteRows') as GenerateWorkReportDraft['wasteRows']) : [],
        observationsCompleted: valueBoolean('observationsCompleted'),
        observationsCategory: normalizeNoteCategory(payload.observationsCategory),
        observationsText: valueString('observationsText'),
        galleryImages: options.includeImages
          ? (valueArray('galleryImages') as GenerateWorkReportDraft['galleryImages'])
          : [],
        foremanResources: valueArray('foremanResources') as GenerateWorkReportDraft['foremanResources'],
        mainForeman: valueString('mainForeman'),
        mainForemanHours: valueNumber('mainForemanHours'),
        siteManager: valueString('siteManager'),
        autoCloneNextDay: false,
        foremanSignature: options.includeSignatures ? valueString('foremanSignature') : '',
        siteManagerSignature: options.includeSignatures ? valueString('siteManagerSignature') : '',
        workReportStatus: 'draft',
        missingDeliveryNotes: false,
        cloneSourceReportId: cloneSourceReport.id,
        cloneSourceReportIdentifier: sourceIdentifier,
        cloneSourceWorkName: sourceWorkName,
        cloneRequiresReview: true,
        cloneCreatedAt: new Date().toISOString(),
        cloneIncludedImages: options.includeImages,
        cloneIncludedSignatures: options.includeSignatures,
        cloneIncludedMaterials: options.includeMaterials,
        cloneIncludedWaste: options.includeWaste,
      };

      setCloneDialogOpen(false);
      setCloneSourceReport(null);
      setHistoryOpen(false);
      setActiveReport(null);
      setManualCloneDraft(cloneDraft);
      setGeneratePanelDate(options.targetDate);
      setGeneratePanelOpen(true);

      toast({
        title: 'Parte clonado',
        description: `Se clonó el parte ${sourceIdentifier}. Revisa los datos antes de guardar.`,
        variant: 'default',
      });
    },
    [
      cloneSourceReport,
      setCloneDialogOpen,
      setCloneSourceReport,
      setHistoryOpen,
      setActiveReport,
      setManualCloneDraft,
      setGeneratePanelDate,
      setGeneratePanelOpen,
    ],
  );

  const persistGeneratedWorkReport = useCallback(
    async (
      draft: GenerateWorkReportDraft,
      options: { skipOverwritePrompt?: boolean } = {},
    ) => {
      if (!user) return;
      if (tenantUnavailable) {
        toast({
          title: 'No se pudo guardar',
          description: tenantErrorMessage,
          variant: 'destructive',
        });
        return;
      }
      if (workReportsReadOnlyByRole) {
        toast({
          title: 'Solo lectura',
          description: 'Este perfil no puede guardar ni modificar partes.',
          variant: 'destructive',
        });
        return;
      }

      try {
        setGeneratePanelSaving(true);
        setWorkReportsLoading(true);
        const preparedTenantId = await prepareOfflineTenantScope(user, { tenantId: resolvedTenantId });

        const normalizedWorkNumber = draft.workNumber.trim().toLowerCase();
        const normalizedWorkName = draft.workName.trim().toLowerCase();
        const existingReports = await workReportsRepo.list({ tenantId: preparedTenantId, limit: 500 });

        const existing = existingReports.find((candidate) => {
          if (candidate.date !== draft.date) return false;
          const candidateNumber = payloadText(candidate.payload, 'workNumber')?.trim().toLowerCase();
          if (candidateNumber && candidateNumber === normalizedWorkNumber) return true;
          const candidateName = (payloadText(candidate.payload, 'workName') ?? candidate.title ?? '').trim().toLowerCase();
          return Boolean(candidateName) && candidateName === normalizedWorkName;
        });

        const existingIsClosed = existing
          ? (payloadBoolean(existing.payload, 'isClosed') ?? false) || existing.status === 'completed'
          : false;
        const existingIdentifier = existing
          ? payloadText(existing.payload, 'reportIdentifier') ?? existing.id.slice(0, 8)
          : null;

        if (existing && existingIsClosed) {
          toast({
            title: 'Parte cerrado',
            description: `El parte ${existingIdentifier ?? existing.id.slice(0, 8)} está cerrado y solo puede visualizarse.`,
            variant: 'destructive',
          });
          return;
        }

        if (existing && !existingIsClosed && !options.skipOverwritePrompt) {
          setPendingOverwrite({
            draft,
            reportIdentifier: existingIdentifier ?? existing.id.slice(0, 8),
          });
          return;
        }

        const reportIdentifier = existingIdentifier || generateReportIdentifier(draft.date);
        const requestedStatus = draft.workReportStatus;
        const statusToStore: WorkReportStatus =
          requestedStatus === 'completed' ||
          requestedStatus === 'missing_data' ||
          requestedStatus === 'missing_delivery_notes'
            ? requestedStatus
            : draft.isClosed
            ? 'completed'
            : 'draft';
        const missingDeliveryNotes = statusToStore === 'missing_delivery_notes' || draft.missingDeliveryNotes === true;
        const isClosedToStore = statusToStore === 'completed';
        const existingPayload = existing ? asRecord(existing.payload) : null;
        const existingProjectId =
          existing?.projectId ??
          (existingPayload ? (typeof existingPayload.projectId === 'string' ? existingPayload.projectId : null) : null);
        const resolvedProjectId = draft.workId ?? existingProjectId ?? null;

        const payloadToStore = {
          ...draft,
          workId: resolvedProjectId,
          projectId: resolvedProjectId,
          source: 'generate-work-report-panel',
          reportIdentifier,
          totalHours: draft.totalHours,
          isClosed: isClosedToStore,
          workReportStatus: statusToStore,
          missingDeliveryNotes,
          lastModifiedAt: new Date().toISOString(),
        };

        let wasUpdated = false;

        if (existing) {
          await workReportsRepo.update(existing.id, {
            projectId: resolvedProjectId,
            title: draft.workName || `Parte ${draft.date}`,
            date: draft.date,
            status: statusToStore,
            payload: payloadToStore,
          });
          wasUpdated = true;
        } else {
          await workReportsRepo.create({
            tenantId: preparedTenantId,
            projectId: resolvedProjectId,
            title: draft.workName || `Parte ${draft.date}`,
            date: draft.date,
            status: statusToStore,
            payload: payloadToStore,
          });
        }

        setPendingOverwrite(null);
        toast({
          title: wasUpdated ? 'Parte actualizado' : 'Parte guardado',
          description: `${wasUpdated ? 'Parte sobrescrito' : 'Parte creado'} en local (offline). Identificador: ${reportIdentifier}.`,
          variant: 'default',
        });

        setActiveReport(null);
        setManualCloneDraft(null);
        setGeneratePanelOpen(false);
        await loadWorkReports();
      } catch (error) {
        if (isTenantResolutionError(error)) {
          toast({
            title: 'No se pudo guardar',
            description: tenantErrorMessage,
            variant: 'destructive',
          });
          return;
        }

        console.error('[WorkReports] Error creating local work report:', error);
        toast({
          title: 'Error creando parte',
          description: 'No se pudo crear el parte en local.',
          variant: 'destructive',
        });
      } finally {
        setGeneratePanelSaving(false);
        setWorkReportsLoading(false);
      }
    },
    [
      generateReportIdentifier,
      loadWorkReports,
      resolvedTenantId,
      setActiveReport,
      setGeneratePanelOpen,
      setGeneratePanelSaving,
      setManualCloneDraft,
      setPendingOverwrite,
      setWorkReportsLoading,
      tenantErrorMessage,
      tenantUnavailable,
      user,
      workReportsReadOnlyByRole,
    ],
  );

  const handleSaveGeneratedWorkReport = useCallback(
    async (draft: GenerateWorkReportDraft) => {
      await persistGeneratedWorkReport(draft);
    },
    [persistGeneratedWorkReport],
  );

  const handleConfirmOverwrite = useCallback(async () => {
    if (!pendingOverwrite) return;
    const draftToPersist = pendingOverwrite.draft;
    setPendingOverwrite(null);
    await persistGeneratedWorkReport(draftToPersist, { skipOverwritePrompt: true });
  }, [pendingOverwrite, persistGeneratedWorkReport, setPendingOverwrite]);

  return {
    openGenerateWorkReport,
    openExistingReport,
    openHistoryReport,
    openCloneFromHistoryDialog,
    handleCloneFromHistory,
    handleSaveGeneratedWorkReport,
    handleConfirmOverwrite,
  };
};
