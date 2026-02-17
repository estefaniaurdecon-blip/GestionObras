import type { Dispatch, SetStateAction } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { WorkReport } from '@/offline-db/types';
import {
  formatCreationDateTime,
  HISTORY_FILTER_OPTIONS,
  payloadBoolean,
  payloadNumber,
  payloadText,
  toIsoDate,
  type HistoryFilterKey,
} from '@/pages/indexHelpers';
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  FileDown,
  FileText,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';

export type HistoryReportsPanelProps = {
  historyEnabledFilters: HistoryFilterKey[];
  toggleHistoryFilter: (filterKey: HistoryFilterKey) => void;
  historySelectedFiltersCount: number;
  historyForemanFilter: string;
  setHistoryForemanFilter: Dispatch<SetStateAction<string>>;
  historyWeekFilter: string;
  setHistoryWeekFilter: Dispatch<SetStateAction<string>>;
  historyMonthFilter: string;
  setHistoryMonthFilter: Dispatch<SetStateAction<string>>;
  historyWorkNameFilter: string;
  setHistoryWorkNameFilter: Dispatch<SetStateAction<string>>;
  historyDateFilter: string;
  setHistoryDateFilter: Dispatch<SetStateAction<string>>;
  historyDatePickerOpen: boolean;
  setHistoryDatePickerOpen: Dispatch<SetStateAction<boolean>>;
  selectedHistoryDate: Date | null;
  allWorkReports: WorkReport[];
  filteredHistoryReports: WorkReport[];
  historyAppliedFiltersCount: number;
  clearHistoryFilters: () => void;
  tenantUnavailable: boolean;
  workReportsReadOnlyByRole: boolean;
  onPending: (featureName: string) => void;
  onOpenCloneFromHistoryDialog: (report: WorkReport) => void;
  onOpenHistoryReport: (report: WorkReport) => void;
};

export const HistoryReportsPanel = ({
  historyEnabledFilters,
  toggleHistoryFilter,
  historySelectedFiltersCount,
  historyForemanFilter,
  setHistoryForemanFilter,
  historyWeekFilter,
  setHistoryWeekFilter,
  historyMonthFilter,
  setHistoryMonthFilter,
  historyWorkNameFilter,
  setHistoryWorkNameFilter,
  historyDateFilter,
  setHistoryDateFilter,
  historyDatePickerOpen,
  setHistoryDatePickerOpen,
  selectedHistoryDate,
  allWorkReports,
  filteredHistoryReports,
  historyAppliedFiltersCount,
  clearHistoryFilters,
  tenantUnavailable,
  workReportsReadOnlyByRole,
  onPending,
  onOpenCloneFromHistoryDialog,
  onOpenHistoryReport,
}: HistoryReportsPanelProps) => {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
        <div className="flex items-start gap-2">
          <Search className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Activa uno o varios filtros. Los que no esten seleccionados no se aplican.</span>
        </div>
      </div>

      <div className="rounded-md border bg-slate-100 p-2">
        <div className="flex justify-center overflow-x-auto">
          <div className="flex min-w-max items-center justify-center gap-2">
            {HISTORY_FILTER_OPTIONS.map((filterOption) => {
              const isEnabled = historyEnabledFilters.includes(filterOption.key);
              return (
                <Button
                  key={filterOption.key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-9 rounded-md px-3 text-sm sm:text-[15px] ${
                    isEnabled
                      ? 'bg-blue-600 text-white hover:bg-blue-700 hover:text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                  onClick={() => toggleHistoryFilter(filterOption.key)}
                >
                  {filterOption.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {historySelectedFiltersCount === 0 ? null : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {historyEnabledFilters.includes('foreman') ? (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="history-foreman">
                Encargado (opcional)
              </label>
              <Input
                id="history-foreman"
                value={historyForemanFilter}
                onChange={(event) => setHistoryForemanFilter(event.target.value)}
                placeholder="Ej. Juan Perez"
              />
            </div>
          ) : null}

          {historyEnabledFilters.includes('weeks') ? (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="history-week">
                Semana (opcional)
              </label>
              <Input
                id="history-week"
                type="week"
                value={historyWeekFilter}
                onChange={(event) => setHistoryWeekFilter(event.target.value)}
              />
            </div>
          ) : null}

          {historyEnabledFilters.includes('months') ? (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="history-month">
                Mes (opcional)
              </label>
              <Input
                id="history-month"
                type="month"
                value={historyMonthFilter}
                onChange={(event) => setHistoryMonthFilter(event.target.value)}
              />
            </div>
          ) : null}

          {historyEnabledFilters.includes('workName') ? (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="history-work-name">
                Nombre de obra (opcional)
              </label>
              <Input
                id="history-work-name"
                value={historyWorkNameFilter}
                onChange={(event) => setHistoryWorkNameFilter(event.target.value)}
                placeholder="Ej. Torre Norte"
              />
            </div>
          ) : null}

          {historyEnabledFilters.includes('date') ? (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="history-date">
                Fecha (opcional)
              </label>
              <Popover open={historyDatePickerOpen} onOpenChange={setHistoryDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="history-date"
                    type="button"
                    variant="outline"
                    className={`w-full justify-between text-left font-normal ${
                      selectedHistoryDate ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {selectedHistoryDate ? format(selectedHistoryDate, 'dd/MM/yyyy', { locale: es }) : 'Seleccionar fecha'}
                    <CalendarDays className="ml-2 h-4 w-4 shrink-0 opacity-70" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedHistoryDate ?? undefined}
                    onSelect={(selectedDate) => {
                      if (!selectedDate) {
                        setHistoryDateFilter('');
                        return;
                      }
                      setHistoryDateFilter(toIsoDate(selectedDate));
                      setHistoryDatePickerOpen(false);
                    }}
                    locale={es}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Total guardados: <span className="font-medium">{allWorkReports.length}</span>. Mostrando:{' '}
          <span className="font-medium">{filteredHistoryReports.length}</span>. Filtros seleccionados:{' '}
          <span className="font-medium">{historySelectedFiltersCount}</span>/{HISTORY_FILTER_OPTIONS.length}. Aplicados:{' '}
          <span className="font-medium">{historyAppliedFiltersCount}</span>.
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={clearHistoryFilters}>
            Limpiar filtros
          </Button>
        </div>
      </div>

      {allWorkReports.length === 0 ? (
        <div className="rounded-md border bg-slate-50 p-6 text-sm text-muted-foreground text-center">
          No hay partes guardados todavia.
        </div>
      ) : filteredHistoryReports.length === 0 ? (
        <div className="rounded-md border bg-slate-50 p-6 text-sm text-muted-foreground text-center">
          No hay resultados para los filtros aplicados.
        </div>
      ) : (
        <div className="max-h-[55vh] overflow-auto divide-y rounded-md border bg-slate-50">
          {filteredHistoryReports.map((report) => {
            const reportName = payloadText(report.payload, 'workName') ?? report.title ?? `Parte ${report.date}`;
            const reportIdentifier = payloadText(report.payload, 'reportIdentifier') ?? report.id.slice(0, 8);
            const workNumber = payloadText(report.payload, 'workNumber') ?? '-';
            const totalHours = payloadNumber(report.payload, 'totalHours');
            const totalHoursLabel = typeof totalHours === 'number' ? totalHours.toFixed(2) : '--';
            const isClosed = (payloadBoolean(report.payload, 'isClosed') ?? false) || report.status === 'completed';

            return (
              <div key={report.id} className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-base font-medium text-slate-900 truncate">{reportName}</div>
                  <div className="text-sm text-muted-foreground">Nº obra: {workNumber}</div>
                  <div className="text-sm text-muted-foreground">Identificador: {reportIdentifier}</div>
                  <div className="text-sm text-muted-foreground">Fecha parte: {report.date}</div>
                  <div className="text-sm text-muted-foreground">Creado: {formatCreationDateTime(report.createdAt)}</div>
                  <div className="text-sm text-muted-foreground">Estado: {isClosed ? 'Cerrado' : 'Abierto'}</div>
                  <div className="text-sm text-muted-foreground">Horas totales: {totalHoursLabel}</div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="flex items-center gap-0.5 px-1 py-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-slate-800"
                      title="Validar parte"
                      onClick={() => onPending('Validar parte desde historial')}
                      disabled={tenantUnavailable || workReportsReadOnlyByRole}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-slate-800"
                      title="Clonar parte"
                      onClick={() => onOpenCloneFromHistoryDialog(report)}
                      disabled={tenantUnavailable || workReportsReadOnlyByRole}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-slate-800"
                      title="Documento resumen del parte"
                      onClick={() => onPending('Documento resumen de parte desde historial')}
                      disabled={tenantUnavailable}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-slate-800"
                      title="Exportar parte"
                      onClick={() => onPending('Exportar parte desde historial')}
                      disabled={tenantUnavailable}
                    >
                      <FileDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-slate-800"
                      title={isClosed || workReportsReadOnlyByRole ? 'Ver parte' : 'Editar parte'}
                      onClick={() => onOpenHistoryReport(report)}
                      disabled={tenantUnavailable}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                      title="Eliminar parte"
                      onClick={() => onPending('Eliminar parte desde historial')}
                      disabled={tenantUnavailable || workReportsReadOnlyByRole}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      report.syncStatus === 'synced'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : report.syncStatus === 'error'
                          ? 'border-rose-500 bg-rose-100 text-rose-800'
                          : 'border-red-300 bg-red-50 text-red-700'
                    }
                  >
                    {report.syncStatus === 'synced'
                      ? 'Sincronizado'
                      : report.syncStatus === 'error'
                        ? 'Error de sincronizacion'
                        : 'Pendiente de sincronizar'}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

