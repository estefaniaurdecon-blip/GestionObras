import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, FileText, Download, Upload, Calendar, Users, Truck, Edit, Trash2, Copy, ChevronDown, Building2, CheckSquare, X } from 'lucide-react';
import { AccessReport } from '@/types/accessControl';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
}: AccessControlListProps) => {
  const { t } = useTranslation();
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());

  const toggleReportSelection = (reportId: string) => {
    setSelectedReports(prev => {
      const newSet = new Set(prev);
      if (newSet.has(reportId)) {
        newSet.delete(reportId);
      } else {
        newSet.add(reportId);
      }
      return newSet;
    });
  };

  const selectAllInGroup = (reportIds: string[]) => {
    setSelectedReports(prev => {
      const newSet = new Set(prev);
      reportIds.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  const deselectAllInGroup = (reportIds: string[]) => {
    setSelectedReports(prev => {
      const newSet = new Set(prev);
      reportIds.forEach(id => newSet.delete(id));
      return newSet;
    });
  };

  const handleBulkDelete = () => {
    if (selectedReports.size === 0) return;
    
    if (onBulkDelete) {
      onBulkDelete(Array.from(selectedReports));
    } else {
      // Fallback to individual deletes
      selectedReports.forEach(id => onDelete(id));
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
    if (file) {
      onImportData(file);
      event.target.value = '';
    }
  };

  const uniqueSites = Array.from(new Set(reports.map(r => r.siteName))).filter(Boolean);

  // Función para calcular estadísticas por grupo de reportes
  const getGroupStats = (groupReports: AccessReport[]) => {
    const totalReports = groupReports.length;
    
    const totalPersonal = groupReports.reduce((sum, r) => {
      const seenDnis = new Set<string>();
      const validEntries = r.personalEntries.filter(e => {
        const dni = e.identifier.trim();
        if (dni === '' || seenDnis.has(dni)) return false;
        seenDnis.add(dni);
        return true;
      });
      return sum + validEntries.length;
    }, 0);
    
    const totalMachinery = groupReports.reduce((sum, r) => {
      const validEntries = r.machineryEntries.filter(e => e.identifier.trim() !== '');
      return sum + validEntries.length;
    }, 0);
    
    const totalCompanies = new Set(
      groupReports.flatMap(r => {
        const seenDnis = new Set<string>();
        const validPersonal = r.personalEntries
          .filter(e => {
            const dni = e.identifier.trim();
            if (dni === '' || seenDnis.has(dni)) return false;
            seenDnis.add(dni);
            return true;
          })
          .map(e => e.company);
        
        // Solo contar empresas de maquinaria que tengan operador asignado
        const validMachinery = r.machineryEntries
          .filter(e => e.identifier.trim() !== '' && e.operator && e.operator.trim() !== '')
          .map(e => e.company);
        
        return [...validPersonal, ...validMachinery];
      })
    ).size;

    return { totalReports, totalPersonal, totalMachinery, totalCompanies };
  };

  // Agrupar reportes por fecha y luego por obra
  const groupedReports = useMemo(() => {
    const groups = new Map<string, Map<string, AccessReport[]>>();
    
    reports.forEach(report => {
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
    
    // Ordenar por fecha (más reciente primero)
    return Array.from(groups.entries()).sort((a, b) => 
      new Date(b[0]).getTime() - new Date(a[0]).getTime()
    ).map(([dateKey, siteGroups]) => ({
      dateKey,
      siteGroups: Array.from(siteGroups.entries()).map(([siteName, reports]) => ({
        siteName,
        reports: reports.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      }))
    }));
  }, [reports]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-foreground text-center">{t('accessControl.title')}</h1>
        <p className="text-xs sm:text-sm text-muted-foreground text-center">
          {t('app.description')}
        </p>
        <Button onClick={onCreateNew} className="btn-gradient w-full sm:w-auto" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          <span>{t('accessControl.newReport')}</span>
        </Button>
      </div>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-lg sm:text-xl">{t('workReports.dataManagement')}</CardTitle>
          <CardDescription className="text-center">
            {t('workReports.dataManagementDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
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
            <Input
              id="import-file"
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      {/* Report Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-lg sm:text-xl">{t('advancedReports.generateReport')}</CardTitle>
          <CardDescription className="text-center">
            {t('app.description')}
          </CardDescription>
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
            
            <Button 
              onClick={() => onGenerateReport(selectedSite, dateRange)}
              className="w-full"
              size="sm"
            >
              <FileText className="h-4 w-4" />
              <span className="ml-2">{t('advancedReports.generateReport')}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reports List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-lg sm:text-xl">{t('accessControl.title')}</CardTitle>
          <CardDescription className="text-center">
            {reports.length === 0 
              ? t('workReports.noReports')
              : `${reports.length} reportes`
            }
          </CardDescription>
          {reports.length > 0 && (
            <div className="flex justify-center gap-2 pt-2">
              {selectionMode ? (
                <>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={selectedReports.size === 0}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar ({selectedReports.size})
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={cancelSelection}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectionMode(true)}
                >
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Selección múltiple
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">{t('workReports.noReports')}</h3>
              <p className="text-muted-foreground mb-4">
                {t('app.description')}
              </p>
              <Button onClick={onCreateNew}>
                <Plus className="mr-2 h-4 w-4" />
                {t('accessControl.newReport')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedReports.map(({ dateKey, siteGroups }) => {
                const totalReportsInDate = siteGroups.reduce((sum, sg) => sum + sg.reports.length, 0);
                
                return (
                  <Collapsible key={dateKey} defaultOpen={true}>
                    <Card className="border-l-4 border-l-primary/50">
                      <CollapsibleTrigger asChild>
                        <CardHeader className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <ChevronDown className="h-5 w-5 text-primary transition-transform data-[state=closed]:rotate-[-90deg]" />
                              <Calendar className="h-5 w-5 text-primary" />
                              <CardTitle className="text-base">
                                {format(new Date(dateKey), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
                              </CardTitle>
                            </div>
                            <Badge variant="secondary">{totalReportsInDate} {totalReportsInDate === 1 ? 'reporte' : 'reportes'}</Badge>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="space-y-3 pt-0">
                          {siteGroups.map(({ siteName, reports: siteReports }) => {
                            const siteReportIds = siteReports.map(r => r.id);
                            const allSelectedInSite = siteReportIds.every(id => selectedReports.has(id));
                            const someSelectedInSite = siteReportIds.some(id => selectedReports.has(id));
                            
                            return (
                            <Collapsible key={siteName} defaultOpen={true}>
                              <Card className="border-l-2 border-l-accent">
                                <CollapsibleTrigger asChild>
                                  <CardHeader className="pb-2 pt-3 cursor-pointer hover:bg-accent/30 transition-colors">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        {selectionMode && (
                                          <Checkbox
                                            checked={allSelectedInSite}
                                            className="mr-1"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (allSelectedInSite) {
                                                deselectAllInGroup(siteReportIds);
                                              } else {
                                                selectAllInGroup(siteReportIds);
                                              }
                                            }}
                                          />
                                        )}
                                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=closed]:rotate-[-90deg]" />
                                        <Building2 className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium text-sm">{siteName}</span>
                                      </div>
                                      <Badge variant="secondary" className="text-xs">
                                        {selectionMode && someSelectedInSite && `${siteReportIds.filter(id => selectedReports.has(id)).length}/`}
                                        {siteReports.length} {siteReports.length === 1 ? 'reporte' : 'reportes'}
                                      </Badge>
                                    </div>
                                  </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <CardContent className="space-y-3 pt-0 pb-3">
                                    {/* Estadísticas por obra y día */}
                                    {(() => {
                                      const stats = getGroupStats(siteReports);
                                      return (
                                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-3">
                                          <Card className="bg-muted/30">
                                            <CardContent className="p-3">
                                              <div className="flex items-center gap-2">
                                                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div className="min-w-0">
                                                  <p className="text-xs text-muted-foreground truncate">{t('advancedReports.totalReports')}</p>
                                                  <p className="text-lg font-bold">{stats.totalReports}</p>
                                                </div>
                                              </div>
                                            </CardContent>
                                          </Card>
                                          
                                          <Card className="bg-muted/30">
                                            <CardContent className="p-3">
                                              <div className="flex items-center gap-2">
                                                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div className="min-w-0">
                                                  <p className="text-xs text-muted-foreground truncate">Personal</p>
                                                  <p className="text-lg font-bold">{stats.totalPersonal}</p>
                                                </div>
                                              </div>
                                            </CardContent>
                                          </Card>

                                          <Card className="bg-muted/30">
                                            <CardContent className="p-3">
                                              <div className="flex items-center gap-2">
                                                <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div className="min-w-0">
                                                  <p className="text-xs text-muted-foreground truncate">Maquinaria</p>
                                                  <p className="text-lg font-bold">{stats.totalMachinery}</p>
                                                </div>
                                              </div>
                                            </CardContent>
                                          </Card>

                                          <Card className="bg-muted/30">
                                            <CardContent className="p-3">
                                              <div className="flex items-center gap-2">
                                                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div className="min-w-0">
                                                  <p className="text-xs text-muted-foreground truncate">Empresas</p>
                                                  <p className="text-lg font-bold">{stats.totalCompanies}</p>
                                                </div>
                                              </div>
                                            </CardContent>
                                          </Card>
                                        </div>
                                      );
                                    })()}
                                    
                                    {siteReports.map((report) => (
                                      <Card 
                                        key={report.id} 
                                        className={`work-card ${selectionMode && selectedReports.has(report.id) ? 'ring-2 ring-primary' : ''}`}
                                        onClick={selectionMode ? () => toggleReportSelection(report.id) : undefined}
                                      >
                                        <CardContent className="p-3 sm:p-4 space-y-3">
                                          <div className="flex items-start justify-between gap-2">
                                            {selectionMode && (
                                              <Checkbox
                                                checked={selectedReports.has(report.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                onCheckedChange={() => toggleReportSelection(report.id)}
                                                className="mt-1"
                                              />
                                            )}
                                            <div className="flex-1 min-w-0 space-y-2">
                                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Users className="h-4 w-4 flex-shrink-0" />
                                                <span className="truncate">{t('accessControl.responsible')}: {report.responsible}</span>
                                              </div>
                                              
                                              <div className="flex flex-wrap gap-2">
                                                <Badge variant="secondary" className="text-xs">
                                                  <Users className="mr-1 h-3 w-3" />
                                                  {(() => {
                                                    const seenDnis = new Set<string>();
                                                    return report.personalEntries.filter(e => {
                                                      const dni = e.identifier.trim();
                                                      if (dni === '' || seenDnis.has(dni)) return false;
                                                      seenDnis.add(dni);
                                                      return true;
                                                    }).length;
                                                  })()} {t('accessControl.personalEntries')}
                                                </Badge>
                                                <Badge variant="outline" className="text-xs">
                                                  <Truck className="mr-1 h-3 w-3" />
                                                  {report.machineryEntries.filter(e => e.identifier.trim() !== '').length} {t('accessControl.machineryEntries')}
                                                </Badge>
                                              </div>

                                              {report.observations && (
                                                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                                                  {report.observations}
                                                </p>
                                              )}
                                            </div>
                                            
                                            {!selectionMode && (
                                              <div className="flex flex-col sm:flex-row gap-1 shrink-0">
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
                                            )}
                                          </div>
                                          
                                          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                                            Creado: {new Date(report.createdAt).toLocaleDateString('es-ES', { 
                                              hour: '2-digit', 
                                              minute: '2-digit' 
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
    </div>
  );
};
