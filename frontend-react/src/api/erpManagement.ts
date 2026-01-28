import { apiClient } from "./client";

export interface ErpProjectCreate {
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  subsidy_percent?: number | null;
  is_active?: boolean;
}

export interface ErpProjectResponse {
  id: number;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration_months?: number | null;
  subsidy_percent?: number | null;
  is_active: boolean;
  created_at: string;
}

export interface ErpProjectUpdate {
  name?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  subsidy_percent?: number | null;
  is_active?: boolean | null;
}

export interface ErpTaskCreate {
  project_id?: number | null;
  subactivity_id?: number | null;
  task_template_id?: number | null;
  title: string;
  description?: string | null;
  assigned_to_id?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  is_completed?: boolean;
}

export interface ErpTaskUpdate {
  project_id?: number | null;
  subactivity_id?: number | null;
  task_template_id?: number | null;
  title?: string | null;
  description?: string | null;
  assigned_to_id?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  is_completed?: boolean;
}

export async function createErpProject(
  payload: ErpProjectCreate,
): Promise<ErpProjectResponse> {
  const response = await apiClient.post<ErpProjectResponse>(
    "/api/v1/erp/projects",
    payload,
  );
  return response.data;
}

export async function updateErpProject(
  projectId: number,
  payload: ErpProjectUpdate,
): Promise<ErpProjectResponse> {
  const response = await apiClient.patch<ErpProjectResponse>(
    `/api/v1/erp/projects/${projectId}`,
    payload,
  );
  return response.data;
}

const buildTenantHeaders = (tenantId?: number) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

export async function createErpTask(
  payload: ErpTaskCreate,
  tenantId?: number,
): Promise<void> {
  await apiClient.post(
    "/api/v1/erp/tasks",
    payload,
    buildTenantHeaders(tenantId),
  );
}

export async function updateErpTask(
  taskId: number,
  payload: ErpTaskUpdate,
  tenantId?: number,
): Promise<void> {
  await apiClient.patch(
    `/api/v1/erp/tasks/${taskId}`,
    payload,
    buildTenantHeaders(tenantId),
  );
}

export async function deleteErpTask(taskId: number): Promise<void> {
  await apiClient.delete(`/api/v1/erp/tasks/${taskId}`);
}

export async function deleteErpProject(projectId: number): Promise<void> {
  await apiClient.delete(`/api/v1/erp/projects/${projectId}`);
}
