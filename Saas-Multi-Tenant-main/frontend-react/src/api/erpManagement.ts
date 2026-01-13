import { apiClient } from "./client";

export interface ErpProjectCreate {
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
}

export interface ErpTaskCreate {
  project_id?: number | null;
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
  title?: string | null;
  description?: string | null;
  assigned_to_id?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  is_completed?: boolean;
}

export async function createErpProject(payload: ErpProjectCreate): Promise<void> {
  await apiClient.post("/api/v1/erp/projects", payload);
}

export async function createErpTask(payload: ErpTaskCreate): Promise<void> {
  await apiClient.post("/api/v1/erp/tasks", payload);
}

export async function updateErpTask(
  taskId: number,
  payload: ErpTaskUpdate,
): Promise<void> {
  await apiClient.patch(`/api/v1/erp/tasks/${taskId}`, payload);
}
