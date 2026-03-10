// Cliente HTTP base (axios) con configuracion comun
import { apiClient, withTenantHeaders } from "./client";

/**
 * Tipos y funciones para:
 * - Catalogo global de herramientas
 * - Herramientas habilitadas por tenant
 * - Lanzar herramientas con contexto de tenant
 */

export interface Tool {
  id: number;
  name: string;
  slug: string;
  base_url: string;
  description?: string | null;
}

export interface ToolLaunchResponse {
  launch_url: string;
  tool_id: number;
  tool_name: string;
}

export async function fetchToolCatalog(): Promise<Tool[]> {
  const response = await apiClient.get<Tool[]>("/api/v1/tools/catalog");
  return response.data;
}

export async function fetchTenantTools(tenantId: number): Promise<Tool[]> {
  const response = await apiClient.get<Tool[]>(
    "/api/v1/tools/by-tenant",
    withTenantHeaders(tenantId),
  );
  return response.data;
}

export async function launchTool(
  toolId: number,
  tenantId: number,
): Promise<ToolLaunchResponse> {
  const response = await apiClient.post<ToolLaunchResponse>(
    `/api/v1/tools/${toolId}/launch`,
    null,
    withTenantHeaders(tenantId),
  );
  return response.data;
}

export async function setTenantToolEnabled(
  tenantId: number,
  toolId: number,
  isEnabled: boolean,
): Promise<void> {
  await apiClient.put(`/api/v1/tools/${toolId}/by-tenant/${tenantId}`, {
    is_enabled: isEnabled,
  });
}
