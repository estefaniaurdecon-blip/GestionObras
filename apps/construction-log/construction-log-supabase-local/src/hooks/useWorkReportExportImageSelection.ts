import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorkReport } from '@/offline-db/types';
import {
  buildSelectedImageMapByReport,
  collectAlbaranImageCandidates,
  syncSelectedImageIdsWithCandidates,
} from '@/services/workReportExportDomain';

type UseWorkReportExportImageSelectionParams = {
  reports: WorkReport[];
  enabled: boolean;
};

export const useWorkReportExportImageSelection = (
  params: UseWorkReportExportImageSelectionParams,
) => {
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);

  const imageCandidates = useMemo(
    () => params.reports.flatMap((report) => collectAlbaranImageCandidates(report)),
    [params.reports],
  );

  useEffect(() => {
    if (!params.enabled) return;
    setSelectedImageIds((previous) =>
      syncSelectedImageIdsWithCandidates(previous, imageCandidates),
    );
  }, [imageCandidates, params.enabled]);

  const selectedImageMapByReport = useMemo(
    () => buildSelectedImageMapByReport(imageCandidates, selectedImageIds),
    [imageCandidates, selectedImageIds],
  );

  const toggleImageSelection = useCallback((candidateId: string) => {
    setSelectedImageIds((previous) =>
      previous.includes(candidateId)
        ? previous.filter((id) => id !== candidateId)
        : [...previous, candidateId],
    );
  }, []);

  const selectAllImages = useCallback(() => {
    setSelectedImageIds(imageCandidates.map((candidate) => candidate.id));
  }, [imageCandidates]);

  const clearImageSelection = useCallback(() => {
    setSelectedImageIds([]);
  }, []);

  return {
    imageCandidates,
    selectedImageIds,
    includeImagesInExport: selectedImageIds.length > 0,
    selectedImageMapByReport,
    toggleImageSelection,
    selectAllImages,
    clearImageSelection,
  };
};
