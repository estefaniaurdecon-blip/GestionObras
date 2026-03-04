import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
import type { WorkReportStatus } from '@/offline-db/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { prepareOfflineTenantScope } from '@/offline-db/tenantScope';
import { workReportsRepo } from '@/offline-db/repositories/workReportsRepo';
import {
  asRecord,
  payloadBoolean,
  payloadNumber,
  payloadText,
} from '@/pages/indexHelpers';
import type { WorkReport as ExportWorkReport } from '@/types/workReport';
import { generateWorkReportPDF } from '@/utils/pdfGenerator';
import JSZip from 'jszip';
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import {
  AlarmClockCheck,
  ChevronLeft,
  CalendarDays,
  CheckCircle2,
  CirclePlus,
  ClipboardPen,
  ClipboardList,
  CloudUpload,
  ChevronDown,
  Copy,
  FileDown,
  FileInput,
  FileOutput,
  FileText,
  Loader2,
  Paintbrush,
  Pencil,
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
  onOpenExistingReport: (report: WorkReport) => void;
};

export type ToolsPanelContentProps = BaseToolsProps & {
  activeToolsTab: ToolsActionTab;
  workReports: WorkReport[];
  onOpenMetrics: () => void;
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

type CustomExportMode = 'single-days' | 'range';
type SinglePeriodMode = 'day' | 'week' | 'month';

type CustomSelection = {
  id: string;
  mode: CustomExportMode;
  dateKeys: string[];
  label: string;
};

type ReportImageCandidate = {
  id: string;
  reportId: string;
  reportLabel: string;
  groupId: string;
  supplier: string;
  invoiceNumber: string;
  uri: string;
  label: string;
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (date: Date) => date.toLocaleDateString('es-ES');

const safeText = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const safeNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const safeArray = (value: unknown) => (Array.isArray(value) ? value : []);

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter((value) => value.length > 0)));

const expandRangeToDateKeys = (from: Date, to: Date): string[] => {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const limit = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const result: string[] = [];

  while (cursor <= limit) {
    result.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
};

const sanitizeFilenameSegment = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();

const PREFERRED_NATIVE_EXPORT_DIRECTORIES: Directory[] = [
  Directory.ExternalStorage,
  Directory.External,
  Directory.Documents,
];

const isNativePlatform = () => Capacitor.isNativePlatform?.() === true;

const blobToBase64 = async (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const sanitizeExportFilename = (filename: string) => {
  const cleaned = filename
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned.length > 0 ? cleaned : `archivo_${Date.now()}`;
};

const getDirectoryLabel = (directory: Directory) => {
  switch (directory) {
    case Directory.ExternalStorage:
      return 'Almacenamiento externo publico';
    case Directory.External:
      return 'Almacenamiento externo';
    case Directory.Documents:
      return 'Documentos';
    default:
      return 'almacenamiento local';
  }
};

const saveBlobToNativeFile = async (blob: Blob, filename: string): Promise<{ uri: string; directory: Directory }> => {
  const safeFilename = sanitizeExportFilename(filename);
  const base64 = await blobToBase64(blob);
  let lastError: unknown;

  for (const directory of PREFERRED_NATIVE_EXPORT_DIRECTORIES) {
    try {
      const writeResult = await Filesystem.writeFile({
        path: safeFilename,
        data: base64,
        directory,
        recursive: true,
      });
      let uri = writeResult.uri;
      try {
        const resolved = await Filesystem.getUri({ path: safeFilename, directory });
        if (resolved?.uri) uri = resolved.uri;
      } catch {
        // Keep write URI as fallback
      }
      return { uri, directory };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('No se pudo guardar el archivo en el dispositivo.');
};

const triggerBrowserBlobDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const isShareCancellationError = (error: unknown) => {
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return '';
            }
          })();
  const normalized = raw.toLowerCase();
  return (
    normalized.includes('cancel') ||
    normalized.includes('dismiss') ||
    normalized.includes('aborted') ||
    normalized.includes('user did not share')
  );
};

const getOfflineReportDateKey = (report: WorkReport) => {
  const payload = asRecord(report.payload);
  const payloadDate = payload ? safeText(payload.date) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(payloadDate)) return payloadDate;
  return report.date;
};

const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeWorkReportStatus = (value: unknown): WorkReportStatus => {
  const normalized = safeText(value).trim().toLowerCase();
  if (
    normalized === 'draft' ||
    normalized === 'pending' ||
    normalized === 'approved' ||
    normalized === 'completed' ||
    normalized === 'missing_data' ||
    normalized === 'missing_delivery_notes'
  ) {
    return normalized;
  }
  return 'draft';
};

type ImportableReportPayload = {
  date: string;
  title: string | null;
  status: WorkReportStatus;
  projectId: string | null;
  payload: unknown;
  sourceId?: string;
};

const toImportableReportFromRecord = (record: Record<string, unknown>): ImportableReportPayload | null => {
  const nestedReport = asRecord(record.report);
  const source = nestedReport ?? record;
  const sourcePayload = source.payload;
  const payloadRecord = asRecord(sourcePayload) ?? asRecord(source);

  const dateCandidate = safeText(source.date) || safeText(payloadRecord?.date);
  if (!isDateKey(dateCandidate)) return null;

  const titleCandidate =
    safeText(source.title) ||
    safeText(source.workName) ||
    safeText(payloadRecord?.workName) ||
    safeText(payloadRecord?.title) ||
    null;

  const projectIdCandidate =
    safeText(source.projectId) ||
    safeText(source.workId) ||
    safeText(payloadRecord?.projectId) ||
    safeText(payloadRecord?.workId) ||
    null;

  const statusCandidate =
    source.status ??
    source.workReportStatus ??
    payloadRecord?.workReportStatus ??
    payloadRecord?.status;

  const payload =
    sourcePayload !== undefined
      ? sourcePayload
      : payloadRecord
        ? payloadRecord
        : source;

  return {
    date: dateCandidate,
    title: titleCandidate,
    status: normalizeWorkReportStatus(statusCandidate),
    projectId: projectIdCandidate,
    payload,
    sourceId: safeText(source.id),
  };
};

const extractImportableReports = (value: unknown): ImportableReportPayload[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractImportableReports(item));
  }

  const record = asRecord(value);
  if (!record) return [];

  const parsed = toImportableReportFromRecord(record);
  return parsed ? [parsed] : [];
};

const buildReportLabel = (report: WorkReport) => {
  const workName = payloadText(report.payload, 'workName') ?? report.title ?? 'Parte';
  return `${getOfflineReportDateKey(report)} - ${workName}`;
};

const collectAlbaranImageCandidates = (report: WorkReport): ReportImageCandidate[] => {
  const payload = asRecord(report.payload);
  const reportLabel = buildReportLabel(report);
  if (!payload) return [];

  const materialGroups = safeArray(payload.materialGroups);
  return materialGroups.flatMap((rawGroup, groupIndex) => {
    const group = asRecord(rawGroup);
    if (!group) return [];

    const groupId = safeText(group.id, `group-${groupIndex}`);
    const supplier = safeText(group.supplier, 'Proveedor');
    const invoiceNumber = safeText(group.invoiceNumber);
    const fromImageUris = safeArray(group.imageUris).map((uri) => safeText(uri)).filter(Boolean);
    const documentImage = safeText(group.documentImage);
    const allUris = uniqueStrings(documentImage ? [documentImage, ...fromImageUris] : fromImageUris);

    return allUris.map((uri, imageIndex) => {
      const id = `${report.id}::${groupId}::${imageIndex}`;
      const invoiceLabel = invoiceNumber ? ` - Alb. ${invoiceNumber}` : '';
      return {
        id,
        reportId: report.id,
        reportLabel,
        groupId,
        supplier,
        invoiceNumber,
        uri,
        label: `${reportLabel} - ${supplier}${invoiceLabel}`,
      };
    });
  });
};

const buildExportWorkReport = (
  report: WorkReport,
  selectedImageUrisByGroup?: Map<string, Set<string>>,
): ExportWorkReport => {
  const payload = asRecord(report.payload) ?? {};
  const workGroupsSource = safeArray(payload.workGroups).length > 0 ? safeArray(payload.workGroups) : safeArray(payload.workforceGroups);
  const machineryGroupsSource =
    safeArray(payload.machineryGroups).length > 0
      ? safeArray(payload.machineryGroups)
      : safeArray(payload.subcontractedMachineryGroups);

  const workGroups = workGroupsSource
    .map((rawGroup, groupIndex) => {
      const group = asRecord(rawGroup);
      if (!group) return null;
      const rows = safeArray(group.items).length > 0 ? safeArray(group.items) : safeArray(group.rows);
      const items = rows
        .map((rawRow, rowIndex) => {
          const row = asRecord(rawRow);
          if (!row) return null;
          return {
            id: safeText(row.id, `w-${groupIndex}-${rowIndex}`),
            name: safeText(row.name, safeText(row.workerName)),
            activity: safeText(row.activity),
            hours: safeNumber(row.hours),
            total: safeNumber(row.total, safeNumber(row.hours)),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      return {
        id: safeText(group.id, `wg-${groupIndex}`),
        company: safeText(group.company, safeText(group.companyName)),
        items,
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);

  const machineryGroups = machineryGroupsSource
    .map((rawGroup, groupIndex) => {
      const group = asRecord(rawGroup);
      if (!group) return null;
      const rows = safeArray(group.items).length > 0 ? safeArray(group.items) : safeArray(group.rows);
      const items = rows
        .map((rawRow, rowIndex) => {
          const row = asRecord(rawRow);
          if (!row) return null;
          return {
            id: safeText(row.id, `m-${groupIndex}-${rowIndex}`),
            type: safeText(row.type, safeText(row.machineType)),
            activity: safeText(row.activity),
            hours: safeNumber(row.hours),
            total: safeNumber(row.total, safeNumber(row.hours)),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      return {
        id: safeText(group.id, `mg-${groupIndex}`),
        company: safeText(group.company, safeText(group.companyName)),
        documentImage: safeText(group.documentImage) || undefined,
        items,
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);

  const materialGroups = safeArray(payload.materialGroups)
    .map((rawGroup, groupIndex) => {
      const group = asRecord(rawGroup);
      if (!group) return null;
      const groupId = safeText(group.id, `mat-${groupIndex}`);
      const rows = safeArray(group.items).length > 0 ? safeArray(group.items) : safeArray(group.rows);
      const items = rows
        .map((rawRow, rowIndex) => {
          const row = asRecord(rawRow);
          if (!row) return null;
          return {
            id: safeText(row.id, `mat-row-${groupIndex}-${rowIndex}`),
            name: safeText(row.name),
            quantity: safeNumber(row.quantity),
            unit: safeText(row.unit),
            unitPrice: safeNumber(row.unitPrice),
            total: safeNumber(row.total, safeNumber(row.quantity) * safeNumber(row.unitPrice)),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      const fromImageUris = safeArray(group.imageUris).map((uri) => safeText(uri)).filter(Boolean);
      const fromDocumentImage = safeText(group.documentImage);
      const allUris = uniqueStrings(fromDocumentImage ? [fromDocumentImage, ...fromImageUris] : fromImageUris);
      const allowedUris = selectedImageUrisByGroup?.get(groupId);
      const filteredUris = allowedUris
        ? allUris.filter((uri) => allowedUris.has(uri))
        : allUris;

      return {
        id: groupId,
        supplier: safeText(group.supplier),
        invoiceNumber: safeText(group.invoiceNumber),
        items,
        documentImage: filteredUris[0] || undefined,
        imageUris: filteredUris,
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);

  const subcontractGroups = safeArray(payload.subcontractGroups)
    .map((rawGroup, groupIndex) => {
      const group = asRecord(rawGroup);
      if (!group) return null;
      const rows = safeArray(group.items).length > 0 ? safeArray(group.items) : safeArray(group.rows);
      const items = rows
        .map((rawRow, rowIndex) => {
          const row = asRecord(rawRow);
          if (!row) return null;
          return {
            id: safeText(row.id, `s-${groupIndex}-${rowIndex}`),
            contractedPart: safeText(row.contractedPart, safeText(row.partida)),
            company: safeText(row.company, safeText(group.company, safeText(group.companyName))),
            activity: safeText(row.activity),
            workers: safeNumber(row.workers, safeArray(row.workersAssigned).length),
            hours: safeNumber(row.hours),
            unitType: safeText(row.unitType, safeText(row.unit)) as
              | 'hora'
              | 'm3'
              | 'm2'
              | 'ml'
              | 'unidad'
              | undefined,
            quantity: safeNumber(row.quantity, safeNumber(row.cantPerWorker)),
            unitPrice: safeNumber(row.unitPrice),
            total: safeNumber(row.total),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      return {
        id: safeText(group.id, `sg-${groupIndex}`),
        company: safeText(group.company, safeText(group.companyName)),
        items,
        documentImage: safeText(group.documentImage) || undefined,
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);

  const createdAtIso = new Date(report.createdAt || Date.now()).toISOString();
  const updatedAtIso = new Date(report.updatedAt || Date.now()).toISOString();
  const workDate = getOfflineReportDateKey(report);
  const statusText = safeText(payload.workReportStatus, report.status);
  const exportStatus: ExportWorkReport['status'] =
    statusText === 'missing_data' || statusText === 'missing_delivery_notes' || statusText === 'completed'
      ? statusText
      : undefined;

  return {
    id: report.id,
    workNumber: safeText(payload.workNumber),
    date: workDate,
    workName: safeText(payload.workName, report.title ?? 'Parte'),
    workId: safeText(payload.workId, report.projectId ?? '') || undefined,
    foreman: safeText(payload.mainForeman, safeText(payload.foreman)),
    foremanHours: safeNumber(payload.mainForemanHours, safeNumber(payload.foremanHours)),
    foremanEntries: safeArray(payload.foremanEntries)
      .map((rawEntry, entryIndex) => {
        const entry = asRecord(rawEntry);
        if (!entry) return null;
        const rawRole = safeText(entry.role).toLowerCase();
        const role: 'encargado' | 'capataz' | 'recurso_preventivo' =
          rawRole === 'capataz' || rawRole === 'recurso_preventivo' ? rawRole : 'encargado';
        return {
          id: safeText(entry.id, `f-${entryIndex}`),
          name: safeText(entry.name),
          role,
          hours: safeNumber(entry.hours),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    foremanSignature: safeText(payload.foremanSignature) || undefined,
    siteManager: safeText(payload.siteManager),
    siteManagerSignature: safeText(payload.siteManagerSignature) || undefined,
    observations: safeText(payload.observationsText, safeText(payload.observations)),
    workGroups,
    machineryGroups,
    materialGroups,
    subcontractGroups,
    createdAt: createdAtIso,
    updatedAt: updatedAtIso,
    status: exportStatus,
  };
};

const BulkExportCustomDialog = ({
  disabled,
  reports,
}: {
  disabled: boolean;
  reports: WorkReport[];
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CustomExportMode>('single-days');
  const [selectedDays, setSelectedDays] = useState<Date[] | undefined>([]);
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(undefined);
  const [customSelections, setCustomSelections] = useState<CustomSelection[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'zip' | null>(null);

  const normalizedSelectedDays = useMemo(() => {
    const deduped = new Map<string, Date>();
    (selectedDays ?? []).forEach((day) => {
      deduped.set(toDateKey(day), day);
    });
    return [...deduped.values()].sort((a, b) => a.getTime() - b.getTime());
  }, [selectedDays]);
  const calendarStartMonth = useMemo(() => new Date(2020, 0, 1), []);
  const calendarEndMonth = useMemo(() => new Date(new Date().getFullYear() + 2, 11, 31), []);

  const canAddRange = Boolean(selectedRange?.from && selectedRange?.to);
  const selectedDateKeys = useMemo(
    () => uniqueStrings(customSelections.flatMap((selection) => selection.dateKeys)),
    [customSelections],
  );
  const selectedDateSet = useMemo(() => new Set(selectedDateKeys), [selectedDateKeys]);
  const matchedReports = useMemo(
    () => reports.filter((report) => selectedDateSet.has(getOfflineReportDateKey(report))),
    [reports, selectedDateSet],
  );
  const imageCandidates = useMemo(
    () => matchedReports.flatMap((report) => collectAlbaranImageCandidates(report)),
    [matchedReports],
  );
  const customCalendarClassNames = useMemo(
    () => ({
      root: 'relative w-full',
      months: 'w-full',
      month: 'relative mx-auto flex w-full max-w-[540px] flex-col gap-4',
      month_grid: 'mx-auto border-collapse',
      weekdays: 'mx-auto flex w-fit',
      week: 'mx-auto mt-2 flex w-fit',
      month_caption: 'relative flex h-10 items-center justify-center',
      dropdowns: 'flex items-center justify-center gap-3',
      dropdown_root:
        'relative inline-flex h-9 min-w-[108px] items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm',
      dropdown: 'absolute inset-0 cursor-pointer appearance-none opacity-0',
      caption_label:
        'inline-flex w-full flex-row-reverse items-center justify-center gap-2 truncate text-sm font-medium capitalize text-slate-700',
      chevron: 'h-3.5 w-3.5 text-slate-500',
      nav: 'pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-2',
      button_previous:
        'pointer-events-auto z-10 h-8 w-8 rounded-md border border-slate-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-slate-100',
      button_next:
        'pointer-events-auto z-10 h-8 w-8 rounded-md border border-slate-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-slate-100',
    }),
    [],
  );
  const hasCustomSelections = customSelections.length > 0;
  const hasMatchedReports = matchedReports.length > 0;
  const canExport = hasCustomSelections && hasMatchedReports && exportingFormat === null;
  const includeImagesInExport = selectedImageIds.length > 0;

  const addCurrentSingleSelection = () => {
    if (normalizedSelectedDays.length === 0) return;
    const label = normalizedSelectedDays.map((day) => formatDateLabel(day)).join(', ');
    const dateKeys = normalizedSelectedDays.map((day) => toDateKey(day));
    setCustomSelections((previous) => [
      ...previous,
      { id: crypto.randomUUID(), mode: 'single-days', dateKeys, label: `Dias: ${label}` },
    ]);
    setSelectedDays([]);
  };

  const addCurrentRangeSelection = () => {
    if (!selectedRange?.from || !selectedRange?.to) return;
    const fromDate = selectedRange.from;
    const toDate = selectedRange.to;
    const [from, to] = fromDate <= toDate ? [fromDate, toDate] : [toDate, fromDate];
    const dateKeys = expandRangeToDateKeys(from, to);
    const label = `Rango: ${formatDateLabel(from)} - ${formatDateLabel(to)}`;
    setCustomSelections((previous) => [
      ...previous,
      { id: crypto.randomUUID(), mode: 'range', dateKeys, label },
    ]);
    setSelectedRange(undefined);
  };

  const removeSelection = (selectionId: string) => {
    setCustomSelections((previous) => previous.filter((selection) => selection.id !== selectionId));
  };

  const toggleImageSelection = (candidateId: string) => {
    setSelectedImageIds((previous) =>
      previous.includes(candidateId)
        ? previous.filter((id) => id !== candidateId)
        : [...previous, candidateId],
    );
  };

  const selectAllImages = () => {
    setSelectedImageIds(imageCandidates.map((candidate) => candidate.id));
  };

  const clearImageSelection = () => {
    setSelectedImageIds([]);
  };

  useEffect(() => {
    if (!open) return;
    setSelectedImageIds((previous) => {
      const currentCandidateIds = new Set(imageCandidates.map((candidate) => candidate.id));
      const kept = previous.filter((id) => currentCandidateIds.has(id));
      if (kept.length > 0 || imageCandidates.length === 0) return kept;
      return imageCandidates.map((candidate) => candidate.id);
    });
  }, [imageCandidates, open]);

  const buildSelectedImageMapByReport = () => {
    const selectedIds = new Set(selectedImageIds);
    const byReport = new Map<string, Map<string, Set<string>>>();

    imageCandidates.forEach((candidate) => {
      if (!selectedIds.has(candidate.id)) return;
      const reportMap = byReport.get(candidate.reportId) ?? new Map<string, Set<string>>();
      const groupSet = reportMap.get(candidate.groupId) ?? new Set<string>();
      groupSet.add(candidate.uri);
      reportMap.set(candidate.groupId, groupSet);
      byReport.set(candidate.reportId, reportMap);
    });

    return byReport;
  };

  const buildFileName = (report: ExportWorkReport) => {
    const workNumber = sanitizeFilenameSegment(report.workNumber || 'sin_numero');
    const workName = sanitizeFilenameSegment(report.workName || 'sin_obra');
    const date = sanitizeFilenameSegment(report.date || 'sin_fecha');
    return `Parte_${date}_${workNumber}_${workName}`;
  };

  const buildPdfExportFiles = async () => {
    const selectedImageMapByReport = buildSelectedImageMapByReport();
    const exportReports = matchedReports.map((report) =>
      buildExportWorkReport(report, selectedImageMapByReport.get(report.id)),
    );
    const files: Array<{ filename: string; blob: Blob }> = [];

    for (const exportReport of exportReports) {
      const pdfBlob = (await generateWorkReportPDF(
        exportReport,
        includeImagesInExport,
        undefined,
        undefined,
        true,
      )) as Blob;
      files.push({ filename: `${buildFileName(exportReport)}.pdf`, blob: pdfBlob });
    }

    return { exportReports, files };
  };

  const downloadFiles = async (files: Array<{ filename: string; blob: Blob }>) => {
    if (!isNativePlatform()) {
      files.forEach((file) => triggerBrowserBlobDownload(file.blob, file.filename));
      return undefined;
    }

    let directoryUsed: Directory | undefined;
    for (const file of files) {
      const saved = await saveBlobToNativeFile(file.blob, file.filename);
      if (!directoryUsed) directoryUsed = saved.directory;
    }
    return directoryUsed;
  };

  const shareFiles = async (files: Array<{ filename: string; blob: Blob }>, title: string, text: string) => {
    if (!isNativePlatform()) {
      files.forEach((file) => triggerBrowserBlobDownload(file.blob, file.filename));
      return false;
    }

    const uris: string[] = [];
    for (const file of files) {
      const saved = await saveBlobToNativeFile(file.blob, file.filename);
      uris.push(saved.uri);
    }

    await Share.share({
      title,
      text,
      files: uris,
      dialogTitle: 'Compartir exportacion',
    });
    return true;
  };

  const notifyExportReadyToShare = (
    files: Array<{ filename: string; blob: Blob }>,
    title: string,
    text: string,
    exportedDescription: string,
  ) => {
    if (!isNativePlatform()) {
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
                await shareFiles(files, title, text);
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
      const nativeDirectory = await downloadFiles(files);
      const exportedDescription = nativeDirectory
        ? `Se guardaron ${exportReports.length} PDF en ${getDirectoryLabel(nativeDirectory)}.`
        : `Se descargaron ${exportReports.length} PDF.`;
      notifyExportReadyToShare(files, 'Partes en PDF', 'Partes de trabajo exportados', exportedDescription);
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
      const zip = new JSZip();

      for (const file of files) {
        zip.file(file.filename, file.blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const stamp = new Date().toISOString().slice(0, 10);
      const zipFilename = `Partes_personalizados_${stamp}.zip`;
      const zipFiles = [{ filename: zipFilename, blob: zipBlob }];
      const nativeDirectory = await downloadFiles(zipFiles);
      const exportedDescription = nativeDirectory
        ? `Se guardo el ZIP en ${getDirectoryLabel(nativeDirectory)}.`
        : `Se generaron ${exportReports.length} partes en ZIP.`;
      notifyExportReadyToShare(zipFiles, 'Partes en ZIP', 'ZIP de partes', exportedDescription);
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
                  classNames={customCalendarClassNames}
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
                  classNames={customCalendarClassNames}
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
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [selectedWeek, setSelectedWeek] = useState<DateRange | undefined>(undefined);
  const [selectedMonthAnchor, setSelectedMonthAnchor] = useState<Date | undefined>(
    mode === 'month' ? new Date() : undefined,
  );
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'zip' | null>(null);

  const calendarStartMonth = useMemo(() => new Date(2020, 0, 1), []);
  const calendarEndMonth = useMemo(() => new Date(new Date().getFullYear() + 2, 11, 31), []);
  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, monthIndex) => ({
        value: monthIndex,
        label: format(new Date(2026, monthIndex, 1), 'MMMM', { locale: es }),
      })),
    [],
  );
  const yearOptions = useMemo(
    () =>
      Array.from(
        { length: calendarEndMonth.getFullYear() - calendarStartMonth.getFullYear() + 1 },
        (_, index) => calendarStartMonth.getFullYear() + index,
      ),
    [calendarEndMonth, calendarStartMonth],
  );
  const customCalendarClassNames = useMemo(
    () => ({
      root: 'relative w-full',
      months: 'w-full',
      month: 'relative mx-auto flex w-full max-w-[540px] flex-col gap-4',
      month_grid: 'mx-auto border-collapse',
      weekdays: 'mx-auto flex w-fit',
      week: 'mx-auto mt-2 flex w-fit',
      month_caption: 'relative flex h-10 items-center justify-center',
      dropdowns: 'flex items-center justify-center gap-3',
      dropdown_root:
        'relative inline-flex h-9 min-w-[108px] items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm',
      dropdown: 'absolute inset-0 cursor-pointer appearance-none opacity-0',
      caption_label:
        'inline-flex w-full flex-row-reverse items-center justify-center gap-2 truncate text-sm font-medium capitalize text-slate-700',
      chevron: 'h-3.5 w-3.5 text-slate-500',
      nav: 'pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-2',
      button_previous:
        'pointer-events-auto z-10 h-8 w-8 rounded-md border border-slate-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-slate-100',
      button_next:
        'pointer-events-auto z-10 h-8 w-8 rounded-md border border-slate-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-slate-100',
    }),
    [],
  );

  const selectedMonthRange = useMemo<DateRange | undefined>(() => {
    if (!selectedMonthAnchor) return undefined;
    return { from: startOfMonth(selectedMonthAnchor), to: endOfMonth(selectedMonthAnchor) };
  }, [selectedMonthAnchor]);

  const selectedDateKeys = useMemo(() => {
    if (mode === 'day') return selectedDay ? [toDateKey(selectedDay)] : [];
    if (mode === 'week') {
      if (!selectedWeek?.from || !selectedWeek?.to) return [];
      return expandRangeToDateKeys(selectedWeek.from, selectedWeek.to);
    }
    if (!selectedMonthRange?.from || !selectedMonthRange?.to) return [];
    return expandRangeToDateKeys(selectedMonthRange.from, selectedMonthRange.to);
  }, [mode, selectedDay, selectedWeek, selectedMonthRange]);

  const selectedLabel = useMemo(() => {
    if (mode === 'day') return selectedDay ? `Dia: ${formatDateLabel(selectedDay)}` : '';
    if (mode === 'week') {
      if (!selectedWeek?.from || !selectedWeek?.to) return '';
      return `Semana: ${formatDateLabel(selectedWeek.from)} - ${formatDateLabel(selectedWeek.to)}`;
    }
    if (!selectedMonthAnchor) return '';
    return `Mes: ${format(selectedMonthAnchor, 'MMMM yyyy', { locale: es })}`;
  }, [mode, selectedDay, selectedWeek, selectedMonthAnchor]);

  const selectedDateSet = useMemo(() => new Set(selectedDateKeys), [selectedDateKeys]);
  const matchedReports = useMemo(
    () => reports.filter((report) => selectedDateSet.has(getOfflineReportDateKey(report))),
    [reports, selectedDateSet],
  );
  const imageCandidates = useMemo(
    () => matchedReports.flatMap((report) => collectAlbaranImageCandidates(report)),
    [matchedReports],
  );
  const hasSelection = selectedDateKeys.length > 0;
  const hasMatchedReports = matchedReports.length > 0;
  const canExport = hasSelection && hasMatchedReports && exportingFormat === null;
  const includeImagesInExport = selectedImageIds.length > 0;

  const clearSelection = () => {
    setSelectedDay(undefined);
    setSelectedWeek(undefined);
    setSelectedMonthAnchor(mode === 'month' ? new Date() : undefined);
  };

  const handleSelectWeekByDay = (day?: Date) => {
    if (!day) {
      setSelectedWeek(undefined);
      return;
    }
    const weekStart = startOfWeek(day, { locale: es, weekStartsOn: 1 });
    const weekEnd = endOfWeek(day, { locale: es, weekStartsOn: 1 });
    setSelectedWeek({ from: weekStart, to: weekEnd });
  };

  const handleMonthChange = (monthValue: number) => {
    const base = selectedMonthAnchor ?? new Date();
    setSelectedMonthAnchor(new Date(base.getFullYear(), monthValue, 1));
  };

  const handleYearChange = (yearValue: number) => {
    const base = selectedMonthAnchor ?? new Date();
    setSelectedMonthAnchor(new Date(yearValue, base.getMonth(), 1));
  };

  const buildSelectedImageMapByReport = () => {
    const selectedIds = new Set(selectedImageIds);
    const byReport = new Map<string, Map<string, Set<string>>>();

    imageCandidates.forEach((candidate) => {
      if (!selectedIds.has(candidate.id)) return;
      const reportMap = byReport.get(candidate.reportId) ?? new Map<string, Set<string>>();
      const groupSet = reportMap.get(candidate.groupId) ?? new Set<string>();
      groupSet.add(candidate.uri);
      reportMap.set(candidate.groupId, groupSet);
      byReport.set(candidate.reportId, reportMap);
    });

    return byReport;
  };

  const buildFileName = (report: ExportWorkReport) => {
    const workNumber = sanitizeFilenameSegment(report.workNumber || 'sin_numero');
    const workName = sanitizeFilenameSegment(report.workName || 'sin_obra');
    const date = sanitizeFilenameSegment(report.date || 'sin_fecha');
    return `Parte_${date}_${workNumber}_${workName}`;
  };

  const buildPdfExportFiles = async () => {
    const selectedImageMapByReport = buildSelectedImageMapByReport();
    const exportReports = matchedReports.map((report) =>
      buildExportWorkReport(report, selectedImageMapByReport.get(report.id)),
    );
    const files: Array<{ filename: string; blob: Blob }> = [];

    for (const exportReport of exportReports) {
      const pdfBlob = (await generateWorkReportPDF(
        exportReport,
        includeImagesInExport,
        undefined,
        undefined,
        true,
      )) as Blob;
      files.push({ filename: `${buildFileName(exportReport)}.pdf`, blob: pdfBlob });
    }

    return { exportReports, files };
  };

  const downloadFiles = async (files: Array<{ filename: string; blob: Blob }>) => {
    if (!isNativePlatform()) {
      files.forEach((file) => triggerBrowserBlobDownload(file.blob, file.filename));
      return undefined;
    }

    let directoryUsed: Directory | undefined;
    for (const file of files) {
      const saved = await saveBlobToNativeFile(file.blob, file.filename);
      if (!directoryUsed) directoryUsed = saved.directory;
    }
    return directoryUsed;
  };

  const shareFiles = async (files: Array<{ filename: string; blob: Blob }>, title: string, text: string) => {
    if (!isNativePlatform()) {
      files.forEach((file) => triggerBrowserBlobDownload(file.blob, file.filename));
      return false;
    }

    const uris: string[] = [];
    for (const file of files) {
      const saved = await saveBlobToNativeFile(file.blob, file.filename);
      uris.push(saved.uri);
    }

    await Share.share({
      title,
      text,
      files: uris,
      dialogTitle: 'Compartir exportacion',
    });
    return true;
  };

  const notifyExportReadyToShare = (
    files: Array<{ filename: string; blob: Blob }>,
    title: string,
    text: string,
    exportedDescription: string,
  ) => {
    if (!isNativePlatform()) {
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
                await shareFiles(files, title, text);
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

  const getZipFilename = () => {
    if (mode === 'day' && selectedDay) return `Partes_dia_${toDateKey(selectedDay)}.zip`;
    if (mode === 'week' && selectedWeek?.from && selectedWeek?.to) {
      return `Partes_semana_${toDateKey(selectedWeek.from)}_a_${toDateKey(selectedWeek.to)}.zip`;
    }
    if (mode === 'month' && selectedMonthAnchor) {
      return `Partes_mes_${format(selectedMonthAnchor, 'yyyy-MM', { locale: es })}.zip`;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return `Partes_${stamp}.zip`;
  };

  const handleExportPdf = async () => {
    if (!canExport) return;
    setExportingFormat('pdf');
    try {
      const { exportReports, files } = await buildPdfExportFiles();
      const nativeDirectory = await downloadFiles(files);
      const exportedDescription = nativeDirectory
        ? `Se guardaron ${exportReports.length} PDF en ${getDirectoryLabel(nativeDirectory)}.`
        : `Se descargaron ${exportReports.length} PDF.`;
      notifyExportReadyToShare(files, 'Partes en PDF', 'Partes de trabajo exportados', exportedDescription);
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
      const zip = new JSZip();

      for (const file of files) {
        zip.file(file.filename, file.blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFilename = getZipFilename();
      const zipFiles = [{ filename: zipFilename, blob: zipBlob }];
      const nativeDirectory = await downloadFiles(zipFiles);
      const exportedDescription = nativeDirectory
        ? `Se guardo el ZIP en ${getDirectoryLabel(nativeDirectory)}.`
        : `Se generaron ${exportReports.length} partes en ZIP.`;
      notifyExportReadyToShare(zipFiles, 'Partes en ZIP', 'ZIP de partes', exportedDescription);
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

  useEffect(() => {
    if (!open) return;
    if (mode === 'month' && !selectedMonthAnchor) {
      setSelectedMonthAnchor(new Date());
    }
    setSelectedImageIds((previous) => {
      const currentCandidateIds = new Set(imageCandidates.map((candidate) => candidate.id));
      const kept = previous.filter((id) => currentCandidateIds.has(id));
      if (kept.length > 0 || imageCandidates.length === 0) return kept;
      return imageCandidates.map((candidate) => candidate.id);
    });
  }, [imageCandidates, mode, open, selectedMonthAnchor]);

  const selectAllImages = () => {
    setSelectedImageIds(imageCandidates.map((candidate) => candidate.id));
  };

  const clearImageSelection = () => {
    setSelectedImageIds([]);
  };

  const toggleImageSelection = (candidateId: string) => {
    setSelectedImageIds((previous) =>
      previous.includes(candidateId)
        ? previous.filter((id) => id !== candidateId)
        : [...previous, candidateId],
    );
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
                classNames={customCalendarClassNames}
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
                  ...customCalendarClassNames,
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
  const [selectedDays, setSelectedDays] = useState<Date[] | undefined>([]);
  const [exporting, setExporting] = useState(false);

  const calendarStartMonth = useMemo(() => new Date(2020, 0, 1), []);
  const calendarEndMonth = useMemo(() => new Date(new Date().getFullYear() + 2, 11, 31), []);
  const customCalendarClassNames = useMemo(
    () => ({
      root: 'relative w-full',
      months: 'w-full',
      month: 'relative mx-auto flex w-full max-w-[540px] flex-col gap-4',
      month_grid: 'mx-auto border-collapse',
      weekdays: 'mx-auto flex w-fit',
      week: 'mx-auto mt-2 flex w-fit',
      month_caption: 'relative flex h-10 items-center justify-center',
      dropdowns: 'flex items-center justify-center gap-3',
      dropdown_root:
        'relative inline-flex h-9 min-w-[108px] items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm',
      dropdown: 'absolute inset-0 cursor-pointer appearance-none opacity-0',
      caption_label:
        'inline-flex w-full flex-row-reverse items-center justify-center gap-2 truncate text-sm font-medium capitalize text-slate-700',
      chevron: 'h-3.5 w-3.5 text-slate-500',
      nav: 'pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-2',
      button_previous:
        'pointer-events-auto z-10 h-8 w-8 rounded-md border border-slate-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-slate-100',
      button_next:
        'pointer-events-auto z-10 h-8 w-8 rounded-md border border-slate-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-slate-100',
    }),
    [],
  );

  const normalizedSelectedDays = useMemo(() => {
    const deduped = new Map<string, Date>();
    (selectedDays ?? []).forEach((day) => {
      deduped.set(toDateKey(day), day);
    });
    return [...deduped.values()].sort((a, b) => a.getTime() - b.getTime());
  }, [selectedDays]);

  const selectedDateSet = useMemo(
    () => new Set(normalizedSelectedDays.map((date) => toDateKey(date))),
    [normalizedSelectedDays],
  );
  const matchedReports = useMemo(
    () => reports.filter((report) => selectedDateSet.has(getOfflineReportDateKey(report))),
    [reports, selectedDateSet],
  );

  const canExport = normalizedSelectedDays.length > 0 && matchedReports.length > 0 && !exporting;

  const downloadFiles = async (files: Array<{ filename: string; blob: Blob }>) => {
    if (!isNativePlatform()) {
      files.forEach((file) => triggerBrowserBlobDownload(file.blob, file.filename));
      return undefined;
    }

    let directoryUsed: Directory | undefined;
    for (const file of files) {
      const saved = await saveBlobToNativeFile(file.blob, file.filename);
      if (!directoryUsed) directoryUsed = saved.directory;
    }
    return directoryUsed;
  };

  const shareFiles = async (files: Array<{ filename: string; blob: Blob }>) => {
    if (!isNativePlatform()) {
      files.forEach((file) => triggerBrowserBlobDownload(file.blob, file.filename));
      return;
    }

    const uris: string[] = [];
    for (const file of files) {
      const saved = await saveBlobToNativeFile(file.blob, file.filename);
      uris.push(saved.uri);
    }

    await Share.share({
      title: 'Partes exportados en JSON',
      text: 'Exportacion de partes en formato JSON',
      files: uris,
      dialogTitle: 'Compartir exportacion',
    });
  };

  const handleExport = async () => {
    if (!canExport) return;
    setExporting(true);

    try {
      const files = matchedReports.map((report) => {
        const date = getOfflineReportDateKey(report);
        const identifier = sanitizeFilenameSegment(
          payloadText(report.payload, 'reportIdentifier') ?? report.id.slice(0, 8),
        );
        const workName = sanitizeFilenameSegment(
          payloadText(report.payload, 'workName') ?? report.title ?? 'sin_obra',
        );
        const filename = `Parte_${date}_${identifier}_${workName}.json`;
        const content = JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            format: 'work-report-json',
            report: {
              id: report.id,
              title: report.title,
              date: date,
              status: report.status,
              projectId: report.projectId,
              payload: report.payload,
              createdAt: report.createdAt,
              updatedAt: report.updatedAt,
            },
          },
          null,
          2,
        );

        return {
          filename,
          blob: new Blob([content], { type: 'application/json;charset=utf-8' }),
        };
      });

      const nativeDirectory = await downloadFiles(files);
      const exportedDescription = nativeDirectory
        ? `Se guardaron ${files.length} JSON en ${getDirectoryLabel(nativeDirectory)}.`
        : `Se descargaron ${files.length} JSON.`;

      if (!isNativePlatform()) {
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
                  await shareFiles(files);
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
      setSelectedDays([]);
      setExporting(false);
    }
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
              classNames={customCalendarClassNames}
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

  const handleImport = async () => {
    if (selectedFiles.length === 0) return;
    setImporting(true);

    try {
      const tenantId = await prepareOfflineTenantScope(user);
      let importedCount = 0;
      let invalidFilesCount = 0;
      let invalidReportsCount = 0;

      for (const file of selectedFiles) {
        try {
          const rawText = await file.text();
          const parsed = JSON.parse(rawText) as unknown;
          const importableReports = extractImportableReports(parsed);

          if (importableReports.length === 0) {
            invalidFilesCount += 1;
            continue;
          }

          for (const importable of importableReports) {
            if (!isDateKey(importable.date)) {
              invalidReportsCount += 1;
              continue;
            }

            const payloadRecord = asRecord(importable.payload);
            const payloadWithImportMeta = payloadRecord
              ? {
                  ...payloadRecord,
                  importedAt: new Date().toISOString(),
                  importedFromFile: file.name,
                  importedOriginalReportId: importable.sourceId ?? null,
                }
              : {
                  value: importable.payload,
                  importedAt: new Date().toISOString(),
                  importedFromFile: file.name,
                  importedOriginalReportId: importable.sourceId ?? null,
                };

            await workReportsRepo.create({
              tenantId,
              projectId: importable.projectId,
              title: importable.title ?? `Parte ${importable.date}`,
              date: importable.date,
              status: importable.status,
              payload: payloadWithImportMeta,
            });
            importedCount += 1;
          }
        } catch (error) {
          console.error('[DataManagementImportDialog] Error procesando archivo JSON:', file.name, error);
          invalidFilesCount += 1;
        }
      }

      if (importedCount === 0) {
        toast({
          title: 'Importacion sin cambios',
          description: 'No se encontraron partes validos en los archivos seleccionados.',
          variant: 'destructive',
        });
        return;
      }

      await onDataChanged();

      const errorsSummary =
        invalidFilesCount > 0 || invalidReportsCount > 0
          ? ` (archivos invalidos: ${invalidFilesCount}, partes invalidos: ${invalidReportsCount})`
          : '';

      toast({
        title: importedCount > 1 ? 'Partes importados' : 'Parte importado',
        description: `Se importaron ${importedCount} parte(s) correctamente${errorsSummary}.`,
      });

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
            Selecciona uno o varios archivos JSON para crear partes nuevos con su informacion.
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
    </Dialog>
  );
};

const ToolActions = ({
  activeToolsTab,
  tenantUnavailable,
  onOpenMetrics,
  onPending,
  onDataChanged,
  workReports,
}: {
  activeToolsTab: ToolsActionTab;
  tenantUnavailable: boolean;
  onOpenMetrics: () => void;
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
          icon={<FileText className="h-8 w-8 text-indigo-600" />}
          label="Informes guardados"
          disabled={tenantUnavailable}
          onClick={() => onPending('Ver informes guardados')}
        />
      </>
    );
  }

  return null;
};
export const ToolsPanelContent = ({
  activeToolsTab,
  workReports,
  tenantUnavailable,
  onOpenMetrics,
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
        <div className={actionGridClass}>
          <ToolActions
            activeToolsTab={activeToolsTab}
            tenantUnavailable={tenantUnavailable}
            onOpenMetrics={onOpenMetrics}
            onPending={onPending}
            onDataChanged={onDataChanged}
            workReports={workReports}
          />
        </div>
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
                const isClosed = (payloadBoolean(report.payload, 'isClosed') ?? false) || report.status === 'completed';

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
                          title="Validar parte"
                          onClick={() => onPending('Validar parte desde lista principal')}
                          disabled={tenantUnavailable || workReportsReadOnlyByRole}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
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
                          title="Documento resumen del parte"
                          onClick={() => onPending('Documento resumen de parte desde lista principal')}
                          disabled={tenantUnavailable}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-slate-800"
                          title="Exportar parte"
                          onClick={() => onPending('Exportar parte desde lista principal')}
                          disabled={tenantUnavailable}
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-slate-800"
                          title={isClosed || workReportsReadOnlyByRole ? 'Ver parte' : 'Editar parte'}
                          onClick={() => onOpenExistingReport(report)}
                          disabled={tenantUnavailable}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          title="Eliminar parte"
                          onClick={() => onPending('Eliminar parte desde lista principal')}
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

