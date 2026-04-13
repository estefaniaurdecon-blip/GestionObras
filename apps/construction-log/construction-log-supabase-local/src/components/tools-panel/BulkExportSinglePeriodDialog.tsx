import { type ReactNode, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useWorkReportExportImageSelection } from '@/hooks/useWorkReportExportImageSelection';
import {
  useSinglePeriodExportSelection,
  type SinglePeriodMode,
} from '@/hooks/useWorkReportExportPeriodSelection';
import {
  buildPdfExportFilesFromReports,
  buildZipExportFile,
  downloadExportFiles,
  getExportDirectoryLabel,
  isNativeExportPlatform,
  isShareCancellationError,
  shareExportFiles,
} from '@/services/workReportExportInfrastructure';
import {
  buildExportWorkReport,
  buildPdfExportFilename,
  getOfflineReportDateKey,
  getSinglePeriodZipFilename,
} from '@/services/workReportExportDomain';
import { es } from 'date-fns/locale';
import { ChevronDown, Loader2 } from 'lucide-react';
import { ToolsOptionButton } from './toolsPanelShared';

export const BulkExportSinglePeriodDialog = ({
  disabled,
  reports,
  mode,
  icon,
  label,
}: {
  disabled: boolean;
  reports: WorkReport[];
  mode: SinglePeriodMode;
  icon: ReactNode;
  label: string;
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
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
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'zip' | null>(null);

  const selectedDateSet = useMemo(() => new Set(selectedDateKeys), [selectedDateKeys]);
  const matchedReports = useMemo(
    () => reports.filter((report) => selectedDateSet.has(getOfflineReportDateKey(report))),
    [reports, selectedDateSet],
  );
  const {
    imageCandidates,
    selectedImageIds,
    includeImagesInExport,
    selectedImageMapByReport,
    toggleImageSelection,
    selectAllImages,
    clearImageSelection,
  } = useWorkReportExportImageSelection({
    reports: matchedReports,
    enabled: open,
  });
  const hasMatchedReports = matchedReports.length > 0;
  const canExport = hasSelection && hasMatchedReports && exportingFormat === null;

  const buildPdfExportFiles = async () => {
    const exportReports = matchedReports.map((report) =>
      buildExportWorkReport(report, selectedImageMapByReport.get(report.id)),
    );
    const files = await buildPdfExportFilesFromReports({
      reports: exportReports,
      includeImages: includeImagesInExport,
      buildFileName: buildPdfExportFilename,
    });

    return { exportReports, files };
  };

  const notifyExportReadyToShare = (
    files: Array<{ filename: string; blob: Blob }>,
    title: string,
    text: string,
    exportedDescription: string,
    savedUris: string[] = [],
  ) => {
    if (!isNativeExportPlatform()) {
      toast({
        title: 'Exportacion completada',
        description: exportedDescription,
      });
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
                  title,
                  text,
                  savedUris,
                });
                toast({
                  title: 'Panel de compartir abierto',
                  description: 'Revisa la app elegida y pulsa Enviar para completar el envio.',
                });
              } catch (error) {
                if (isShareCancellationError(error)) return;
                console.error('[BulkExportSinglePeriodDialog] Error compartiendo archivo exportado:', error);
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
  };

  const handleExportPdf = async () => {
    if (!canExport) return;
    setExportingFormat('pdf');
    try {
      const { exportReports, files } = await buildPdfExportFiles();
      const downloadResult = await downloadExportFiles(files);
      const nativeDirectory = downloadResult.directory;
      const exportedDescription = nativeDirectory
        ? `Se guardaron ${exportReports.length} PDF en ${getExportDirectoryLabel(nativeDirectory)}.`
        : `Se descargaron ${exportReports.length} PDF.`;
      notifyExportReadyToShare(
        files,
        'Partes en PDF',
        'Partes de trabajo exportados',
        exportedDescription,
        downloadResult.uris,
      );
      setOpen(false);
    } catch (error) {
      console.error('[BulkExportSinglePeriodDialog] Error exportando PDF:', error);
      toast({
        title: 'Error al exportar PDF',
        description: 'No se pudieron generar los partes en PDF.',
        variant: 'destructive',
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const handleExportZip = async () => {
    if (!canExport) return;
    setExportingFormat('zip');
    try {
      const { exportReports, files } = await buildPdfExportFiles();
      const zipFilename = getSinglePeriodZipFilename({
        mode,
        selectedDay,
        selectedWeek,
        selectedMonthAnchor,
      });
      const zipFile = await buildZipExportFile({ files, filename: zipFilename });
      const zipFiles = [zipFile];
      const downloadResult = await downloadExportFiles(zipFiles);
      const nativeDirectory = downloadResult.directory;
      const exportedDescription = nativeDirectory
        ? `Se guardo el ZIP en ${getExportDirectoryLabel(nativeDirectory)}.`
        : `Se generaron ${exportReports.length} partes en ZIP.`;
      notifyExportReadyToShare(
        zipFiles,
        'Partes en ZIP',
        'ZIP de partes',
        exportedDescription,
        downloadResult.uris,
      );
      setOpen(false);
    } catch (error) {
      console.error('[BulkExportSinglePeriodDialog] Error exportando ZIP:', error);
      toast({
        title: 'Error al exportar ZIP',
        description: 'No se pudo generar el ZIP con los partes.',
        variant: 'destructive',
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const dialogTitle =
    mode === 'day' ? 'Exportacion diaria' : mode === 'week' ? 'Exportacion semanal' : 'Exportacion mensual';
  const selectionHint =
    mode === 'day'
      ? 'Selecciona un dia del calendario.'
      : mode === 'week'
        ? 'Selecciona un dia y se elegira la semana completa.'
        : 'Selecciona mes y año.';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ToolsOptionButton
          icon={icon}
          label={label}
          disabled={disabled}
          onClick={() => {
            setOpen(true);
          }}
        />
      </DialogTrigger>

      <DialogContent fullScreen className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{selectionHint}</DialogDescription>
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
                <div className="text-center text-sm text-slate-600">Selecciona mes y año</div>
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

          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-700">Imagenes de albaranes</div>
            {imageCandidates.length === 0 ? (
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                Al seleccionar un periodo con partes, aqui se mostraran solo los albaranes asociados.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={selectAllImages}>
                    Seleccionar todas
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={clearImageSelection}>
                    Quitar todas
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {selectedImageIds.length}/{imageCandidates.length} seleccionadas
                  </span>
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border bg-slate-50 p-2">
                  {imageCandidates.map((candidate) => (
                    <label
                      key={candidate.id}
                      className="flex items-start gap-2 rounded-md border bg-white px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedImageIds.includes(candidate.id)}
                        onCheckedChange={() => toggleImageSelection(candidate.id)}
                      />
                      <span className="text-slate-700">{candidate.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {hasSelection ? (
              hasMatchedReports ? (
                <>
                  Partes seleccionados: <strong>{matchedReports.length}</strong>
                </>
              ) : (
                'No hay partes para el periodo seleccionado.'
              )
            ) : (
              'Selecciona un periodo para exportar.'
            )}
          </div>
        </div>

        <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
          <Button
            type="button"
            className="!bg-blue-600 !text-white hover:!bg-blue-700 border border-blue-600"
            disabled={!canExport}
            onClick={() => void handleExportPdf()}
          >
            {exportingFormat === 'pdf' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exportando PDF...
              </>
            ) : (
              'Exportar como PDF'
            )}
          </Button>
          <Button
            type="button"
            className="!bg-blue-600 !text-white hover:!bg-blue-700 border border-blue-600"
            disabled={!canExport}
            onClick={() => void handleExportZip()}
          >
            {exportingFormat === 'zip' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exportando ZIP...
              </>
            ) : (
              'Exportar como ZIP'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
