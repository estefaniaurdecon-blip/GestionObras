import type { ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorkReport } from '@/offline-db/types';
import { payloadBoolean, payloadNumber, payloadText } from '@/pages/indexHelpers';
import {
  AlarmClockCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardPen,
  ClipboardList,
  CloudUpload,
  Copy,
  FileDown,
  FileInput,
  FileOutput,
  FileText,
  Pencil,
  Plus,
  Trash2,
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
  onOpenMetrics: () => void;
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

const ToolsOptionButton = ({ icon, label, disabled, onClick }: ToolsOptionButtonProps) => (
  <Button
    type="button"
    variant="outline"
    disabled={disabled}
    onClick={onClick}
    className="h-28 w-[150px] shrink-0 flex-col justify-center gap-2 rounded-2xl border-slate-300 bg-white px-3 text-slate-700 shadow-sm hover:bg-slate-50 [&_svg]:h-9 [&_svg]:w-9 md:h-32 md:w-[170px] md:[&_svg]:h-10 md:[&_svg]:w-10 lg:h-28 lg:w-[170px]"
  >
    {icon}
    <span className="max-w-full whitespace-normal break-words text-center text-[15px] font-medium leading-snug sm:text-base">
      {label}
    </span>
  </Button>
);

const ToolActions = ({
  activeToolsTab,
  tenantUnavailable,
  onOpenMetrics,
  onPending,
}: {
  activeToolsTab: ToolsActionTab;
  tenantUnavailable: boolean;
  onOpenMetrics: () => void;
  onPending: (featureName: string) => void;
}) => {
  if (activeToolsTab === 'bulk-export') {
    return (
      <>
        <ToolsOptionButton
          icon={<CalendarNumberIcon value="1" />}
          label="Exportar día"
          disabled={tenantUnavailable}
          onClick={() => onPending('Exportacion diaria')}
        />
        <ToolsOptionButton
          icon={<CalendarNumberIcon value="7" />}
          label="Exportar semanal"
          disabled={tenantUnavailable}
          onClick={() => onPending('Exportacion semanal')}
        />
        <ToolsOptionButton
          icon={<CalendarNumberIcon value="30" />}
          label="Exportar mensual"
          disabled={tenantUnavailable}
          onClick={() => onPending('Exportacion mensual')}
        />
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
        <ToolsOptionButton
          icon={<FileInput className="h-8 w-8 text-indigo-600" />}
          label="Importar datos"
          onClick={() => onPending('Importar datos')}
        />
        <ToolsOptionButton
          icon={<FileOutput className="h-8 w-8 text-indigo-600" />}
          label="Exportar datos"
          onClick={() => onPending('Exportar datos')}
        />
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
  tenantUnavailable,
  onOpenMetrics,
  onPending,
}: ToolsPanelContentProps) => {
  const subtitle =
    activeToolsTab === 'bulk-export'
      ? 'Genera un archivo ZIP con múltiples partes de trabajo.'
      : 'Selecciona una accion para continuar.';

  return (
    <Card className="bg-white">
      <CardHeader className="pb-3 text-center">
        <CardTitle className="text-xl sm:text-2xl">{TOOLS_LABELS[activeToolsTab]}</CardTitle>
        <CardDescription className="text-sm sm:text-[15px]">{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <ToolActions
            activeToolsTab={activeToolsTab}
            tenantUnavailable={tenantUnavailable}
            onOpenMetrics={onOpenMetrics}
            onPending={onPending}
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
    ? 'h-11 w-[160px] justify-center bg-blue-600 text-[16px] text-white hover:bg-blue-700'
    : 'h-10 w-[140px] justify-center bg-blue-600 text-white hover:bg-blue-700';
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
                <Plus className={`mr-2 ${isAndroidPlatform ? 'h-5 w-5' : 'h-4 w-4'}`} />
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

            <div aria-hidden className="hidden sm:block sm:w-[140px]" />
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
            <Button
              className={`${isAndroidPlatform ? 'text-[16px]' : ''} bg-blue-600 hover:bg-blue-700 text-white`}
              disabled={!canCreateWorkReport}
              onClick={onGenerateWorkReport}
            >
              <Plus className={`${isAndroidPlatform ? 'h-5 w-5' : 'h-4 w-4'} mr-2`} />
              Generar Primer Parte
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
                    {syncSummary.pendingSync > 0 ? ` · Pendientes: ${syncSummary.pendingSync}` : ''}
                    {syncSummary.errorSync > 0 ? ` · Con error: ${syncSummary.errorSync}` : ''}
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
                  <div key={report.id} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className={reportNameClass}>{reportName}</div>
                      <div className={reportDetailClass}>Identificador: {reportIdentifier}</div>
                      <div className={reportDetailClass}>Fecha: {report.date}</div>
                      <div className={reportDetailClass}>Estado: {isClosed ? 'Cerrado' : 'Abierto'}</div>
                      <div className={reportDetailClass}>Horas totales: {totalHoursLabel}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="flex items-center gap-0.5 px-1 py-1">
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
