import { toast } from 'sonner';

export interface PostventaWorker {
  name: string;
  hours: number;
}

export interface PostventaMachinery {
  type: string;
  hours: number;
}

export interface PostventaSubcontractGroup {
  company: string;
  workers: PostventaWorker[];
  machinery: PostventaMachinery[];
}

export interface WorkPostventa {
  id: string;
  work_id: string;
  organization_id: string;
  code: string;
  status: 'pending' | 'in_progress' | 'completed';
  description: string;
  assigned_company: string | null;
  estimated_hours: number;
  actual_hours: number;
  before_image: string | null;
  after_image: string | null;
  subcontract_groups: PostventaSubcontractGroup[];
  created_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePostventaData {
  description: string;
  assigned_company?: string;
  estimated_hours?: number;
  actual_hours?: number;
  before_image?: string;
  after_image?: string;
  status?: 'pending' | 'in_progress' | 'completed';
  subcontract_groups?: PostventaSubcontractGroup[];
}

export interface UpdatePostventaData extends Partial<CreatePostventaData> {
  completed_at?: string | null;
  completed_by?: string | null;
}

const notifyUnavailable = () => {
  toast.error(
    'Las postventas legacy estan desactivadas hasta completar la migracion.',
  );
};

export const useWorkPostventas = (_workId: string) => {
  const createPostventa = async (_data: CreatePostventaData) => {
    notifyUnavailable();
    return null;
  };

  const updatePostventa = async (_id: string, _data: UpdatePostventaData) => {
    notifyUnavailable();
    return null;
  };

  const deletePostventa = async (_id: string) => {
    notifyUnavailable();
    return false;
  };

  const refreshPostventas = async () => {
    return [];
  };

  return {
    postventas: [] as WorkPostventa[],
    loading: false,
    stats: {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      totalEstimatedHours: 0,
      totalActualHours: 0,
    },
    createPostventa,
    updatePostventa,
    deletePostventa,
    refreshPostventas,
  };
};
