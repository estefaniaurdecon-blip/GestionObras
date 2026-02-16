import type { Dispatch, SetStateAction } from 'react';
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
import { AccessPersonalDialog, type AccessPersonalForm } from '@/components/AccessPersonalDialog';
import { CloneOptionsDialog, type CloneOptions } from '@/components/CloneOptionsDialog';
import { DashboardSummaryPanel } from '@/components/api/DashboardSummaryPanel';
import { ProfileSettingsPanel } from '@/components/api/ProfileSettingsPanel';
import { ToolsSettingsPanel } from '@/components/api/ToolsSettingsPanel';
import { HistoryReportsDialog } from '@/components/HistoryReportsDialog';
import { toast } from '@/hooks/use-toast';
import type { ApiUser } from '@/integrations/api/client';
import type { WorkReport } from '@/offline-db/types';
import { payloadText, type HistoryFilterKey } from '@/pages/indexHelpers';
import type { PendingOverwrite } from '@/hooks/useWorkReportMutations';

type SettingsDialogConfig = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  user: ApiUser;
  onProfileUpdated: () => Promise<void>;
};

type MetricsDialogConfig = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
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
  filteredHistoryReports: WorkReport[];
  historyAppliedFiltersCount: number;
  clearHistoryFilters: () => void;
  tenantUnavailable: boolean;
  workReportsReadOnlyByRole: boolean;
  onPending: (featureName: string) => void;
  onOpenCloneFromHistoryDialog: (report: WorkReport) => void;
  onOpenHistoryReport: (report: WorkReport) => void;
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
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Ajustes</DialogTitle>
            <DialogDescription>Perfil y herramientas (API propia).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ProfileSettingsPanel user={settings.user} onProfileUpdated={settings.onProfileUpdated} />
            <ToolsSettingsPanel
              tenantId={settings.user.tenant_id}
              isSuperAdmin={Boolean(settings.user.is_super_admin)}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={metrics.open} onOpenChange={metrics.setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Resumen en tiempo real</DialogTitle>
            <DialogDescription>Datos desde `/api/v1/dashboard/summary`.</DialogDescription>
          </DialogHeader>
          <DashboardSummaryPanel />
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
        filteredHistoryReports={history.filteredHistoryReports}
        historyAppliedFiltersCount={history.historyAppliedFiltersCount}
        clearHistoryFilters={history.clearHistoryFilters}
        tenantUnavailable={history.tenantUnavailable}
        workReportsReadOnlyByRole={history.workReportsReadOnlyByRole}
        onPending={history.onPending}
        onOpenCloneFromHistoryDialog={history.onOpenCloneFromHistoryDialog}
        onOpenHistoryReport={history.onOpenHistoryReport}
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
