import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { WorkBasic } from '@/types/work';
import { listManagedUserAssignments, listProjects } from '@/integrations/api/client';

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

      // Get work IDs assigned to the user via API
      const workIds = await listManagedUserAssignments(Number(user.id));

      if (workIds.length > 0) {
        // Get all projects and filter by assigned IDs
        const allProjects = await listProjects();
        const assignedProjects = allProjects
          .filter(p => workIds.includes(p.id))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        setWorks(assignedProjects as unknown as Work[]);
      } else {
        setWorks([]);
      }
    } catch (error: unknown) {
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
