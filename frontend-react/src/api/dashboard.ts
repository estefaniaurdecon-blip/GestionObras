import { apiClient } from "./client";

export interface DashboardSummary {
  tenants_activos: number;
  usuarios_activos: number;
  herramientas_activas: number;
  horas_hoy: number;
  horas_ultima_semana: number;
   tickets_abiertos: number;
   tickets_en_progreso: number;
   tickets_resueltos_hoy: number;
   tickets_cerrados_ultima_semana: number;
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const response = await apiClient.get<DashboardSummary>(
    "/api/v1/dashboard/summary",
  );
  return response.data;
}
