import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccessPersonalDialog, type AccessPersonalForm } from '@/components/AccessPersonalDialog';
import { CloneOptionsDialog, type CloneOptions } from '@/components/CloneOptionsDialog';
import { DashboardSummaryPanel } from '@/components/api/DashboardSummaryPanel';
import { ProfileSettingsPanel } from '@/components/api/ProfileSettingsPanel';
import { UsersAdminPanel } from '@/components/api/UsersAdminPanel';
import { UpdatesViewer } from '@/components/UpdatesViewer';
import { HelpCenter } from '@/components/HelpCenter';
import { HistoryReportsDialog } from '@/components/HistoryReportsDialog';
import { toast } from '@/hooks/use-toast';
import type { ApiUser } from '@/integrations/api/client';
import type { WorkReport } from '@/offline-db/types';
import { payloadText, type HistoryFilterKey } from '@/pages/indexHelpers';
import type { PendingOverwrite } from '@/hooks/useWorkReportMutations';
import { startupPerfPoint } from '@/utils/startupPerf';

type SettingsDialogTab = 'profile' | 'users' | 'updates' | 'help';
type HelpCenterTab = 'features' | 'faq' | 'chat';
type SettingsDialogConfig = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  user: ApiUser;
  onProfileUpdated: () => Promise<void>;
  showUserManagementTab: boolean;
  showUpdatesTab?: boolean;
  hasPendingUpdate?: boolean;
};

type MetricsDialogConfig = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  workReports: WorkReport[];
  allWorkReportsLoaded: boolean;
  allWorkReportsLoading: boolean;
};

type AccessPersonalDialogConfig = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: AccessPersonalForm;
  setForm: Dispatch<SetStateAction<AccessPersonalForm>>;
  onSave: () => void;
  onCancel: () => void;
};

type HistoryDialogConfig = {
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  historyEnabledFilters: HistoryFilterKey[];
  toggleHistoryFilter: (filterKey: HistoryFilterKey) => void;
  historySelectedFiltersCount: number;
  historyForemanFilter: string;
  setHistoryForemanFilter: Dispatch<SetStateAction<string>>;
  historyWeekFilter: string;
  setHistoryWeekFilter: Dispatch<SetStateAction<string>>;
  historyMonthFilter: string;
  setHistoryMonthFilter: Dispatch<SetStateAction<string>>;
  historyWorkNameFilter: string;
  setHistoryWorkNameFilter: Dispatch<SetStateAction<string>>;
  historyDateFilter: string;
  setHistoryDateFilter: Dispatch<SetStateAction<string>>;
  historyDatePickerOpen: boolean;
  setHistoryDatePickerOpen: Dispatch<SetStateAction<boolean>>;
  selectedHistoryDate: Date | null;
  allWorkReports: WorkReport[];
  allWorkReportsLoaded: boolean;
  allWorkReportsLoading: boolean;
  filteredHistoryReports: WorkReport[];
  historyAppliedFiltersCount: number;
  clearHistoryFilters: () => void;
  tenantUnavailable: boolean;
  workReportsReadOnlyByRole: boolean;
  onPending: (featureName: string) => void;
  onOpenCloneFromHistoryDialog: (report: WorkReport) => void;
  onOpenHistoryReport: (report: WorkReport) => void;
  onDeleteReport?: (report: WorkReport) => void;
};

type CloneDialogConfig = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  sourceReport: WorkReport | null;
  setSourceReport: Dispatch<SetStateAction<WorkReport | null>>;
  onConfirm: (options: CloneOptions) => void;
};

type OverwriteDialogConfig = {
  pendingOverwrite: PendingOverwrite | null;
  setPendingOverwrite: Dispatch<SetStateAction<PendingOverwrite | null>>;
  generatePanelSaving: boolean;
  onConfirmOverwrite: () => Promise<void>;
};

type IndexDialogsProps = {
  settings: SettingsDialogConfig;
  metrics: MetricsDialogConfig;
  accessPersonal: AccessPersonalDialogConfig;
  history: HistoryDialogConfig;
  clone: CloneDialogConfig;
  overwrite: OverwriteDialogConfig;
};

export const IndexDialogs = ({
  settings,
  metrics,
  accessPersonal,
  history,
  clone,
  overwrite,
}: IndexDialogsProps) => {
  const [settingsTab, setSettingsTab] = useState<SettingsDialogTab>('profile');
  const [helpCenterTab, setHelpCenterTab] = useState<HelpCenterTab>('features');
  const [helpCenterOpenRequestKey, setHelpCenterOpenRequestKey] = useState(0);

  useEffect(() => {
    startupPerfPoint('panel:IndexDialogs mounted');
  }, []);

  useEffect(() => {
    const handleOpenHelpCenter = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: HelpCenterTab }>).detail;
      setSettingsTab('help');
      setHelpCenterTab(detail?.tab ?? 'faq');
      setHelpCenterOpenRequestKey((current) => current + 1);
      settings.setOpen(true);
    };

    document.addEventListener('open-help-center', handleOpenHelpCenter as EventListener);
    return () => {
      document.removeEventListener('open-help-center', handleOpenHelpCenter as EventListener);
    };
  }, [settings]);

  useEffect(() => {
    if (!settings.open) {
      setSettingsTab('profile');
      setHelpCenterTab('features');
    }
  }, [settings.open]);

  return (
    <>
      <AccessPersonalDialog
        open={accessPersonal.open}
        onOpenChange={accessPersonal.onOpenChange}
        form={accessPersonal.form}
        setForm={accessPersonal.setForm}
        onSave={accessPersonal.onSave}
        onCancel={accessPersonal.onCancel}
      />

      <Dialog open={settings.open} onOpenChange={settings.setOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Ajustes</DialogTitle>
            <DialogDescription>Perfil, actualizaciones y ayuda.</DialogDescription>
          </DialogHeader>
          <Tabs value={settingsTab} onValueChange={(value) => setSettingsTab(value as SettingsDialogTab)} className="w-full">
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
              <TabsTrigger value="profile" className="text-sm sm:text-[15px]">
                Perfil
              </TabsTrigger>
              {settings.showUserManagementTab ? (
                <TabsTrigger value="users" className="text-sm sm:text-[15px]">
                  Gestion de usuarios
                </TabsTrigger>
              ) : null}
              {settings.showUpdatesTab ? (
                <TabsTrigger value="updates" className="relative text-sm sm:text-[15px]">
                  Actualizaciones
                  {settings.hasPendingUpdate ? (
                    <span
                      className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-orange-400"
                      aria-label="Actualizaciones disponibles"
                    />
                  ) : null}
                </TabsTrigger>
              ) : null}
              <TabsTrigger value="help" className="text-sm sm:text-[15px]">
                Ayuda
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-4 max-h-[70vh] overflow-y-auto">
              <ProfileSettingsPanel user={settings.user} onProfileUpdated={settings.onProfileUpdated} />
            </TabsContent>

            {settings.showUserManagementTab ? (
              <TabsContent value="users" className="mt-4 max-h-[70vh] overflow-y-auto">
                <UsersAdminPanel
                  tenantId={settings.user.tenant_id}
                  isSuperAdmin={Boolean(settings.user.is_super_admin)}
                />
              </TabsContent>
            ) : null}

            {settings.showUpdatesTab ? (
              <TabsContent value="updates" className="mt-4 max-h-[70vh] overflow-y-auto">
                <UpdatesViewer />
              </TabsContent>
            ) : null}

            <TabsContent value="help" className="mt-4 max-h-[70vh] overflow-y-auto">
              <HelpCenter initialTab={helpCenterTab} openRequestKey={helpCenterOpenRequestKey} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={metrics.open} onOpenChange={metrics.setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Resumen en tiempo real</DialogTitle>
          </DialogHeader>
          {!metrics.allWorkReportsLoaded && metrics.allWorkReportsLoading && metrics.workReports.length > 0 ? (
            <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              Mostrando datos disponibles mientras termina la carga completa en segundo plano.
            </div>
          ) : null}
          {metrics.workReports.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Cargando partes disponibles...
            </div>
          ) : (
            <DashboardSummaryPanel workReports={metrics.workReports} />
          )}
        </DialogContent>
      </Dialog>

      <HistoryReportsDialog
        open={history.open}
        onOpenChange={history.onOpenChange}
        historyEnabledFilters={history.historyEnabledFilters}
        toggleHistoryFilter={history.toggleHistoryFilter}
        historySelectedFiltersCount={history.historySelectedFiltersCount}
        historyForemanFilter={history.historyForemanFilter}
        setHistoryForemanFilter={history.setHistoryForemanFilter}
        historyWeekFilter={history.historyWeekFilter}
        setHistoryWeekFilter={history.setHistoryWeekFilter}
        historyMonthFilter={history.historyMonthFilter}
        setHistoryMonthFilter={history.setHistoryMonthFilter}
        historyWorkNameFilter={history.historyWorkNameFilter}
        setHistoryWorkNameFilter={history.setHistoryWorkNameFilter}
        historyDateFilter={history.historyDateFilter}
        setHistoryDateFilter={history.setHistoryDateFilter}
        historyDatePickerOpen={history.historyDatePickerOpen}
        setHistoryDatePickerOpen={history.setHistoryDatePickerOpen}
        selectedHistoryDate={history.selectedHistoryDate}
        allWorkReports={history.allWorkReports}
        allWorkReportsLoaded={history.allWorkReportsLoaded}
        allWorkReportsLoading={history.allWorkReportsLoading}
        filteredHistoryReports={history.filteredHistoryReports}
        historyAppliedFiltersCount={history.historyAppliedFiltersCount}
        clearHistoryFilters={history.clearHistoryFilters}
        tenantUnavailable={history.tenantUnavailable}
        workReportsReadOnlyByRole={history.workReportsReadOnlyByRole}
        onPending={history.onPending}
        onOpenCloneFromHistoryDialog={history.onOpenCloneFromHistoryDialog}
        onOpenHistoryReport={history.onOpenHistoryReport}
        onDeleteReport={history.onDeleteReport}
      />

      <CloneOptionsDialog
        open={clone.open}
        onOpenChange={(open) => {
          clone.setOpen(open);
          if (!open) {
            clone.setSourceReport(null);
          }
        }}
        onConfirm={clone.onConfirm}
        reportWorkName={
          clone.sourceReport
            ? payloadText(clone.sourceReport.payload, 'workName') ??
              clone.sourceReport.title ??
              `Parte ${clone.sourceReport.date}`
            : undefined
        }
        originalDate={clone.sourceReport?.date}
      />

      <AlertDialog
        open={Boolean(overwrite.pendingOverwrite)}
        onOpenChange={(open) => {
          if (!open && !overwrite.generatePanelSaving) {
            overwrite.setPendingOverwrite(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Sobrescribir parte abierto?</AlertDialogTitle>
            <AlertDialogDescription>
              {overwrite.pendingOverwrite
                ? `Ya existe un parte abierto (${overwrite.pendingOverwrite.reportIdentifier}). Si continúas, se actualizará con los nuevos datos.`
                : 'Confirma la sobrescritura del parte abierto.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={overwrite.generatePanelSaving}
              onClick={() => {
                overwrite.setPendingOverwrite(null);
                toast({
                  title: 'Actualización cancelada',
                  description: 'No se aplicaron cambios al parte existente.',
                  variant: 'default',
                });
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void overwrite.onConfirmOverwrite()}
              disabled={overwrite.generatePanelSaving}
            >
              {overwrite.generatePanelSaving ? 'Guardando...' : 'Sobrescribir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
