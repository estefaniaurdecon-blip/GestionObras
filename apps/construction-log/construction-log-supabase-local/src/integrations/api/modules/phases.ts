type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

export interface PhasesApiDeps {
  apiFetchJson: ApiFetchJsonFn;
}

export type ApiPhaseStatus = 'pending' | 'in_progress' | 'completed';

export interface ApiPhase {
  id: number;
  tenant_id: number;
  project_id?: number | null;
  name: string;
  description?: string | null;
  responsible?: string | null;
  start_date: string;
  end_date: string;
  status: ApiPhaseStatus;
  progress: number;
  created_by_id?: number | null;
  created_at: string;
  updated_at: string;
  work_name?: string | null;
}

export interface CreatePhasePayload {
  name: string;
  project_id?: number | null;
  description?: string | null;
  responsible?: string | null;
  start_date: string;
  end_date: string;
  status?: ApiPhaseStatus;
  progress?: number;
}

export interface UpdatePhasePayload {
  name?: string;
  project_id?: number | null;
  description?: string | null;
  responsible?: string | null;
  start_date?: string;
  end_date?: string;
  status?: ApiPhaseStatus;
  progress?: number;
}

export function createPhasesApi(deps: PhasesApiDeps) {
  const listPhases = async (): Promise<ApiPhase[]> => {
    return deps.apiFetchJson<ApiPhase[]>('/api/v1/erp/phases');
  };

  const createPhase = async (payload: CreatePhasePayload): Promise<ApiPhase> => {
    return deps.apiFetchJson<ApiPhase>('/api/v1/erp/phases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const updatePhase = async (phaseId: number, payload: UpdatePhasePayload): Promise<ApiPhase> => {
    return deps.apiFetchJson<ApiPhase>(`/api/v1/erp/phases/${phaseId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  };

  const deletePhase = async (phaseId: number): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/erp/phases/${phaseId}`, {
      method: 'DELETE',
    });
  };

  const checkPhaseHasChildren = async (phaseId: number): Promise<boolean> => {
    const response = await deps.apiFetchJson<{ has_children?: boolean }>(
      `/api/v1/erp/phases/${phaseId}/has-children`
    );
    return response?.has_children === true;
  };

  return {
    listPhases,
    createPhase,
    updatePhase,
    deletePhase,
    checkPhaseHasChildren,
  };
}
