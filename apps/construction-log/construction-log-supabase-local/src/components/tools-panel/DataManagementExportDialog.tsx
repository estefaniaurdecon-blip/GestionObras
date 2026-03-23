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
import { FileOutput, Loader2 } from 'lucide-react';
import { ToolsOptionButton } from './toolsPanelShared';

export const DataManagementExportDialog = ({
  disabled,
  reports,
}: {
  disabled: boolean;
  reports: WorkReport[];
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { selectedDays, setSelectedDays, normalizedSelectedDays, selectedDateKeys, clearSelection } =
    useMultiDayExportSelection();
  const { calendarStartMonth, calendarEndMonth, calendarClassNames } = useWorkReportExportCalendar();
  const [exporting, setExporting] = useState(false);

  const selectedDateSet = useMemo(() => new Set(selectedDateKeys), [selectedDateKeys]);
  const matchedReports = useMemo(
    () => reports.filter((report) => selectedDateSet.has(getOfflineReportDateKey(report))),
    [reports, selectedDateSet],
  );

  const canExport = normalizedSelectedDays.length > 0 && matchedReports.length > 0 && !exporting;

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
      clearSelection();
      setExporting(false);
    }
  }, [clearSelection, open]);

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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exportar datos</DialogTitle>
          <DialogDescription>
            Selecciona uno o varios dias para exportar sus partes en formato JSON.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Dias seleccionados: {normalizedSelectedDays.length}
          </div>
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Partes encontrados: {matchedReports.length}
          </div>
        </div>

        <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={exporting}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="!bg-blue-600 !text-white hover:!bg-blue-700 border border-blue-600"
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
