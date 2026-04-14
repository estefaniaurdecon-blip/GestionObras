import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ToastAction } from '@/components/ui/toast';
import type { WorkReport } from '@/offline-db/types';
import { useToast } from '@/hooks/use-toast';
import { useWorkReportExportCalendar } from '@/hooks/useWorkReportExportCalendar';
import {
  useMultiDayExportSelection,
  useSinglePeriodExportSelection,
} from '@/hooks/useWorkReportExportPeriodSelection';
import {
  downloadExportFiles,
  getExportDirectoryLabel,
  isNativeExportPlatform,
  isShareCancellationError,
  shareExportFiles,
} from '@/services/workReportExportInfrastructure';
import {
  buildJsonExportFilesFromReports,
  getOfflineReportDateKey,
} from '@/services/workReportExportDomain';
import { es } from 'date-fns/locale';
import { ChevronDown, FileOutput, Loader2 } from 'lucide-react';
import { ToolsOptionButton } from './toolsPanelShared';

type ExportMode = 'days' | 'week' | 'month';

const MODE_LABELS: Record<ExportMode, string> = {
  days: 'Días sueltos',
  week: 'Semana',
  month: 'Mes',
};

export const DataManagementExportDialog = ({
  disabled,
  reports,
}: {
  disabled: boolean;
  reports: WorkReport[];
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<ExportMode>('days');
  const [exporting, setExporting] = useState(false);

  // Todos los hooks de selección llamados incondicionalmente
  const multiDay = useMultiDayExportSelection();
  const weekSel = useSinglePeriodExportSelection('week');
  const monthSel = useSinglePeriodExportSelection('month');

  const {
    calendarStartMonth,
    calendarEndMonth,
    calendarClassNames,
    monthOptions,
    yearOptions,
  } = useWorkReportExportCalendar();

  // Derivar selección activa según modo
  const activeSelectedDateKeys = useMemo(() => {
    if (activeMode === 'days') return multiDay.selectedDateKeys;
    if (activeMode === 'week') return weekSel.selectedDateKeys;
    return monthSel.selectedDateKeys;
  }, [activeMode, multiDay.selectedDateKeys, weekSel.selectedDateKeys, monthSel.selectedDateKeys]);

  const hasSelection =
    activeMode === 'days'
      ? multiDay.normalizedSelectedDays.length > 0
      : activeMode === 'week'
        ? weekSel.hasSelection
        : monthSel.hasSelection;

  const selectionLabel =
    activeMode === 'days'
      ? multiDay.normalizedSelectedDays.length > 0
        ? `${multiDay.normalizedSelectedDays.length} día${multiDay.normalizedSelectedDays.length !== 1 ? 's' : ''} seleccionado${multiDay.normalizedSelectedDays.length !== 1 ? 's' : ''}`
        : 'Ningún día seleccionado.'
      : activeMode === 'week'
        ? weekSel.hasSelection
          ? weekSel.selectedLabel
          : 'Ninguna semana seleccionada.'
        : monthSel.hasSelection
          ? monthSel.selectedLabel
          : 'Ningún mes seleccionado.';

  const clearActiveSelection = () => {
    if (activeMode === 'days') multiDay.clearSelection();
    else if (activeMode === 'week') weekSel.clearSelection();
    else monthSel.clearSelection();
  };

  const selectedDateSet = useMemo(() => new Set(activeSelectedDateKeys), [activeSelectedDateKeys]);
  const matchedReports = useMemo(
    () => reports.filter((report) => selectedDateSet.has(getOfflineReportDateKey(report))),
    [reports, selectedDateSet],
  );

  const canExport = hasSelection && matchedReports.length > 0 && !exporting;

  const handleExport = async () => {
    if (!canExport) return;
    setExporting(true);

    try {
      const files = buildJsonExportFilesFromReports(matchedReports);

      const downloadResult = await downloadExportFiles(files);
      const nativeDirectory = downloadResult.directory;
      const exportedDescription = nativeDirectory
        ? `Se guardaron ${files.length} JSON en ${getExportDirectoryLabel(nativeDirectory)}.`
        : `Se descargaron ${files.length} JSON.`;

      if (!isNativeExportPlatform()) {
        toast({
          title: files.length > 1 ? 'Archivos exportados con exito' : 'Archivo exportado con exito',
          description: exportedDescription,
        });
        setOpen(false);
        return;
      }

      toast({
        title: files.length > 1 ? 'Archivos exportados con exito' : 'Archivo exportado con exito',
        description: `${exportedDescription} Quieres compartir?`,
        duration: Infinity,
        action: (
          <ToastAction
            altText="Compartir archivo exportado"
            onClick={() => {
              void (async () => {
                try {
                  await shareExportFiles({
                    files,
                    savedUris: downloadResult.uris,
                    title: 'Partes exportados en JSON',
                    text: 'Exportacion de partes en formato JSON',
                  });
                  toast({
                    title: 'Panel de compartir abierto',
                    description: 'Revisa la app elegida y pulsa Enviar para completar el envio.',
                  });
                } catch (error) {
                  if (isShareCancellationError(error)) return;
                  console.error('[DataManagementExportDialog] Error compartiendo JSON exportado:', error);
                  toast({
                    title: 'Error al compartir',
                    description: 'No se pudo compartir el archivo exportado.',
                    variant: 'destructive',
                  });
                }
              })();
            }}
          >
            Compartir
          </ToastAction>
        ),
      });
      setOpen(false);
    } catch (error) {
      console.error('[DataManagementExportDialog] Error exportando JSON:', error);
      toast({
        title: 'Error al exportar',
        description: 'No se pudieron generar los archivos JSON.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!open) {
      multiDay.clearSelection();
      weekSel.clearSelection();
      monthSel.clearSelection();
      setExporting(false);
      setActiveMode('days');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ToolsOptionButton
          icon={<FileOutput className="h-8 w-8 text-indigo-600" />}
          label="Exportar datos"
          disabled={disabled}
          onClick={() => setOpen(true)}
        />
      </DialogTrigger>
      <DialogContent fullScreen className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exportar datos</DialogTitle>
          <DialogDescription>
            Selecciona el periodo a exportar en formato JSON.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selector de modo */}
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
            {(Object.keys(MODE_LABELS) as ExportMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setActiveMode(mode)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  activeMode === mode
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>

          {/* Calendario / selector según modo */}
          <div className="flex justify-center rounded-md border p-2">
            {activeMode === 'days' && (
              <Calendar
                mode="multiple"
                selected={multiDay.selectedDays}
                onSelect={multiDay.setSelectedDays}
                locale={es}
                weekStartsOn={1}
                captionLayout="dropdown"
                startMonth={calendarStartMonth}
                endMonth={calendarEndMonth}
                reverseYears
                classNames={calendarClassNames}
              />
            )}

            {activeMode === 'week' && (
              <Calendar
                mode="range"
                selected={weekSel.selectedWeek}
                onSelect={(_, day) => weekSel.handleSelectWeekByDay(day)}
                locale={es}
                weekStartsOn={1}
                captionLayout="dropdown"
                startMonth={calendarStartMonth}
                endMonth={calendarEndMonth}
                reverseYears
                classNames={{
                  ...calendarClassNames,
                  range_start: 'bg-indigo-500 text-white rounded-md',
                  range_middle: 'bg-indigo-100 text-indigo-900',
                  range_end: 'bg-indigo-500 text-white rounded-md',
                }}
              />
            )}

            {activeMode === 'month' && (
              <div className="w-full max-w-[540px] space-y-2 px-2 py-1">
                <div className="text-center text-sm text-slate-600">Selecciona mes y año</div>
                <div className="flex items-center justify-center gap-5">
                  <div className="relative w-[112px]">
                    <select
                      value={
                        monthSel.selectedMonthAnchor
                          ? monthSel.selectedMonthAnchor.getMonth()
                          : new Date().getMonth()
                      }
                      onChange={(e) => monthSel.handleMonthChange(Number(e.target.value))}
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
                      value={
                        monthSel.selectedMonthAnchor
                          ? monthSel.selectedMonthAnchor.getFullYear()
                          : new Date().getFullYear()
                      }
                      onChange={(e) => monthSel.handleYearChange(Number(e.target.value))}
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

          {/* Resumen de selección */}
          <div className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span>{selectionLabel}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={clearActiveSelection}
              disabled={!hasSelection}
            >
              Limpiar
            </Button>
          </div>

          {/* Partes encontrados */}
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {hasSelection ? (
              matchedReports.length > 0 ? (
                <>
                  Partes encontrados: <strong>{matchedReports.length}</strong>
                </>
              ) : (
                'No hay partes para el periodo seleccionado.'
              )
            ) : (
              'Selecciona un periodo para ver los partes disponibles.'
            )}
          </div>
        </div>

        <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={exporting}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="!bg-indigo-600 !text-white hover:!bg-indigo-700 border border-indigo-600"
            onClick={() => void handleExport()}
            disabled={!canExport}
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exportando...
              </>
            ) : (
              'Exportar JSON'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
