import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInDays, parseISO, addDays, format } from 'date-fns';
import { listManagedUserAssignments, listPhases, listProjects } from '@/integrations/api/client';

export interface DeadlineItem {
  id: string;
  name: string;
  workName: string | null;
  workId: string | null;
  endDate: string;
  startDate: string;
  progress: number;
  daysRemaining: number;
  status: 'ok' | 'warning' | 'critical';
  phaseStatus: string;
}

const calculateDeadlineStatus = (endDate: string): { daysRemaining: number; status: 'ok' | 'warning' | 'critical' } => {
  const end = parseISO(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysRemaining = differenceInDays(end, today);

  if (daysRemaining <= 0) {
    return { daysRemaining, status: 'critical' };
  } else if (daysRemaining <= 3) {
    return { daysRemaining, status: 'warning' };
  }
  return { daysRemaining, status: 'ok' };
};

export const useUpcomingDeadlines = (limit: number = 5) => {
  const { user } = useAuth();

  const { data: deadlines = [], isLoading, error, refetch } = useQuery({
    queryKey: ['upcoming-deadlines', user?.id, limit],
    queryFn: async (): Promise<DeadlineItem[]> => {
      if (!user?.id) return [];

      // Get works assigned to the current user via API
      let assignedWorkIds: number[] = [];
      try {
        assignedWorkIds = await listManagedUserAssignments(Number(user.id));
      } catch {
        console.error('Error fetching work assignments');
      }

      // Get all phases and projects via API
      const [allPhases, allProjects] = await Promise.all([
        listPhases(),
        listProjects(),
      ]);

      // Build project name map
      const projectNameMap = new Map<number, string>();
      for (const p of allProjects) {
        projectNameMap.set(p.id, p.name || '');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTs = today.getTime();
      const nextWeekTs = addDays(today, 7).getTime();

      // Filter phases: pending/in_progress, deadline or started, optionally by assigned works
      const filtered = allPhases.filter((phase: any) => {
        if (!['pending', 'in_progress'].includes(phase.status)) return false;

        const endTs = phase.end_date ? parseISO(phase.end_date).getTime() : Infinity;
        const startTs = phase.start_date ? parseISO(phase.start_date).getTime() : Infinity;
        if (endTs > nextWeekTs && startTs > todayTs) return false;

        if (assignedWorkIds.length > 0 && !assignedWorkIds.includes(phase.project_id)) return false;

        return true;
      });

      // Transform and calculate deadline info
      const deadlineItems: DeadlineItem[] = filtered
        .map((phase: any) => {
          const { daysRemaining, status } = calculateDeadlineStatus(phase.end_date);
          return {
            id: String(phase.id),
            name: phase.name,
            workName: projectNameMap.get(phase.project_id) || null,
            workId: phase.project_id != null ? String(phase.project_id) : null,
            endDate: phase.end_date,
            startDate: phase.start_date,
            progress: phase.progress || 0,
            daysRemaining,
            status,
            phaseStatus: phase.status,
          };
        })
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .slice(0, limit);

      return deadlineItems;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    deadlines,
    isLoading,
    error,
    refetch,
  };
};
