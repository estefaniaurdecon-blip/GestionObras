import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  aggregateByDay,
  aggregateByMonth,
  aggregateByYear,
  buildWindow,
  computeNiceYAxisMax,
  computeNiceYAxisTicks,
  type PeriodHoursRawRow,
  type PeriodMode,
} from '@/components/periodHoursChartUtils';

export type PeriodHoursSeriesType = 'encargado' | 'trabajadores' | 'maquinaria';

type PeriodHoursChartProps = {
  title: string;
  rawRows: PeriodHoursRawRow[];
  seriesType: PeriodHoursSeriesType;
};

const modeOptions: Array<{ value: PeriodMode; label: string }> = [
  { value: 'day', label: 'Dias' },
  { value: 'month', label: 'Meses' },
  { value: 'year', label: 'Años' },
];

export const PeriodHoursChart = ({ title, rawRows, seriesType }: PeriodHoursChartProps) => {
  const [mode, setMode] = useState<PeriodMode>('day');
  const [pageOffset, setPageOffset] = useState(0);
  const gradientToken = useId().replace(/:/g, '');
  const barGradientId = `period-hours-bar-gradient-${gradientToken}`;

  useEffect(() => {
    setPageOffset(0);
  }, [mode]);

  const aggregatedSeries = useMemo(() => {
    if (mode === 'year') return aggregateByYear(rawRows);
    if (mode === 'month') return aggregateByMonth(rawRows);
    return aggregateByDay(rawRows);
  }, [mode, rawRows]);

  const windowState = useMemo(
    () => buildWindow(aggregatedSeries, mode, pageOffset),
    [aggregatedSeries, mode, pageOffset],
  );

  useEffect(() => {
    if (windowState.pageOffset !== pageOffset) {
      setPageOffset(windowState.pageOffset);
    }
  }, [pageOffset, windowState.pageOffset]);

  const chartData = useMemo(
    () =>
      windowState.data.map((point) => ({
        period: point.label,
        hours: point.valueHours,
      })),
    [windowState.data],
  );

  const maxValue = useMemo(
    () => chartData.reduce((currentMax, point) => Math.max(currentMax, point.hours), 0),
    [chartData],
  );
  const yMax = useMemo(() => computeNiceYAxisMax(maxValue), [maxValue]);
  const yTicks = useMemo(() => computeNiceYAxisTicks(maxValue), [maxValue]);

  const handleModeChange = (value: string) => {
    if (value === 'day' || value === 'month' || value === 'year') {
      setMode(value);
    }
  };

  return (
    <div className="space-y-3" aria-label={title} data-series={seriesType}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={handleModeChange}
          className="w-full justify-start rounded-lg bg-slate-100 p-1 sm:w-auto"
        >
          {modeOptions.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className="h-8 px-3 text-xs font-medium text-slate-700 data-[state=on]:bg-white data-[state=on]:text-slate-900"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPageOffset((previous) => previous + 1)}
            disabled={!windowState.canGoBack}
            aria-label="Periodo anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPageOffset((previous) => Math.max(0, previous - 1))}
            disabled={!windowState.canGoForward}
            aria-label="Periodo siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="h-[280px] rounded-xl border border-slate-200 bg-white p-2 sm:h-[295px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 10, left: 2, bottom: 0 }}>
            <defs>
              <linearGradient id={barGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1AB3E5" />
                <stop offset="58%" stopColor="#7EC3DA" />
                <stop offset="100%" stopColor="#E4E7EA" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="#d1d5db" />
            <XAxis dataKey="period" tick={{ fontSize: 12 }} stroke="#6b7280" padding={{ left: 16, right: 16 }} />
            <YAxis
              domain={[0, yMax]}
              ticks={yTicks}
              allowDecimals
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              tickCount={yTicks.length}
            />
            <Tooltip
              formatter={(value) => [`${Number(value).toFixed(1)} h`, 'Horas']}
              labelFormatter={(label) => `Periodo: ${String(label)}`}
            />
            <Bar dataKey="hours" fill={`url(#${barGradientId})`} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
