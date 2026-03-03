import { useEffect, type ChangeEvent, type RefObject, type SetStateAction, type Dispatch } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { AccessReport } from '@/types/accessControl';
import { startupPerfPoint } from '@/utils/startupPerf';
import { FileDown, FileText, Plus, Save, Truck, Upload, Users } from 'lucide-react';

type WorkOption = {
  id: string;
  number?: string | null;
  name?: string | null;
};

type AccessPersonalEntryPreview = {
  id: string;
  name: string;
  dni: string;
  company: string;
  entryTime: string;
  exitTime: string;
  activity: string;
  signature: string;
};

type AccessControlTabProps = {
  accessControlLoading: boolean;
  accessControlReports: AccessReport[];
  accessReportWorkFilter: string;
  setAccessReportWorkFilter: (value: string) => void;
  accessReportPeriodFilter: string;
  setAccessReportPeriodFilter: (value: string) => void;
  sortedWorks: WorkOption[];
  accessImportInputRef: RefObject<HTMLInputElement | null>;
  handleNewAccessControlRecord: () => void;
  handleExportAccessControlData: () => Promise<void> | void;
  handleAccessDataFileSelected: (event: ChangeEvent<HTMLInputElement>) => Promise<void> | void;
  handleGenerateAccessControlReport: () => void;
  accessPersonalEntries: AccessPersonalEntryPreview[];
  handleOpenAccessPersonalDialog: () => void;
  handlePending: (featureName: string) => void;
  accessObservations: string;
  setAccessObservations: Dispatch<SetStateAction<string>>;
  accessAdditionalTasks: string;
  setAccessAdditionalTasks: Dispatch<SetStateAction<string>>;
  handleSaveAccessControl: () => Promise<void> | void;
};

export const AccessControlTab = ({
  accessControlLoading,
  accessControlReports,
  accessReportWorkFilter,
  setAccessReportWorkFilter,
  accessReportPeriodFilter,
  setAccessReportPeriodFilter,
  sortedWorks,
  accessImportInputRef,
  handleNewAccessControlRecord,
  handleExportAccessControlData,
  handleAccessDataFileSelected,
  handleGenerateAccessControlReport,
  accessPersonalEntries,
  handleOpenAccessPersonalDialog,
  handlePending,
  accessObservations,
  setAccessObservations,
  accessAdditionalTasks,
  setAccessAdditionalTasks,
  handleSaveAccessControl,
}: AccessControlTabProps) => {
  useEffect(() => {
    startupPerfPoint('panel:AccessControlTab mounted');
  }, []);

  return (
    <TabsContent value="access-control" className="m-0 space-y-4">
      <Card className="bg-white">
        <CardHeader className="items-center text-center space-y-2">
          <CardTitle className="text-xl sm:text-3xl font-bold text-slate-800">
            Control de Accesos
          </CardTitle>
          <CardDescription className="text-sm text-slate-600">
            Supervisión de Obra
          </CardDescription>
          <Button
            className="mt-2 bg-blue-600 text-white hover:bg-blue-700"
            onClick={handleNewAccessControlRecord}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Registro
          </Button>
        </CardHeader>
      </Card>

      <Card className="bg-white">
        <CardHeader className="text-center">
          <CardTitle>Gestión de Datos</CardTitle>
          <CardDescription>
            Guarda todos tus partes en un archivo o carga datos guardados previamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                void handleExportAccessControlData();
              }}
              className="w-full sm:w-auto"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Guardar Datos
            </Button>
            <Button
              variant="outline"
              onClick={() => accessImportInputRef.current?.click()}
              className="w-full sm:w-auto"
            >
              <Upload className="mr-2 h-4 w-4" />
              Cargar Datos
            </Button>
            <input
              ref={accessImportInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                void handleAccessDataFileSelected(event);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader className="text-center">
          <CardTitle>Generar Informe</CardTitle>
          <CardDescription>Sistema de Gestión de Obras</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nombre de Obra</label>
            <Select value={accessReportWorkFilter} onValueChange={setAccessReportWorkFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todas las obras" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las obras</SelectItem>
                {sortedWorks.map((work) => (
                  <SelectItem key={work.id} value={work.id}>
                    {(work.number ? `${work.number} - ` : '') + (work.name || 'Sin nombre')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Periodo</label>
            <Select value={accessReportPeriodFilter} onValueChange={setAccessReportPeriodFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todas las obras" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las obras</SelectItem>
                <SelectItem value="daily">Diario</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full bg-blue-600 text-white hover:bg-blue-700"
            onClick={handleGenerateAccessControlReport}
          >
            <FileText className="mr-2 h-4 w-4" />
            Generar Informe
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader className="text-center">
          <CardTitle>Control de Accesos</CardTitle>
          <CardDescription>
            {accessControlLoading
              ? 'Cargando controles de acceso...'
              : accessControlReports.length === 0
                ? 'No hay controles de acceso guardados'
                : `${accessControlReports.length} control(es) guardado(s) en local`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accessControlReports.length > 0 ? (
            <div className="space-y-2">
              {accessControlReports.slice(0, 5).map((report) => (
                <div key={report.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                  <div className="font-medium text-slate-900">{report.siteName || 'Sin obra'}</div>
                  <div className="text-muted-foreground">
                    Fecha: {report.date} | Responsable: {report.responsible || '-'}
                  </div>
                  <div className="text-muted-foreground">
                    Personal: {report.personalEntries.length} | Maquinaria: {report.machineryEntries.length}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <div className="flex flex-col items-center gap-3 text-center">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Users className="h-5 w-5" />
              Personal
            </CardTitle>
            <CardDescription>Registro de acceso del personal</CardDescription>
            <Button
              onClick={handleOpenAccessPersonalDialog}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Añadir Personal
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {accessPersonalEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay registros de personal. Haz clic en "Añadir Personal" para empezar.
            </div>
          ) : (
            <div className="space-y-2">
              {accessPersonalEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
                >
                  <div className="font-medium text-slate-900">{entry.name}</div>
                  <div className="text-xs text-muted-foreground">DNI: {entry.dni}</div>
                  <div className="text-xs text-muted-foreground">Empresa: {entry.company}</div>
                  <div className="text-xs text-muted-foreground">
                    Horario: {entry.entryTime} - {entry.exitTime}
                  </div>
                  {entry.activity ? (
                    <div className="text-xs text-muted-foreground">Actividad: {entry.activity}</div>
                  ) : null}
                  <div className="mt-1">
                    {entry.signature ? (
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                        Firma guardada
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                        Sin firma
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <div className="flex flex-col items-center gap-3 text-center">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Truck className="h-5 w-5" />
              Maquinaria
            </CardTitle>
            <CardDescription>Registro de acceso de maquinaria</CardDescription>
            <Button
              onClick={() => handlePending('Añadir maquinaria en control de accesos')}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Añadir Máquina
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No hay registros de maquinaria. Haz clic en "Añadir Máquina" para empezar.
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader className="text-center">
          <CardTitle>Observaciones</CardTitle>
          <CardDescription>Notas adicionales sobre el control de accesos</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={accessObservations}
            onChange={(event) => setAccessObservations(event.target.value)}
            placeholder="Observaciones, incidencias o notas adicionales..."
            rows={4}
          />
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader className="text-center">
          <CardTitle>Tareas adicionales</CardTitle>
          <CardDescription>Anota tareas o acciones pendientes relacionadas con el acceso</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={accessAdditionalTasks}
            onChange={(event) => setAccessAdditionalTasks(event.target.value)}
            placeholder="Tareas adicionales..."
            rows={4}
          />
          <Button
            className="w-full bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => {
              void handleSaveAccessControl();
            }}
          >
            <Save className="mr-2 h-4 w-4" />
            Guardar
          </Button>
        </CardContent>
      </Card>
    </TabsContent>
  );
};
