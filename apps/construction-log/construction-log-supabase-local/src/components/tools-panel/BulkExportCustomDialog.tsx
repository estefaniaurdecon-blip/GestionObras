import { useMemo, useState } from 'react';
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
  useCustomExportPeriodSelection,
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
} from '@/services/workReportExportDomain';
import { es } from 'date-fns/locale';
import { Loader2, X } from 'lucide-react';
import { CalendarCustomIcon, ToolsOptionButton } from './toolsPanelShared';

export const BulkExportCustomDialog = ({
  disabled,
  reports,
}: {
  disabled: boolean;
  reports: WorkReport[];
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
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
  const canExport = hasCustomSelections && hasMatchedReports && exportingFormat === null;

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
                console.error('[BulkExportCustomDialog] Error compartiendo archivo exportado:', error);
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
      console.error('[BulkExportCustomDialog] Error exportando PDF:', error);
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
      const stamp = new Date().toISOString().slice(0, 10);
      const zipFilename = `Partes_personalizados_${stamp}.zip`;
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
      console.error('[BulkExportCustomDialog] Error exportando ZIP:', error);
      toast({
        title: 'Error al exportar ZIP',
        description: 'No se pudo generar el ZIP con los partes.',
        variant: 'destructive',
      });
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ToolsOptionButton
          icon={<CalendarCustomIcon />}
          label="Personalizado"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
          }}
        />
      </DialogTrigger>

      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exportacion personalizada</DialogTitle>
          <DialogDescription>
            Selecciona dias sueltos o rangos, elige imagenes asociadas y exporta.
          </DialogDescription>
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
              <Button
                type="button"
                variant="outline"
                onClick={addCurrentRangeSelection}
                disabled={!canAddRange}
              >
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

          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-700">Imagenes de albaranes</div>
            {imageCandidates.length === 0 ? (
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                Al seleccionar fechas con partes, aqui se mostraran solo los albaranes asociados.
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
            {hasCustomSelections ? (
              hasMatchedReports ? (
                <>
                  Partes seleccionados: <strong>{matchedReports.length}</strong>
                </>
              ) : (
                'No hay partes para las fechas seleccionadas.'
              )
            ) : (
              'Anade al menos una seleccion de fechas para exportar.'
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
