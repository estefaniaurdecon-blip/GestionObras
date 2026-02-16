import { useMemo } from 'react';
import type { WorkReport } from '@/offline-db/types';
import { payloadBoolean } from '@/pages/indexHelpers';

type WorkReportsSummary = {
  total: number;
  completed: number;
  pending: number;
  approved: number;
  completedPctTotal: number;
  approvedPctCompleted: number;
};

type SyncSummary = {
  total: number;
  synced: number;
  pendingSync: number;
  errorSync: number;
  pendingTotal: number;
};

type UseWorkReportsSummaryResult = {
  workReportsSummary: WorkReportsSummary;
  syncSummary: SyncSummary;
  hasSyncPendingValidation: boolean;
  syncPanelClass: string;
  syncTitleClass: string;
  syncHeadlineClass: string;
  syncBadgeClass: string;
  syncIconBubbleClass: string;
  syncStatusBadgeLabel: string;
};

export const useWorkReportsSummary = (workReports: WorkReport[]): UseWorkReportsSummaryResult => {
  const workReportsSummary = useMemo<WorkReportsSummary>(() => {
    const total = workReports.length;
    const completed = workReports.filter((report) => {
      const isClosedByPayload = payloadBoolean(report.payload, 'isClosed') ?? false;
      return report.status === 'completed' || isClosedByPayload;
    }).length;
    const approved = workReports.filter((report) => report.status === 'approved').length;
    const pending = Math.max(total - completed - approved, 0);

    const percentage = (value: number, base: number) => {
      if (base <= 0) return 0;
      return Math.round((value / base) * 100);
    };

    return {
      total,
      completed,
      pending,
      approved,
      completedPctTotal: percentage(completed, total),
      approvedPctCompleted: percentage(approved, completed),
    };
  }, [workReports]);

  const syncSummary = useMemo<SyncSummary>(() => {
    const total = workReports.length;
    let synced = 0;
    let pendingSync = 0;
    let errorSync = 0;

    workReports.forEach((report) => {
      if (report.syncStatus === 'synced') {
        synced += 1;
      } else if (report.syncStatus === 'error') {
        errorSync += 1;
      } else {
        pendingSync += 1;
      }
    });

    const pendingTotal = pendingSync + errorSync;
    return {
      total,
      synced,
      pendingSync,
      errorSync,
      pendingTotal,
    };
  }, [workReports]);

  const hasSyncPendingValidation = syncSummary.pendingTotal > 0;
  const syncPanelClass = hasSyncPendingValidation
    ? 'border-amber-300 bg-amber-100/70'
    : 'border-emerald-200 bg-emerald-50/60';
  const syncTitleClass = hasSyncPendingValidation ? 'text-amber-900' : 'text-emerald-800';
  const syncHeadlineClass = hasSyncPendingValidation ? 'text-amber-900' : 'text-emerald-900';
  const syncBadgeClass = hasSyncPendingValidation
    ? 'border-amber-400 bg-amber-200 text-amber-900'
    : 'border-emerald-300 bg-emerald-100 text-emerald-700';
  const syncIconBubbleClass = hasSyncPendingValidation
    ? 'bg-amber-200 text-amber-700'
    : 'bg-emerald-100 text-emerald-600';
  const syncStatusBadgeLabel = hasSyncPendingValidation ? 'Pendientes de validación' : 'Sin pendientes';

  return {
    workReportsSummary,
    syncSummary,
    hasSyncPendingValidation,
    syncPanelClass,
    syncTitleClass,
    syncHeadlineClass,
    syncBadgeClass,
    syncIconBubbleClass,
    syncStatusBadgeLabel,
  };
};
