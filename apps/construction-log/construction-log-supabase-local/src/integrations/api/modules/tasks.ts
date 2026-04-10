type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

type TenantHeaderFn = (
  tenantId?: string | number | null
) => Record<string, string> | undefined;

export interface TasksApiDeps {
  apiFetchJson: ApiFetchJsonFn;
  tenantHeader: TenantHeaderFn;
}

export type ApiErpTaskStatus = 'pending' | 'in_progress' | 'done' | 'deleted';

export interface ApiErpTask {
  id: number;
  project_id?: number | null;
  subactivity_id?: number | null;
  task_template_id?: number | null;
  title: string;
  description?: string | null;
  assigned_to_id?: number | null;
  status: ApiErpTaskStatus | string;
  start_date?: string | null;
  end_date?: string | null;
  is_completed: boolean;
  created_at: string;
}

export interface ApiErpTaskCreatePayload {
  project_id?: number | null;
  subactivity_id?: number | null;
  task_template_id?: number | null;
  title: string;
  description?: string | null;
  assigned_to_id?: number | null;
  status?: ApiErpTaskStatus | null;
  start_date?: string | null;
  end_date?: string | null;
  is_completed?: boolean;
}

export interface ApiErpTaskUpdatePayload {
  project_id?: number | null;
  subactivity_id?: number | null;
  task_template_id?: number | null;
  title?: string | null;
  description?: string | null;
  assigned_to_id?: number | null;
  status?: ApiErpTaskStatus | null;
  start_date?: string | null;
  end_date?: string | null;
  is_completed?: boolean;
}

export function createTasksApi(deps: TasksApiDeps) {
  const listTasks = async (
    tenantId?: string | number | null
  ): Promise<ApiErpTask[]> => {
    return deps.apiFetchJson<ApiErpTask[]>('/api/v1/erp/tasks', {
      headers: deps.tenantHeader(tenantId),
    });
  };

  const createTask = async (
    payload: ApiErpTaskCreatePayload,
    tenantId?: string | number | null
  ): Promise<ApiErpTask> => {
    return deps.apiFetchJson<ApiErpTask>('/api/v1/erp/tasks', {
      method: 'POST',
      headers: deps.tenantHeader(tenantId),
      body: JSON.stringify(payload),
    });
  };

  const updateTask = async (
    taskId: number,
    payload: ApiErpTaskUpdatePayload,
    tenantId?: string | number | null
  ): Promise<ApiErpTask> => {
    return deps.apiFetchJson<ApiErpTask>(`/api/v1/erp/tasks/${taskId}`, {
      method: 'PATCH',
      headers: deps.tenantHeader(tenantId),
      body: JSON.stringify(payload),
    });
  };

  const deleteTask = async (
    taskId: number,
    tenantId?: string | number | null
  ): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/erp/tasks/${taskId}`, {
      method: 'DELETE',
      headers: deps.tenantHeader(tenantId),
    });
  };

  return {
    listTasks,
    createTask,
    updateTask,
    deleteTask,
  };
}
