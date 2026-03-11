/**
 * useAccessControl — hook unificado para control de accesos.
 *
 * Combina:
 * - useAccessControlReports (capa de datos offline-first + API)
 * - useAccessControlSync    (auto-sync WorkReport → AccessControlReport)
 * - Form state + handlers   (antes en useAccessControlManager)
 */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { type AccessEntry, type AccessReport } from '@/types/accessControl';
import { exportAccessControlToExcel } from '@/utils/accessControlExportUtils';
import { isNative, saveBase64File, textToBase64 } from '@/utils/nativeFile';
import {
  asRecord,
  buildInitialAccessPersonalForm,
  getIsoWeekKey,
  normalizeComparableText,
  parseIsoDate,
  toIsoDate,
  toOptionalString,
  toStringValue,
  type AccessPersonalEntry,
  type AccessPersonalFormState,
  type HistoryFilterKey,
} from '@/pages/indexHelpers';
import { useAccessControlReports } from './useAccessControlReports';
import { useAccessControlSync } from './useAccessControlSync';

type WorkOption = {
  id: string;
  number?: string | null;
  name?: string | null;
};

type UserLike = {
  full_name?: string | null;
  email?: string | null;
} | null;

type AccessReportSearchFilterKey = Exclude<HistoryFilterKey, 'workName'>;

type UseAccessControlParams = {
  sortedWorks: WorkOption[];
  resolvedTenantId: string | null;
  enabled: boolean;
  user: UserLike;
};

type UseAccessControlResult = {
  // Data layer
  accessControlReports: AccessReport[];
  accessControlLoading: boolean;
  deleteAccessControlReport: (id: string) => Promise<void>;
  bulkDeleteAccessControlReports: (ids: string[]) => Promise<void>;
  syncPendingReports: () => Promise<void>;
  // Form state
  activeAccessControlReport: AccessReport | null;
  accessReportWorkFilter: string;
  setAccessReportWorkFilter: Dispatch<SetStateAction<string>>;
  accessReportSelectedWorks: string[];
  setAccessReportSelectedWorks: Dispatch<SetStateAction<string[]>>;
  accessReportPeriodFilter: string;
  setAccessReportPeriodFilter: Dispatch<SetStateAction<string>>;
  accessReportSelectedDateKeys: string[];
  setAccessReportSelectedDateKeys: Dispatch<SetStateAction<string[]>>;
  accessReportPeriodSelectionLabel: string;
  setAccessReportPeriodSelectionLabel: Dispatch<SetStateAction<string>>;
  accessReportEnabledFilters: AccessReportSearchFilterKey[];
  accessReportSelectedFiltersCount: number;
  accessReportAppliedFiltersCount: number;
  accessResponsibleFilter: string;
  setAccessResponsibleFilter: Dispatch<SetStateAction<string>>;
  accessWeekFilter: string;
  setAccessWeekFilter: Dispatch<SetStateAction<string>>;
  accessMonthFilter: string;
  setAccessMonthFilter: Dispatch<SetStateAction<string>>;
  accessDateFilter: string;
  setAccessDateFilter: Dispatch<SetStateAction<string>>;
  accessDatePickerOpen: boolean;
  setAccessDatePickerOpen: Dispatch<SetStateAction<boolean>>;
  selectedAccessReportDate: Date | null;
  filteredAccessControlReportsForGenerate: AccessReport[];
  accessObservations: string;
  setAccessObservations: Dispatch<SetStateAction<string>>;
  accessAdditionalTasks: string;
  setAccessAdditionalTasks: Dispatch<SetStateAction<string>>;
  accessPersonalEntries: AccessPersonalEntry[];
  accessPersonalDialogOpen: boolean;
  accessControlFormOpen: boolean;
  accessPersonalForm: AccessPersonalFormState;
  setAccessPersonalForm: Dispatch<SetStateAction<AccessPersonalFormState>>;
  accessImportInputRef: RefObject<HTMLInputElement | null>;
  // Handlers
  handleNewAccessControlRecord: () => void;
  handleEditAccessControlReport: (report: AccessReport) => void;
  handleCloneAccessControlReport: (report: AccessReport) => Promise<void>;
  handleCloseAccessControlForm: () => void;
  handleSaveAccessControlForm: (report: AccessReport) => Promise<void>;
  handleOpenAccessPersonalDialog: () => void;
  handleCancelAccessPersonalDialog: () => void;
  handleAccessPersonalDialogOpenChange: (open: boolean) => void;
  handleSaveAccessPersonal: () => void;
  handleSaveAccessControl: () => Promise<void>;
  handleExportAccessControlData: () => Promise<void>;
  handleAccessDataFileSelected: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleGenerateAccessControlReport: () => Promise<void>;
  toggleAccessReportFilter: (filterKey: AccessReportSearchFilterKey) => void;
  clearAccessReportFilters: () => void;
};

export const useAccessControl = ({
  sortedWorks,
  resolvedTenantId,
  enabled,
  user,
}: UseAccessControlParams): UseAccessControlResult => {
  // ── Data layer ──────────────────────────────────────────────────────────────
  const {
    reports: accessControlReports,
    loading: accessControlLoading,
    saveReport: saveAccessControlReport,
    deleteReport: deleteAccessControlReport,
    bulkDeleteReports: bulkDeleteAccessControlReports,
    reloadReports: reloadAccessControlReports,
    syncPendingReports,
  } = useAccessControlReports({ tenantId: resolvedTenantId, enabled });

  // ── Background sync (event-driven, was orphaned) ─────────────────────────
  useAccessControlSync({ workReport: undefined, enabled });

  // ── Form state ───────────────────────────────────────────────────────────
  const [accessReportWorkFilter, setAccessReportWorkFilter] = useState('all');
  const [accessReportSelectedWorks, setAccessReportSelectedWorks] = useState<string[]>([]);
  const [accessReportPeriodFilter, setAccessReportPeriodFilter] = useState('all');
  const [accessReportSelectedDateKeys, setAccessReportSelectedDateKeys] = useState<string[]>([]);
  const [accessReportPeriodSelectionLabel, setAccessReportPeriodSelectionLabel] = useState('');
  const [accessReportEnabledFilters, setAccessReportEnabledFilters] = useState<AccessReportSearchFilterKey[]>([]);
  const [accessResponsibleFilter, setAccessResponsibleFilter] = useState('');
  const [accessWeekFilter, setAccessWeekFilter] = useState('');
  const [accessMonthFilter, setAccessMonthFilter] = useState('');
  const [accessDateFilter, setAccessDateFilter] = useState('');
  const [accessDatePickerOpen, setAccessDatePickerOpen] = useState(false);
  const [accessObservations, setAccessObservations] = useState('');
  const [accessAdditionalTasks, setAccessAdditionalTasks] = useState('');
  const [accessPersonalEntries, setAccessPersonalEntries] = useState<AccessPersonalEntry[]>([]);
  const [accessPersonalDialogOpen, setAccessPersonalDialogOpen] = useState(false);
  const [accessControlFormOpen, setAccessControlFormOpen] = useState(false);
  const [activeAccessControlReport, setActiveAccessControlReport] = useState<AccessReport | null>(null);
  const [accessPersonalForm, setAccessPersonalForm] = useState<AccessPersonalFormState>(() =>
    buildInitialAccessPersonalForm(),
  );
  const accessImportInputRef = useRef<HTMLInputElement | null>(null);

  const filteredAccessControlReportsForGenerate = useMemo(() => {
    const enabledFilters = new Set(accessReportEnabledFilters);
    const normalizedResponsible = normalizeComparableText(accessResponsibleFilter);
    const normalizedWeek = accessWeekFilter.trim();
    const normalizedMonth = accessMonthFilter.trim();
    const normalizedDate = accessDateFilter.trim();
    const shouldFilterByResponsible = enabledFilters.has('foreman') && normalizedResponsible.length > 0;
    const shouldFilterByWeek = enabledFilters.has('weeks') && normalizedWeek.length > 0;
    const shouldFilterByMonth = enabledFilters.has('months') && normalizedMonth.length > 0;
    const shouldFilterByDate = enabledFilters.has('date') && normalizedDate.length > 0;

    return accessControlReports.filter((report) => {
      const responsible = normalizeComparableText(report.responsible);
      const reportDate = report.date.trim();
      const reportWeek = getIsoWeekKey(reportDate);
      const reportMonth = reportDate.slice(0, 7);

      if (shouldFilterByResponsible && !responsible.includes(normalizedResponsible)) return false;
      if (shouldFilterByWeek && reportWeek !== normalizedWeek) return false;
      if (shouldFilterByMonth && reportMonth !== normalizedMonth) return false;
      if (shouldFilterByDate && reportDate !== normalizedDate) return false;
      return true;
    });
  }, [
    accessControlReports,
    accessDateFilter,
    accessMonthFilter,
    accessReportEnabledFilters,
    accessResponsibleFilter,
    accessWeekFilter,
  ]);

  const accessReportSelectedFiltersCount = accessReportEnabledFilters.length;
  const selectedAccessReportDate = useMemo(() => parseIsoDate(accessDateFilter), [accessDateFilter]);

  const accessReportAppliedFiltersCount = useMemo(() => {
    let activeFilters = 0;
    if (accessReportEnabledFilters.includes('foreman') && accessResponsibleFilter.trim()) activeFilters += 1;
    if (accessReportEnabledFilters.includes('weeks') && accessWeekFilter.trim()) activeFilters += 1;
    if (accessReportEnabledFilters.includes('months') && accessMonthFilter.trim()) activeFilters += 1;
    if (accessReportEnabledFilters.includes('date') && accessDateFilter.trim()) activeFilters += 1;
    return activeFilters;
  }, [
    accessDateFilter,
    accessMonthFilter,
    accessReportEnabledFilters,
    accessResponsibleFilter,
    accessWeekFilter,
  ]);

  const toggleAccessReportFilter = useCallback((filterKey: AccessReportSearchFilterKey) => {
    setAccessReportEnabledFilters((current) =>
      current.includes(filterKey)
        ? current.filter((activeKey) => activeKey !== filterKey)
        : [...current, filterKey],
    );
  }, []);

  const clearAccessReportFilters = useCallback(() => {
    setAccessReportEnabledFilters([]);
    setAccessResponsibleFilter('');
    setAccessWeekFilter('');
    setAccessMonthFilter('');
    setAccessDateFilter('');
    setAccessDatePickerOpen(false);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleNewAccessControlRecord = useCallback(() => {
    setActiveAccessControlReport(null);
    setAccessPersonalEntries([]);
    setAccessObservations('');
    setAccessAdditionalTasks('');
    setAccessControlFormOpen(true);
  }, []);

  const handleEditAccessControlReport = useCallback((report: AccessReport) => {
    setActiveAccessControlReport(report);
    setAccessControlFormOpen(true);
  }, []);

  const handleCloneAccessControlReport = useCallback(
    async (report: AccessReport) => {
      const nowIso = new Date().toISOString();
      const clonedReport: AccessReport = {
        ...report,
        id: crypto.randomUUID(),
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await saveAccessControlReport(clonedReport);
      await reloadAccessControlReports();
      toast({
        title: 'Control duplicado',
        description: 'Se ha creado una copia del control de accesos.',
        variant: 'default',
      });
    },
    [reloadAccessControlReports, saveAccessControlReport],
  );

  const handleCloseAccessControlForm = useCallback(() => {
    setActiveAccessControlReport(null);
    setAccessControlFormOpen(false);
  }, []);

  const handleSaveAccessControlForm = useCallback(
    async (report: AccessReport) => {
      await saveAccessControlReport(report);
      await reloadAccessControlReports();
    },
    [reloadAccessControlReports, saveAccessControlReport],
  );

  const handleOpenAccessPersonalDialog = useCallback(() => {
    setAccessPersonalForm(buildInitialAccessPersonalForm());
    setAccessPersonalDialogOpen(true);
  }, []);

  const handleCancelAccessPersonalDialog = useCallback(() => {
    setAccessPersonalDialogOpen(false);
    setAccessPersonalForm(buildInitialAccessPersonalForm());
  }, []);

  const handleAccessPersonalDialogOpenChange = useCallback((open: boolean) => {
    setAccessPersonalDialogOpen(open);
    if (!open) {
      setAccessPersonalForm(buildInitialAccessPersonalForm());
    }
  }, []);

  const handleSaveAccessPersonal = useCallback(() => {
    if (!accessPersonalForm.name.trim() || !accessPersonalForm.dni.trim() || !accessPersonalForm.company.trim()) {
      toast({
        title: 'Campos obligatorios',
        description: 'Nombre, DNI y empresa son obligatorios.',
        variant: 'destructive',
      });
      return;
    }

    const newEntry: AccessPersonalEntry = {
      id: crypto.randomUUID(),
      name: accessPersonalForm.name.trim(),
      dni: accessPersonalForm.dni.trim(),
      company: accessPersonalForm.company.trim(),
      entryTime: accessPersonalForm.entryTime || '08:00',
      exitTime: accessPersonalForm.exitTime || '18:00',
      activity: accessPersonalForm.activity.trim(),
      signature: accessPersonalForm.signature,
    };

    setAccessPersonalEntries((current) => [newEntry, ...current]);
    setAccessPersonalDialogOpen(false);
    setAccessPersonalForm(buildInitialAccessPersonalForm());
    toast({
      title: 'Personal guardado',
      description: 'El registro de personal se ha añadido correctamente.',
      variant: 'default',
    });
  }, [accessPersonalForm]);

  const handleSaveAccessControl = useCallback(async () => {
    const selectedWork =
      accessReportWorkFilter === 'all'
        ? null
        : sortedWorks.find((work) => work.id === accessReportWorkFilter) ?? null;

    const now = new Date();
    const nowIso = now.toISOString();
    const personalEntries: AccessEntry[] = accessPersonalEntries.map((entry) => ({
      id: entry.id,
      type: 'personal',
      name: entry.name.trim(),
      identifier: entry.dni.trim(),
      company: entry.company.trim(),
      entryTime: entry.entryTime || '08:00',
      exitTime: entry.exitTime || undefined,
      activity: entry.activity.trim(),
      signature: entry.signature || undefined,
    }));

    const newReport: AccessReport = {
      id: crypto.randomUUID(),
      date: toIsoDate(now),
      siteName: selectedWork
        ? `${selectedWork.number ? `${selectedWork.number} - ` : ''}${selectedWork.name || 'Sin nombre'}`
        : 'Sin obra seleccionada',
      workId: selectedWork?.id,
      responsible: user?.full_name || user?.email || 'Usuario',
      responsibleEntryTime: undefined,
      responsibleExitTime: undefined,
      observations: accessObservations.trim(),
      additionalTasks: accessAdditionalTasks.trim() || undefined,
      personalEntries,
      machineryEntries: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await saveAccessControlReport(newReport);
    await reloadAccessControlReports();
    setAccessPersonalEntries([]);
    setAccessObservations('');
    setAccessAdditionalTasks('');
    toast({
      title: 'Control guardado',
      description: 'Guardado en almacenamiento local y sincronización API lanzada.',
      variant: 'default',
    });
  }, [
    accessAdditionalTasks,
    accessObservations,
    accessPersonalEntries,
    accessReportWorkFilter,
    reloadAccessControlReports,
    saveAccessControlReport,
    sortedWorks,
    user?.email,
    user?.full_name,
  ]);

  const handleExportAccessControlData = useCallback(async () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tenantId: resolvedTenantId,
      reports: accessControlReports,
    };
    const serialized = JSON.stringify(payload, null, 2);
    const fileName = `control_accesos_${format(new Date(), 'yyyyMMdd_HHmm')}.json`;

    if (isNative()) {
      const base64 = await textToBase64(serialized);
      await saveBase64File(fileName, base64, 'application/json');
    } else {
      const blob = new Blob([serialized], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    toast({
      title: 'Datos exportados',
      description: `Se exportaron ${accessControlReports.length} controles de acceso.`,
      variant: 'default',
    });
  }, [accessControlReports, resolvedTenantId]);

  const handleAccessDataFileSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw);
        const candidates = Array.isArray(parsed)
          ? parsed
          : Array.isArray((parsed as { reports?: unknown[] }).reports)
            ? (parsed as { reports: unknown[] }).reports
            : [];

        if (candidates.length === 0) {
          toast({
            title: 'Sin datos válidos',
            description: 'El archivo no contiene controles de acceso importables.',
            variant: 'destructive',
          });
          return;
        }

        const normalizeEntry = (rawEntry: unknown, fallbackType: AccessEntry['type']): AccessEntry => {
          const record = asRecord(rawEntry) ?? {};
          const sourceRaw = toStringValue(record.source);
          const source = sourceRaw === 'subcontract' || sourceRaw === 'rental' ? sourceRaw : undefined;
          const typeRaw = toStringValue(record.type);
          return {
            id: toStringValue(record.id, crypto.randomUUID()),
            type: typeRaw === 'machinery' ? 'machinery' : fallbackType,
            name: toStringValue(record.name),
            identifier: toStringValue(record.identifier),
            company: toStringValue(record.company),
            entryTime: toStringValue(record.entryTime, '08:00'),
            exitTime: toOptionalString(record.exitTime),
            activity: toStringValue(record.activity),
            operator: toOptionalString(record.operator),
            signature: toOptionalString(record.signature),
            source,
          };
        };

        let imported = 0;
        for (const candidate of candidates) {
          const record = asRecord(candidate);
          if (!record) continue;
          const id = toStringValue(record.id, crypto.randomUUID());
          const createdAt = toStringValue(record.createdAt, new Date().toISOString());
          const report: AccessReport = {
            id,
            date: toStringValue(record.date, toIsoDate(new Date())),
            siteName: toStringValue(record.siteName),
            workId: toOptionalString(record.workId),
            responsible: toStringValue(record.responsible, user?.full_name || user?.email || 'Usuario'),
            responsibleEntryTime: toOptionalString(record.responsibleEntryTime),
            responsibleExitTime: toOptionalString(record.responsibleExitTime),
            observations: toStringValue(record.observations),
            additionalTasks: toOptionalString(record.additionalTasks),
            personalEntries: Array.isArray(record.personalEntries)
              ? record.personalEntries.map((entry) => normalizeEntry(entry, 'personal'))
              : [],
            machineryEntries: Array.isArray(record.machineryEntries)
              ? record.machineryEntries.map((entry) => normalizeEntry(entry, 'machinery'))
              : [],
            createdAt,
            updatedAt: new Date().toISOString(),
          };
          await saveAccessControlReport(report);
          imported += 1;
        }

        await reloadAccessControlReports();
        toast({
          title: 'Datos importados',
          description: `Se importaron ${imported} controles de acceso.`,
          variant: 'default',
        });
      } catch (error: unknown) {
        toast({
          title: 'Error al importar',
          description: error instanceof Error ? error.message : 'No se pudo leer el archivo seleccionado.',
          variant: 'destructive',
        });
      }
    },
    [reloadAccessControlReports, saveAccessControlReport, user?.email, user?.full_name],
  );

  const handleGenerateAccessControlReport = useCallback(async () => {
    const filteredByWork =
      accessReportSelectedWorks.length === 0
        ? accessControlReports
        : accessControlReports.filter((report) => accessReportSelectedWorks.includes(report.siteName.trim()));

    if (accessReportPeriodFilter !== 'all' && accessReportSelectedDateKeys.length === 0) {
      toast({
        title: 'Periodo sin seleccionar',
        description: 'Selecciona un dia, semana, mes o rango personalizado antes de generar el informe.',
        variant: 'destructive',
      });
      return;
    }

    const selectedDateSet = new Set(accessReportSelectedDateKeys);

    const filtered = filteredByWork.filter((report) => {
      if (accessReportPeriodFilter !== 'all') return selectedDateSet.has(report.date.trim());
      return true;
    });

    if (filtered.length === 0) {
      toast({
        title: 'Sin datos para informe',
        description: 'No hay controles de acceso para los filtros seleccionados.',
        variant: 'destructive',
      });
      return;
    }

    await exportAccessControlToExcel(filtered);
    toast({
      title: 'Informe generado',
      description: `Se generó el informe con ${filtered.length} controles.`,
      variant: 'default',
    });
  }, [accessControlReports, accessReportPeriodFilter, accessReportSelectedDateKeys, accessReportSelectedWorks]);

  return {
    // Data
    accessControlReports,
    accessControlLoading,
    deleteAccessControlReport,
    bulkDeleteAccessControlReports,
    syncPendingReports,
    // Form state
    activeAccessControlReport,
    accessReportWorkFilter,
    setAccessReportWorkFilter,
    accessReportSelectedWorks,
    setAccessReportSelectedWorks,
    accessReportPeriodFilter,
    setAccessReportPeriodFilter,
    accessReportSelectedDateKeys,
    setAccessReportSelectedDateKeys,
    accessReportPeriodSelectionLabel,
    setAccessReportPeriodSelectionLabel,
    accessReportEnabledFilters,
    accessReportSelectedFiltersCount,
    accessReportAppliedFiltersCount,
    accessResponsibleFilter,
    setAccessResponsibleFilter,
    accessWeekFilter,
    setAccessWeekFilter,
    accessMonthFilter,
    setAccessMonthFilter,
    accessDateFilter,
    setAccessDateFilter,
    accessDatePickerOpen,
    setAccessDatePickerOpen,
    selectedAccessReportDate,
    filteredAccessControlReportsForGenerate,
    accessObservations,
    setAccessObservations,
    accessAdditionalTasks,
    setAccessAdditionalTasks,
    accessPersonalEntries,
    accessPersonalDialogOpen,
    accessControlFormOpen,
    accessPersonalForm,
    setAccessPersonalForm,
    accessImportInputRef,
    // Handlers
    handleNewAccessControlRecord,
    handleEditAccessControlReport,
    handleCloneAccessControlReport,
    handleCloseAccessControlForm,
    handleSaveAccessControlForm,
    handleOpenAccessPersonalDialog,
    handleCancelAccessPersonalDialog,
    handleAccessPersonalDialogOpenChange,
    handleSaveAccessPersonal,
    handleSaveAccessControl,
    handleExportAccessControlData,
    handleAccessDataFileSelected,
    handleGenerateAccessControlReport,
    toggleAccessReportFilter,
    clearAccessReportFilters,
  };
};
