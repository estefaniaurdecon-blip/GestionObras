import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, ToggleLeft, ToggleRight, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  launchTool,
  listToolCatalog,
  listToolsByTenant,
  setToolEnabledForTenant,
  type ApiTool,
} from '@/integrations/api/client';
import { toast } from '@/hooks/use-toast';

interface ToolsSettingsPanelProps {
  tenantId?: number | null;
  isSuperAdmin?: boolean;
}

export function ToolsSettingsPanel({ tenantId, isSuperAdmin = false }: ToolsSettingsPanelProps) {
  const envTenantId = useMemo(() => {
    const fromEnv = Number(import.meta.env.VITE_TENANT_ID);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 1;
  }, []);
  const [selectedTenantId, setSelectedTenantId] = useState<number>(tenantId || envTenantId);
  const [activeTools, setActiveTools] = useState<ApiTool[]>([]);
  const [catalogTools, setCatalogTools] = useState<ApiTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId && tenantId !== selectedTenantId) {
      setSelectedTenantId(tenantId);
    }
  }, [tenantId, selectedTenantId]);

  const activeToolIds = useMemo(() => new Set(activeTools.map((tool) => tool.id)), [activeTools]);

  const loadTools = useCallback(async () => {
    if (!selectedTenantId) {
      setError('No hay tenant seleccionado para herramientas');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [active, catalog] = await Promise.all([
        listToolsByTenant(selectedTenantId),
        listToolCatalog(),
      ]);
      setActiveTools(active);
      setCatalogTools(catalog);
    } catch (loadError: any) {
      setError(loadError?.message || 'No se pudieron cargar las herramientas');
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  const handleLaunch = async (tool: ApiTool) => {
    try {
      const response = await launchTool(tool.id);
      window.open(response.launch_url, '_blank', 'noopener,noreferrer');
    } catch (launchError: any) {
      toast({
        title: 'No se pudo abrir la herramienta',
        description: launchError?.message || 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  const handleToggleTool = async (tool: ApiTool) => {
    if (!selectedTenantId) return;
    const isEnabled = activeToolIds.has(tool.id);
    try {
      await setToolEnabledForTenant(tool.id, selectedTenantId, !isEnabled);
      await loadTools();
      toast({
        title: !isEnabled ? 'Herramienta habilitada' : 'Herramienta deshabilitada',
        description: tool.name,
      });
    } catch (toggleError: any) {
      toast({
        title: 'No se pudo actualizar la herramienta',
        description: toggleError?.message || 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4 text-blue-700" />
            Herramientas del tenant
          </CardTitle>
          <div className="flex items-center gap-2">
            {isSuperAdmin ? (
              <Input
                type="number"
                min={1}
                className="w-24 h-8"
                value={selectedTenantId}
                onChange={(event) => setSelectedTenantId(Number(event.target.value || 1))}
              />
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void loadTools()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {loading ? <div className="text-sm text-muted-foreground">Cargando herramientas...</div> : null}

          {!loading && activeTools.length === 0 ? (
            <div className="text-sm text-muted-foreground">No hay herramientas activas para este tenant.</div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeTools.map((tool) => (
              <Card key={tool.id} className="bg-white">
                <CardContent className="pt-4 space-y-2">
                  <div className="font-medium text-sm">{tool.name}</div>
                  <div className="text-xs text-muted-foreground">{tool.description || tool.base_url}</div>
                  <div className="flex items-center justify-between">
                    <Badge variant="default">Activa</Badge>
                    <Button size="sm" variant="outline" onClick={() => void handleLaunch(tool)}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catalogo global</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {catalogTools.map((tool) => {
            const enabled = activeToolIds.has(tool.id);
            return (
              <div
                key={tool.id}
                className="rounded-md border bg-white p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div>
                  <div className="font-medium text-sm">{tool.name}</div>
                  <div className="text-xs text-muted-foreground">{tool.slug}</div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={enabled ? 'default' : 'secondary'}>
                    {enabled ? 'Habilitada' : 'Deshabilitada'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleToggleTool(tool)}
                    disabled={!selectedTenantId}
                  >
                    {enabled ? (
                      <ToggleLeft className="h-4 w-4 mr-2" />
                    ) : (
                      <ToggleRight className="h-4 w-4 mr-2" />
                    )}
                    {enabled ? 'Deshabilitar' : 'Habilitar'}
                  </Button>
                </div>
              </div>
            );
          })}
          {catalogTools.length === 0 ? (
            <div className="text-sm text-muted-foreground">No hay herramientas en catalogo.</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
