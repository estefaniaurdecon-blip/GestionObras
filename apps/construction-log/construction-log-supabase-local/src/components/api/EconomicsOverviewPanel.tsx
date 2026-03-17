import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getYearlySummary,
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const summaryData = await getYearlySummary(year);
      setSummary(summaryData);
    } catch (loadError: any) {
      setError(loadError?.message || 'No se pudieron cargar los datos economicos');
    } finally {
      setLoading(false);
    }
  }, [year]);

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
        <CardHeader className="space-y-4">
          <div className="text-center">
            <CardTitle className="app-page-title inline-flex items-center gap-2">
              <Wallet className="h-5 w-5 text-blue-700" />
              Resumen ERP
            </CardTitle>
            <p className="app-page-subtitle mt-1">Vista agregada anual de justificación, ejecución y horas imputadas.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="app-btn-soft min-w-[56px] px-3"
              onClick={() => setYear((prev) => prev - 1)}
              aria-label="Año anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex min-w-[110px] items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-base font-semibold text-slate-900">
              {year}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="app-btn-soft min-w-[56px] px-3"
              onClick={() => setYear((prev) => prev + 1)}
              aria-label="Año siguiente"
            >
              <ChevronRight className="h-4 w-4" />
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
    </div>
  );
}
