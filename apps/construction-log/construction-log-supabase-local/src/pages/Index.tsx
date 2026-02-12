import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AppIcon } from '@/components/AppIcon';
import { LanguageSelector } from '@/components/LanguageSelector';
import { NetworkStatusIcon } from '@/components/NetworkStatusIcon';
import { DashboardSummaryPanel } from '@/components/api/DashboardSummaryPanel';
import { EconomicsOverviewPanel } from '@/components/api/EconomicsOverviewPanel';
import { ProfileSettingsPanel } from '@/components/api/ProfileSettingsPanel';
import { TasksAndTimePanel } from '@/components/api/TasksAndTimePanel';
import { ToolsSettingsPanel } from '@/components/api/ToolsSettingsPanel';
import { UsersAdminPanel } from '@/components/api/UsersAdminPanel';
import { GenerateWorkReportPanel, type GenerateWorkReportDraft } from '@/components/GenerateWorkReportPanel';
import { normalizeNoteCategory } from '@/components/ObservacionesIncidenciasSection';
import { TenantPicker } from '@/components/TenantPicker';
import { useAuth } from '@/contexts/AuthContext';
import { useWorks } from '@/hooks/useWorks';
import { toast } from '@/hooks/use-toast';
import { listTenants, type ApiTenant } from '@/integrations/api/client';
import {
  TENANT_REQUIRED_MESSAGE,
  getTenantResolutionState,
  isTenantResolutionError,
  prepareOfflineTenantScope,
  setActiveTenantId as persistActiveTenantId,
} from '@/offline-db/tenantScope';
import { workReportsRepo } from '@/offline-db/repositories/workReportsRepo';
import type { WorkReport } from '@/offline-db/types';
import { syncNow } from '@/sync/syncService';
import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  CloudUpload,
  Database,
  FileDown,
  FileText,
  HelpCircle,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Timer,
  Users,
} from 'lucide-react';

const PENDING_MIGRATION_MESSAGE = 'Pendiente de migracion a API';
const AUTO_CLONE_CHECK_INTERVAL_MS = 60_000;
const AUTO_CLONE_HOUR = 6;
let autoCloneProcessRunning = false;

function normalizeRoles(roles: unknown): string[] {
  if (!Array.isArray(roles)) return [];
  return roles.map((role) => String(role).toLowerCase());
}

function getRoleLabel(isSuperAdmin: boolean, isTenantAdmin: boolean): string {
  if (isSuperAdmin) return 'SUPERADMIN';
  if (isTenantAdmin) return 'ADMIN';
  return 'USUARIO';
}

function isTenantAdminRole(role: string): boolean {
  const normalized = role.trim().toLowerCase();
  return (
    normalized === 'tenant_admin' ||
    normalized === 'tenant-admin' ||
    normalized === 'tenant admin' ||
    normalized === 'admin' ||
    normalized === 'site_manager' ||
    normalized === 'site-manager' ||
    normalized === 'encargado'
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function payloadText(payload: unknown, key: string): string | null {
  const record = asRecord(payload);
  if (!record) return null;
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function payloadNumber(payload: unknown, key: string): number | null {
  const record = asRecord(payload);
  if (!record) return null;
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function payloadBoolean(payload: unknown, key: string): boolean | null {
  const record = asRecord(payload);
  if (!record) return null;
  const value = record[key];
  return typeof value === 'boolean' ? value : null;
}

function generateReportIdentifier(date: string): string {
  const datePart = date.replaceAll('-', '');
  const randomPart = crypto.randomUUID().split('-')[0].toUpperCase();
  return `PRT-${datePart}-${randomPart}`;
}

function generateUniqueReportIdentifier(date: string, reserved: Set<string>): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateReportIdentifier(date);
    if (!reserved.has(candidate)) {
      return candidate;
    }
  }
  return `${generateReportIdentifier(date)}-${Date.now().toString(36).toUpperCase()}`;
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function parseIsoDate(dateValue: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextBusinessDate(dateValue: string): string | null {
  const base = parseIsoDate(dateValue);
  if (!base) return null;

  const next = new Date(base);
  do {
    next.setDate(next.getDate() + 1);
  } while (next.getDay() === 0 || next.getDay() === 6);

  return toIsoDate(next);
}

function getCloneDueTimestamp(targetDate: string): number | null {
  const parsed = parseIsoDate(targetDate);
  if (!parsed) return null;
  parsed.setHours(AUTO_CLONE_HOUR, 0, 0, 0);
  return parsed.getTime();
}

type WorkReportIdentity = {
  workNumber: string;
  workName: string;
};

function getWorkReportIdentity(report: WorkReport): WorkReportIdentity {
  const payload = asRecord(report.payload);
  return {
    workNumber: normalizeComparableText(payloadText(payload, 'workNumber')),
    workName: normalizeComparableText(payloadText(payload, 'workName') ?? report.title ?? ''),
  };
}

function sameWorkIdentity(left: WorkReportIdentity, right: WorkReportIdentity): boolean {
  if (left.workNumber && right.workNumber) {
    return left.workNumber === right.workNumber;
  }
  if (left.workName && right.workName) {
    return left.workName === right.workName;
  }
  return false;
}

type PendingOverwrite = {
  draft: GenerateWorkReportDraft;
  reportIdentifier: string;
};

type TenantGateStatus = 'loading' | 'resolved' | 'picker' | 'error';

const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut, refreshUser } = useAuth();
  const { works, loading: worksLoading, loadWorks } = useWorks();
  const [activeTab, setActiveTab] = useState('work-reports');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [timeTrackingOpen, setTimeTrackingOpen] = useState(false);
  const [workReports, setWorkReports] = useState<WorkReport[]>([]);
  const [workReportsLoading, setWorkReportsLoading] = useState(false);
  const [generatePanelOpen, setGeneratePanelOpen] = useState(false);
  const [generatePanelSaving, setGeneratePanelSaving] = useState(false);
  const [generatePanelDate, setGeneratePanelDate] = useState<string | undefined>(undefined);
  const [activeReport, setActiveReport] = useState<WorkReport | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [tenantGateStatus, setTenantGateStatus] = useState<TenantGateStatus>('loading');
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);
  const [tenantPickerOptions, setTenantPickerOptions] = useState<ApiTenant[]>([]);
  const [tenantPickerSelection, setTenantPickerSelection] = useState('');
  const [tenantPickerLoading, setTenantPickerLoading] = useState(false);
  const [tenantPickerSubmitting, setTenantPickerSubmitting] = useState(false);
  const [tenantResolutionMessage, setTenantResolutionMessage] = useState<string | null>(null);
  const bootstrapSyncAttemptedRef = useRef<Record<string, boolean>>({});

  const roles = useMemo(() => normalizeRoles(user?.roles), [user?.roles]);
  const roleName = roles[0] || '';

  // Backwards-compatible mapping:
  // - New logical roles: super_admin | tenant_admin | user
  // - Legacy roles that we map into the new behavior for UX.
  const isSuperAdmin =
    Boolean(user?.is_super_admin) || roles.includes('super_admin') || roles.includes('master');
  const isTenantAdmin = roles.some(isTenantAdminRole);

  // Per requirement: hide user management for tenant admin and user.
  // We keep it only for superadmin (system managers).
  const showUserManagementTab = isSuperAdmin;
  const showUpdatesTab = isSuperAdmin || isTenantAdmin;
  const tenantResolving = tenantGateStatus === 'loading';
  const tenantResolved = tenantGateStatus === 'resolved' && Boolean(resolvedTenantId);
  const tenantUnavailable = !tenantResolved;
  const tenantNeedsPicker = tenantGateStatus === 'picker';
  const tenantErrorMessage = tenantResolutionMessage ?? TENANT_REQUIRED_MESSAGE;
  const tenantPickerErrorMessage = tenantResolutionMessage;
  const canCreateWorkReport = tenantResolved;

  const roleLabel = useMemo(() => getRoleLabel(isSuperAdmin, isTenantAdmin), [isSuperAdmin, isTenantAdmin]);

  const sortedWorks = useMemo(() => {
    return [...works].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [works]);

  const panelReadOnly = useMemo(() => {
    if (!activeReport) return false;
    return (payloadBoolean(activeReport.payload, 'isClosed') ?? false) || activeReport.status === 'completed';
  }, [activeReport]);

  const panelReportIdentifier = useMemo(() => {
    if (!activeReport) return null;
    return payloadText(activeReport.payload, 'reportIdentifier') ?? activeReport.id.slice(0, 8);
  }, [activeReport]);

  const panelInitialDraft = useMemo<GenerateWorkReportDraft | null>(() => {
    if (!activeReport) return null;
    const payload = asRecord(activeReport.payload) ?? {};
    const valueString = (key: string, fallback = '') => {
      const value = payload[key];
      return typeof value === 'string' ? value : fallback;
    };
    const valueNumber = (key: string, fallback = 0) => {
      const value = payload[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    };
    const valueBoolean = (key: string, fallback = false) => {
      const value = payload[key];
      return typeof value === 'boolean' ? value : fallback;
    };
    const valueArray = (key: string) => {
      const value = payload[key];
      return Array.isArray(value) ? value : [];
    };
    const fallbackWorkId = typeof activeReport.projectId === 'string' ? activeReport.projectId : '';

    return {
      workId: valueString('workId', fallbackWorkId) || null,
      workNumber: valueString('workNumber'),
      workName: valueString('workName', activeReport.title ?? ''),
      date: valueString('date', activeReport.date),
      totalHours: valueNumber('totalHours', 0),
      isClosed: valueBoolean('isClosed', activeReport.status === 'completed'),
      workforceSectionCompleted: valueBoolean('workforceSectionCompleted'),
      workforceGroups: valueArray('workforceGroups') as GenerateWorkReportDraft['workforceGroups'],
      subcontractedMachineryGroups: valueArray('subcontractedMachineryGroups') as GenerateWorkReportDraft['subcontractedMachineryGroups'],
      materialGroups: valueArray('materialGroups') as GenerateWorkReportDraft['materialGroups'],
      subcontractGroups: valueArray('subcontractGroups') as GenerateWorkReportDraft['subcontractGroups'],
      subcontractedMachineryRows: valueArray('subcontractedMachineryRows') as GenerateWorkReportDraft['subcontractedMachineryRows'],
      materialRows: valueArray('materialRows') as GenerateWorkReportDraft['materialRows'],
      subcontractRows: valueArray('subcontractRows') as GenerateWorkReportDraft['subcontractRows'],
      rentalMachineryRows: valueArray('rentalMachineryRows') as GenerateWorkReportDraft['rentalMachineryRows'],
      rentalMachinesSnapshot: valueArray('rentalMachinesSnapshot') as GenerateWorkReportDraft['rentalMachinesSnapshot'],
      wasteRows: valueArray('wasteRows') as GenerateWorkReportDraft['wasteRows'],
      observationsCompleted: valueBoolean('observationsCompleted'),
      observationsCategory: normalizeNoteCategory(payload.observationsCategory),
      observationsText: valueString('observationsText'),
      galleryImages: valueArray('galleryImages') as GenerateWorkReportDraft['galleryImages'],
      foremanResources: valueArray('foremanResources') as GenerateWorkReportDraft['foremanResources'],
      mainForeman: valueString('mainForeman'),
      mainForemanHours: valueNumber('mainForemanHours'),
      siteManager: valueString('siteManager'),
      autoCloneNextDay: valueBoolean('autoCloneNextDay'),
      foremanSignature: valueString('foremanSignature'),
      siteManagerSignature: valueString('siteManagerSignature'),
    };
  }, [activeReport]);

  const handlePending = (featureName: string) => {
    toast({
      title: 'Pendiente de migracion',
      description: `${featureName}: ${PENDING_MIGRATION_MESSAGE}`,
      variant: 'default',
    });
  };

  const processScheduledAutoClones = useCallback(async (
    tenantId: string,
    options: { notify?: boolean } = {},
  ): Promise<{ created: number; linkedExisting: number }> => {
    if (autoCloneProcessRunning) {
      return { created: 0, linkedExisting: 0 };
    }

    autoCloneProcessRunning = true;
    try {
      await workReportsRepo.init();
      const reports = await workReportsRepo.list({ tenantId, limit: 500 });
      if (reports.length === 0) {
        return { created: 0, linkedExisting: 0 };
      }

      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const reportsInMemory = [...reports];
      const existingIdentifiers = new Set<string>();
      const existingCloneKeys = new Set<string>();

      for (const report of reportsInMemory) {
        const payload = asRecord(report.payload);
        const identifier = payloadText(payload, 'reportIdentifier');
        if (identifier) {
          existingIdentifiers.add(identifier);
        }

        const sourceReportId = payloadText(payload, 'autoClonedFromReportId');
        if (sourceReportId) {
          existingCloneKeys.add(`${sourceReportId}::${report.date}`);
        }
      }

      let created = 0;
      let linkedExisting = 0;

      for (const sourceReport of reports) {
        const sourcePayload = asRecord(sourceReport.payload);
        if ((payloadBoolean(sourcePayload, 'autoCloneNextDay') ?? false) !== true) {
          continue;
        }

        const sourceDate = payloadText(sourcePayload, 'date') ?? sourceReport.date;
        const targetDate = getNextBusinessDate(sourceDate);
        if (!targetDate) continue;

        const dueTimestamp = getCloneDueTimestamp(targetDate);
        if (!dueTimestamp || now < dueTimestamp) continue;

        const sourceCloneKey = `${sourceReport.id}::${targetDate}`;
        if (existingCloneKeys.has(sourceCloneKey)) {
          const completedForDate = payloadText(sourcePayload, 'autoCloneCompletedForDate');
          if (completedForDate !== targetDate) {
            await workReportsRepo.update(sourceReport.id, {
              payload: {
                ...(sourcePayload ?? {}),
                autoCloneCompletedForDate: targetDate,
                autoCloneCompletedAt: nowIso,
              },
            });
            linkedExisting += 1;
          }
          continue;
        }

        const sourceIdentity = getWorkReportIdentity(sourceReport);
        const reportWithSameDateAndWork = reportsInMemory.find((candidate) => {
          if (candidate.id === sourceReport.id || candidate.date !== targetDate) return false;
          return sameWorkIdentity(sourceIdentity, getWorkReportIdentity(candidate));
        });

        if (reportWithSameDateAndWork) {
          existingCloneKeys.add(sourceCloneKey);
          await workReportsRepo.update(sourceReport.id, {
            payload: {
              ...(sourcePayload ?? {}),
              autoCloneCompletedForDate: targetDate,
              autoCloneCompletedAt: nowIso,
              autoCloneCreatedReportId: reportWithSameDateAndWork.id,
            },
          });
          linkedExisting += 1;
          continue;
        }

        const cloneIdentifier = generateUniqueReportIdentifier(targetDate, existingIdentifiers);
        existingIdentifiers.add(cloneIdentifier);

        const clonedPayload = {
          ...(sourcePayload ?? {}),
          reportIdentifier: cloneIdentifier,
          date: targetDate,
          isClosed: false,
          autoCloneNextDay: false,
          autoClonedFromReportId: sourceReport.id,
          autoClonedFromIdentifier:
            payloadText(sourcePayload, 'reportIdentifier') ?? sourceReport.id.slice(0, 8),
          autoClonedAt: nowIso,
          autoCloneCompletedForDate: undefined,
          autoCloneCompletedAt: undefined,
          autoCloneCreatedReportId: undefined,
          lastModifiedAt: nowIso,
        };

        const createdClone = await workReportsRepo.create({
          tenantId,
          projectId: sourceReport.projectId,
          title: payloadText(sourcePayload, 'workName') ?? sourceReport.title ?? `Parte ${targetDate}`,
          date: targetDate,
          status: 'draft',
          payload: clonedPayload,
        });

        await workReportsRepo.update(sourceReport.id, {
          payload: {
            ...(sourcePayload ?? {}),
            autoCloneCompletedForDate: targetDate,
            autoCloneCompletedAt: nowIso,
            autoCloneCreatedReportId: createdClone.id,
          },
        });

        reportsInMemory.push(createdClone);
        existingCloneKeys.add(sourceCloneKey);
        created += 1;
      }

      if (options.notify && created > 0) {
        toast({
          title: 'Clonación automática completada',
          description: created === 1
            ? 'Se creó 1 parte nuevo para el siguiente día laborable.'
            : `Se crearon ${created} partes nuevos para el siguiente día laborable.`,
        });
      }

      return { created, linkedExisting };
    } finally {
      autoCloneProcessRunning = false;
    }
  }, [toast]);

  const resolveTenantGate = useCallback(async () => {
    if (!user) {
      setTenantGateStatus('loading');
      setResolvedTenantId(null);
      setTenantPickerOptions([]);
      setTenantPickerSelection('');
      setTenantResolutionMessage(null);
      return;
    }

    setTenantGateStatus('loading');
    setTenantResolutionMessage(null);

    try {
      const resolution = await getTenantResolutionState(user);

      if (resolution.isResolved && resolution.tenantId) {
        setResolvedTenantId(resolution.tenantId);
        setTenantGateStatus('resolved');
        setTenantPickerOptions([]);
        setTenantPickerSelection('');
        setTenantResolutionMessage(null);
        return;
      }

      setResolvedTenantId(null);

      if (resolution.requiresTenantPicker) {
        setTenantGateStatus('picker');
        setTenantPickerLoading(true);

        try {
          const tenants = await listTenants();
          const activeTenants = tenants.filter((tenant) => tenant.is_active !== false);
          setTenantPickerOptions(activeTenants);
          setTenantPickerSelection((previous) => {
            if (previous && activeTenants.some((tenant) => String(tenant.id) === previous)) {
              return previous;
            }
            return activeTenants.length > 0 ? String(activeTenants[0].id) : '';
          });
          setTenantResolutionMessage(
            activeTenants.length > 0 ? null : 'No hay tenants accesibles para este usuario.'
          );
        } catch (pickerError) {
          console.error('[TenantPicker] Error loading tenants:', pickerError);
          setTenantPickerOptions([]);
          setTenantPickerSelection('');
          setTenantResolutionMessage('No se pudieron cargar tenants. Reintenta o vuelve a iniciar sesión.');
        } finally {
          setTenantPickerLoading(false);
        }

        return;
      }

      setTenantGateStatus('error');
      setTenantPickerOptions([]);
      setTenantPickerSelection('');
      setTenantResolutionMessage(resolution.errorMessage ?? TENANT_REQUIRED_MESSAGE);
    } catch (resolutionError) {
      console.error('[TenantScope] Error resolving tenant:', resolutionError);
      setTenantGateStatus('error');
      setResolvedTenantId(null);
      setTenantPickerOptions([]);
      setTenantPickerSelection('');
      setTenantResolutionMessage(TENANT_REQUIRED_MESSAGE);
    }
  }, [user]);

  const handleRetryTenantResolution = useCallback(() => {
    void resolveTenantGate();
  }, [resolveTenantGate]);

  const handleConfirmTenantSelection = useCallback(async () => {
    if (!user) return;
    if (!tenantPickerSelection) {
      setTenantResolutionMessage('Selecciona un tenant para continuar.');
      return;
    }

    setTenantPickerSubmitting(true);
    try {
      const tenantId = await persistActiveTenantId(user, tenantPickerSelection);
      setResolvedTenantId(tenantId);
      setTenantGateStatus('resolved');
      setTenantResolutionMessage(null);
    } catch (error) {
      console.error('[TenantPicker] Error selecting tenant:', error);
      setTenantResolutionMessage('No se pudo guardar el tenant activo. Reintenta.');
    } finally {
      setTenantPickerSubmitting(false);
    }
  }, [tenantPickerSelection, user]);

  const loadWorkReports = useCallback(async () => {
    if (!user || !tenantResolved || !resolvedTenantId) {
      setWorkReports([]);
      return;
    }

    setWorkReportsLoading(true);
    try {
      const preparedTenantId = await prepareOfflineTenantScope(user, { tenantId: resolvedTenantId });
      await workReportsRepo.init();
      await processScheduledAutoClones(preparedTenantId);
      const reports = await workReportsRepo.list({ tenantId: preparedTenantId, limit: 50 });
      setWorkReports(reports);
    } catch (error) {
      if (isTenantResolutionError(error)) {
        setWorkReports([]);
        return;
      }
      console.error('[WorkReports] Error loading local work reports:', error);
      toast({
        title: 'Error cargando partes',
        description: 'No se pudieron cargar los partes locales (offline).',
        variant: 'destructive',
      });
    } finally {
      setWorkReportsLoading(false);
    }
  }, [processScheduledAutoClones, resolvedTenantId, tenantResolved, toast, user]);

  const openGenerateWorkReport = useCallback((targetDate?: string) => {
    if (tenantUnavailable) {
      toast({
        title: 'Operación bloqueada',
        description: tenantErrorMessage,
        variant: 'destructive',
      });
      return;
    }

    setActiveReport(null);
    setGeneratePanelDate(targetDate);
    setGeneratePanelOpen(true);
  }, [tenantErrorMessage, tenantUnavailable, toast]);

  const openExistingReport = useCallback((report: WorkReport) => {
    if (tenantUnavailable) {
      toast({
        title: 'Operación bloqueada',
        description: tenantErrorMessage,
        variant: 'destructive',
      });
      return;
    }

    setActiveReport(report);
    setGeneratePanelDate(report.date);
    setGeneratePanelOpen(true);
  }, [tenantErrorMessage, tenantUnavailable, toast]);

  const persistGeneratedWorkReport = useCallback(async (
    draft: GenerateWorkReportDraft,
    options: { skipOverwritePrompt?: boolean } = {},
  ) => {
    if (!user) return;
    if (tenantUnavailable) {
      toast({
        title: 'No se pudo guardar',
        description: tenantErrorMessage,
        variant: 'destructive',
      });
      return;
    }

    try {
      setGeneratePanelSaving(true);
      setWorkReportsLoading(true);
      const preparedTenantId = await prepareOfflineTenantScope(user, { tenantId: resolvedTenantId });

      const normalizedWorkNumber = draft.workNumber.trim().toLowerCase();
      const normalizedWorkName = draft.workName.trim().toLowerCase();
      const existingReports = await workReportsRepo.list({ tenantId: preparedTenantId, limit: 500 });

      const existing = existingReports.find((candidate) => {
        if (candidate.date !== draft.date) return false;
        const candidateNumber = payloadText(candidate.payload, 'workNumber')?.trim().toLowerCase();
        if (candidateNumber && candidateNumber === normalizedWorkNumber) return true;
        const candidateName = (payloadText(candidate.payload, 'workName') ?? candidate.title ?? '').trim().toLowerCase();
        return Boolean(candidateName) && candidateName === normalizedWorkName;
      });

      const existingIsClosed = existing
        ? (payloadBoolean(existing.payload, 'isClosed') ?? false) || existing.status === 'completed'
        : false;
      const existingIdentifier = existing
        ? payloadText(existing.payload, 'reportIdentifier') ?? existing.id.slice(0, 8)
        : null;

      if (existing && existingIsClosed) {
        toast({
          title: 'Parte cerrado',
          description: `El parte ${existingIdentifier ?? existing.id.slice(0, 8)} está cerrado y solo puede visualizarse.`,
          variant: 'destructive',
        });
        return;
      }

      if (existing && !existingIsClosed && !options.skipOverwritePrompt) {
        setPendingOverwrite({
          draft,
          reportIdentifier: existingIdentifier ?? existing.id.slice(0, 8),
        });
        return;
      }

      const reportIdentifier = existingIdentifier || generateReportIdentifier(draft.date);
      const statusToStore = draft.isClosed ? 'completed' : 'draft';
      const existingPayload = existing ? asRecord(existing.payload) : null;
      const existingProjectId =
        existing?.projectId ??
        (existingPayload ? (typeof existingPayload.projectId === 'string' ? existingPayload.projectId : null) : null);
      const resolvedProjectId = draft.workId ?? existingProjectId ?? null;

      const payloadToStore = {
        ...draft,
        workId: resolvedProjectId,
        projectId: resolvedProjectId,
        source: 'generate-work-report-panel',
        reportIdentifier,
        totalHours: draft.totalHours,
        isClosed: draft.isClosed,
        lastModifiedAt: new Date().toISOString(),
      };

      let wasUpdated = false;

      if (existing) {
        await workReportsRepo.update(existing.id, {
          projectId: resolvedProjectId,
          title: draft.workName || `Parte ${draft.date}`,
          date: draft.date,
          status: statusToStore,
          payload: payloadToStore,
        });
        wasUpdated = true;
      } else {
        await workReportsRepo.create({
          tenantId: preparedTenantId,
          projectId: resolvedProjectId,
          title: draft.workName || `Parte ${draft.date}`,
          date: draft.date,
          status: statusToStore,
          payload: payloadToStore,
        });
      }

      setPendingOverwrite(null);
      toast({
        title: wasUpdated ? 'Parte actualizado' : 'Parte guardado',
        description: `${wasUpdated ? 'Parte sobrescrito' : 'Parte creado'} en local (offline). Identificador: ${reportIdentifier}.`,
        variant: 'default',
      });

      setActiveReport(null);
      setGeneratePanelOpen(false);
      await loadWorkReports();
    } catch (error) {
      if (isTenantResolutionError(error)) {
        toast({
          title: 'No se pudo guardar',
          description: tenantErrorMessage,
          variant: 'destructive',
        });
        return;
      }

      console.error('[WorkReports] Error creating local work report:', error);
      toast({
        title: 'Error creando parte',
        description: 'No se pudo crear el parte en local.',
        variant: 'destructive',
      });
    } finally {
      setGeneratePanelSaving(false);
      setWorkReportsLoading(false);
    }
  }, [loadWorkReports, resolvedTenantId, tenantErrorMessage, tenantUnavailable, toast, user]);

  const handleSaveGeneratedWorkReport = useCallback(async (draft: GenerateWorkReportDraft) => {
    await persistGeneratedWorkReport(draft);
  }, [persistGeneratedWorkReport]);

  const handleConfirmOverwrite = useCallback(async () => {
    if (!pendingOverwrite) return;
    const draftToPersist = pendingOverwrite.draft;
    setPendingOverwrite(null);
    await persistGeneratedWorkReport(draftToPersist, { skipOverwritePrompt: true });
  }, [pendingOverwrite, persistGeneratedWorkReport]);

  const handleSyncNow = useCallback(async () => {
    if (tenantUnavailable) {
      toast({
        title: 'Sincronización bloqueada',
        description: tenantErrorMessage,
        variant: 'destructive',
      });
      return;
    }

    try {
      setSyncing(true);
      await prepareOfflineTenantScope(user, { tenantId: resolvedTenantId });
      const result = await syncNow({ tenantId: resolvedTenantId });
      await loadWorkReports();

      if (result.synced > 0) {
        toast({
          title: result.failed > 0 ? 'Sincronización parcial' : 'Sincronización completada',
          description: `Sincronizados: ${result.synced}. Pendientes: ${result.pendingAfter}.`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Sin cambios sincronizados',
          description: result.failed > 0
            ? `${result.note} Pendientes: ${result.pendingAfter}.`
            : result.note,
          variant: result.failed > 0 ? 'destructive' : 'default',
        });
      }
    } catch (error) {
      if (isTenantResolutionError(error)) {
        toast({
          title: 'Sincronización bloqueada',
          description: tenantErrorMessage,
          variant: 'destructive',
        });
        return;
      }

      console.error('[Sync] Error running sync:', error);
      toast({
        title: 'Error sincronizando',
        description: 'No se pudo enviar los partes pendientes.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  }, [loadWorkReports, resolvedTenantId, tenantErrorMessage, tenantUnavailable, toast, user]);

  useEffect(() => {
    void resolveTenantGate();
  }, [resolveTenantGate]);

  useEffect(() => {
    void loadWorkReports();
  }, [loadWorkReports]);

  useEffect(() => {
    if (!tenantResolved || !resolvedTenantId) return;
    if (tenantUnavailable || workReportsLoading || syncing) return;
    if (workReports.length > 0) return;
    if (bootstrapSyncAttemptedRef.current[resolvedTenantId]) return;

    bootstrapSyncAttemptedRef.current[resolvedTenantId] = true;
    void handleSyncNow();
  }, [
    handleSyncNow,
    resolvedTenantId,
    syncing,
    tenantResolved,
    tenantUnavailable,
    workReports.length,
    workReportsLoading,
  ]);

  useEffect(() => {
    if (!user || !tenantResolved || !resolvedTenantId) return;

    let cancelled = false;

    const runAutoCloneTick = async () => {
      if (cancelled) return;
      try {
        const preparedTenantId = await prepareOfflineTenantScope(user, { tenantId: resolvedTenantId });
        const result = await processScheduledAutoClones(preparedTenantId, { notify: true });
        if (!cancelled && result.created > 0) {
          const refreshedReports = await workReportsRepo.list({ tenantId: preparedTenantId, limit: 50 });
          setWorkReports(refreshedReports);
        }
      } catch (error) {
        if (isTenantResolutionError(error)) return;
        console.error('[AutoClone] Error processing scheduled clones:', error);
      }
    };

    const intervalId = window.setInterval(() => {
      void runAutoCloneTick();
    }, AUTO_CLONE_CHECK_INTERVAL_MS);

    void runAutoCloneTick();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [processScheduledAutoClones, resolvedTenantId, tenantResolved, user]);

  useEffect(() => {
    if (!tenantUnavailable) return;
    setGeneratePanelOpen(false);
    setActiveReport(null);
    setPendingOverwrite(null);
  }, [tenantUnavailable]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <header className="bg-blue-700 text-white shadow-sm sticky top-0 z-50">
          <div className="w-full px-2 sm:px-4 lg:px-6 py-2 sm:py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <AppIcon size={34} className="flex-shrink-0" />
                <div className="min-w-0 leading-tight">
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-base sm:text-lg font-semibold truncate">Partes de Trabajo y C.A. 2.0</h1>
                    <Badge className="hidden sm:inline-flex bg-white/15 text-white border-white/20">
                      {roleLabel}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-blue-100 truncate hidden sm:block">
                    {user.email}
                    {roleName ? ` | ${roleName}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <NetworkStatusIcon />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => loadWorks()}
                  disabled={worksLoading}
                  className="h-9 w-9 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground rounded-lg"
                  title="Recargar datos"
                >
                  <RefreshCw className={`h-4 w-4 ${worksLoading ? 'animate-spin' : ''}`} />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleSyncNow()}
                  disabled={syncing || tenantUnavailable}
                  className="h-9 w-9 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground rounded-lg"
                  title={tenantUnavailable ? tenantErrorMessage : 'Sincronizar (outbox)'}
                >
                  <CloudUpload className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                </Button>

                <div className="hidden sm:block">
                  <LanguageSelector />
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  className="h-9 w-9 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground rounded-lg"
                  title="Ajustes"
                >
                  <Settings className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => signOut()}
                  className="h-9 w-9 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground rounded-lg"
                  title="Salir"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <div className="w-full px-2 sm:px-4 lg:px-6 py-3 border-b bg-slate-100">
          <div className="overflow-x-auto">
            <div className="mx-auto w-fit min-w-max">
              <TabsList className="w-max bg-slate-200/90 p-1 rounded-xl justify-center gap-1">
            <TabsTrigger
              value="work-reports"
              className="rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Partes de Trabajo
            </TabsTrigger>
            <TabsTrigger
              value="access-control"
              className="rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Control de Accesos
            </TabsTrigger>
            <TabsTrigger
              value="works"
              className="rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Obras
            </TabsTrigger>
            <TabsTrigger
              value="economics"
              className="rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Analisis Economico
            </TabsTrigger>
            {showUserManagementTab ? (
              <TabsTrigger
                value="users"
                className="rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                Gestion de Usuarios
              </TabsTrigger>
            ) : null}
            {showUpdatesTab ? (
              <TabsTrigger
                value="updates"
                className="rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                Actualizaciones
              </TabsTrigger>
            ) : null}
            <TabsTrigger
              value="help"
              className="rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Ayuda
            </TabsTrigger>
              </TabsList>
            </div>
          </div>
        </div>

        <main className="w-full px-2 sm:px-4 lg:px-6 py-5 sm:py-7">
          <TabsContent value="work-reports" className="m-0 space-y-5">
            {generatePanelOpen ? (
              <GenerateWorkReportPanel
                initialDate={generatePanelDate}
                initialDraft={panelInitialDraft}
                readOnly={panelReadOnly}
                reportIdentifier={panelReportIdentifier}
                saving={generatePanelSaving}
                works={sortedWorks.map((work) => ({ id: String(work.id), number: work.number, name: work.name }))}
                onBack={() => {
                  setGeneratePanelOpen(false);
                  setActiveReport(null);
                }}
                onSave={handleSaveGeneratedWorkReport}
              />
            ) : (
              <>
            <div className="text-center space-y-1">
              <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">Partes de Trabajo</h2>
              <p className="text-sm text-muted-foreground">Gestiona tus partes diarios</p>
            </div>
            {tenantResolving ? (
              <Alert>
                <AlertTitle>Resolviendo tenant...</AlertTitle>
                <AlertDescription>Esperando contexto de tenant para habilitar el módulo offline.</AlertDescription>
              </Alert>
            ) : tenantNeedsPicker ? (
              <TenantPicker
                tenants={tenantPickerOptions}
                selectedTenantId={tenantPickerSelection}
                loading={tenantPickerLoading}
                submitting={tenantPickerSubmitting}
                error={tenantPickerErrorMessage}
                onSelectTenant={setTenantPickerSelection}
                onContinue={() => void handleConfirmTenantSelection()}
                onRetry={handleRetryTenantResolution}
                onLogout={() => {
                  void signOut();
                }}
              />
            ) : tenantUnavailable ? (
              <Alert variant="destructive">
                <AlertTitle>Tenant no resuelto</AlertTitle>
                <AlertDescription>{tenantErrorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button
                className="h-12 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!canCreateWorkReport}
                onClick={() => openGenerateWorkReport()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Generar Parte
              </Button>
              <Button
                className="h-12 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!canCreateWorkReport}
                onClick={() => openGenerateWorkReport(new Date().toISOString().split('T')[0])}
              >
                <CalendarDays className="h-4 w-4 mr-2" />
                Parte de hoy
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() => setTimeTrackingOpen(true)}
              >
                <Timer className="h-4 w-4 mr-2" />
                Fichaje
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-center md:justify-start">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2" disabled={tenantUnavailable}>
                    <FileDown className="h-4 w-4" />
                    Exportacion Masiva
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handlePending('Exportacion semanal'); }}>
                    Exportar semanal
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handlePending('Exportacion mensual'); }}>
                    Exportar mensual
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Database className="h-4 w-4" />
                    Gestion de Datos
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setMetricsOpen(true); }}>
                    Ver resumen en tiempo real
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handlePending('Importar datos'); }}>
                    Importar datos
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handlePending('Exportar datos'); }}>
                    Exportar datos
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2" disabled={tenantUnavailable}>
                    <FileText className="h-4 w-4" />
                    Informe Resumen
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handlePending('Generar informe'); }}>
                    Generar informe
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handlePending('Ver informes guardados'); }}>
                    Informes guardados
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Card className="bg-white">
              <CardHeader className="text-center">
                <CardTitle>Partes de Trabajo ({workReports.length})</CardTitle>
                <CardDescription>
                  {tenantResolving
                    ? 'Resolviendo tenant...'
                    : tenantNeedsPicker
                    ? 'Selecciona un tenant activo para cargar los partes offline.'
                    : tenantUnavailable
                    ? tenantErrorMessage
                    : workReportsLoading
                    ? 'Cargando partes locales...'
                    : workReports.length === 0
                      ? 'No hay partes de trabajo'
                      : 'Guardados en SQLite local (offline-first)'}
                </CardDescription>
              </CardHeader>
              {workReports.length === 0 ? (
                <CardContent className="py-10 flex flex-col items-center gap-4">
                  <ClipboardList className="h-12 w-12 text-slate-400" />
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    Crea tu primer parte de trabajo. Se guardará en local aunque estés offline.
                  </p>
                  <Button
                    variant="outline"
                    disabled={syncing || tenantUnavailable}
                    onClick={() => void handleSyncNow()}
                  >
                    <CloudUpload className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    Sincronizar
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={!canCreateWorkReport}
                    onClick={() => openGenerateWorkReport()}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Generar Primer Parte
                  </Button>
                </CardContent>
              ) : (
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      Fuente de verdad local. Cambios en cola:{' '}
                      <span className="font-medium">
                        {workReports.filter((r) => r.syncStatus !== 'synced').length}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleSyncNow()}
                      disabled={syncing || tenantUnavailable}
                    >
                      <CloudUpload className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                      Sincronizar
                    </Button>
                  </div>

                  <div className="divide-y rounded-md border bg-slate-50">
                    {workReports.slice(0, 20).map((report) => {
                      const reportName = payloadText(report.payload, 'workName') ?? report.title ?? `Parte ${report.date}`;
                      const reportIdentifier = payloadText(report.payload, 'reportIdentifier') ?? report.id.slice(0, 8);
                      const totalHours = payloadNumber(report.payload, 'totalHours');
                      const totalHoursLabel = typeof totalHours === 'number' ? totalHours.toFixed(2) : '--';
                      const isClosed = (payloadBoolean(report.payload, 'isClosed') ?? false) || report.status === 'completed';

                      return (
                        <div key={report.id} className="p-3 flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="text-sm font-medium text-slate-900 truncate">{reportName}</div>
                            <div className="text-xs text-muted-foreground">Identificador: {reportIdentifier}</div>
                            <div className="text-xs text-muted-foreground">Fecha: {report.date}</div>
                            <div className="text-xs text-muted-foreground">Estado: {isClosed ? 'Cerrado' : 'Abierto'}</div>
                            <div className="text-xs text-muted-foreground">Horas totales: {totalHoursLabel}</div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openExistingReport(report)}
                              disabled={tenantUnavailable}
                            >
                              {isClosed ? 'Ver' : 'Editar'}
                            </Button>
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
                                ? 'Error de sincronización'
                                : 'Pendiente de sincronizar'}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {workReports.length > 20 ? (
                    <div className="text-xs text-muted-foreground text-center">
                      Mostrando 20 de {workReports.length}.
                    </div>
                  ) : null}
                </CardContent>
              )}
            </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="access-control" className="m-0 space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-700" />
                  Control de Accesos
                </CardTitle>
                <CardDescription>
                  Layout restaurado. Esta seccion quedara operativa cuando exista endpoint dedicado en la API.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => handlePending('Crear Control de Accesos')}>Crear Control</Button>
                  <Button variant="outline" onClick={() => handlePending('Exportar Control de Accesos')}>
                    Exportar
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  API pendiente para control de accesos en backend actual.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="works" className="m-0 space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Obras</CardTitle>
                <CardDescription>Datos cargados desde la API (`/api/v1/erp/projects`).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => navigate('/projects')}>Abrir gestion completa</Button>
                  <Button variant="outline" onClick={() => loadWorks()} disabled={worksLoading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${worksLoading ? 'animate-spin' : ''}`} />
                    Recargar
                  </Button>
                </div>

                {sortedWorks.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No hay obras visibles.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sortedWorks.slice(0, 12).map((work) => (
                      <div key={work.id} className="rounded-md border bg-white p-3">
                        <div className="font-medium text-sm">{work.name || 'Sin nombre'}</div>
                        <div className="text-xs text-muted-foreground">Codigo: {work.number || '-'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="economics" className="m-0 space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Analisis Economico</CardTitle>
                <CardDescription>
                  Datos enlazados con `/api/v1/summary/*` y `/api/v1/erp/projects/*/budgets`.
                </CardDescription>
              </CardHeader>
            </Card>
            <EconomicsOverviewPanel />
          </TabsContent>

          {showUserManagementTab ? (
            <TabsContent value="users" className="m-0 space-y-4">
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-700" />
                    Gestion de usuarios
                  </CardTitle>
                  <CardDescription>
                    Visible solo para superadmin. El registro web esta deshabilitado.
                  </CardDescription>
                </CardHeader>
              </Card>
              <UsersAdminPanel tenantId={user.tenant_id} isSuperAdmin={Boolean(user.is_super_admin)} />
            </TabsContent>
          ) : null}

          {showUpdatesTab ? (
            <TabsContent value="updates" className="m-0 space-y-4">
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle>Actualizaciones</CardTitle>
                  <CardDescription>Seccion visible sin depender de Supabase.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Modulo de actualizaciones en revision. Por ahora, usa la app desktop para instalar nuevas versiones.
                </CardContent>
              </Card>
            </TabsContent>
          ) : null}

          <TabsContent value="help" className="m-0 space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-blue-700" />
                  Ayuda
                </CardTitle>
                <CardDescription>Soporte y documentacion.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div>Si tienes incidencias con el acceso, contacta con el administrador.</div>
                <div className="text-xs">
                  Nota: el centro de ayuda completo se reactivara cuando este migrado sin Supabase.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </main>

        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Ajustes</DialogTitle>
              <DialogDescription>Perfil y herramientas (API propia).</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <ProfileSettingsPanel user={user} onProfileUpdated={refreshUser} />
              <ToolsSettingsPanel tenantId={user.tenant_id} isSuperAdmin={Boolean(user.is_super_admin)} />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={metricsOpen} onOpenChange={setMetricsOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Resumen en tiempo real</DialogTitle>
              <DialogDescription>Datos desde `/api/v1/dashboard/summary`.</DialogDescription>
            </DialogHeader>
            <DashboardSummaryPanel />
          </DialogContent>
        </Dialog>

        <Dialog open={timeTrackingOpen} onOpenChange={setTimeTrackingOpen}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>Fichaje</DialogTitle>
              <DialogDescription>Tareas y seguimiento de tiempo (API propia).</DialogDescription>
            </DialogHeader>
            <TasksAndTimePanel />
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={Boolean(pendingOverwrite)}
          onOpenChange={(open) => {
            if (!open && !generatePanelSaving) {
              setPendingOverwrite(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Sobrescribir parte abierto?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingOverwrite
                  ? `Ya existe un parte abierto (${pendingOverwrite.reportIdentifier}). Si continúas, se actualizará con los nuevos datos.`
                  : 'Confirma la sobrescritura del parte abierto.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={generatePanelSaving}
                onClick={() => {
                  setPendingOverwrite(null);
                  toast({
                    title: 'Actualización cancelada',
                    description: 'No se aplicaron cambios al parte existente.',
                    variant: 'default',
                  });
                }}
              >
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleConfirmOverwrite()} disabled={generatePanelSaving}>
                {generatePanelSaving ? 'Guardando...' : 'Sobrescribir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Tabs>
    </div>
  );
};

export default Index;
