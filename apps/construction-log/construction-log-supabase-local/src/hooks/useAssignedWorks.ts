import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { WorkBasic } from '@/types/work';

// Use WorkBasic for assigned works (only essential fields needed)
export type Work = WorkBasic;

export const useAssignedWorks = () => {
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const loadWorks = async () => {
    if (!user) {
      setWorks([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Get works assigned to the user through work_assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from('work_assignments')
        .select('work_id')
        .eq('user_id', user.id);

      if (assignmentsError) throw assignmentsError;

      if (assignments && assignments.length > 0) {
        const workIds = assignments.map(a => a.work_id);
        
        const { data: worksData, error: worksError } = await supabase
          .from('works')
          .select('*')
          .in('id', workIds)
          .order('name', { ascending: true });

        if (worksError) throw worksError;

        if (worksData) {
          setWorks(worksData);
        }
      } else {
        setWorks([]);
      }
    } catch (error: any) {
      console.error('Error loading assigned works:', error);
      setWorks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadWorks();
    }
  }, [user?.id]);

  return {
    works,
    loading,
    reloadWorks: loadWorks,
  };
};
