import { useEffect, useCallback } from 'react';
import { WorkReport } from '@/types/workReport';
import { AccessEntry } from '@/types/accessControl';
import { useAuth } from '@/contexts/AuthContext';
import {
  createAccessControlReport,
  listAccessControlReports,
  listRentalMachinery,
  updateAccessControlReport,
  type ApiAccessControlReport,
} from '@/integrations/api/client';
import { toAccessEntries } from '@/utils/accessControlHelpers';

interface UseAccessControlSyncProps {
  workReport: WorkReport | undefined;
  enabled: boolean;
}

const resolveProjectId = (workId?: string): number | null => {
  if (!workId) return null;
  if (!/^\d+$/.test(workId.trim())) return null;
  const parsed = Number(workId);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const toExternalId = (report: WorkReport): string => {
  const reportId = (report.id || '').trim();
  if (reportId) return `work-report:${reportId}`;
  const workId = (report.workId || '').trim() || 'unknown';
  return `work:${workId}:${report.date}`;
};


export const useAccessControlSync = ({ workReport, enabled }: UseAccessControlSyncProps) => {
  const { user } = useAuth();

  const comparePersonalEntries = (existing: AccessEntry[], nextEntries: AccessEntry[]): boolean => {
    if (existing.length !== nextEntries.length) return false;

    const normalize = (entries: AccessEntry[]) => entries.map((entry) => `${entry.name}|${entry.company}|${entry.activity}`).sort();

    const existingNormalized = normalize(existing);
    const nextNormalized = normalize(nextEntries);

    return existingNormalized.every((value, index) => value === nextNormalized[index]);
  };

  const compareMachineryEntries = (existing: AccessEntry[], nextEntries: AccessEntry[]): boolean => {
    if (existing.length !== nextEntries.length) return false;

    const normalize = (entries: AccessEntry[]) =>
      entries
        .map(
          (entry) =>
            `${entry.name}|${entry.identifier}|${entry.company}|${entry.activity}|${entry.operator || ''}|${entry.source || ''}`
        )
        .sort();

    const existingNormalized = normalize(existing);
    const nextNormalized = normalize(nextEntries);

    return existingNormalized.every((value, index) => value === nextNormalized[index]);
  };

  const resolveExistingReport = (
    reports: ApiAccessControlReport[],
    externalId: string,
    projectId: number | null,
    workName: string
  ): ApiAccessControlReport | null => {
    const byExternalId = reports.find((report) => (report.external_id || '').trim() === externalId);
    if (byExternalId) return byExternalId;

    if (projectId !== null) {
      const byProject = reports.find((report) => report.project_id === projectId);
      if (byProject) return byProject;
    }

    const bySiteName = reports.find((report) => report.site_name === workName);
    return bySiteName || null;
  };

  const syncAccessControl = useCallback(
    async (report: WorkReport) => {
      if (!enabled || !report.date || !user?.id) return;

      const tenantId = user.tenant_id;
      if (!tenantId) {
        console.warn('[AccessControlSync] Missing tenant scope. Skipping sync.');
        return;
      }

      try {
        const calculateExitTime = (entryTime: string, hours: number): string => {
          if (!hours || hours <= 0) return '';
          const [entryHour, entryMinute] = entryTime.split(':').map(Number);
          const totalHours = hours > 6 ? hours + 1 : hours;
          const totalMinutes = entryHour * 60 + entryMinute + totalHours * 60;
          const exitHour = Math.floor(totalMinutes / 60) % 24;
          const exitMinute = Math.floor(totalMinutes % 60);
          return `${exitHour.toString().padStart(2, '0')}:${exitMinute.toString().padStart(2, '0')}`;
        };

        const personalFromWorkGroups: AccessEntry[] = (report.workGroups || []).flatMap((group) =>
          group.items.map((worker) => {
            const entryTime = '08:00';
            const exitTime = calculateExitTime(entryTime, worker.hours);
            return {
              id: crypto.randomUUID(),
              type: 'personal',
              name: worker.name,
              identifier: '',
              company: group.company,
              entryTime,
              exitTime,
              activity: worker.activity,
              signature: undefined,
            };
          })
        );

        const personalFromSubcontracts: AccessEntry[] = (report.subcontractGroups || []).flatMap((group) =>
          group.items.flatMap((item) => {
            if (item.workerDetails && item.workerDetails.length > 0) {
              return item.workerDetails.map((worker) => {
                const entryTime = '08:00';
                const exitTime = calculateExitTime(entryTime, worker.hours || item.hours || 0);
                return {
                  id: crypto.randomUUID(),
                  type: 'personal' as const,
                  name: worker.name,
                  identifier: worker.dni || '',
                  company: group.company,
                  entryTime,
                  exitTime,
                  activity: item.activity || item.contractedPart || '',
                  signature: undefined,
                };
              });
            }

            if (item.workers && item.workers > 0) {
              return Array.from({ length: item.workers }, (_, index) => {
                const entryTime = '08:00';
                const exitTime = calculateExitTime(entryTime, item.hours || 0);
                return {
                  id: crypto.randomUUID(),
                  type: 'personal' as const,
                  name: `Trabajador ${index + 1}`,
                  identifier: '',
                  company: group.company,
                  entryTime,
                  exitTime,
                  activity: item.activity || item.contractedPart || '',
                  signature: undefined,
                };
              });
            }

            return [];
          })
        );

        const personalEntries: AccessEntry[] = [...personalFromWorkGroups, ...personalFromSubcontracts];

        const machineryFromGroups: AccessEntry[] = (report.machineryGroups || []).flatMap((group) =>
          group.items.map((item) => {
            const entryTime = '08:00';
            const exitTime = calculateExitTime(entryTime, item.hours);
            return {
              id: crypto.randomUUID(),
              type: 'machinery',
              name: item.type,
              identifier: '',
              company: group.company,
              entryTime,
              exitTime,
              activity: item.activity,
              operator: 'Operador incluido',
              source: 'subcontract',
            };
          })
        );

        const projectId = resolveProjectId(report.workId);
        const rentalRows = projectId
          ? await listRentalMachinery({
              tenantId,
              projectId,
              date: report.date,
              status: 'active',
              limit: 500,
            })
          : [];

        const machineryFromRental: AccessEntry[] = rentalRows.map((machine) => ({
          id: crypto.randomUUID(),
          type: 'machinery',
          name: machine.name || 'Maquinaria de alquiler',
          identifier: machine.description || '',
          company: machine.provider || '',
          entryTime: '08:00',
          exitTime: '',
          activity: 'Maquinaria de Alquiler',
          operator: undefined,
          source: 'rental',
        }));

        const allMachineryEntries = [...machineryFromGroups, ...machineryFromRental];
        const externalId = toExternalId(report);

        const existingCandidates = await listAccessControlReports({
          tenantId,
          projectId: projectId ?? undefined,
          dateFrom: report.date,
          dateTo: report.date,
          limit: 200,
        });

        const existingReport = resolveExistingReport(
          existingCandidates,
          externalId,
          projectId,
          report.workName
        );

        if (existingReport) {
          const existingPersonal = toAccessEntries(existingReport.personal_entries, 'personal');
          const existingMachinery = toAccessEntries(existingReport.machinery_entries, 'machinery');

          const personalChanged = !comparePersonalEntries(existingPersonal, personalEntries);
          const machineryChanged = !compareMachineryEntries(existingMachinery, allMachineryEntries);

          if (!personalChanged && !machineryChanged) {
            console.log('[AccessControlSync] No changes detected; skipping update.');
            return;
          }

          const updatePayload: Record<string, unknown> = {
            expected_updated_at: existingReport.updated_at,
          };

          if (personalChanged) {
            updatePayload.personal_entries = personalEntries as unknown as Record<string, unknown>[];
            console.log('[AccessControlSync] Updating personal entries.');
          }

          if (machineryChanged) {
            updatePayload.machinery_entries = allMachineryEntries as unknown as Record<string, unknown>[];
            console.log('[AccessControlSync] Updating machinery entries.');
          }

          await updateAccessControlReport(existingReport.id, updatePayload, tenantId);
          console.log('[AccessControlSync] Access control report updated:', existingReport.id);
          return;
        }

        if (personalEntries.length === 0 && allMachineryEntries.length === 0) {
          console.log('[AccessControlSync] No entries to create access control report.');
          return;
        }

        await createAccessControlReport(
          {
            date: report.date,
            site_name: report.workName,
            responsible: (user.full_name || report.foreman || '').trim(),
            project_id: projectId,
            external_id: externalId,
            responsible_entry_time: null,
            responsible_exit_time: null,
            observations: report.observations || '',
            personal_entries: personalEntries as unknown as Record<string, unknown>[],
            machinery_entries: allMachineryEntries as unknown as Record<string, unknown>[],
          },
          tenantId
        );

        console.log(
          '[AccessControlSync] Access control report created automatically with',
          personalEntries.length,
          'personal and',
          allMachineryEntries.length,
          'machinery entries'
        );
      } catch (error) {
        console.error('[AccessControlSync] Error syncing access control:', error);
      }
    },
    [enabled, user?.full_name, user?.id, user?.tenant_id]
  );

  useEffect(() => {
    if (!enabled) return;

    const handleSyncEvent = (event: CustomEvent) => {
      const { report } = event.detail as { report: WorkReport; isNewReport: boolean };
      syncAccessControl(report);
    };

    window.addEventListener('sync-access-control', handleSyncEvent as EventListener);

    return () => {
      window.removeEventListener('sync-access-control', handleSyncEvent as EventListener);
    };
  }, [syncAccessControl, enabled]);

  return { syncAccessControl };
};
