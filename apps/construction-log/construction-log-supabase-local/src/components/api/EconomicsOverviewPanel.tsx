import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, RefreshCw, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getYearlySummary,
  listProjectBudgets,
  listProjects,
  type ApiProject,
  type ApiProjectBudgetLine,
  type YearlySummary,
} from '@/integrations/api/client';

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
  const [budgetLines, setBudgetLines] = useState<ApiProjectBudgetLine[]>([]);
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
        setBudgetLines([]);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'No se pudieron cargar los datos economicos');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, year]);

  const loadProjectBudgets = useCallback(async (projectId: number) => {
    try {
      const lines = await listProjectBudgets(projectId);
      setBudgetLines(lines);
    } catch (budgetError: any) {
      setError(budgetError?.message || 'No se pudieron cargar los presupuestos del proyecto');
      setBudgetLines([]);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!selectedProjectId) return;
    void loadProjectBudgets(selectedProjectId);
  }, [loadProjectBudgets, selectedProjectId]);

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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-700" />
            Presupuesto por obra
          </CardTitle>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={selectedProjectId ?? ''}
            onChange={(event) => setSelectedProjectId(Number(event.target.value))}
          >
            {projects.length === 0 ? <option value="">Sin obras</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent className="space-y-2">
          {budgetLines.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No hay lineas de presupuesto para la obra seleccionada.
            </div>
          ) : null}

          {budgetLines.map((line) => (
            <div key={line.id} className="rounded-md border bg-white p-3 space-y-1">
              <div className="font-medium text-sm">{line.concept}</div>
              <div className="text-xs text-muted-foreground">
                Aprobado: {getCurrencyValue(line.approved_budget)} | Ejecutado: {getCurrencyValue(line.forecasted_spent)}
              </div>
              <div className="text-xs text-muted-foreground">
                % consumido: {toNumber(line.percent_spent).toFixed(2)}%
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
