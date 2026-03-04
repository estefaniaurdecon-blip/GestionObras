import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, Ticket, Users, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getDashboardSummary, type DashboardSummary } from '@/integrations/api/client';
import type { WorkReport } from '@/offline-db/types';

type DashboardSummaryPanelProps = {
  workReports?: WorkReport[];
};

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

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseIsoDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function getReportDate(report: WorkReport): Date | null {
  const payload = asRecord(report.payload);
  const candidates = [report.date, payload?.date];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const parsed = parseIsoDay(candidate);
    if (parsed) return parsed;
    const fallback = new Date(candidate);
    if (!Number.isNaN(fallback.getTime())) {
      fallback.setHours(0, 0, 0, 0);
      return fallback;
    }
  }
  return null;
}

function getApprovedDate(report: WorkReport): Date | null {
  const payload = asRecord(report.payload);
  const approvedAt = payload?.approvedAt ?? payload?.approved_at;
  if (typeof approvedAt === 'string' && approvedAt.trim()) {
    const parsed = new Date(approvedAt);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setHours(0, 0, 0, 0);
      return parsed;
    }
  }
  return getReportDate(report);
}

function getTotalHours(report: WorkReport): number {
  const payload = asRecord(report.payload);
  if (!payload) return 0;
  return toNumber(payload.totalHours ?? payload.total_hours ?? payload.foremanHours ?? payload.foreman_hours);
}

export function DashboardSummaryPanel({ workReports = [] }: DashboardSummaryPanelProps) {
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

  const reportMetrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 6);

    let abiertos = 0;
    let enProgreso = 0;
    let resueltosHoy = 0;
    let cerrados7dias = 0;
    let horasHoy = 0;
    let horasUltimaSemana = 0;

    for (const report of workReports) {
      const payload = asRecord(report.payload);
      const statusText = String(report.status ?? '').toLowerCase();
      const isClosedByPayload = payload?.isClosed === true || payload?.is_closed === true;
      const isApprovedByPayload = payload?.approved === true || payload?.isApproved === true;
      const isApproved = isApprovedByPayload || statusText === 'approved' || statusText === 'closed';
      const isOpenNotApproved = !isApproved && !isClosedByPayload;
      const isPorCompletar =
        statusText === 'draft' ||
        statusText === 'pending' ||
        statusText === 'missing_data' ||
        statusText === 'missing_delivery_notes';

      if (isOpenNotApproved) abiertos += 1;
      if (isPorCompletar) enProgreso += 1;

      const approvedDate = isApproved ? getApprovedDate(report) : null;
      if (approvedDate) {
        if (approvedDate.getTime() === today.getTime()) {
          resueltosHoy += 1;
        }
        if (approvedDate >= last7Days && approvedDate <= today) {
          cerrados7dias += 1;
        }
      }

      const reportDate = getReportDate(report);
      const hours = getTotalHours(report);
      if (reportDate && hours > 0) {
        if (reportDate.getTime() === today.getTime()) {
          horasHoy += hours;
        }
        if (reportDate >= last7Days && reportDate <= today) {
          horasUltimaSemana += hours;
        }
      }
    }

    return {
      abiertos,
      enProgreso,
      resueltosHoy,
      cerrados7dias,
      horasHoy,
      horasUltimaSemana,
    };
  }, [workReports]);

  const effectiveSummary = useMemo<DashboardSummary>(
    () => ({
      ...summary,
      horas_hoy: reportMetrics.horasHoy,
      horas_ultima_semana: reportMetrics.horasUltimaSemana,
      tickets_abiertos: reportMetrics.abiertos,
      tickets_en_progreso: reportMetrics.enProgreso,
      tickets_resueltos_hoy: reportMetrics.resueltosHoy,
      tickets_cerrados_ultima_semana: reportMetrics.cerrados7dias,
    }),
    [reportMetrics, summary],
  );

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
              <div className="text-2xl font-semibold">{effectiveSummary.usuarios_activos}</div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Wrench className="h-3 w-3" />
                Herramientas activas
              </div>
              <div className="text-2xl font-semibold">{effectiveSummary.herramientas_activas}</div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Horas hoy</div>
              <div className="text-2xl font-semibold">{effectiveSummary.horas_hoy.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Horas ultima semana</div>
              <div className="text-2xl font-semibold">{effectiveSummary.horas_ultima_semana.toFixed(2)}</div>
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
              <div className="text-xl font-semibold">{effectiveSummary.tickets_abiertos}</div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">En progreso</div>
              <div className="text-xl font-semibold">{effectiveSummary.tickets_en_progreso}</div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Resueltos hoy</div>
              <div className="text-xl font-semibold">{effectiveSummary.tickets_resueltos_hoy}</div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Cerrados 7 dias</div>
              <div className="text-xl font-semibold">{effectiveSummary.tickets_cerrados_ultima_semana}</div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
