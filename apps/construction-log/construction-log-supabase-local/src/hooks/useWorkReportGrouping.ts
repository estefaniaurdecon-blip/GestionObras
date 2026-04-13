import { useMemo } from 'react';
import { WorkReport } from '@/types/workReport';

// Helper: ISO week number of the year
export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export interface UseWorkReportGroupingResult {
  weeklyGroups: [string, [string, WorkReport[]][]][];
  monthlyGroups: [string, [string, WorkReport[]][]][];
  foremanGroups: [string, WorkReport[]][];
  workGroups: [string, WorkReport[]][];
}

export function useWorkReportGrouping(filteredReports: WorkReport[]): UseWorkReportGroupingResult {
  // Group by week then by work
  const weeklyGroups = useMemo(() => {
    const groups = new Map<string, Map<string, WorkReport[]>>();

    filteredReports.forEach(report => {
      const reportDate = new Date(report.date);
      const year = reportDate.getFullYear();
      const weekNum = getWeekNumber(reportDate);
      const weekKey = `${year}-S${weekNum.toString().padStart(2, '0')}`;
      const workKey = `${report.workNumber}|||${report.workName}`;

      if (!groups.has(weekKey)) {
        groups.set(weekKey, new Map());
      }

      const weekGroup = groups.get(weekKey)!;
      if (!weekGroup.has(workKey)) {
        weekGroup.set(workKey, []);
      }
      weekGroup.get(workKey)!.push(report);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([weekKey, workGroups]): [string, [string, WorkReport[]][]] => {
        const sortedWorkGroups = Array.from(workGroups.entries())
          .sort(([a], [b]) => {
            const [numA] = a.split('|||');
            const [numB] = b.split('|||');
            return numA.localeCompare(numB);
          });
        return [weekKey, sortedWorkGroups];
      });
  }, [filteredReports]);

  // Group by month then by work
  const monthlyGroups = useMemo(() => {
    const groups = new Map<string, Map<string, WorkReport[]>>();

    filteredReports.forEach(report => {
      const reportDate = new Date(report.date);
      const monthKey = `${reportDate.getFullYear()}-${(reportDate.getMonth() + 1).toString().padStart(2, '0')}`;
      const workKey = `${report.workNumber}|||${report.workName}`;

      if (!groups.has(monthKey)) {
        groups.set(monthKey, new Map());
      }

      const monthGroup = groups.get(monthKey)!;
      if (!monthGroup.has(workKey)) {
        monthGroup.set(workKey, []);
      }
      monthGroup.get(workKey)!.push(report);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, workGroups]): [string, [string, WorkReport[]][]] => {
        const sortedWorkGroups = Array.from(workGroups.entries())
          .sort(([a], [b]) => {
            const [numA] = a.split('|||');
            const [numB] = b.split('|||');
            return numA.localeCompare(numB);
          });
        return [monthKey, sortedWorkGroups];
      });
  }, [filteredReports]);

  // Group by foreman (Title Case normalized)
  const foremanGroups = useMemo((): [string, WorkReport[]][] => {
    const groups = new Map<string, WorkReport[]>();

    filteredReports.forEach(report => {
      const rawForeman = report.foreman || 'Sin Encargado';
      const foremanName = rawForeman === 'Sin Encargado'
        ? rawForeman
        : rawForeman
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

      if (!groups.has(foremanName)) {
        groups.set(foremanName, []);
      }
      groups.get(foremanName)!.push(report);
    });

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredReports]);

  // Group by work (for office role)
  const workGroups = useMemo((): [string, WorkReport[]][] => {
    const groups = new Map<string, WorkReport[]>();

    filteredReports.forEach(report => {
      const workKey = `${report.workNumber || 'N/A'} - ${report.workName || 'Sin nombre'}`;

      if (!groups.has(workKey)) {
        groups.set(workKey, []);
      }
      groups.get(workKey)!.push(report);
    });

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredReports]);

  return { weeklyGroups, monthlyGroups, foremanGroups, workGroups };
}
