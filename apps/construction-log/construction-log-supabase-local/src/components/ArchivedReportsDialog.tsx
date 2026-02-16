import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Archive, 
  ArchiveRestore, 
  Search, 
  Calendar, 
  User, 
  Building2, 
  ChevronDown, 
  ChevronRight,
  FolderOpen,
  Download,
  FileArchive,
  Loader2,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import { WorkReport } from '@/types/workReport';
import { useTranslation } from 'react-i18next';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';
import { 
  exportMonthToZip, 
  exportAllArchivedToZip, 
  downloadBlob,
  ExportFormat 
} from '@/utils/archivedExportUtils';

interface ArchivedReportsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  archivedReports: WorkReport[];
  onUnarchive: (reportId: string) => Promise<void>;
  isRestoring: boolean;
  companyLogo?: string;
}

export const ArchivedReportsDialog = ({
  isOpen,
  onClose,
  archivedReports,
  onUnarchive,
  isRestoring,
  companyLogo
}: ArchivedReportsDialogProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState('');
  const [foremanFilter, setForemanFilter] = useState<string>('all');
  const [workFilter, setWorkFilter] = useState<string>('all');
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportingMonth, setExportingMonth] = useState<string | null>(null);

  // Obtener lista única de encargados
  const uniqueForemen = useMemo(() => {
    const foremenSet = new Set<string>();
    archivedReports.forEach(report => {
      if (report.foreman) {
        foremenSet.add(report.foreman);
      }
    });
    return Array.from(foremenSet).sort();
  }, [archivedReports]);

  // Obtener lista única de obras
  const uniqueWorks = useMemo(() => {
    const worksMap = new Map<string, string>();
    archivedReports.forEach(report => {
      if (report.workId && report.workName) {
        worksMap.set(report.workId, report.workName);
      }
    });
    return Array.from(worksMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [archivedReports]);

  // Filtrar reportes archivados
  const filteredReports = useMemo(() => {
    let filtered = archivedReports;

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(report =>
        report.workName?.toLowerCase().includes(searchLower) ||
        report.workNumber?.toLowerCase().includes(searchLower) ||
        report.foreman?.toLowerCase().includes(searchLower) ||
        report.siteManager?.toLowerCase().includes(searchLower)
      );
    }

    if (foremanFilter && foremanFilter !== 'all') {
      filtered = filtered.filter(report => report.foreman === foremanFilter);
    }

    if (workFilter && workFilter !== 'all') {
      filtered = filtered.filter(report => report.workId === workFilter);
    }

    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [archivedReports, searchTerm, foremanFilter, workFilter]);

  // Agrupar por año y mes
  const groupedByYearMonth = useMemo(() => {
    const yearGroups = new Map<number, Map<string, WorkReport[]>>();

    filteredReports.forEach(report => {
      const date = new Date(report.date);
      const year = date.getFullYear();
      const monthKey = `${year}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

      if (!yearGroups.has(year)) {
        yearGroups.set(year, new Map());
      }

      const yearMap = yearGroups.get(year)!;
      if (!yearMap.has(monthKey)) {
        yearMap.set(monthKey, []);
      }
      yearMap.get(monthKey)!.push(report);
    });

    // Convertir a array ordenado descendentemente por año
    return Array.from(yearGroups.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, months]) => ({
        year,
        months: new Map(
          Array.from(months.entries()).sort(([a], [b]) => b.localeCompare(a))
        )
      }));
  }, [filteredReports]);

  // Toggle year expansion
  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  // Toggle month expansion
  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };

  // Formatear nombre del mes
  const formatMonthName = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return format(date, 'MMMM yyyy', { locale: es });
  };

  // Contar partes en un mes
  const getMonthCount = (reports: WorkReport[]) => {
    return reports.length;
  };

  // Exportar mes a ZIP
  const handleExportMonth = async (monthKey: string, reports: WorkReport[], exportFormat: ExportFormat) => {
    setIsExporting(true);
    setExportingMonth(monthKey);

    try {
      const { blob, result, filename } = await exportMonthToZip(
        monthKey,
        reports,
        exportFormat,
        companyLogo,
        organization?.brand_color
      );

      if (result.successCount > 0) {
        downloadBlob(blob, filename);
        const formatLabel = exportFormat === 'pdf' ? 'PDF' : 'Excel';
        toast({
          title: "Exportación completada",
          description: `Se han exportado ${result.successCount} partes en ${formatLabel}`,
        });
      } else {
        toast({
          title: "Error",
          description: "No se pudo exportar ningún parte",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error exporting month:', error);
      toast({
        title: "Error",
        description: "Hubo un problema al exportar los partes",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
      setExportingMonth(null);
    }
  };

  // Exportar todos los archivados
  const handleExportAll = async (exportFormat: ExportFormat) => {
    if (filteredReports.length === 0) return;

    setIsExporting(true);
    setExportingMonth('all');

    try {
      const { blob, result, filename } = await exportAllArchivedToZip(
        filteredReports,
        exportFormat,
        companyLogo,
        organization?.brand_color
      );

      if (result.successCount > 0) {
        downloadBlob(blob, filename);
        const formatLabel = exportFormat === 'pdf' ? 'PDF' : 'Excel';
        toast({
          title: "Exportación completada",
          description: `Se han exportado ${result.successCount} partes en ${formatLabel} organizados por mes`,
        });
      }
    } catch (error) {
      console.error('Error exporting all:', error);
      toast({
        title: "Error",
        description: "Hubo un problema al exportar los partes",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
      setExportingMonth(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Partes Archivados
          </DialogTitle>
          <DialogDescription>
            Visualiza y restaura partes de trabajo organizados por fecha. Exporta en PDF (con imágenes) o Excel.
          </DialogDescription>
        </DialogHeader>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 py-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por obra, encargado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={foremanFilter} onValueChange={setForemanFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Encargado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los encargados</SelectItem>
              {uniqueForemen.map(foreman => (
                <SelectItem key={foreman} value={foreman}>{foreman}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={workFilter} onValueChange={setWorkFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Obra" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las obras</SelectItem>
              {uniqueWorks.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Botón exportar todos */}
        {filteredReports.length > 0 && (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isExporting}
                  className="gap-2"
                >
                  {isExporting && exportingMonth === 'all' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileArchive className="h-4 w-4" />
                  )}
                  Exportar todo ({filteredReports.length})
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExportAll('pdf')} className="gap-2">
                  <FileText className="h-4 w-4 text-red-500" />
                  Descargar ZIP de PDFs (con imágenes)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportAll('excel')} className="gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                  Descargar ZIP de Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Lista de partes archivados por año/mes */}
        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          {groupedByYearMonth.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Archive className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No hay partes archivados</p>
              <p className="text-sm">Los partes que archives aparecerán aquí</p>
            </div>
          ) : (
            groupedByYearMonth.map(({ year, months }) => {
              const yearReportsCount = Array.from(months.values()).reduce(
                (sum, reports) => sum + reports.length, 0
              );
              const isYearExpanded = expandedYears.has(year);

              return (
                <Collapsible 
                  key={year} 
                  open={isYearExpanded}
                  onOpenChange={() => toggleYear(year)}
                >
                  <CollapsibleTrigger asChild>
                    <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isYearExpanded ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          <FolderOpen className="h-5 w-5 text-primary" />
                          <span className="font-semibold text-lg">{year}</span>
                        </div>
                        <Badge variant="secondary">
                          {yearReportsCount} parte{yearReportsCount !== 1 ? 's' : ''}
                        </Badge>
                      </CardContent>
                    </Card>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="pl-4 mt-2 space-y-2">
                    {Array.from(months.entries()).map(([monthKey, monthReports]) => {
                      const isMonthExpanded = expandedMonths.has(monthKey);

                      return (
                        <Collapsible
                          key={monthKey}
                          open={isMonthExpanded}
                          onOpenChange={() => toggleMonth(monthKey)}
                        >
                          <CollapsibleTrigger asChild>
                            <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                              <CardContent className="p-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {isMonthExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium capitalize">
                                    {formatMonthName(monthKey)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {/* Dropdown para elegir formato de descarga */}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => e.stopPropagation()}
                                        disabled={isExporting}
                                        className="h-8 px-2"
                                      >
                                        {isExporting && exportingMonth === monthKey ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Download className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                      <DropdownMenuItem 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleExportMonth(monthKey, monthReports, 'pdf');
                                        }} 
                                        className="gap-2"
                                      >
                                        <FileText className="h-4 w-4 text-red-500" />
                                        ZIP de PDFs (con imágenes)
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleExportMonth(monthKey, monthReports, 'excel');
                                        }} 
                                        className="gap-2"
                                      >
                                        <FileSpreadsheet className="h-4 w-4 text-green-600" />
                                        ZIP de Excel
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                  <Badge variant="outline">
                                    {getMonthCount(monthReports)}
                                  </Badge>
                                </div>
                              </CardContent>
                            </Card>
                          </CollapsibleTrigger>

                          <CollapsibleContent className="pl-4 mt-2 space-y-2">
                            {monthReports.map(report => (
                              <Card key={report.id} className="hover:bg-muted/30 transition-colors">
                                <CardContent className="p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                        <span className="font-medium text-sm truncate">
                                          {report.workNumber} - {report.workName}
                                        </span>
                                      </div>
                                      
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          {format(new Date(report.date), 'dd MMM yyyy', { locale: es })}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <User className="h-3 w-3" />
                                          {report.foreman || 'Sin encargado'}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      {report.approved && (
                                        <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                                          Aprobado
                                        </Badge>
                                      )}
                                      
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onUnarchive(report.id)}
                                        disabled={isRestoring}
                                        className="gap-1 h-8"
                                      >
                                        <ArchiveRestore className="h-3 w-3" />
                                        <span className="hidden sm:inline text-xs">Restaurar</span>
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              );
            })
          )}
        </div>

        <div className="flex justify-between items-center pt-3 border-t">
          <p className="text-sm text-muted-foreground">
            {filteredReports.length} parte(s) archivado(s)
          </p>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
