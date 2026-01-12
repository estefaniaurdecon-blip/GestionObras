import { apiClient } from "./client";

export interface TimeSession {
  id: number;
  task_id: number;
  user_id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  is_active: boolean;
  created_at: string;
}

export interface ErpTask {
  id: number;
  project_id: number | null;
  title: string;
  description?: string | null;
  assigned_to_id?: number | null;
  is_completed: boolean;
  created_at: string;
}

export async function fetchErpTasks(): Promise<ErpTask[]> {
  const response = await apiClient.get<ErpTask[]>("/api/v1/erp/tasks");
  return response.data;
}

export async function getActiveTimeSession(): Promise<TimeSession | null> {
  try {
    const response = await apiClient.get<TimeSession>(
      "/api/v1/erp/time-tracking/active",
    );
    return response.data;
  } catch (error: any) {
    // En caso de no encontrar sesión activa o errores de autenticación,
    // consideramos que no hay sesión en marcha y no mostramos errores en UI.
    if (
      error?.response?.status === 404 ||
      error?.response?.status === 401 ||
      error?.response?.status === 403
    ) {
      return null;
    }
    return null;
  }
}

export async function startTimeSession(taskId: number): Promise<TimeSession> {
  const response = await apiClient.post<TimeSession>(
    "/api/v1/erp/time-tracking/start",
    {
      task_id: taskId,
    },
  );
  return response.data;
}

export async function stopTimeSession(): Promise<TimeSession> {
  const response = await apiClient.put<TimeSession>(
    "/api/v1/erp/time-tracking/stop",
  );
  return response.data;
}
