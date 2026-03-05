type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

export interface ToolsApiDeps {
  apiFetchJson: ApiFetchJsonFn;
}

export interface ApiTool {
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

export function createToolsApi(deps: ToolsApiDeps) {
  const listToolCatalog = async (): Promise<ApiTool[]> => {
    return deps.apiFetchJson<ApiTool[]>('/api/v1/tools/catalog');
  };

  const listToolsByTenant = async (tenantId?: number | null): Promise<ApiTool[]> => {
    const tenantQuery = tenantId ? `?tenant_id=${tenantId}` : '';
    return deps.apiFetchJson<ApiTool[]>(`/api/v1/tools/by-tenant${tenantQuery}`);
  };

  const launchTool = async (toolId: number): Promise<ToolLaunchResponse> => {
    return deps.apiFetchJson<ToolLaunchResponse>(`/api/v1/tools/${toolId}/launch`, {
      method: 'POST',
    });
  };

  const setToolEnabledForTenant = async (
    toolId: number,
    tenantId: number,
    isEnabled: boolean
  ): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/tools/${toolId}/by-tenant/${tenantId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_enabled: isEnabled }),
    });
  };

  return {
    listToolCatalog,
    listToolsByTenant,
    launchTool,
    setToolEnabledForTenant,
  };
}
