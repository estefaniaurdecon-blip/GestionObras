import { useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWorkReportExportCalendar } from '@/hooks/useWorkReportExportCalendar';
import {
  useCustomExportPeriodSelection,
  useSinglePeriodExportSelection,
  type SinglePeriodMode,
} from '@/hooks/useWorkReportExportPeriodSelection';
import type { AccessReport } from '@/types/accessControl';
import { es } from 'date-fns/locale';
import { ChevronDown, X } from 'lucide-react';

const SINGLE_PERIOD_DIALOG_COPY: Record<
  SinglePeriodMode,
  { title: string; description: string; emptyMessage: string }
> = {
  day: {
    title: 'Exportacion diaria',
    description: 'Selecciona un dia del calendario.',
    emptyMessage: 'Selecciona un dia para continuar.',
  },
  week: {
    title: 'Exportacion semanal',
    description: 'Selecciona un dia y se elegira la semana completa.',
    emptyMessage: 'Selecciona una semana para continuar.',
  },
  month: {
    title: 'Exportacion mensual',
    description: 'Selecciona mes y ano.',
    emptyMessage: 'Selecciona un mes para continuar.',
  },
};

type AccessControlSinglePeriodDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: SinglePeriodMode;
  reports: AccessReport[];
  applyButtonClassName: string;
  onApply: (dateKeys: string[], label: string) => void;
};

type AccessControlCustomPeriodDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reports: AccessReport[];
  applyButtonClassName: string;
  onApply: (dateKeys: string[], label: string) => void;
};

const buildCustomSelectionLabel = (selectionCount: number, selectedDateCount: number) =>
  selectionCount === 1
    ? `Personalizado: 1 seleccion (${selectedDateCount} dias)`
    : `Personalizado: ${selectionCount} selecciones (${selectedDateCount} dias)`;

export const AccessControlSinglePeriodDialog = ({
  open,
  onOpenChange,
  mode,
  reports,
  applyButtonClassName,
    onApply,
}: AccessControlSinglePeriodDialogProps) => {
  const {
    selectedDay,
    setSelectedDay,
    selectedWeek,
    selectedMonthAnchor,
    selectedDateKeys,
    selectedLabel,
    hasSelection,
    clearSelection,
    handleSelectWeekByDay,
    handleMonthChange,
    handleYearChange,
  } = useSinglePeriodExportSelection(mode);
  const {
    calendarStartMonth,
    calendarEndMonth,
    calendarClassNames,
    monthOptions,
    yearOptions,
  } = useWorkReportExportCalendar();

  const selectedDateSet = useMemo(() => new Set(selectedDateKeys), [selectedDateKeys]);
  const matchedReports = useMemo(
    () => reports.filter((report) => selectedDateSet.has(report.date.trim())),
    [reports, selectedDateSet],
  );
  const dialogCopy = SINGLE_PERIOD_DIALOG_COPY[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen className="overflow-y-auto">
        <DialogHeader className="text-center">
          <DialogTitle>{dialogCopy.title}</DialogTitle>
          <DialogDescription>{dialogCopy.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-center rounded-md border p-2">
            {mode === 'day' ? (
              <Calendar
                mode="single"
                selected={selectedDay}
                onSelect={setSelectedDay}
                locale={es}
                weekStartsOn={1}
                captionLayout="dropdown"
                startMonth={calendarStartMonth}
                endMonth={calendarEndMonth}
                reverseYears
                classNames={calendarClassNames}
              />
            ) : mode === 'week' ? (
              <Calendar
                mode="range"
                selected={selectedWeek}
                onSelect={(_, day) => handleSelectWeekByDay(day)}
                locale={es}
                weekStartsOn={1}
                captionLayout="dropdown"
                startMonth={calendarStartMonth}
                endMonth={calendarEndMonth}
                reverseYears
                classNames={{
                  ...calendarClassNames,
                  range_start: 'bg-cyan-500 text-white rounded-md',
                  range_middle: 'bg-cyan-100 text-cyan-900',
                  range_end: 'bg-cyan-500 text-white rounded-md',
                }}
              />
            ) : (
              <div className="w-full max-w-[540px] space-y-2 px-2 py-1">
                <div className="text-center text-sm text-slate-600">Selecciona mes y ano</div>
                <div className="flex items-center justify-center gap-5">
                  <div className="relative w-[112px]">
                    <select
                      value={selectedMonthAnchor ? selectedMonthAnchor.getMonth() : new Date().getMonth()}
                      onChange={(event) => handleMonthChange(Number(event.target.value))}
                      className="h-9 w-full appearance-none rounded-md border border-slate-200 bg-white py-1 pl-8 pr-3 text-center text-sm font-medium capitalize text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      {monthOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  </div>
                  <div className="relative w-[112px]">
                    <select
                      value={selectedMonthAnchor ? selectedMonthAnchor.getFullYear() : new Date().getFullYear()}
                      onChange={(event) => handleYearChange(Number(event.target.value))}
                      className="h-9 w-full appearance-none rounded-md border border-slate-200 bg-white py-1 pl-8 pr-3 text-center text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span>{hasSelection ? selectedLabel : 'No hay periodo seleccionado.'}</span>
            <Button type="button" size="sm" variant="outline" onClick={clearSelection} disabled={!hasSelection}>
              Limpiar
            </Button>
          </div>

          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {hasSelection ? (
              matchedReports.length > 0 ? (
                <>
                  Controles seleccionados: <strong>{matchedReports.length}</strong>
                </>
              ) : (
                'No hay controles para el periodo seleccionado.'
              )
            ) : (
              dialogCopy.emptyMessage
            )}
          </div>
        </div>

        <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            className={applyButtonClassName}
            disabled={!hasSelection}
            onClick={() => {
              onApply(selectedDateKeys, selectedLabel);
              onOpenChange(false);
            }}
          >
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const AccessControlCustomPeriodDialog = ({
  open,
  onOpenChange,
  reports,
  applyButtonClassName,
  onApply,
}: AccessControlCustomPeriodDialogProps) => {
  const {
    mode,
    setMode,
    selectedDays,
    setSelectedDays,
    selectedRange,
    setSelectedRange,
    customSelections,
    normalizedSelectedDays,
    canAddRange,
    selectedDateKeys,
    hasCustomSelections,
    addCurrentSingleSelection,
    addCurrentRangeSelection,
    removeSelection,
  } = useCustomExportPeriodSelection();
  const { calendarStartMonth, calendarEndMonth, calendarClassNames } = useWorkReportExportCalendar();

  const selectedDateSet = useMemo(() => new Set(selectedDateKeys), [selectedDateKeys]);
  const matchedReports = useMemo(
    () => reports.filter((report) => selectedDateSet.has(report.date.trim())),
    [reports, selectedDateSet],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen className="overflow-y-auto">
        <DialogHeader className="text-center">
          <DialogTitle>Exportacion personalizada</DialogTitle>
          <DialogDescription>Selecciona dias sueltos o rangos para generar el informe.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={mode === 'single-days' ? 'default' : 'outline'}
              onClick={() => setMode('single-days')}
              className="min-w-[180px]"
            >
              Dias sueltos
            </Button>
            <Button
              type="button"
              variant={mode === 'range' ? 'default' : 'outline'}
              onClick={() => setMode('range')}
              className="min-w-[180px]"
            >
              De fecha a fecha
            </Button>
          </div>

          {mode === 'single-days' ? (
            <div className="space-y-3">
              <div className="flex justify-center rounded-md border p-2">
                <Calendar
                  mode="multiple"
                  selected={selectedDays}
                  onSelect={setSelectedDays}
                  locale={es}
                  weekStartsOn={1}
                  captionLayout="dropdown"
                  startMonth={calendarStartMonth}
                  endMonth={calendarEndMonth}
                  reverseYears
                  classNames={calendarClassNames}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={addCurrentSingleSelection}
                disabled={normalizedSelectedDays.length === 0}
              >
                Anadir dias seleccionados
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-center rounded-md border p-2">
                <Calendar
                  mode="range"
                  selected={selectedRange}
                  onSelect={setSelectedRange}
                  locale={es}
                  weekStartsOn={1}
                  captionLayout="dropdown"
                  startMonth={calendarStartMonth}
                  endMonth={calendarEndMonth}
                  reverseYears
                  classNames={calendarClassNames}
                />
              </div>
              <Button type="button" variant="outline" onClick={addCurrentRangeSelection} disabled={!canAddRange}>
                Anadir rango
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-700">Selecciones anadidas</div>
            {customSelections.length === 0 ? (
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                Todavia no hay fechas anadidas.
              </div>
            ) : (
              <div className="space-y-2 rounded-md border bg-slate-50 p-2">
                {customSelections.map((selection) => (
                  <div
                    key={selection.id}
                    className="flex items-start justify-between gap-2 rounded-md border bg-white px-3 py-2"
                  >
                    <span className="text-sm text-slate-700">{selection.label}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-500 hover:text-slate-800"
                      onClick={() => removeSelection(selection.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {hasCustomSelections ? (
              matchedReports.length > 0 ? (
                <>
                  Controles seleccionados: <strong>{matchedReports.length}</strong>. Fechas incluidas:{' '}
                  <strong>{selectedDateKeys.length}</strong>
                </>
              ) : (
                'No hay controles para las fechas seleccionadas.'
              )
            ) : (
              'Anade al menos una seleccion de fechas para continuar.'
            )}
          </div>
        </div>

        <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            className={applyButtonClassName}
            disabled={!hasCustomSelections}
            onClick={() => {
              onApply(
                selectedDateKeys,
                buildCustomSelectionLabel(customSelections.length, selectedDateKeys.length),
              );
              onOpenChange(false);
            }}
          >
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
