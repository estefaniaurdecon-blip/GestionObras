import { useMemo } from 'react';
import { normalizeNoteCategory } from '@/components/ObservacionesIncidenciasSection';
import type { GenerateWorkReportDraft } from '@/components/GenerateWorkReportPanel';
import type { WorkReport, WorkReportStatus } from '@/offline-db/types';
import { asRecord, payloadBoolean, payloadText } from '@/pages/indexHelpers';

type UseActiveReportPanelDataResult = {
  panelReadOnly: boolean;
  panelReportIdentifier: string | null;
  panelInitialDraft: GenerateWorkReportDraft | null;
};

export const useActiveReportPanelData = (
  activeReport: WorkReport | null,
  workReportsReadOnlyByRole: boolean,
): UseActiveReportPanelDataResult => {
  const panelReadOnly = useMemo(() => {
    if (workReportsReadOnlyByRole) return true;
    if (!activeReport) return false;
    return (payloadBoolean(activeReport.payload, 'isClosed') ?? false) || activeReport.status === 'completed';
  }, [activeReport, workReportsReadOnlyByRole]);

  const panelReportIdentifier = useMemo(() => {
    if (!activeReport) return null;
    return payloadText(activeReport.payload, 'reportIdentifier') ?? activeReport.id.slice(0, 8);
  }, [activeReport]);

  const panelInitialDraft = useMemo<GenerateWorkReportDraft | null>(() => {
    if (!activeReport) return null;
    const payload = asRecord(activeReport.payload) ?? {};
    const valueString = (key: string, fallback = '') => {
      const value = payload[key];
      return typeof value === 'string' ? value : fallback;
    };
    const valueNumber = (key: string, fallback = 0) => {
      const value = payload[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    };
    const valuePositiveInteger = (key: string): number | null => {
      const value = payload[key];
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
      if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
        const parsed = Number.parseInt(value.trim(), 10);
        return parsed > 0 ? parsed : null;
      }
      return null;
    };
    const valueBoolean = (key: string, fallback = false) => {
      const value = payload[key];
      return typeof value === 'boolean' ? value : fallback;
    };
    const valueArray = (key: string) => {
      const value = payload[key];
      return Array.isArray(value) ? value : [];
    };
    const fallbackWorkId = typeof activeReport.projectId === 'string' ? activeReport.projectId : '';

    return {
      workId: valueString('workId', fallbackWorkId) || null,
      workNumber: valueString('workNumber'),
      workName: valueString('workName', activeReport.title ?? ''),
      date: valueString('date', activeReport.date),
      totalHours: valueNumber('totalHours', 0),
      isClosed: valueBoolean('isClosed', activeReport.status === 'completed'),
      workforceSectionCompleted: valueBoolean('workforceSectionCompleted'),
      workforceGroups: valueArray('workforceGroups') as GenerateWorkReportDraft['workforceGroups'],
      subcontractedMachineryGroups: valueArray(
        'subcontractedMachineryGroups',
      ) as GenerateWorkReportDraft['subcontractedMachineryGroups'],
      materialGroups: valueArray('materialGroups') as GenerateWorkReportDraft['materialGroups'],
      subcontractGroups: valueArray('subcontractGroups') as GenerateWorkReportDraft['subcontractGroups'],
      subcontractedMachineryRows: valueArray(
        'subcontractedMachineryRows',
      ) as GenerateWorkReportDraft['subcontractedMachineryRows'],
      materialRows: valueArray('materialRows') as GenerateWorkReportDraft['materialRows'],
      subcontractRows: valueArray('subcontractRows') as GenerateWorkReportDraft['subcontractRows'],
      rentalMachineryRows: valueArray('rentalMachineryRows') as GenerateWorkReportDraft['rentalMachineryRows'],
      rentalMachinesSnapshot: valueArray(
        'rentalMachinesSnapshot',
      ) as GenerateWorkReportDraft['rentalMachinesSnapshot'],
      wasteRows: valueArray('wasteRows') as GenerateWorkReportDraft['wasteRows'],
      observationsCompleted: valueBoolean('observationsCompleted'),
      observationsCategory: normalizeNoteCategory(payload.observationsCategory),
      observationsText: valueString('observationsText'),
      galleryImages: valueArray('galleryImages') as GenerateWorkReportDraft['galleryImages'],
      foremanResources: valueArray('foremanResources') as GenerateWorkReportDraft['foremanResources'],
      mainForeman: valueString('mainForeman'),
      mainForemanUserId:
        valuePositiveInteger('mainForemanUserId') ?? valuePositiveInteger('main_foreman_user_id'),
      mainForemanHours: valueNumber('mainForemanHours'),
      siteManager: valueString('siteManager'),
      siteManagerUserId:
        valuePositiveInteger('siteManagerUserId') ?? valuePositiveInteger('site_manager_user_id'),
      autoCloneNextDay: valueBoolean('autoCloneNextDay'),
      foremanSignature: valueString('foremanSignature'),
      siteManagerSignature: valueString('siteManagerSignature'),
      workReportStatus: (valueString('workReportStatus', activeReport.status) as WorkReportStatus) ?? activeReport.status,
      missingDeliveryNotes:
        valueBoolean('missingDeliveryNotes') ?? activeReport.status === 'missing_delivery_notes',
      cloneSourceReportId: valueString('cloneSourceReportId', valueString('autoClonedFromReportId')),
      cloneSourceReportIdentifier: valueString(
        'cloneSourceReportIdentifier',
        valueString('autoClonedFromIdentifier'),
      ),
      cloneSourceWorkName: valueString('cloneSourceWorkName'),
      cloneRequiresReview:
        valueBoolean('cloneRequiresReview') ??
        Boolean(valueString('autoClonedFromReportId') || valueString('cloneSourceReportId')),
      cloneCreatedAt: valueString('cloneCreatedAt', valueString('autoClonedAt')),
      cloneIncludedImages: valueBoolean('cloneIncludedImages'),
      cloneIncludedSignatures: valueBoolean('cloneIncludedSignatures'),
      cloneIncludedMaterials: valueBoolean('cloneIncludedMaterials'),
      cloneIncludedWaste: valueBoolean('cloneIncludedWaste'),
    };
  }, [activeReport]);

  return {
    panelReadOnly,
    panelReportIdentifier,
    panelInitialDraft,
  };
};
