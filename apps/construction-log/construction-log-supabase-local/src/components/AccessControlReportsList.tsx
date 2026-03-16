import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { AccessReport } from '@/types/accessControl';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Building2, Calendar, CheckSquare, ChevronDown, Copy, Edit, Trash2, Users, X } from 'lucide-react';

type AccessControlReportsListProps = {
  accessControlLoading: boolean;
  accessControlReports: AccessReport[];
  selectionMode: boolean;
  selectedReports: ReadonlySet<string>;
  lightButtonClass: string;
  onEnterSelectionMode: () => void;
  onCancelSelection: () => void;
  onBulkDelete: () => void;
  onToggleReportSelection: (reportId: string) => void;
  onToggleSiteSelection: (reportIds: string[], allSelected: boolean) => void;
  onCloneReport: (report: AccessReport) => Promise<void> | void;
  onEditReport: (report: AccessReport) => void;
  onDeleteReport: (reportId: string) => Promise<void> | void;
};

const getGroupStats = (reports: AccessReport[]) => {
  const totalReports = reports.length;
  const totalPersonal = reports.reduce((sum, report) => {
    const seenDnis = new Set<string>();
    const validEntries = report.personalEntries.filter((entry) => {
      const dni = entry.identifier.trim();
      if (!dni || seenDnis.has(dni)) return false;
      seenDnis.add(dni);
      return true;
    });
    return sum + validEntries.length;
  }, 0);
  const totalMachinery = reports.reduce(
    (sum, report) => sum + report.machineryEntries.filter((entry) => entry.identifier.trim() !== '').length,
    0,
  );
  const totalCompanies = new Set(
    reports.flatMap((report) => {
      const personal = report.personalEntries
        .filter((entry) => entry.identifier.trim() !== '')
        .map((entry) => entry.company);
      const machinery = report.machineryEntries
        .filter((entry) => entry.identifier.trim() !== '')
        .map((entry) => entry.company);
      return [...personal, ...machinery];
    }),
  ).size;

  return { totalReports, totalPersonal, totalMachinery, totalCompanies };
};

const getPersonalCount = (report: AccessReport) => {
  const seenDnis = new Set<string>();
  return report.personalEntries.filter((entry) => {
    const dni = entry.identifier.trim();
    if (!dni || seenDnis.has(dni)) return false;
    seenDnis.add(dni);
    return true;
  }).length;
};

const getMachineryCount = (report: AccessReport) =>
  report.machineryEntries.filter((entry) => entry.identifier.trim() !== '').length;

export const AccessControlReportsList = ({
  accessControlLoading,
  accessControlReports,
  selectionMode,
  selectedReports,
  lightButtonClass,
  onEnterSelectionMode,
  onCancelSelection,
  onBulkDelete,
  onToggleReportSelection,
  onToggleSiteSelection,
  onCloneReport,
  onEditReport,
  onDeleteReport,
}: AccessControlReportsListProps) => {
  const groupedReports = useMemo(() => {
    const groups = new Map<string, Map<string, AccessReport[]>>();

    accessControlReports.forEach((report) => {
      const dateKey = report.date;
      const siteKey = report.siteName || 'Sin obra';

      if (!groups.has(dateKey)) {
        groups.set(dateKey, new Map());
      }

      const dateGroup = groups.get(dateKey)!;
      if (!dateGroup.has(siteKey)) {
        dateGroup.set(siteKey, []);
      }

      dateGroup.get(siteKey)!.push(report);
    });

    return Array.from(groups.entries())
      .sort((left, right) => new Date(right[0]).getTime() - new Date(left[0]).getTime())
      .map(([dateKey, siteGroups]) => ({
        dateKey,
        siteGroups: Array.from(siteGroups.entries()).map(([siteName, reports]) => ({
          siteName,
          reports: reports.sort(
            (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
          ),
        })),
      }));
  }, [accessControlReports]);

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="items-center text-center">
        <CardTitle className="app-page-title">Control de accesos</CardTitle>
        <CardDescription className="app-page-subtitle">
          {accessControlLoading
            ? 'Cargando controles de acceso...'
            : `${accessControlReports.length} ${accessControlReports.length === 1 ? 'reporte' : 'reportes'}`}
        </CardDescription>
        {accessControlReports.length > 0 ? (
          <div className="flex justify-center gap-2 pt-2">
            {selectionMode ? (
              <>
                <Button
                  variant="destructive"
                  className="app-btn-soft bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:text-destructive-foreground"
                  onClick={onBulkDelete}
                  disabled={selectedReports.size === 0}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar ({selectedReports.size})
                </Button>
                <Button variant="outline" className={lightButtonClass} onClick={onCancelSelection}>
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={onEnterSelectionMode} className={lightButtonClass}>
                <CheckSquare className="mr-2 h-4 w-4" />
                Selección múltiple
              </Button>
            )}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {accessControlReports.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No hay controles de acceso guardados.</div>
        ) : (
          <div className="space-y-4">
            {groupedReports.map(({ dateKey, siteGroups }) => {
              const totalReportsInDate = siteGroups.reduce((sum, group) => sum + group.reports.length, 0);

              return (
                <Collapsible key={dateKey}>
                  <Card className="border border-slate-200 shadow-none">
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer pb-3 transition-colors hover:bg-accent/50">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <ChevronDown className="h-5 w-5 text-primary transition-transform data-[state=closed]:rotate-[-90deg]" />
                            <Calendar className="h-5 w-5 text-primary" />
                            <CardTitle className="app-card-title text-slate-700">
                              {format(new Date(dateKey), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
                            </CardTitle>
                          </div>
                          <Badge className="border-0 bg-orange-500 text-white hover:bg-orange-500">
                            {totalReportsInDate} {totalReportsInDate === 1 ? 'reporte' : 'reportes'}
                          </Badge>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-3 pt-0">
                        {siteGroups.map(({ siteName, reports }) => {
                          const siteReportIds = reports.map((report) => report.id);
                          const allSelected = siteReportIds.every((id) => selectedReports.has(id));
                          const selectedCount = siteReportIds.filter((id) => selectedReports.has(id)).length;
                          const stats = getGroupStats(reports);

                          return (
                            <Collapsible key={siteName}>
                              <Card className="border border-slate-200 bg-slate-50/50 shadow-none">
                                <CollapsibleTrigger asChild>
                                  <CardHeader className="cursor-pointer pb-2 pt-3 transition-colors hover:bg-accent/30">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-2">
                                        {selectionMode ? (
                                          <Checkbox
                                            checked={allSelected}
                                            className="mr-1"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              onToggleSiteSelection(siteReportIds, allSelected);
                                            }}
                                          />
                                        ) : null}
                                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=closed]:rotate-[-90deg]" />
                                        <Building2 className="h-4 w-4 text-muted-foreground" />
                                        <span className="app-field-label">{siteName}</span>
                                      </div>
                                      <Badge className="border-0 bg-orange-500 text-white hover:bg-orange-500">
                                        {selectionMode && selectedCount > 0 ? `${selectedCount}/` : null}
                                        {reports.length} {reports.length === 1 ? 'reporte' : 'reportes'}
                                      </Badge>
                                    </div>
                                  </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <CardContent className="space-y-3 pb-3 pt-0">
                                    <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                      <Card className="border-slate-200 bg-white shadow-none">
                                        <CardContent className="p-3">
                                          <p className="truncate text-xs text-muted-foreground">Total Partes</p>
                                          <p className="text-2xl font-bold text-slate-800">{stats.totalReports}</p>
                                        </CardContent>
                                      </Card>
                                      <Card className="border-slate-200 bg-white shadow-none">
                                        <CardContent className="p-3">
                                          <p className="truncate text-xs text-muted-foreground">Personal</p>
                                          <p className="text-2xl font-bold text-slate-800">{stats.totalPersonal}</p>
                                        </CardContent>
                                      </Card>
                                      <Card className="border-slate-200 bg-white shadow-none">
                                        <CardContent className="p-3">
                                          <p className="truncate text-xs text-muted-foreground">Maquinaria</p>
                                          <p className="text-2xl font-bold text-slate-800">{stats.totalMachinery}</p>
                                        </CardContent>
                                      </Card>
                                      <Card className="border-slate-200 bg-white shadow-none">
                                        <CardContent className="p-3">
                                          <p className="truncate text-xs text-muted-foreground">Empresas</p>
                                          <p className="text-2xl font-bold text-slate-800">{stats.totalCompanies}</p>
                                        </CardContent>
                                      </Card>
                                    </div>

                                    {reports.map((report) => (
                                      <Card
                                        key={report.id}
                                        className={`border-slate-200 bg-white shadow-none ${
                                          selectionMode && selectedReports.has(report.id) ? 'ring-2 ring-primary' : ''
                                        }`}
                                        onClick={selectionMode ? () => onToggleReportSelection(report.id) : undefined}
                                      >
                                        <CardContent className="space-y-3 p-3 sm:p-4">
                                          <div className="flex items-start justify-between gap-3">
                                            {selectionMode ? (
                                              <Checkbox
                                                checked={selectedReports.has(report.id)}
                                                onClick={(event) => event.stopPropagation()}
                                                onCheckedChange={() => onToggleReportSelection(report.id)}
                                                className="mt-1"
                                              />
                                            ) : null}
                                            <div className="min-w-0 flex-1 space-y-3">
                                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Users className="h-4 w-4 flex-shrink-0" />
                                                <span className="truncate">Responsable: {report.responsible}</span>
                                              </div>
                                              <div className="flex flex-wrap gap-2">
                                                <Badge className="border-0 bg-orange-500 text-white hover:bg-orange-500">
                                                  {getPersonalCount(report)} Entradas de Personal
                                                </Badge>
                                                <Badge variant="outline">
                                                  {getMachineryCount(report)} Entradas de Maquinaria
                                                </Badge>
                                              </div>
                                            </div>
                                            {!selectionMode ? (
                                              <div className="flex shrink-0 gap-1">
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => void onCloneReport(report)}
                                                  className="h-8 w-8 p-0"
                                                >
                                                  <Copy className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => onEditReport(report)}
                                                  className="h-8 w-8 p-0"
                                                >
                                                  <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => void onDeleteReport(report.id)}
                                                  className="h-8 w-8 p-0 text-destructive"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </div>
                                            ) : null}
                                          </div>
                                          <div className="border-t border-border pt-2 text-xs text-muted-foreground">
                                            Creado:{' '}
                                            {new Date(report.createdAt).toLocaleDateString('es-ES', {
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </div>
                                        </CardContent>
                                      </Card>
                                    ))}
                                  </CardContent>
                                </CollapsibleContent>
                              </Card>
                            </Collapsible>
                          );
                        })}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
