import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, RefreshCw, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getYearlySummary,
  listProjects,
  type ApiProject,
  type YearlySummary,
} from '@/integrations/api/client';
import { ErpBudgetManager } from '@/components/api/ErpBudgetManager';

const currentYear = new Date().getFullYear();

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getCurrencyValue(value: unknown): string {
  const numeric = toNumber(value);
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function EconomicsOverviewPanel() {
  const [year, setYear] = useState(currentYear);
  const [summary, setSummary] = useState<YearlySummary | null>(null);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryData, projectData] = await Promise.all([
        getYearlySummary(year),
        listProjects(),
      ]);
      setSummary(summaryData);
      setProjects(projectData);

      const firstProject = projectData[0];
      if (firstProject) {
        const projectId = selectedProjectId || firstProject.id;
        setSelectedProjectId(projectId);
      } else {
        setSelectedProjectId(null);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'No se pudieron cargar los datos economicos');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, year]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const justifyTotal = useMemo(() => {
    if (!summary?.projectJustify) return 0;
    return Object.values(summary.projectJustify).reduce((acc, item) => acc + toNumber(item), 0);
  }, [summary]);

  const justifiedTotal = useMemo(() => {
    if (!summary?.projectJustified) return 0;
    return Object.values(summary.projectJustified).reduce((acc, item) => acc + toNumber(item), 0);
  }, [summary]);

  const hoursTotal = useMemo(() => {
    if (!summary?.summaryMilestones) return 0;
    return Object.values(summary.summaryMilestones)
      .flat()
      .reduce((acc, item) => acc + toNumber(item.hours), 0);
  }, [summary]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-blue-700" />
            Resumen economico
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setYear((prev) => prev - 1)}>
              <CalendarDays className="h-4 w-4 mr-2" />
              {year - 1}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setYear((prev) => prev + 1)}>
              <CalendarDays className="h-4 w-4 mr-2" />
              {year + 1}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadSummary()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="bg-white">
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Justificacion estimada</div>
                <div className="text-xl font-semibold">{getCurrencyValue(justifyTotal)}</div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Justificacion ejecutada</div>
                <div className="text-xl font-semibold">{getCurrencyValue(justifiedTotal)}</div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Horas imputadas (hitos)</div>
                <div className="text-xl font-semibold">{hoursTotal.toFixed(2)} h</div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
      <ErpBudgetManager
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectedProjectIdChange={setSelectedProjectId}
      />
    </div>
  );
}
