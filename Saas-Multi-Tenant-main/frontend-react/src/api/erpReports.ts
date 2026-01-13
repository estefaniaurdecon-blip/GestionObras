import { apiClient } from "./client";

export interface ErpProject {
  id: number;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
}

export interface TimeReportRow {
  project_id: number;
  project_name: string;
  task_id: number;
  task_title: string;
  user_id: number | null;
  username: string | null;
  total_hours: string;
  hourly_rate: string | null;
}

export interface TimeReportFilters {
  projectId?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export async function fetchErpProjects(): Promise<ErpProject[]> {
  const response = await apiClient.get<ErpProject[]>("/api/v1/erp/projects");
  return response.data;
}

export async function fetchTimeReport(
  filters: TimeReportFilters,
): Promise<TimeReportRow[]> {
  const params: Record<string, string> = {};

  if (filters.projectId) {
    params.project = String(filters.projectId);
  }
  if (filters.dateFrom) {
    params.date_from = filters.dateFrom;
  }
  if (filters.dateTo) {
    params.date_to = filters.dateTo;
  }

  const response = await apiClient.get<TimeReportRow[]>(
    "/api/v1/erp/reports/time",
    {
      params,
    },
  );
  return response.data;
}
