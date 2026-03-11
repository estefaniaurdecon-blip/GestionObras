import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AccessReport } from '@/types/accessControl';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Building2,
  Calendar,
  CheckSquare,
  ChevronDown,
  Copy,
  Download,
  Edit,
  FileText,
  Plus,
  Trash2,
  Truck,
  Upload,
  Users,
  X,
} from 'lucide-react';

interface AccessControlListProps {
  reports: AccessReport[];
  onCreateNew: () => void;
  onEdit: (report: AccessReport) => void;
  onClone: (report: AccessReport) => void;
  onDelete: (reportId: string) => void;
  onBulkDelete?: (reportIds: string[]) => void;
  onExportData: () => void;
  onImportData: (file: File) => void;
  onGenerateReport: (siteName?: string, dateRange?: string) => void;
  loading?: boolean;
  listOnly?: boolean;
}

export const AccessControlList = ({
  reports,
  onCreateNew,
  onEdit,
  onClone,
  onDelete,
  onBulkDelete,
  onExportData,
  onImportData,
  onGenerateReport,
  loading = false,
  listOnly = false,
}: AccessControlListProps) => {
  const { t } = useTranslation();
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());

  const toggleReportSelection = (reportId: string) => {
    setSelectedReports((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  };

  const selectAllInGroup = (reportIds: string[]) => {
    setSelectedReports((prev) => {
      const next = new Set(prev);
      reportIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const deselectAllInGroup = (reportIds: string[]) => {
    setSelectedReports((prev) => {
      const next = new Set(prev);
      reportIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedReports.size === 0) return;

    if (onBulkDelete) {
      onBulkDelete(Array.from(selectedReports));
    } else {
      selectedReports.forEach((id) => onDelete(id));
    }

    setSelectedReports(new Set());
    setSelectionMode(false);
  };

  const cancelSelection = () => {
    setSelectedReports(new Set());
    setSelectionMode(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onImportData(file);
    event.target.value = '';
  };

  const uniqueSites = Array.from(new Set(reports.map((report) => report.siteName))).filter(Boolean);

  const getGroupStats = (groupReports: AccessReport[]) => {
    const totalReports = groupReports.length;

    const totalPersonal = groupReports.reduce((sum, report) => {
      const seenDnis = new Set<string>();
      const validEntries = report.personalEntries.filter((entry) => {
        const dni = entry.identifier.trim();
        if (!dni || seenDnis.has(dni)) return false;
        seenDnis.add(dni);
        return true;
      });
      return sum + validEntries.length;
    }, 0);

    const totalMachinery = groupReports.reduce((sum, report) => {
      const validEntries = report.machineryEntries.filter((entry) => entry.identifier.trim() !== '');
      return sum + validEntries.length;
    }, 0);

    const totalCompanies = new Set(
      groupReports.flatMap((report) => {
        const seenDnis = new Set<string>();
        const validPersonal = report.personalEntries
          .filter((entry) => {
            const dni = entry.identifier.trim();
            if (!dni || seenDnis.has(dni)) return false;
            seenDnis.add(dni);
            return true;
          })
          .map((entry) => entry.company);

        const validMachinery = report.machineryEntries
          .filter((entry) => entry.identifier.trim() !== '' && entry.operator && entry.operator.trim() !== '')
          .map((entry) => entry.company);

        return [...validPersonal, ...validMachinery];
      }),
    ).size;

    return { totalReports, totalPersonal, totalMachinery, totalCompanies };
  };

  const groupedReports = useMemo(() => {
    const groups = new Map<string, Map<string, AccessReport[]>>();

    reports.forEach((report) => {
      const dateKey = report.date;
      const siteKey = report.siteName;

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
        siteGroups: Array.from(siteGroups.entries()).map(([siteName, siteReports]) => ({
          siteName,
          reports: siteReports.sort(
            (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
          ),
        })),
      }));
  }, [reports]);

  const reportsListSection = (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="items-center text-center">
        <CardTitle className="text-xl font-bold text-slate-800 sm:text-2xl">
          {t('accessControl.title')}
        </CardTitle>
        <CardDescription className="text-sm text-slate-600">
          {loading
            ? 'Cargando controles de acceso...'
            : reports.length === 0
              ? 'No hay controles de acceso guardados'
              : `${reports.length} ${reports.length === 1 ? 'reporte' : 'reportes'}`}
        </CardDescription>
        {reports.length > 0 ? (
          <div className="flex justify-center gap-2 pt-2">
            {selectionMode ? (
              <>
                <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={selectedReports.size === 0}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar ({selectedReports.size})
                </Button>
                <Button variant="outline" size="sm" onClick={cancelSelection}>
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectionMode(true)}
                className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                Selección múltiple
              </Button>
            )}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium">{t('workReports.noReports')}</h3>
            <p className="mb-4 text-muted-foreground">{t('app.description')}</p>
            <Button onClick={onCreateNew}>
              <Plus className="mr-2 h-4 w-4" />
              {t('accessControl.newReport')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedReports.map(({ dateKey, siteGroups }) => {
              const totalReportsInDate = siteGroups.reduce((sum, group) => sum + group.reports.length, 0);

              return (
                <Collapsible key={dateKey} defaultOpen>
                  <Card className="border border-slate-200 shadow-none">
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer pb-3 transition-colors hover:bg-accent/50">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <ChevronDown className="h-5 w-5 text-primary transition-transform data-[state=closed]:rotate-[-90deg]" />
                            <Calendar className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base text-slate-700">
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
                        {siteGroups.map(({ siteName, reports: siteReports }) => {
                          const siteReportIds = siteReports.map((report) => report.id);
                          const allSelectedInSite = siteReportIds.every((id) => selectedReports.has(id));
                          const someSelectedInSite = siteReportIds.some((id) => selectedReports.has(id));
                          const stats = getGroupStats(siteReports);

                          return (
                            <Collapsible key={siteName} defaultOpen>
                              <Card className="border border-slate-200 bg-slate-50/50 shadow-none">
                                <CollapsibleTrigger asChild>
                                  <CardHeader className="cursor-pointer pb-2 pt-3 transition-colors hover:bg-accent/30">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-2">
                                        {selectionMode ? (
                                          <Checkbox
                                            checked={allSelectedInSite}
                                            className="mr-1"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              if (allSelectedInSite) {
                                                deselectAllInGroup(siteReportIds);
                                              } else {
                                                selectAllInGroup(siteReportIds);
                                              }
                                            }}
                                          />
                                        ) : null}
                                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=closed]:rotate-[-90deg]" />
                                        <Building2 className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium text-slate-700">{siteName}</span>
                                      </div>
                                      <Badge className="border-0 bg-orange-500 text-white hover:bg-orange-500">
                                        {selectionMode && someSelectedInSite
                                          ? `${siteReportIds.filter((id) => selectedReports.has(id)).length}/`
                                          : null}
                                        {siteReports.length} {siteReports.length === 1 ? 'reporte' : 'reportes'}
                                      </Badge>
                                    </div>
                                  </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <CardContent className="space-y-3 pb-3 pt-0">
                                    <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                      <Card className="border-slate-200 bg-white shadow-none">
                                        <CardContent className="p-3">
                                          <p className="truncate text-xs text-muted-foreground">
                                            {t('advancedReports.totalReports')}
                                          </p>
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

                                    {siteReports.map((report) => {
                                      const personalCount = (() => {
                                        const seenDnis = new Set<string>();
                                        return report.personalEntries.filter((entry) => {
                                          const dni = entry.identifier.trim();
                                          if (!dni || seenDnis.has(dni)) return false;
                                          seenDnis.add(dni);
                                          return true;
                                        }).length;
                                      })();

                                      const machineryCount = report.machineryEntries.filter(
                                        (entry) => entry.identifier.trim() !== '',
                                      ).length;

                                      return (
                                        <Card
                                          key={report.id}
                                          className={`border-slate-200 bg-white shadow-none ${
                                            selectionMode && selectedReports.has(report.id) ? 'ring-2 ring-primary' : ''
                                          }`}
                                          onClick={selectionMode ? () => toggleReportSelection(report.id) : undefined}
                                        >
                                          <CardContent className="space-y-3 p-3 sm:p-4">
                                            <div className="flex items-start justify-between gap-3">
                                              {selectionMode ? (
                                                <Checkbox
                                                  checked={selectedReports.has(report.id)}
                                                  onClick={(event) => event.stopPropagation()}
                                                  onCheckedChange={() => toggleReportSelection(report.id)}
                                                  className="mt-1"
                                                />
                                              ) : null}
                                              <div className="min-w-0 flex-1 space-y-3">
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                  <Users className="h-4 w-4 flex-shrink-0" />
                                                  <span className="truncate">
                                                    {t('accessControl.responsible')}: {report.responsible}
                                                  </span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                  <Badge className="border-0 bg-orange-500 text-white hover:bg-orange-500">
                                                    {personalCount} {t('accessControl.personalEntries')}
                                                  </Badge>
                                                  <Badge variant="outline">{machineryCount} {t('accessControl.machineryEntries')}</Badge>
                                                </div>
                                                {report.observations ? (
                                                  <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">
                                                    {report.observations}
                                                  </p>
                                                ) : null}
                                              </div>
                                              {!selectionMode ? (
                                                <div className="flex shrink-0 gap-1">
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onClone(report)}
                                                    title={t('workReports.cloneReport')}
                                                    className="h-8 w-8 p-0"
                                                  >
                                                    <Copy className="h-4 w-4" />
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onEdit(report)}
                                                    title={t('workReports.editReport')}
                                                    className="h-8 w-8 p-0"
                                                  >
                                                    <Edit className="h-4 w-4" />
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onDelete(report.id)}
                                                    title={t('workReports.deleteReport')}
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
                                      );
                                    })}
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

  if (listOnly) {
    return reportsListSection;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-center text-lg font-bold tracking-tight text-foreground sm:text-2xl">
          {t('accessControl.title')}
        </h1>
        <p className="text-center text-xs text-muted-foreground sm:text-sm">{t('app.description')}</p>
        <Button onClick={onCreateNew} className="btn-gradient w-full sm:w-auto" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          <span>{t('accessControl.newReport')}</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-center text-lg sm:text-xl">{t('workReports.dataManagement')}</CardTitle>
          <CardDescription className="text-center">{t('workReports.dataManagementDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={onExportData} className="flex-1 sm:flex-none" size="sm">
              <Download className="h-4 w-4" />
              <span className="ml-2">{t('workReports.saveData')}</span>
            </Button>

            <Button variant="outline" asChild className="flex-1 sm:flex-none">
              <label htmlFor="import-file" className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" />
                {t('workReports.loadData')}
              </label>
            </Button>
            <Input id="import-file" type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-center text-lg sm:text-xl">{t('advancedReports.generateReport')}</CardTitle>
          <CardDescription className="text-center">{t('app.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('accessControl.siteName')}</label>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger>
                  <SelectValue placeholder={t('advancedReports.allWorks')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('advancedReports.allWorks')}</SelectItem>
                  {uniqueSites.map((site) => (
                    <SelectItem key={site} value={site}>
                      {site}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('workReports.period')}</label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('advancedReports.allWorks')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('advancedReports.allWorks')}</SelectItem>
                  <SelectItem value="weekly">{t('workReports.weekly')}</SelectItem>
                  <SelectItem value="monthly">{t('workReports.monthly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => onGenerateReport(selectedSite, dateRange)} className="w-full" size="sm">
              <FileText className="h-4 w-4" />
              <span className="ml-2">{t('advancedReports.generateReport')}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {reportsListSection}
    </div>
  );
};
