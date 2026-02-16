import {
  useCallback,
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
  parseIsoDate,
  toIsoDate,
  toOptionalString,
  toStringValue,
  type AccessPersonalEntry,
  type AccessPersonalFormState,
} from '@/pages/indexHelpers';

type WorkOption = {
  id: string;
  number?: string | null;
  name?: string | null;
};

type UserLike = {
  full_name?: string | null;
  email?: string | null;
} | null;

type UseAccessControlManagerParams = {
  sortedWorks: WorkOption[];
  resolvedTenantId: string | null;
  accessControlReports: AccessReport[];
  saveAccessControlReport: (report: AccessReport) => Promise<void>;
  reloadAccessControlReports: () => Promise<void>;
  user: UserLike;
};

type UseAccessControlManagerResult = {
  accessReportWorkFilter: string;
  setAccessReportWorkFilter: Dispatch<SetStateAction<string>>;
  accessReportPeriodFilter: string;
  setAccessReportPeriodFilter: Dispatch<SetStateAction<string>>;
  accessObservations: string;
  setAccessObservations: Dispatch<SetStateAction<string>>;
  accessAdditionalTasks: string;
  setAccessAdditionalTasks: Dispatch<SetStateAction<string>>;
  accessPersonalEntries: AccessPersonalEntry[];
  accessPersonalDialogOpen: boolean;
  accessPersonalForm: AccessPersonalFormState;
  setAccessPersonalForm: Dispatch<SetStateAction<AccessPersonalFormState>>;
  accessImportInputRef: RefObject<HTMLInputElement | null>;
  handleNewAccessControlRecord: () => void;
  handleOpenAccessPersonalDialog: () => void;
  handleCancelAccessPersonalDialog: () => void;
  handleAccessPersonalDialogOpenChange: (open: boolean) => void;
  handleSaveAccessPersonal: () => void;
  handleSaveAccessControl: () => Promise<void>;
  handleExportAccessControlData: () => Promise<void>;
  handleAccessDataFileSelected: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleGenerateAccessControlReport: () => void;
};

export const useAccessControlManager = ({
  sortedWorks,
  resolvedTenantId,
  accessControlReports,
  saveAccessControlReport,
  reloadAccessControlReports,
  user,
}: UseAccessControlManagerParams): UseAccessControlManagerResult => {
  const [accessReportWorkFilter, setAccessReportWorkFilter] = useState('all');
  const [accessReportPeriodFilter, setAccessReportPeriodFilter] = useState('all');
  const [accessObservations, setAccessObservations] = useState('');
  const [accessAdditionalTasks, setAccessAdditionalTasks] = useState('');
  const [accessPersonalEntries, setAccessPersonalEntries] = useState<AccessPersonalEntry[]>([]);
  const [accessPersonalDialogOpen, setAccessPersonalDialogOpen] = useState(false);
  const [accessPersonalForm, setAccessPersonalForm] = useState<AccessPersonalFormState>(() =>
    buildInitialAccessPersonalForm(),
  );
  const accessImportInputRef = useRef<HTMLInputElement | null>(null);

  const handleNewAccessControlRecord = useCallback(() => {
    setAccessPersonalEntries([]);
    setAccessObservations('');
    setAccessAdditionalTasks('');
    toast({
      title: 'Nuevo registro',
      description: 'Formulario de control de accesos reiniciado.',
      variant: 'default',
    });
  }, []);

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
      } catch (error: any) {
        toast({
          title: 'Error al importar',
          description: error?.message || 'No se pudo leer el archivo seleccionado.',
          variant: 'destructive',
        });
      }
    },
    [reloadAccessControlReports, saveAccessControlReport, user?.email, user?.full_name],
  );

  const handleGenerateAccessControlReport = useCallback(() => {
    const filteredByWork =
      accessReportWorkFilter === 'all'
        ? accessControlReports
        : accessControlReports.filter((report) => report.workId === accessReportWorkFilter);

    const today = new Date();
    const todayIso = toIsoDate(today);
    const monthKey = todayIso.slice(0, 7);
    const weekStart = new Date(today);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);

    const filtered = filteredByWork.filter((report) => {
      if (accessReportPeriodFilter === 'daily') {
        return report.date === todayIso;
      }
      if (accessReportPeriodFilter === 'weekly') {
        const reportDate = parseIsoDate(report.date);
        return Boolean(reportDate && reportDate >= weekStart);
      }
      if (accessReportPeriodFilter === 'monthly') {
        return report.date.startsWith(monthKey);
      }
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

    exportAccessControlToExcel(filtered);
    toast({
      title: 'Informe generado',
      description: `Se generó el informe con ${filtered.length} controles.`,
      variant: 'default',
    });
  }, [accessControlReports, accessReportPeriodFilter, accessReportWorkFilter]);

  return {
    accessReportWorkFilter,
    setAccessReportWorkFilter,
    accessReportPeriodFilter,
    setAccessReportPeriodFilter,
    accessObservations,
    setAccessObservations,
    accessAdditionalTasks,
    setAccessAdditionalTasks,
    accessPersonalEntries,
    accessPersonalDialogOpen,
    accessPersonalForm,
    setAccessPersonalForm,
    accessImportInputRef,
    handleNewAccessControlRecord,
    handleOpenAccessPersonalDialog,
    handleCancelAccessPersonalDialog,
    handleAccessPersonalDialogOpenChange,
    handleSaveAccessPersonal,
    handleSaveAccessControl,
    handleExportAccessControlData,
    handleAccessDataFileSelected,
    handleGenerateAccessControlReport,
  };
};
