import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInDays, parseISO, addDays, format } from 'date-fns';

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

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = format(today, 'yyyy-MM-dd');
      const nextWeekStr = format(addDays(today, 7), 'yyyy-MM-dd');

      // First, get works assigned to the current user
      const { data: assignments, error: assignmentsError } = await supabase
        .from('work_assignments')
        .select('work_id')
        .eq('user_id', user.id);

      if (assignmentsError) {
        console.error('Error fetching work assignments:', assignmentsError);
        throw assignmentsError;
      }

      const assignedWorkIds = assignments?.map(a => a.work_id) || [];

      // Fetch phases with smart filters
      let query = supabase
        .from('phases')
        .select(`
          id,
          name,
          start_date,
          end_date,
          progress,
          status,
          work_id,
          works:work_id (name)
        `)
        .in('status', ['pending', 'in_progress'])
        .or(`end_date.lte.${nextWeekStr},start_date.lte.${todayStr}`)
        .order('end_date', { ascending: true })
        .limit(limit * 2); // Fetch extra to filter later

      // If user has assigned works, filter by those works
      // If no assignments (admin/master), they see all org phases
      if (assignedWorkIds.length > 0) {
        query = query.in('work_id', assignedWorkIds);
      }

      const { data: phases, error: phasesError } = await query;

      if (phasesError) {
        console.error('Error fetching phases:', phasesError);
        throw phasesError;
      }

      // Transform and calculate deadline info
      const deadlineItems: DeadlineItem[] = (phases || [])
        .map((phase: any) => {
          const { daysRemaining, status } = calculateDeadlineStatus(phase.end_date);
          return {
            id: phase.id,
            name: phase.name,
            workName: phase.works?.name || null,
            workId: phase.work_id,
            endDate: phase.end_date,
            startDate: phase.start_date,
            progress: phase.progress || 0,
            daysRemaining,
            status,
            phaseStatus: phase.status,
          };
        })
        // Sort by urgency (most critical first)
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
