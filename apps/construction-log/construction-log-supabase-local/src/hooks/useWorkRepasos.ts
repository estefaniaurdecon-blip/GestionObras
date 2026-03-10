import { toast } from 'sonner';

export interface RepasoWorker {
  name: string;
  hours: number;
}

export interface RepasoMachinery {
  type: string;
  hours: number;
}

export interface RepasoSubcontractGroup {
  company: string;
  workers: RepasoWorker[];
  machinery: RepasoMachinery[];
}

export interface WorkRepaso {
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
  subcontract_groups: RepasoSubcontractGroup[];
  created_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRepasoData {
  description: string;
  assigned_company?: string;
  estimated_hours?: number;
  actual_hours?: number;
  before_image?: string;
  after_image?: string;
  status?: 'pending' | 'in_progress' | 'completed';
  subcontract_groups?: RepasoSubcontractGroup[];
}

export interface UpdateRepasoData extends Partial<CreateRepasoData> {
  completed_at?: string | null;
  completed_by?: string | null;
}

const notifyUnavailable = () => {
  toast.error('Los repasos legacy estan desactivados hasta completar la migracion.');
};

export const useWorkRepasos = (_workId: string) => {
  const createRepaso = async (_data: CreateRepasoData) => {
    notifyUnavailable();
    return null;
  };

  const updateRepaso = async (_id: string, _data: UpdateRepasoData) => {
    notifyUnavailable();
    return null;
  };

  const deleteRepaso = async (_id: string) => {
    notifyUnavailable();
    return false;
  };

  const refreshRepasos = async () => {
    return [];
  };

  return {
    repasos: [] as WorkRepaso[],
    loading: false,
    stats: {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      totalEstimatedHours: 0,
      totalActualHours: 0,
    },
    createRepaso,
    updateRepaso,
    deleteRepaso,
    refreshRepasos,
  };
};
