import { apiClient } from "./client";

export interface ErpProjectCreate {
  name: string;
  description?: string | null;
  is_active?: boolean;
}

export interface ErpTaskCreate {
  project_id?: number | null;
  title: string;
  description?: string | null;
  assigned_to_id?: number | null;
  is_completed?: boolean;
}

export async function createErpProject(payload: ErpProjectCreate): Promise<void> {
  await apiClient.post("/api/v1/erp/projects", payload);
}

export async function createErpTask(payload: ErpTaskCreate): Promise<void> {
  await apiClient.post("/api/v1/erp/tasks", payload);
}
