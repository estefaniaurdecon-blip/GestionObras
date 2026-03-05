import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { PeriodHoursChart } from '@/components/PeriodHoursChart';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  formatDateLabel,
  toDateKey,
  useCustomExportPeriodSelection,
  useMultiDayExportSelection,
  useSinglePeriodExportSelection,
  type SinglePeriodMode,
} from '@/hooks/useWorkReportExportPeriodSelection';
import { useAuth } from '@/contexts/AuthContext';
import { prepareOfflineTenantScope } from '@/offline-db/tenantScope';
import { workReportsRepo } from '@/offline-db/repositories/workReportsRepo';
import { executeWorkReportImport, type ImportConflictPolicy } from '@/services/workReportImportService';
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
  buildJsonExportFilesFromReports,
  buildPdfExportFilename,
  getOfflineReportDateKey,
  getSinglePeriodZipFilename,
} from '@/services/workReportExportDomain';
import {
  asRecord,
  payloadBoolean,
  payloadNumber,
  payloadText,
} from '@/pages/indexHelpers';
import {
  EMPTY_WORK_SEARCH_FILTERS,
  filterReportsByWorkFilters,
  groupReportsByWork,
  hasWorkSearchFilters,
  normalizeWorkSearchFilters,
  type WorkSearchFilters,
} from '@/components/reportsAnalysisWorkGrouping';
import {
  format,
  isAfter,
  isBefore,
  startOfMonth,
  subDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlarmClockCheck,
  BarChart3,
  Brain,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CirclePlus,
  ClipboardPen,
  ClipboardList,
  CloudUpload,
  ChevronDown,
  Copy,
  Download,
  FileText,
  FileInput,
  FileOutput,
  Clock3,
  Euro,
  Truck,
  Eye,
  Loader2,
  Paintbrush,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';

type SyncSummary = {
  total: number;
  synced: number;
  pendingSync: number;
  errorSync: number;
  pendingTotal: number;
};

type ToolsActionTab = 'bulk-export' | 'data-management' | 'summary-report';

const TOOLS_LABELS: Record<ToolsActionTab, string> = {
  'bulk-export': 'Exportacion masiva',
  'data-management': 'Gestion de datos',
  'summary-report': 'Informe resumen',
};

type BaseToolsProps = {
  tenantUnavailable: boolean;
  onPending: (featureName: string) => void;
};

export type OpenExistingReportOptions = {
  navigationReportIds?: string[];
  returnToSummaryAnalysis?: boolean;
};

export type PartsTabContentProps = BaseToolsProps & {
  tenantResolving: boolean;
  tenantNeedsPicker: boolean;
  tenantErrorMessage: string;
  workReportsLoading: boolean;
  workReports: WorkReport[];
  workReportVisibleDays: number;
  syncing: boolean;
  canCreateWorkReport: boolean;
  workReportsReadOnlyByRole: boolean;
  hasSyncPendingValidation: boolean;
  syncSummary: SyncSummary;
  syncPanelClass: string;
  syncHeadlineClass: string;
  onSyncNow: () => Promise<void>;
  onGenerateWorkReport: () => void;
  onCloneFromHistoryDialog: (report: WorkReport) => void;
  onOpenExistingReport: (report: WorkReport, options?: OpenExistingReportOptions) => void;
  onDeleteReport: (report: WorkReport) => void;
};

export type ToolsPanelContentProps = BaseToolsProps & {
  activeToolsTab: ToolsActionTab;
  workReports: WorkReport[];
  summaryReportAnalysisOpen: boolean;
  onSummaryReportAnalysisOpenChange: (open: boolean) => void;
  onOpenMetrics: () => void;
  onOpenExistingReport: (report: WorkReport, options?: OpenExistingReportOptions) => void;
  onBackToParts: () => void;
  onDataChanged: () => Promise<void>;
};

type ToolsOptionButtonProps = {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

const CalendarNumberIcon = ({ value }: { value: string }) => (
  <span className="relative inline-flex items-center justify-center text-indigo-600">
    <CalendarDays className="h-8 w-8" />
    <span
      className={`pointer-events-none absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-indigo-200 bg-white/95 font-extrabold leading-none text-indigo-700 ${
        value.length > 1 ? 'px-1.5 py-0.5 text-[12px]' : 'px-1 py-0.5 text-[14px]'
      }`}
    >
      {value}
    </span>
  </span>
);

const CalendarCustomIcon = () => (
  <span className="relative inline-flex items-center justify-center text-indigo-600">
    <CalendarDays className="h-8 w-8" />
    <span className="pointer-events-none absolute left-1/2 top-[56%] -translate-x-1/2 -translate-y-1/2 rounded-md bg-white/95 p-0.5">
      <Paintbrush className="h-4 w-4 text-indigo-700" />
    </span>
  </span>
);

const ToolsOptionButton = ({ icon, label, disabled, onClick }: ToolsOptionButtonProps) => (
  <Button
    type="button"
    variant="outline"
    disabled={disabled}
    onClick={onClick}
    className="h-24 w-full flex-col items-center justify-start gap-2 rounded-2xl border-slate-300 bg-white px-3 pt-3 text-slate-700 shadow-sm hover:bg-slate-50 sm:h-28 sm:pt-4 md:h-32 md:pt-5 lg:h-28 lg:pt-4"
  >
    <span className="flex h-9 items-center justify-center sm:h-10 md:h-11 [&_svg]:h-8 [&_svg]:w-8 sm:[&_svg]:h-9 sm:[&_svg]:w-9 md:[&_svg]:h-10 md:[&_svg]:w-10">
      {icon}
    </span>
    <span className="min-h-[2.25rem] max-w-full whitespace-normal break-words text-center text-[14px] font-medium leading-snug sm:min-h-[2.75rem] sm:text-base">
      {label}
    </span>
  </Button>
);

const parseDateKey = (value: string): Date | null => {
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }
  return parsed;
};

const safeText = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const safeNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const safeArray = (value: unknown) => (Array.isArray(value) ? value : []);
const firstFiniteNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};
const pickCostReference = (...values: unknown[]) => {
  const finiteValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  const firstPositive = finiteValues.find((value) => value > 0);
  if (typeof firstPositive === 'number') return firstPositive;
  return finiteValues[0] ?? 0;
};

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter((value) => value.length > 0)));

const BulkExportCustomDialog = ({
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

const BulkExportSinglePeriodDialog = ({
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

      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
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

const DataManagementExportDialog = ({
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

const DataManagementImportDialog = ({
  disabled,
  onDataChanged,
}: {
  disabled: boolean;
  onDataChanged: () => Promise<void>;
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [pendingConflictCount, setPendingConflictCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePickFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles(files);
  };

  const handleImport = async (selectedConflictPolicy?: ImportConflictPolicy) => {
    if (selectedFiles.length === 0) return;
    setImporting(true);

    try {
      const tenantId = await prepareOfflineTenantScope(user);
      const existingReports = await workReportsRepo.list({ tenantId, limit: 5000 });
      const importResult = await executeWorkReportImport({
        tenantId,
        existingReports,
        files: selectedFiles,
        selectedConflictPolicy,
        createReport: (draft) => workReportsRepo.create(draft),
        updateReport: (id, patch) => workReportsRepo.update(id, patch),
      });

      if (importResult.reportsToImportCount === 0) {
        toast({
          title: 'Importacion sin cambios',
          description: 'No se encontraron partes validos en los archivos seleccionados.',
          variant: 'destructive',
        });
        return;
      }

      if (importResult.requiresConflictResolution) {
        setPendingConflictCount(importResult.conflictMatchesCount);
        return;
      }

      await onDataChanged();

      const errorsSummary =
        importResult.invalidFilesCount > 0 || importResult.invalidReportsCount > 0
          ? ` (archivos invalidos: ${importResult.invalidFilesCount}, partes invalidos: ${importResult.invalidReportsCount})`
          : '';
      const conflictSummary =
        importResult.conflictMatchesCount > 0
          ? ` Conflictos de identificador: ${importResult.conflictMatchesCount}.`
          : '';
      const importSummary = `Nuevos: ${importResult.createdCount}. Sobrescritos: ${importResult.overwrittenCount}. Identificador cambiado: ${importResult.renumberedCount}.`;

      toast({
        title: 'Importacion completada',
        description: `Se procesaron ${importResult.importedCount} parte(s). ${importSummary}${conflictSummary}${errorsSummary}`,
      });

      setPendingConflictCount(null);
      resetFiles();
      setOpen(false);
    } catch (error) {
      console.error('[DataManagementImportDialog] Error importando datos JSON:', error);
      toast({
        title: 'Error al importar',
        description: 'No se pudieron importar los archivos JSON.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    if (!open) {
      resetFiles();
      setImporting(false);
      setPendingConflictCount(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ToolsOptionButton
          icon={<FileInput className="h-8 w-8 text-indigo-600" />}
          label="Importar datos"
          disabled={disabled}
          onClick={() => setOpen(true)}
        />
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar datos</DialogTitle>
          <DialogDescription>
            Selecciona uno o varios archivos JSON para crear o actualizar partes con su informacion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={handleFilesSelected}
          />

          <Button type="button" variant="outline" onClick={handlePickFiles} disabled={importing}>
            Seleccionar archivos JSON
          </Button>

          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Archivos seleccionados: {selectedFiles.length}
          </div>
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Si un identificador ya existe, se mostrara un aviso para elegir entre sobrescribir o cambiar identificador.
          </div>

          {selectedFiles.length > 0 ? (
            <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-2">
              {selectedFiles.map((file) => (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="truncate rounded bg-slate-50 px-2 py-1 text-xs text-slate-700"
                  title={file.name}
                >
                  {file.name}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="!bg-blue-600 !text-white hover:!bg-blue-700 border border-blue-600"
            onClick={() => void handleImport()}
            disabled={selectedFiles.length === 0 || importing}
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importando...
              </>
            ) : (
              'Importar JSON'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog
        open={pendingConflictCount !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !importing) {
            setPendingConflictCount(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Parte ya existente</DialogTitle>
            <DialogDescription>
              Se detectaron {pendingConflictCount ?? 0} conflicto(s) de identificador. Elige como continuar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingConflictCount(null)}
              disabled={importing}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleImport('renumber')}
              disabled={importing}
            >
              Cambiar identificador
            </Button>
            <Button
              type="button"
              className="!bg-blue-600 !text-white hover:!bg-blue-700 border border-blue-600"
              onClick={() => void handleImport('overwrite')}
              disabled={importing}
            >
              Sobrescribir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

const ToolActions = ({
  activeToolsTab,
  tenantUnavailable,
  onOpenMetrics,
  onOpenAnalysis,
  onPending,
  onDataChanged,
  workReports,
}: {
  activeToolsTab: ToolsActionTab;
  tenantUnavailable: boolean;
  onOpenMetrics: () => void;
  onOpenAnalysis: () => void;
  onPending: (featureName: string) => void;
  onDataChanged: () => Promise<void>;
  workReports: WorkReport[];
}) => {
  if (activeToolsTab === 'bulk-export') {
    return (
      <>
        <BulkExportSinglePeriodDialog
          disabled={tenantUnavailable}
          reports={workReports}
          mode="day"
          icon={<CalendarNumberIcon value="1" />}
          label="Exportar dia"
        />
        <BulkExportSinglePeriodDialog
          disabled={tenantUnavailable}
          reports={workReports}
          mode="week"
          icon={<CalendarNumberIcon value="7" />}
          label="Exportar semanal"
        />
        <BulkExportSinglePeriodDialog
          disabled={tenantUnavailable}
          reports={workReports}
          mode="month"
          icon={<CalendarNumberIcon value="30" />}
          label="Exportar mensual"
        />
        <BulkExportCustomDialog disabled={tenantUnavailable} reports={workReports} />
      </>
    );
  }

  if (activeToolsTab === 'data-management') {
    return (
      <>
        <ToolsOptionButton
          icon={<AlarmClockCheck className="h-8 w-8 text-indigo-600" />}
          label="Ver resumen en tiempo real"
          onClick={onOpenMetrics}
        />
        <DataManagementImportDialog disabled={tenantUnavailable} onDataChanged={onDataChanged} />
        <DataManagementExportDialog disabled={tenantUnavailable} reports={workReports} />
      </>
    );
  }

  if (activeToolsTab === 'summary-report') {
    return (
      <>
        <ToolsOptionButton
          icon={<ClipboardPen className="h-8 w-8 text-indigo-600" />}
          label="Generar informe"
          disabled={tenantUnavailable}
          onClick={() => onPending('Generar informe')}
        />
        <ToolsOptionButton
          icon={<BarChart3 className="h-8 w-8 text-indigo-600" />}
          label="Analisis de informes"
          disabled={tenantUnavailable}
          onClick={onOpenAnalysis}
        />
      </>
    );
  }

  return null;
};

type AnalysisPeriod = 'all' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
type AnalysisTabValue = 'foreman' | 'workers' | 'machinery' | 'rental' | 'reports' | 'economic';

type WorkerAnalysisEntry = {
  id: string;
  company: string;
  name: string;
  hours: number;
};

type MachineryAnalysisEntry = {
  id: string;
  company: string;
  type: string;
  hours: number;
};

type AnalysisRow = {
  id: string;
  sourceReport: WorkReport;
  workNumber: string;
  workId: string;
  workName: string;
  reportTitle: string;
  reportIdentifier: string;
  date: Date | null;
  dateKey: string;
  isClosed: boolean;
  foremanHours: number;
  totalHours: number;
  totalCost: number;
  rentalProviders: string[];
  workerEntries: WorkerAnalysisEntry[];
  machineryEntries: MachineryAnalysisEntry[];
};

const WORKER_ROWS_PAGE_SIZE = 10;

const isDateWithinPeriod = (date: Date | null, period: AnalysisPeriod) => {
  if (period === 'all') return true;
  if (!date) return false;

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  let start = new Date(end);
  if (period === 'weekly') {
    start = subDays(end, 6);
  } else if (period === 'monthly') {
    start = startOfMonth(end);
  } else if (period === 'quarterly') {
    start = subDays(end, 89);
  } else if (period === 'yearly') {
    start = subDays(end, 364);
  }
  start.setHours(0, 0, 0, 0);

  return !isBefore(date, start) && !isAfter(date, end);
};

const AnalysisMetricCard = ({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) => (
  <Card className="border-slate-200">
    <CardContent className="flex min-h-[132px] flex-col items-center justify-center gap-1.5 p-3 text-center sm:min-h-[148px] sm:gap-2 sm:p-4">
      <span className="text-slate-800 [&_svg]:h-9 [&_svg]:w-9 sm:[&_svg]:h-10 sm:[&_svg]:w-10">{icon}</span>
      <div className="max-w-full break-all text-[1.15rem] font-bold leading-[1.05] text-slate-800 [font-variant-numeric:tabular-nums] sm:text-[1.3rem] md:text-[1.45rem]">
        {value}
      </div>
      <p className="text-[14px] leading-tight text-slate-600 sm:text-[15px]">{label}</p>
    </CardContent>
  </Card>
);

const ReportsAnalysisWindow = ({
  reports,
  tenantUnavailable,
  onPending,
  onOpenExistingReport,
}: {
  reports: WorkReport[];
  tenantUnavailable: boolean;
  onPending: (featureName: string) => void;
  onOpenExistingReport: (report: WorkReport, options?: OpenExistingReportOptions) => void;
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<AnalysisPeriod>('all');
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<AnalysisTabValue>('foreman');
  const [workerRowsPage, setWorkerRowsPage] = useState(0);
  const [workDatePickerOpen, setWorkDatePickerOpen] = useState(false);
  const [draftWorkSearchFilters, setDraftWorkSearchFilters] = useState<WorkSearchFilters>({
    ...EMPTY_WORK_SEARCH_FILTERS,
    includeAllWorks: true,
  });
  const [appliedWorkSearchFilters, setAppliedWorkSearchFilters] = useState<WorkSearchFilters | null>({
    ...EMPTY_WORK_SEARCH_FILTERS,
    includeAllWorks: true,
  });
  const [workSearchValidationMessage, setWorkSearchValidationMessage] = useState<string | null>(null);
  const [workSearchHasExecuted, setWorkSearchHasExecuted] = useState(true);
  const selectedWorkSearchDate = useMemo(
    () => parseDateKey(draftWorkSearchFilters.reportDate),
    [draftWorkSearchFilters.reportDate],
  );

  const analysisRows = useMemo<AnalysisRow[]>(() => {
    return reports.map((report) => {
      const payload = asRecord(report.payload) ?? {};
      const exportReport = buildExportWorkReport(report);
      const dateKey = getOfflineReportDateKey(report);
      const parsedDate = parseDateKey(dateKey);
      const reportIdentifier = payloadText(report.payload, 'reportIdentifier') ?? report.id.slice(0, 8);
      const statusText = String(report.status ?? '').toLowerCase();
      const isClosed =
        (payloadBoolean(report.payload, 'isClosed') ?? false) ||
        statusText === 'completed' ||
        statusText === 'closed';

      const workerEntries = exportReport.workGroups.flatMap((group, groupIndex) =>
        group.items
          .map((item, itemIndex) => {
            const name = safeText(item.name).trim();
            const company = safeText(group.company, 'Sin empresa').trim();
            const hours = safeNumber(item.hours, safeNumber(item.total));
            if (name.length === 0 && hours <= 0) return null;
            return {
              id: `${report.id}-worker-${groupIndex}-${itemIndex}`,
              company: company.length > 0 ? company : 'Sin empresa',
              name: name.length > 0 ? name : 'Sin nombre',
              hours,
            };
          })
          .filter((entry): entry is WorkerAnalysisEntry => entry !== null),
      );

      const machineryEntries = exportReport.machineryGroups.flatMap((group, groupIndex) =>
        group.items
          .map((item, itemIndex) => {
            const type = safeText(item.type).trim();
            const company = safeText(group.company, 'Sin empresa').trim();
            const hours = safeNumber(item.hours, safeNumber(item.total));
            if (type.length === 0 && hours <= 0) return null;
            return {
              id: `${report.id}-machinery-${groupIndex}-${itemIndex}`,
              company: company.length > 0 ? company : 'Sin empresa',
              type: type.length > 0 ? type : 'Sin tipo',
              hours,
            };
          })
          .filter((entry): entry is MachineryAnalysisEntry => entry !== null),
      );

      const rentalRows = [...safeArray(payload.rentalMachineryRows), ...safeArray(payload.rentalMachinesSnapshot)];
      const rentalProviders = uniqueStrings(
        rentalRows
          .map((rawRow) => {
            const row = asRecord(rawRow);
            if (!row) return '';
            return safeText(row.provider, safeText(row.supplier, safeText(row.company)));
          })
          .filter((provider) => provider.trim().length > 0),
      );

      const foremanEntriesHours = safeArray(payload.foremanEntries).reduce((sum, rawEntry) => {
        const entry = asRecord(rawEntry);
        if (!entry) return sum;
        const role = safeText(entry.role).trim().toLowerCase();
        if (role !== 'encargado') return sum;
        return sum + safeNumber(entry.hours);
      }, 0);
      const workersHours = workerEntries.reduce((sum, entry) => sum + entry.hours, 0);
      const machineryHours = machineryEntries.reduce((sum, entry) => sum + entry.hours, 0);
      const legacyForemanHours = firstFiniteNumber(payload.foremanHours);
      const totalHoursInPayload = firstFiniteNumber(payload.totalHours);
      const legacyLooksLikeTotalHours =
        typeof legacyForemanHours === 'number' &&
        typeof totalHoursInPayload === 'number' &&
        Math.abs(legacyForemanHours - totalHoursInPayload) < 0.01 &&
        (workersHours > 0 || machineryHours > 0);
      const foremanHours =
        firstFiniteNumber(payload.mainForemanHours) ??
        (foremanEntriesHours > 0 ? foremanEntriesHours : null) ??
        (typeof legacyForemanHours === 'number' && !legacyLooksLikeTotalHours ? legacyForemanHours : null) ??
        0;
      const totalHours = safeNumber(payload.totalHours, foremanHours);
      const materialsCostFromReport = exportReport.materialGroups.reduce(
        (sum, group) =>
          sum +
          group.items.reduce(
            (groupSum, item) =>
              groupSum + safeNumber(item.total, safeNumber(item.quantity) * safeNumber(item.unitPrice)),
            0,
          ),
        0,
      );
      const totalCost =
        materialsCostFromReport > 0
          ? materialsCostFromReport
          : pickCostReference(
              payload.materialTotal,
              payload.materialTotals,
              payload.materialsTotal,
              payload.materialCost,
              payload.materialsCost,
              payload.materialCostTotal,
              payload.materialTotalCost,
              payload.totalCost,
              payload.totalCostAmount,
              payload.costTotal,
            );

      return {
        id: report.id,
        sourceReport: report,
        workNumber: exportReport.workNumber || '',
        workId: exportReport.workId ?? '',
        workName: exportReport.workName || report.title || 'Sin obra',
        reportTitle: report.title ?? exportReport.workName,
        reportIdentifier,
        date: parsedDate,
        dateKey,
        isClosed,
        foremanHours,
        totalHours,
        totalCost,
        rentalProviders,
        workerEntries,
        machineryEntries,
      };
    });
  }, [reports]);

  const updateDraftWorkSearchFilter = <K extends keyof WorkSearchFilters>(
    key: K,
    value: WorkSearchFilters[K],
  ) => {
    setDraftWorkSearchFilters((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleSearchReports = () => {
    const normalizedFilters = normalizeWorkSearchFilters(draftWorkSearchFilters);
    const hasAnyFilter = hasWorkSearchFilters(normalizedFilters);
    if (!normalizedFilters.includeAllWorks && !hasAnyFilter) {
      setWorkSearchValidationMessage('Introduce al menos un filtro o selecciona Todas las obras.');
      setWorkSearchHasExecuted(true);
      return;
    }
    setWorkSearchValidationMessage(null);
    setWorkSearchHasExecuted(true);
    setAppliedWorkSearchFilters(normalizedFilters);
  };

  const handleClearSearch = () => {
    setDraftWorkSearchFilters(EMPTY_WORK_SEARCH_FILTERS);
    setAppliedWorkSearchFilters(null);
    setWorkSearchHasExecuted(false);
    setWorkSearchValidationMessage(null);
    setWorkDatePickerOpen(false);
  };

  const rowsWithinPeriod = useMemo(
    () => analysisRows.filter((row) => isDateWithinPeriod(row.date, selectedPeriod)),
    [analysisRows, selectedPeriod],
  );

  const filteredRows = useMemo(() => {
    if (!appliedWorkSearchFilters) return [];
    // TODO: Cuando exista endpoint con filtros por obra/fecha, mover este filtrado al servidor.
    return filterReportsByWorkFilters(rowsWithinPeriod, appliedWorkSearchFilters);
  }, [appliedWorkSearchFilters, rowsWithinPeriod]);

  const groupedFilteredRows = useMemo(() => groupReportsByWork(filteredRows), [filteredRows]);

  const totals = useMemo(() => {
    const totalParts = filteredRows.length;
    const foremanHours = filteredRows.reduce((sum, row) => sum + row.foremanHours, 0);
    const totalCost = filteredRows.reduce((sum, row) => sum + row.totalCost, 0);
    const providerCount = new Set(filteredRows.flatMap((row) => row.rentalProviders)).size;
    return { totalParts, foremanHours, totalCost, providerCount };
  }, [filteredRows]);

  const foremanChartRows = useMemo(
    () =>
      filteredRows.map((row) => ({
        date: row.date,
        dateKey: row.dateKey,
        hours: row.foremanHours,
      })),
    [filteredRows],
  );

  const workerRows = useMemo(
    () =>
      filteredRows
        .flatMap((row) =>
          row.workerEntries.map((entry) => ({
            ...entry,
            reportId: row.id,
            reportIdentifier: row.reportIdentifier,
            workName: row.workName,
            date: row.date,
            dateKey: row.dateKey,
          })),
        )
        .sort(
          (left, right) =>
            right.dateKey.localeCompare(left.dateKey) ||
            left.company.localeCompare(right.company) ||
            left.name.localeCompare(right.name),
        ),
    [filteredRows],
  );

  const machineryRows = useMemo(
    () =>
      filteredRows
        .flatMap((row) =>
          row.machineryEntries.map((entry) => ({
            ...entry,
            reportId: row.id,
            reportIdentifier: row.reportIdentifier,
            workName: row.workName,
            date: row.date,
            dateKey: row.dateKey,
          })),
        )
        .sort(
          (left, right) =>
            right.dateKey.localeCompare(left.dateKey) ||
            left.company.localeCompare(right.company) ||
            left.type.localeCompare(right.type),
        ),
    [filteredRows],
  );

  const workerChartRows = useMemo(
    () =>
      workerRows.map((row) => ({
        date: row.date,
        dateKey: row.dateKey,
        hours: row.hours,
      })),
    [workerRows],
  );

  const workerRowsPageCount = useMemo(
    () => Math.max(1, Math.ceil(workerRows.length / WORKER_ROWS_PAGE_SIZE)),
    [workerRows.length],
  );

  useEffect(() => {
    setWorkerRowsPage((previous) => Math.min(previous, workerRowsPageCount - 1));
  }, [workerRowsPageCount]);

  useEffect(() => {
    setWorkerRowsPage(0);
  }, [appliedWorkSearchFilters, selectedPeriod]);

  const paginatedWorkerRows = useMemo(() => {
    const startIndex = workerRowsPage * WORKER_ROWS_PAGE_SIZE;
    return workerRows.slice(startIndex, startIndex + WORKER_ROWS_PAGE_SIZE);
  }, [workerRows, workerRowsPage]);

  const workerRowsPageStart = workerRows.length === 0 ? 0 : workerRowsPage * WORKER_ROWS_PAGE_SIZE + 1;
  const workerRowsPageEnd = Math.min((workerRowsPage + 1) * WORKER_ROWS_PAGE_SIZE, workerRows.length);
  const canGoWorkerRowsPrevious = workerRowsPage > 0;
  const canGoWorkerRowsNext = workerRowsPage < workerRowsPageCount - 1;

  const machineryChartRows = useMemo(
    () =>
      machineryRows.map((row) => ({
        date: row.date,
        dateKey: row.dateKey,
        hours: row.hours,
      })),
    [machineryRows],
  );

  const workerSummary = useMemo(() => {
    const totalHours = workerRows.reduce((sum, row) => sum + row.hours, 0);
    const uniqueWorkers = new Set(
      workerRows.map((row) => `${row.company.toLowerCase()}::${row.name.toLowerCase()}`),
    ).size;
    return { totalHours, uniqueWorkers };
  }, [workerRows]);

  const machinerySummary = useMemo(() => {
    const totalHours = machineryRows.reduce((sum, row) => sum + row.hours, 0);
    const uniqueMachines = new Set(
      machineryRows.map((row) => `${row.company.toLowerCase()}::${row.type.toLowerCase()}`),
    ).size;
    return { totalHours, uniqueMachines };
  }, [machineryRows]);

  const sortedFilteredRows = useMemo(
    () =>
      [...filteredRows].sort(
        (left, right) => right.dateKey.localeCompare(left.dateKey) || right.id.localeCompare(left.id),
      ),
    [filteredRows],
  );
  const filteredNavigationReportIds = useMemo(
    () => sortedFilteredRows.map((row) => row.sourceReport.id),
    [sortedFilteredRows],
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="mb-5">
        <div>
          <h3 className="text-3xl font-semibold text-slate-800 sm:text-4xl">Informes Avanzados</h3>
          <p className="mt-1 text-[15px] text-slate-500 sm:text-[16px]">Analisis detallado de partes de trabajo</p>
        </div>
      </div>

      <div className="mb-5 space-y-4 rounded-xl bg-slate-100 p-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="analysis-all-works"
            checked={draftWorkSearchFilters.includeAllWorks}
            onCheckedChange={(checked) => updateDraftWorkSearchFilter('includeAllWorks', checked === true)}
          />
          <label htmlFor="analysis-all-works" className="text-[15px] font-medium text-slate-700 sm:text-[16px]">
            Todas las obras
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <label
              htmlFor="analysis-work-number-filter"
              className="text-[15px] font-semibold text-slate-700 sm:text-[16px]"
            >
              Numero de obra
            </label>
            <Input
              id="analysis-work-number-filter"
              value={draftWorkSearchFilters.workNumber}
              onChange={(event) => updateDraftWorkSearchFilter('workNumber', event.target.value)}
              placeholder="Ej. 1234"
              className="h-11 text-[15px] sm:text-[16px]"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="analysis-work-name-filter"
              className="text-[15px] font-semibold text-slate-700 sm:text-[16px]"
            >
              Nombre de obra
            </label>
            <Input
              id="analysis-work-name-filter"
              value={draftWorkSearchFilters.workName}
              onChange={(event) => updateDraftWorkSearchFilter('workName', event.target.value)}
              placeholder="Ej. Torre Norte"
              className="h-11 text-[15px] sm:text-[16px]"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="analysis-report-date-filter"
              className="text-[15px] font-semibold text-slate-700 sm:text-[16px]"
            >
              Fecha del parte
            </label>
            <Popover open={workDatePickerOpen} onOpenChange={setWorkDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="analysis-report-date-filter"
                  type="button"
                  variant="outline"
                  className={`h-11 w-full justify-between text-left text-[15px] font-normal sm:text-[16px] ${
                    selectedWorkSearchDate ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {selectedWorkSearchDate
                    ? format(selectedWorkSearchDate, 'dd/MM/yyyy', { locale: es })
                    : 'Seleccionar fecha'}
                  <CalendarDays className="ml-2 h-4 w-4 shrink-0 opacity-70" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedWorkSearchDate ?? undefined}
                  onSelect={(selectedDate) => {
                    if (!selectedDate) {
                      updateDraftWorkSearchFilter('reportDate', '');
                      return;
                    }
                    updateDraftWorkSearchFilter('reportDate', toDateKey(selectedDate));
                    setWorkDatePickerOpen(false);
                  }}
                  locale={es}
                  weekStartsOn={1}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label className="text-[15px] font-semibold text-slate-700 sm:text-[16px]">Periodo</label>
            <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as AnalysisPeriod)}>
              <SelectTrigger className="h-11 text-[15px] sm:text-[16px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los datos</SelectItem>
                <SelectItem value="weekly">Esta semana</SelectItem>
                <SelectItem value="monthly">Este mes</SelectItem>
                <SelectItem value="quarterly">Ultimos 3 meses</SelectItem>
                <SelectItem value="yearly">Por año</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-11 min-w-[140px] bg-slate-700 px-4 text-[15px] text-white hover:bg-slate-800 sm:text-[16px]"
            onClick={handleSearchReports}
          >
            <Search className="mr-2 h-4 w-4" />
            Buscar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 min-w-[140px] text-[15px] sm:text-[16px]"
            onClick={handleClearSearch}
          >
            Limpiar
          </Button>
        </div>

        {workSearchValidationMessage ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {workSearchValidationMessage}
          </div>
        ) : null}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <AnalysisMetricCard icon={<FileText />} value={`${totals.totalParts}`} label="Total Partes" />
        <AnalysisMetricCard icon={<Clock3 />} value={totals.foremanHours.toFixed(1)} label="Horas Encargado" />
        <AnalysisMetricCard
          icon={<Euro />}
          value={totals.totalCost.toLocaleString('es-ES', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
          label="Costo Total"
        />
        <AnalysisMetricCard icon={<Truck />} value={`${totals.providerCount}`} label="Proveedores Alquiler" />
      </div>

      <Tabs value={activeAnalysisTab} onValueChange={(value) => setActiveAnalysisTab(value as AnalysisTabValue)}>
        <TabsList className="mb-4 h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
          <TabsTrigger value="foreman" className="text-[15px] sm:text-[16px]">
            Encargado
          </TabsTrigger>
          <TabsTrigger value="workers" className="text-[15px] sm:text-[16px]">
            Trabajadores
          </TabsTrigger>
          <TabsTrigger value="machinery" className="text-[15px] sm:text-[16px]">
            Maquinaria
          </TabsTrigger>
          <TabsTrigger value="rental" className="text-[15px] sm:text-[16px]">
            Alquiler
          </TabsTrigger>
          <TabsTrigger value="reports" className="text-[15px] sm:text-[16px]">
            Partes/Obra
          </TabsTrigger>
          <TabsTrigger value="economic" className="text-[15px] sm:text-[16px]">
            Economico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="foreman">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-2xl text-slate-800 sm:text-4xl">Horas del Encargado por Periodo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <PeriodHoursChart
                title="Horas del Encargado por Periodo"
                rawRows={foremanChartRows}
                seriesType="encargado"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workers">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-2xl text-slate-800 sm:text-4xl">Trabajadores por Periodo</CardTitle>
              <CardDescription className="text-[15px] sm:text-[16px]">
                Horas y detalle de trabajadores por empresa para los partes filtrados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-500">Trabajadores unicos</p>
                  <p className="text-2xl font-semibold text-slate-800">{workerSummary.uniqueWorkers}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-500">Horas de trabajadores</p>
                  <p className="text-2xl font-semibold text-slate-800">{workerSummary.totalHours.toFixed(1)} h</p>
                </div>
              </div>

              <PeriodHoursChart title="Trabajadores por Periodo" rawRows={workerChartRows} seriesType="trabajadores" />

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-800">Detalle de trabajadores</h3>
                {workerRows.length === 0 ? (
                  <div className="rounded-md border bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    No hay trabajadores para los filtros seleccionados.
                  </div>
                ) : (
                  <div className="overflow-auto rounded-md border">
                    <table className="w-full min-w-[620px] border-collapse text-sm">
                      <thead className="sticky top-0 bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                          <th className="px-3 py-2 text-left font-semibold">Parte</th>
                          <th className="px-3 py-2 text-left font-semibold">Empresa</th>
                          <th className="px-3 py-2 text-left font-semibold">Trabajador</th>
                          <th className="px-3 py-2 text-right font-semibold">Horas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {paginatedWorkerRows.map((row) => (
                          <tr key={row.id} className="bg-white">
                            <td className="px-3 py-2 text-slate-600">
                              {row.date ? formatDateLabel(row.date) : row.dateKey}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{row.reportIdentifier}</td>
                            <td className="px-3 py-2 text-slate-700">{row.company}</td>
                            <td className="px-3 py-2 text-slate-800">{row.name}</td>
                            <td className="px-3 py-2 text-right font-medium text-slate-800">
                              {row.hours.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center justify-between border-t bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">
                        Mostrando {workerRowsPageStart}-{workerRowsPageEnd} de {workerRows.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => setWorkerRowsPage((previous) => Math.max(0, previous - 1))}
                          disabled={!canGoWorkerRowsPrevious}
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          Anterior
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() =>
                            setWorkerRowsPage((previous) => Math.min(workerRowsPageCount - 1, previous + 1))
                          }
                          disabled={!canGoWorkerRowsNext}
                        >
                          Siguiente
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="machinery">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-2xl text-slate-800 sm:text-4xl">Maquinaria por Periodo</CardTitle>
              <CardDescription className="text-[15px] sm:text-[16px]">
                Horas y detalle de maquinaria por empresa para los partes filtrados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-500">Maquinas unicas</p>
                  <p className="text-2xl font-semibold text-slate-800">{machinerySummary.uniqueMachines}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-500">Horas de maquinaria</p>
                  <p className="text-2xl font-semibold text-slate-800">{machinerySummary.totalHours.toFixed(1)} h</p>
                </div>
              </div>

              <PeriodHoursChart title="Maquinaria por Periodo" rawRows={machineryChartRows} seriesType="maquinaria" />

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-800">Detalle de maquinaria</h3>
                {machineryRows.length === 0 ? (
                  <div className="rounded-md border bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    No hay maquinaria para los filtros seleccionados.
                  </div>
                ) : (
                  <div className="max-h-[360px] overflow-auto rounded-md border">
                    <table className="w-full min-w-[620px] border-collapse text-sm">
                      <thead className="sticky top-0 bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                          <th className="px-3 py-2 text-left font-semibold">Parte</th>
                          <th className="px-3 py-2 text-left font-semibold">Empresa</th>
                          <th className="px-3 py-2 text-left font-semibold">Maquinaria</th>
                          <th className="px-3 py-2 text-right font-semibold">Horas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {machineryRows.map((row) => (
                          <tr key={row.id} className="bg-white">
                            <td className="px-3 py-2 text-slate-600">
                              {row.date ? formatDateLabel(row.date) : row.dateKey}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{row.reportIdentifier}</td>
                            <td className="px-3 py-2 text-slate-700">{row.company}</td>
                            <td className="px-3 py-2 text-slate-800">{row.type}</td>
                            <td className="px-3 py-2 text-right font-medium text-slate-800">
                              {row.hours.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="rental">
          <Card className="border-slate-200">
            <CardContent className="py-10 text-center text-[18px] text-slate-500 sm:text-base">
              Vista de alquiler en preparacion.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="reports">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-2xl text-slate-800 sm:text-4xl">Partes por Obra</CardTitle>
              <CardDescription className="text-[15px] sm:text-[16px]">
                Haz clic en un parte para abrir su visualizacion y revisarlo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!workSearchHasExecuted ? (
                <div className="rounded-md border bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  Aplica los filtros y pulsa Buscar para ver resultados.
                </div>
              ) : groupedFilteredRows.length === 0 ? (
                <div className="rounded-md border bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No hay partes para los filtros seleccionados.
                </div>
              ) : (
                <Accordion type="multiple" className="rounded-md border bg-slate-50">
                  {groupedFilteredRows.map((group) => (
                    <AccordionItem key={group.groupKey} value={group.groupKey} className="last:border-b-0">
                      <AccordionTrigger className="px-3 py-3 hover:no-underline">
                        <div className="flex w-full items-center justify-between gap-3 pr-2">
                          <span className="truncate text-base font-medium text-slate-900">
                            {group.displayWorkNumber} - {group.displayWorkName}
                          </span>
                          <Badge
                            variant="outline"
                            className="shrink-0 border-slate-300 bg-white text-slate-700"
                          >
                            {group.count}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="border-t bg-white pb-0 pt-0">
                        <div className="divide-y">
                          {group.reports.map((row) => (
                            <button
                              key={row.id}
                              type="button"
                              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                              onClick={() =>
                                onOpenExistingReport(row.sourceReport, {
                                  navigationReportIds: filteredNavigationReportIds,
                                  returnToSummaryAnalysis: true,
                                })
                              }
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="truncate text-sm font-medium text-slate-900">
                                  Parte: {row.reportIdentifier}
                                </div>
                                <div className="text-xs text-slate-600">Fecha: {row.dateKey}</div>
                                <div className="text-xs text-slate-600">Horas: {row.totalHours.toFixed(2)}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={
                                    row.isClosed
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                      : 'border-amber-300 bg-amber-50 text-amber-700'
                                  }
                                >
                                  {row.isClosed ? 'Cerrado' : 'Abierto'}
                                </Badge>
                                <Eye className="h-4 w-4 text-slate-500" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="economic">
          <Card className="border-slate-200">
            <CardContent className="py-10 text-center text-[18px] text-slate-500 sm:text-base">
              Vista economica en preparacion.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-5 flex flex-wrap items-center justify-start gap-2">
        <Button
          type="button"
          className="h-11 min-w-[240px] bg-slate-700 px-4 text-[15px] text-white hover:bg-slate-800 sm:text-[16px]"
          disabled={tenantUnavailable}
        >
          <Brain className="mr-2 h-4 w-4" />
          Generar Informe Resumen IA
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-11 min-w-[220px] justify-between text-[15px] sm:text-[16px]"
              disabled={tenantUnavailable}
            >
              <span className="inline-flex items-center">
                <Download className="mr-2 h-4 w-4" />
                Exportacion Excel
              </span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[220px]">
            <DropdownMenuItem onClick={() => onPending('Excel semanal')}>Semanal</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPending('Excel mensual')}>Mensual</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPending('Excel general')}>General</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

    </div>
  );
};

export const ToolsPanelContent = ({
  activeToolsTab,
  workReports,
  tenantUnavailable,
  summaryReportAnalysisOpen,
  onSummaryReportAnalysisOpenChange,
  onOpenMetrics,
  onOpenExistingReport,
  onPending,
  onDataChanged,
  onBackToParts,
}: ToolsPanelContentProps) => {
  const subtitle =
    activeToolsTab === 'bulk-export'
      ? 'Genera un archivo ZIP con multiples partes de trabajo.'
      : 'Selecciona una accion para continuar.';
  const actionGridClass =
    activeToolsTab === 'bulk-export'
      ? 'mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2'
      : 'mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <Card className="bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-start">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBackToParts}
            className="h-8 px-2 text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="mr-1 h-5 w-5" strokeWidth={3} />
            Volver
          </Button>
        </div>
        <div className="space-y-1 text-center">
          <CardTitle className="text-xl sm:text-2xl">{TOOLS_LABELS[activeToolsTab]}</CardTitle>
          <CardDescription className="text-sm sm:text-[15px]">{subtitle}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {activeToolsTab === 'summary-report' && summaryReportAnalysisOpen ? (
          <ReportsAnalysisWindow
            reports={workReports}
            tenantUnavailable={tenantUnavailable}
            onPending={onPending}
            onOpenExistingReport={onOpenExistingReport}
          />
        ) : (
          <div className={actionGridClass}>
            <ToolActions
              activeToolsTab={activeToolsTab}
              tenantUnavailable={tenantUnavailable}
              onOpenMetrics={onOpenMetrics}
              onOpenAnalysis={() => onSummaryReportAnalysisOpenChange(true)}
              onPending={onPending}
              onDataChanged={onDataChanged}
              workReports={workReports}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const PartsTabContent = ({
  tenantResolving,
  tenantNeedsPicker,
  tenantUnavailable,
  tenantErrorMessage,
  workReportsLoading,
  workReports,
  workReportVisibleDays,
  syncing,
  canCreateWorkReport,
  workReportsReadOnlyByRole,
  hasSyncPendingValidation,
  syncSummary,
  syncPanelClass,
  syncHeadlineClass,
  onSyncNow,
  onGenerateWorkReport,
  onPending,
  onCloneFromHistoryDialog,
  onOpenExistingReport,
  onDeleteReport,
}: PartsTabContentProps) => {
  const isAndroidPlatform = Capacitor.getPlatform() === 'android';
  const generatePartButtonClass = isAndroidPlatform
    ? 'h-11 w-[158px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[16px] font-semibold text-cyan-700 hover:bg-cyan-50 hover:text-cyan-800'
    : 'h-10 w-[148px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[15px] font-semibold text-cyan-700 hover:bg-cyan-50 hover:text-cyan-800';
  const headerSpacerClass = isAndroidPlatform
    ? 'hidden sm:block sm:w-[158px]'
    : 'hidden sm:block sm:w-[148px]';
  const reportNameClass = isAndroidPlatform
    ? 'text-[19px] font-semibold text-slate-900 truncate leading-snug'
    : 'text-[17px] font-medium text-slate-900 truncate';
  const reportDetailClass = isAndroidPlatform
    ? 'text-[16px] text-muted-foreground leading-snug'
    : 'text-[15px] text-muted-foreground';
  const unsyncedReportsCount = useMemo(
    () => workReports.filter((report) => report.syncStatus !== 'synced').length,
    [workReports],
  );
  const visibleReportIds = useMemo(() => workReports.slice(0, 20).map((report) => report.id), [workReports]);

  return (
    <div className="space-y-2">
      <Card className="bg-white">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <div className="flex items-center justify-start sm:justify-self-start">
              <Button
                className={generatePartButtonClass}
                disabled={!canCreateWorkReport}
                onClick={onGenerateWorkReport}
              >
                <CirclePlus className={isAndroidPlatform ? 'h-5 w-5' : 'h-[18px] w-[18px]'} />
                Generar parte
              </Button>
            </div>

            <div className="text-center sm:col-start-2">
              <CardTitle>Partes recientes</CardTitle>
              <CardDescription className="text-[15px] sm:text-base">
                {tenantResolving
                  ? 'Resolviendo tenant...'
                  : tenantNeedsPicker
                    ? 'Selecciona un tenant activo para cargar los partes offline.'
                    : tenantUnavailable
                      ? tenantErrorMessage
                      : workReportsLoading
                        ? 'Cargando partes locales...'
                        : workReports.length === 0
                          ? `No hay partes de trabajo en los ultimos ${workReportVisibleDays} dias`
                          : unsyncedReportsCount > 0
                            ? `Mostrando ultimos ${workReportVisibleDays} dias + ${unsyncedReportsCount} sin sincronizar`
                          : `Mostrando partes de los ultimos ${workReportVisibleDays} dias`}
              </CardDescription>
            </div>

            <div aria-hidden className={headerSpacerClass} />
          </div>
        </CardHeader>
        {workReports.length === 0 ? (
          <CardContent className="py-10 flex flex-col items-center gap-4">
            <ClipboardList className="h-12 w-12 text-slate-400" />
            <p className="text-[15px] sm:text-base text-muted-foreground text-center max-w-md">
              No hay partes creados en los ultimos {workReportVisibleDays} dias. Puedes crear uno nuevo o sincronizar.
            </p>
            <Button variant="outline" disabled={syncing || tenantUnavailable} onClick={() => void onSyncNow()}>
              <CloudUpload className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sincronizar
            </Button>
          </CardContent>
        ) : (
          <CardContent className="space-y-3">
            <div className={`rounded-md border p-3 ${syncPanelClass}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className={`text-[17px] font-medium ${syncHeadlineClass}`}>
                    {hasSyncPendingValidation ? 'Partes pendientes de sincronizar' : 'Todos los partes estan sincronizados'}
                  </div>
                  <div className="text-[15px] text-muted-foreground">
                    {hasSyncPendingValidation
                      ? `Pendientes de validacion: ${syncSummary.pendingTotal}`
                      : `Sincronizados: ${syncSummary.synced}/${syncSummary.total}`}
                    {syncSummary.pendingSync > 0 ? ` - Pendientes: ${syncSummary.pendingSync}` : ''}
                    {syncSummary.errorSync > 0 ? ` - Con error: ${syncSummary.errorSync}` : ''}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[15px]"
                  onClick={() => void onSyncNow()}
                  disabled={syncing || tenantUnavailable}
                >
                  <CloudUpload className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  Sincronizar
                </Button>
              </div>
            </div>

            <div className="divide-y rounded-md border bg-slate-50">
              {workReports.slice(0, 20).map((report) => {
                const reportName = payloadText(report.payload, 'workName') ?? report.title ?? `Parte ${report.date}`;
                const reportIdentifier = payloadText(report.payload, 'reportIdentifier') ?? report.id.slice(0, 8);
                const totalHours = payloadNumber(report.payload, 'totalHours');
                const totalHoursLabel = typeof totalHours === 'number' ? totalHours.toFixed(2) : '--';
                const statusText = String(report.status ?? '').toLowerCase();
                const isClosed =
                  (payloadBoolean(report.payload, 'isClosed') ?? false) ||
                  statusText === 'completed' ||
                  statusText === 'closed';
                const importedAt = payloadText(report.payload, 'importedAt');
                const isImportedPending =
                  report.syncStatus === 'pending' &&
                  typeof importedAt === 'string' &&
                  importedAt.trim().length > 0;

                return (
                  <div key={report.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className={reportNameClass}>{reportName}</div>
                      <div className={reportDetailClass}>Identificador: {reportIdentifier}</div>
                      <div className={reportDetailClass}>Fecha: {report.date}</div>
                      <div className={reportDetailClass}>Estado: {isClosed ? 'Cerrado' : 'Abierto'}</div>
                      <div className={reportDetailClass}>Horas totales: {totalHoursLabel}</div>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:flex-shrink-0 sm:items-end">
                      <div className="flex flex-wrap items-center gap-0.5 px-1 py-1 sm:justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-slate-800"
                          title="Clonar parte"
                          onClick={() => onCloneFromHistoryDialog(report)}
                          disabled={tenantUnavailable || workReportsReadOnlyByRole}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-slate-800"
                          title={isClosed || workReportsReadOnlyByRole ? 'Ver parte' : 'Editar parte'}
                          onClick={() =>
                            onOpenExistingReport(report, {
                              navigationReportIds: visibleReportIds,
                            })
                          }
                          disabled={tenantUnavailable}
                        >
                          {isClosed || workReportsReadOnlyByRole ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <Pencil className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          title="Eliminar parte"
                          onClick={() => onDeleteReport(report)}
                          disabled={tenantUnavailable || workReportsReadOnlyByRole}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {!isClosed ? (
                        <Badge
                          variant="outline"
                          className="border-amber-400 bg-amber-50 text-[13px] sm:text-sm text-amber-700"
                        >
                          Por completar
                        </Badge>
                      ) : null}
                      {isImportedPending ? (
                        <Badge
                          variant="outline"
                          className="border-sky-300 bg-sky-50 text-[13px] sm:text-sm text-sky-700"
                        >
                          Importado
                        </Badge>
                      ) : null}
                      <Badge
                        variant="outline"
                        className={
                          report.syncStatus === 'synced'
                            ? 'border-emerald-300 bg-emerald-50 text-[13px] sm:text-sm text-emerald-700'
                            : report.syncStatus === 'error'
                              ? 'border-rose-500 bg-rose-100 text-[13px] sm:text-sm text-rose-800'
                              : 'border-red-300 bg-red-50 text-[13px] sm:text-sm text-red-700'
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

            {workReports.length > 20 ? (
              <div className="text-[15px] text-muted-foreground text-center">Mostrando 20 de {workReports.length}.</div>
            ) : null}
          </CardContent>
        )}
      </Card>
    </div>
  );
};



