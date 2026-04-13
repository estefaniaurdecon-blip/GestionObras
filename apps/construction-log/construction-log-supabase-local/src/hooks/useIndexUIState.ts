import { useState } from 'react';
import type { GenerateWorkReportDraft } from '@/components/GenerateWorkReportPanel';
import type { PendingOverwrite } from '@/hooks/useWorkReportMutations';
import type { WorkReport } from '@/offline-db/types';

export const useIndexUIState = () => {
  const [activeTab, setActiveTab] = useState('work-reports');
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [workReports, setWorkReports] = useState<WorkReport[]>([]);
  const [allWorkReports, setAllWorkReports] = useState<WorkReport[]>([]);
  const [allWorkReportsLoaded, setAllWorkReportsLoaded] = useState(false);
  const [allWorkReportsLoading, setAllWorkReportsLoading] = useState(false);
  const [workReportsLoading, setWorkReportsLoading] = useState(false);
  const [generatePanelOpen, setGeneratePanelOpen] = useState(false);
  const [generatePanelSaving, setGeneratePanelSaving] = useState(false);
  const [generatePanelDate, setGeneratePanelDate] = useState<string | undefined>(undefined);
  const [activeReport, setActiveReport] = useState<WorkReport | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSourceReport, setCloneSourceReport] = useState<WorkReport | null>(null);
  const [manualCloneDraft, setManualCloneDraft] = useState<GenerateWorkReportDraft | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite | null>(null);
  const [syncing, setSyncing] = useState(false);

  return {
    activeTab,
    setActiveTab,
    metricsOpen,
    setMetricsOpen,
    workReports,
    setWorkReports,
    allWorkReports,
    setAllWorkReports,
    allWorkReportsLoaded,
    setAllWorkReportsLoaded,
    allWorkReportsLoading,
    setAllWorkReportsLoading,
    workReportsLoading,
    setWorkReportsLoading,
    generatePanelOpen,
    setGeneratePanelOpen,
    generatePanelSaving,
    setGeneratePanelSaving,
    generatePanelDate,
    setGeneratePanelDate,
    activeReport,
    setActiveReport,
    historyOpen,
    setHistoryOpen,
    cloneDialogOpen,
    setCloneDialogOpen,
    cloneSourceReport,
    setCloneSourceReport,
    manualCloneDraft,
    setManualCloneDraft,
    pendingOverwrite,
    setPendingOverwrite,
    syncing,
    setSyncing,
  };
};
