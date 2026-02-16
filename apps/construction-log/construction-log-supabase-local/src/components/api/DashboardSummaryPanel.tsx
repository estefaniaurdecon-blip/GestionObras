import { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw, Ticket, Users, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getDashboardSummary, type DashboardSummary } from '@/integrations/api/client';

const emptySummary: DashboardSummary = {
  tenants_activos: 0,
  usuarios_activos: 0,
  herramientas_activas: 0,
  horas_hoy: 0,
  horas_ultima_semana: 0,
  tickets_abiertos: 0,
  tickets_en_progreso: 0,
  tickets_resueltos_hoy: 0,
  tickets_cerrados_ultima_semana: 0,
};

export function DashboardSummaryPanel() {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardSummary();
      setSummary(data);
    } catch (loadError: any) {
      setError(loadError?.message || 'No se pudo cargar el resumen del dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-blue-700" />
          Resumen en tiempo real
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => void loadSummary()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Users className="h-3 w-3" />
                Usuarios activos
              </div>
              <div className="text-2xl font-semibold">{summary.usuarios_activos}</div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Wrench className="h-3 w-3" />
                Herramientas activas
              </div>
              <div className="text-2xl font-semibold">{summary.herramientas_activas}</div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Horas hoy</div>
              <div className="text-2xl font-semibold">{summary.horas_hoy.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Horas ultima semana</div>
              <div className="text-2xl font-semibold">{summary.horas_ultima_semana.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Ticket className="h-3 w-3" />
                Abiertos
              </div>
              <div className="text-xl font-semibold">{summary.tickets_abiertos}</div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">En progreso</div>
              <div className="text-xl font-semibold">{summary.tickets_en_progreso}</div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Resueltos hoy</div>
              <div className="text-xl font-semibold">{summary.tickets_resueltos_hoy}</div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Cerrados 7 dias</div>
              <div className="text-xl font-semibold">{summary.tickets_cerrados_ultima_semana}</div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
