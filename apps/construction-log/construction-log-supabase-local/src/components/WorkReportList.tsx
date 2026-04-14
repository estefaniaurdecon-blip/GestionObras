import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { PdfViewer } from './PdfViewer';
import { AdvancedReports } from './AdvancedReports';
import { WorkReportStatusSummary, StatusFilter } from './WorkReportStatusSummary';
import { BulkPdfExport } from './BulkPdfExport';
import { exportWeeklyReports, exportMonthlyReports } from '@/utils/weeklyMonthlyExportUtils';
import { WorkReport, WorkReportSection } from '@/types/workReport';
import { useWorkReportListFilters } from '@/hooks/useWorkReportListFilters';
import { useWorkReportGrouping, getWeekNumber } from '@/hooks/useWorkReportGrouping';
import { useWorkReportExportActions } from '@/hooks/useWorkReportExportActions';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { enUS, es, fr, it, de as deLocale } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Edit,
  Copy,
  Trash2,
  Download,
  Upload,
  FileBarChart,
  Building2,
  Calendar,
  BarChart3,
  CheckCircle,
  XCircle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  FileSpreadsheet,
  LockOpen,
  RefreshCw,
  Filter,
  X,
  Archive,
  ArchiveRestore,
  Database
} from 'lucide-react';
import { ArchivedReportsDialog } from './ArchivedReportsDialog';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { generateWorkReportPDF } from '@/utils/pdfGenerator';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/hooks/useOrganization';
import { useWorkReportDownloads } from '@/hooks/useWorkReportDownloads';
import { listAssignedWorksByUser, listProfileNamesByIds } from '@/services/workReportsSupabaseGateway';

export type ViewMode = 'byForeman' | 'weekly' | 'monthly';

interface WorkReportListProps {
  reports: WorkReport[];
  onCreateNew: () => void;
  onGoToToday?: () => void;
  onEdit: (report: WorkReport, viewMode: ViewMode, groupReports: WorkReport[]) => void;
  onClone: (report: WorkReport) => void;
  onDelete: (reportId: string) => void;
  onExportData: () => void;
  onImportData: (file: File) => void;
  onGenerateReport: (workName?: string, dateRange?: string) => void;
  onApprove?: (reportId: string) => void;
  onUnapprove?: (reportId: string) => void;
  onArchive?: (reportIdOrIds: string | string[], showToast?: boolean) => Promise<void>;
  onUnarchive?: (reportId: string) => Promise<void>;
  onReopenReport?: (report: WorkReport) => Promise<void>;
  canApprove?: boolean;
  companyLogo?: string;
  onReload?: () => Promise<void>;
  isReloading?: boolean;
}

export const WorkReportList = ({
  reports,
  onCreateNew,
  onGoToToday,
  onEdit,
  onClone,
  onDelete,
  onExportData,
  onImportData,
  onGenerateReport,
  onApprove,
  onUnapprove,
  onArchive,
  onUnarchive,
  onReopenReport,
  canApprove = false,
  companyLogo,
  onReload,
  isReloading = false
}: WorkReportListProps) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const currentUserId = user ? String(user.id) : null;
  const isSuperAdmin = Boolean(user?.is_super_admin);
  const { isSiteManager, isAdmin, isOfi, isMaster } = useUserPermissions();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const { trackDownload } = useWorkReportDownloads();
  const [selectedWork, setSelectedWork] = useState('');
  const [dateRange, setDateRange] = useState('weekly');
  const [showAdvancedReports, setShowAdvancedReports] = useState(false);
  const [viewMode, setViewMode] = useState<'byForeman' | 'weekly' | 'monthly'>('byForeman');
  const dfLocale = (() => {
    const map: Record<string, typeof es> = { es, en: enUS, 'en-US': enUS, fr, it, de: deLocale };
    return map[i18n.language] || es;
  })();
  const [availableWorks, setAvailableWorks] = useState<Array<{id: string, number: string, name: string}>>([]);

  // Archive dialog state
  const [showArchivedDialog, setShowArchivedDialog] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showArchiveConfirmDialog, setShowArchiveConfirmDialog] = useState(false);
  const [pendingArchiveGroup, setPendingArchiveGroup] = useState<{ name: string; reports: WorkReport[] } | null>(null);

  // Filter state and computed values via hook
  const {
    selectedWorkFilter, setSelectedWorkFilter,
    showAdvancedFilters, setShowAdvancedFilters,
    dateFilterStart, setDateFilterStart,
    dateFilterEnd, setDateFilterEnd,
    approvalFilter, setApprovalFilter,
    foremanFilter, setForemanFilter,
    siteManagerFilter, setSiteManagerFilter,
    statusFilter, setStatusFilter,
    archivedReports,
    reportsForStats,
    filteredReports,
    uniqueForemen,
    uniqueSiteManagers,
    clearAllFilters,
  } = useWorkReportListFilters({ reports, isOfi, isAdmin, isMaster });

  // Grouping
  const { weeklyGroups, monthlyGroups, foremanGroups, workGroups } = useWorkReportGrouping(filteredReports);

  // Export / download actions
  const {
    pdfViewerOpen,
    pdfUrl,
    pdfBuffer,
    showImageDialog,
    pendingReport,
    pendingAction,
    showStatusWarning,
    statusWarningMessage,
    selectedReports,
    isDownloadingBulk,
    isDownloadingExcelBulk,
    showBulkImageDialog,
    setPdfViewerOpen,
    setShowImageDialog,
    setShowStatusWarning,
    setShowBulkImageDialog,
    toggleReportSelection,
    selectAllReports,
    handleBulkDownloadClick,
    downloadSelectedPDFs,
    downloadSelectedExcels,
    handleViewPDFClick,
    handleViewPDF,
    handleClosePdfViewer,
    handleDownloadPDFClick,
    handleDownloadPDF,
    handleDownloadExcel,
  } = useWorkReportExportActions({
    filteredReports,
    isOfi,
    isSiteManager,
    isAdmin,
    isMaster,
    companyLogo,
    brandColor: organization?.brand_color,
    trackDownload,
  });

  // Office role export filters
  const [officeExportWork, setOfficeExportWork] = useState<string>('');
  const [officeExportPeriod, setOfficeExportPeriod] = useState<'weekly' | 'monthly'>('weekly');

  // Map para almacenar nombres de editores por user_id
  const [editorNames, setEditorNames] = useState<Map<string, string>>(new Map());

  // Cargar obras disponibles desde los partes
  useEffect(() => {
    const loadWorks = async () => {
      if (!currentUserId) return;

      try {
        const assignedWorks = await listAssignedWorksByUser(currentUserId);
        setAvailableWorks(assignedWorks);
      } catch (error) {
        console.error('Error loading works:', error);
      }
    };

    loadWorks();
  }, [currentUserId]);

  // Cargar nombres de editores para reportes que han sido editados
  useEffect(() => {
    const loadEditorNames = async () => {
      const editorIds = new Set<string>();
      reports.forEach(report => {
        if (report.lastEditedBy) {
          editorIds.add(String(report.lastEditedBy));
        }
      });

      if (editorIds.size === 0) return;

      try {
        const profiles = await listProfileNamesByIds(Array.from(editorIds));

        if (profiles) {
          const newEditorNames = new Map<string, string>();
          profiles.forEach(profile => {
            newEditorNames.set(profile.id, profile.full_name || 'Usuario desconocido');
          });
          setEditorNames(newEditorNames);
        }
      } catch (error) {
        console.error('Error loading editor names:', error);
      }
    };

    loadEditorNames();
  }, [reports]);


  // Handler para desarchivar
  const handleUnarchive = async (reportId: string) => {
    if (!onUnarchive) return;
    setIsRestoring(true);
    try {
      await onUnarchive(reportId);
    } finally {
      setIsRestoring(false);
    }
  };

  // Handler para archivar múltiples partes con confirmación
  const handleArchiveGroup = (groupName: string, groupReports: WorkReport[]) => {
    setPendingArchiveGroup({ name: groupName, reports: groupReports });
    setShowArchiveConfirmDialog(true);
  };

  // Confirmar archivado de grupo - AHORA EN UNA SOLA OPERACIÓN
  const confirmArchiveGroup = async () => {
    if (!pendingArchiveGroup || !onArchive) return;
    
    setIsArchiving(true);
    setShowArchiveConfirmDialog(false);
    
    try {
      // Obtener todos los IDs de los partes a archivar
      const reportIds = pendingArchiveGroup.reports.map(report => report.id);
      
      // Llamar a archiveReport con todos los IDs de una vez
      await onArchive(reportIds, false); // showToast=false, mostraremos nuestro propio toast
      
      // Mostrar toast de éxito
      toast({
        title: "Partes archivados",
        description: `Se han archivado ${reportIds.length} partes de ${pendingArchiveGroup.name}`,
      });
    } catch (error) {
      console.error('Error archiving reports:', error);
      toast({
        title: "Error al archivar",
        description: "Hubo un problema al archivar los partes. Por favor, inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsArchiving(false);
      setPendingArchiveGroup(null);
    }
  };

  // Calcular secciones pendientes de un reporte
  const getPendingSectionsCount = (report: WorkReport): number => {
    // No contamos 'general_info', 'rental_machinery' ni 'material_groups' (son automáticas)
    const totalSections: WorkReportSection[] = [
      'work_groups',
      'machinery_groups',
      'subcontract_groups',
      'observations'
    ];
    
    const completedSections = report.completedSections || [];
    // Filtramos las secciones que no deben contarse
    const relevantCompletedSections = completedSections.filter(
      s => s !== 'general_info' && s !== 'rental_machinery' && s !== 'material_groups'
    );
    return totalSections.length - relevantCompletedSections.filter(s => totalSections.includes(s)).length;
  };

  // Obtener nombres de las secciones pendientes
  const getPendingSectionsNames = (report: WorkReport): string => {
    const sectionNames: Record<string, string> = {
      'work_groups': 'Mano de Obra',
      'machinery_groups': 'Maquinaria de Subcontratas',
      'subcontract_groups': 'Subcontratas',
      'observations': 'Observaciones e Incidencias'
    };

    // No contamos 'material_groups' porque es automática (rellenada por IA)
    const totalSections: WorkReportSection[] = [
      'work_groups',
      'machinery_groups',
      'subcontract_groups',
      'observations'
    ];

    const completedSections = report.completedSections || [];
    const pendingSections = totalSections.filter(
      section => !completedSections.includes(section)
    );

    return pendingSections.map(s => sectionNames[s] || s).join(', ');
  };


  // Helper function to check if user can edit/delete a report
  const canModifyReport = (report: WorkReport) => {
    if (!currentUserId) return false;
    // El creador siempre puede modificar
    if (report.createdBy !== undefined && report.createdBy !== null && String(report.createdBy) === currentUserId) return true;
    
    // Master y Admin pueden modificar si están asignados a la obra del reporte
    if ((isMaster || isAdmin) && report.workId) {
      return availableWorks.some(work => work.id === report.workId);
    }
    
    // Jefes de obra pueden modificar partes de sus encargados en obras asignadas
    if (isSiteManager && report.workId) {
      return availableWorks.some(work => work.id === report.workId);
    }
    
    return false;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportData(file);
      event.target.value = ''; // Reset input
    }
  };

  const uniqueWorks = [...new Set(reports.map(r => r.workName).filter(Boolean))];
  
  const activeFiltersCount = [
    selectedWorkFilter && selectedWorkFilter !== 'all',
    dateFilterStart,
    dateFilterEnd,
    approvalFilter !== 'all',
    foremanFilter && foremanFilter !== 'all',
    siteManagerFilter && siteManagerFilter !== 'all'
  ].filter(Boolean).length;
  
  // Función para exportar con filtros de oficina
  const handleOfficeExport = async (format: 'pdf' | 'excel') => {
    if (!officeExportWork) {
      toast({
        title: "Error",
        description: "Por favor selecciona una obra para exportar",
        variant: "destructive",
      });
      return;
    }
    
    // Filtrar reportes por obra seleccionada
    const workReports = reports.filter(r => r.workId === officeExportWork && r.approved === true);
    
    if (workReports.length === 0) {
      toast({
        title: "Sin datos",
        description: "No hay partes aprobados para la obra seleccionada",
        variant: "destructive",
      });
      return;
    }
    
    try {
      if (format === 'excel') {
        if (officeExportPeriod === 'weekly') {
          await exportWeeklyReports(workReports);
        } else {
          await exportMonthlyReports(workReports);
        }
        toast({
          title: "Exportación exitosa",
          description: `Se ha exportado el informe ${officeExportPeriod === 'weekly' ? 'semanal' : 'mensual'} a Excel`,
        });
      } else {
        // PDF export
        const work = availableWorks.find(w => w.id === officeExportWork);
        const workName = work ? `${work.number} - ${work.name}` : 'Obra';
        
        // Agrupar por período
        if (officeExportPeriod === 'weekly') {
          const weeklyGroups = new Map<string, WorkReport[]>();
          workReports.forEach(report => {
            const reportDate = new Date(report.date);
            const year = reportDate.getFullYear();
            const weekNum = getWeekNumber(reportDate);
            const weekKey = `${year}-S${weekNum.toString().padStart(2, '0')}`;
            if (!weeklyGroups.has(weekKey)) {
              weeklyGroups.set(weekKey, []);
            }
            weeklyGroups.get(weekKey)!.push(report);
          });
          
          // Exportar cada semana
          for (const [weekKey, reports] of weeklyGroups.entries()) {
            for (const report of reports) {
              await generateWorkReportPDF(report, false, companyLogo, organization?.brand_color);
            }
          }
        } else {
          // Mensual
          const monthlyGroups = new Map<string, WorkReport[]>();
          workReports.forEach(report => {
            const reportDate = new Date(report.date);
            const monthKey = `${reportDate.getFullYear()}-${(reportDate.getMonth() + 1).toString().padStart(2, '0')}`;
            if (!monthlyGroups.has(monthKey)) {
              monthlyGroups.set(monthKey, []);
            }
            monthlyGroups.get(monthKey)!.push(report);
          });
          
          // Exportar cada mes
          for (const [monthKey, reports] of monthlyGroups.entries()) {
            for (const report of reports) {
              await generateWorkReportPDF(report, false, companyLogo, organization?.brand_color);
            }
          }
        }
        
        toast({
          title: "Exportación exitosa",
          description: `Se han exportado los PDFs ${officeExportPeriod === 'weekly' ? 'semanales' : 'mensuales'}`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo completar la exportación",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* Header Actions - Mobile optimized */}
      <div className="flex flex-col gap-3">
        <div className="text-center">
          <h1 className="app-page-title">{t('workReports.title')}</h1>
          <p className="app-page-subtitle mt-1">{t('workReports.description')}</p>
        </div>
        
        {/* Resumen de estados - usar reportes filtrados por rol para las estadísticas */}
        <WorkReportStatusSummary 
          reports={reportsForStats} 
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />
        
        {!isOfi && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <Button onClick={onCreateNew} className="app-btn-primary w-full">
              <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              <span>{t('workReports.createReport')}</span>
            </Button>
            {onGoToToday && (
              <Button 
                onClick={onGoToToday} 
                variant="default"
                className="app-btn-primary w-full"
              >
                <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                <span>{t('workReports.goToToday')}</span>
              </Button>
            )}
          </div>
        )}
        
        {/* Fila de botones desplegables: Exportación masiva, Gestión de datos, Informe resumen */}
        {!isOfi && (
          <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
            {/* Exportación Masiva de PDFs */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Exportación Masiva</span>
                  <span className="sm:hidden">PDFs</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80 p-3 bg-popover">
                <DropdownMenuLabel className="flex items-center gap-2 pb-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Exportación Masiva de PDFs
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="py-2">
                  <BulkPdfExport 
                    reports={filteredReports} 
                    companyLogo={companyLogo}
                    brandColor={organization?.brand_color}
                  />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Gestión de Datos */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Database className="h-4 w-4" />
                  <span className="hidden sm:inline">Gestión de Datos</span>
                  <span className="sm:hidden">Datos</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72 p-3 bg-popover">
                <DropdownMenuLabel className="flex items-center gap-2 pb-2">
                  <Download className="h-4 w-4 text-primary" />
                  {t('workReports.dataManagement')}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="py-2 space-y-3">
                  <p className="app-section-subtitle">
                    {t('workReports.dataManagementDesc')}
                  </p>
                  <div className="flex flex-col gap-2">
                    <input
                      type="file"
                      id="file-upload-dropdown"
                      className="hidden"
                      accept=".json"
                      onChange={handleFileUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => document.getElementById('file-upload-dropdown')?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {t('workReports.loadData')}
                    </Button>
                    <Button 
                      size="sm"
                      className="w-full justify-start"
                      onClick={onExportData}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {t('workReports.saveData')}
                    </Button>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Generar Informe Resumen */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <FileBarChart className="h-4 w-4" />
                  <span className="hidden sm:inline">Informe Resumen</span>
                  <span className="sm:hidden">Informe</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80 p-3 bg-popover">
                <DropdownMenuLabel className="flex items-center gap-2 pb-2">
                  <FileBarChart className="h-4 w-4 text-primary" />
                  {t('workReports.generateSummary')}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="py-2 space-y-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">{t('workReports.selectWorkLabel')}</label>
                    <select 
                      value={selectedWork} 
                      onChange={(e) => setSelectedWork(e.target.value)}
                      className="work-form-input text-sm"
                    >
                      <option value="">{t('common.allWorks')}</option>
                      {uniqueWorks.map(work => (
                        <option key={work} value={work}>{work}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">{t('workReports.period')}</label>
                    <select 
                      value={dateRange} 
                      onChange={(e) => setDateRange(e.target.value)}
                      className="work-form-input text-sm"
                    >
                      <option value="weekly">{t('workReports.last7days')}</option>
                      <option value="monthly">{t('workReports.last30days')}</option>
                      <option value="all">{t('workReports.allHistory')}</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2 pt-1">
                    <Button 
                      onClick={() => onGenerateReport(selectedWork || undefined, dateRange)}
                      className="btn-gradient w-full"
                      size="sm"
                    >
                      <FileBarChart className="h-4 w-4 mr-2" />
                      {t('advancedReports.generateReport')}
                    </Button>
                    <Button 
                      onClick={() => setShowAdvancedReports(true)}
                      variant="outline"
                      className="w-full"
                      size="sm"
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      {t('workReports.viewAdvancedReports')}
                    </Button>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        
        {/* Botón de ver archivados - solo para jefes de obra, admin y master */}
        {(isSiteManager || isAdmin || isMaster) && archivedReports.length > 0 && (
          <Button 
            variant="outline" 
            onClick={() => setShowArchivedDialog(true)}
            className="w-full sm:w-auto"
          >
            <Archive className="h-4 w-4 mr-2" />
            Ver archivados ({archivedReports.length})
          </Button>
        )}
      </div>

      {/* Dialog de partes archivados */}
      <ArchivedReportsDialog
        isOpen={showArchivedDialog}
        onClose={() => setShowArchivedDialog(false)}
        archivedReports={archivedReports}
        onUnarchive={handleUnarchive}
        isRestoring={isRestoring}
        companyLogo={companyLogo}
      />

      {/* Office Export Section - Only for office role */}
      {isOfi && (
        <Card className="work-card">
          <CardHeader>
            <CardTitle className="app-card-title flex items-center justify-center gap-2 text-center">
              <Download className="h-5 w-5 text-primary" />
              Exportación de Informes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="app-section-subtitle text-center mb-4">
              Selecciona la obra y el período para exportar los partes aprobados
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Selector de obra */}
              <div className="space-y-2">
                <label className="app-field-label">Seleccionar Obra</label>
                <Select value={officeExportWork} onValueChange={setOfficeExportWork}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una obra" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableWorks.map(work => {
                      const approvedCount = reports.filter(r => r.workId === work.id && r.approved === true).length;
                      return (
                        <SelectItem key={work.id} value={work.id}>
                          {work.number} - {work.name} ({approvedCount} aprobados)
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Selector de período */}
              <div className="space-y-2">
                <label className="app-field-label">Período de Exportación</label>
                <Select value={officeExportPeriod} onValueChange={(value: 'weekly' | 'monthly') => setOfficeExportPeriod(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Botones de exportación */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
              <Button
                onClick={() => handleOfficeExport('excel')}
                disabled={!officeExportWork}
                className="app-btn-soft w-full"
                variant="outline"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Exportar a Excel
              </Button>
              <Button
                onClick={() => handleOfficeExport('pdf')}
                disabled={!officeExportWork}
                className="app-btn-primary w-full"
              >
                <FileText className="h-4 w-4 mr-2" />
                Exportar PDFs
              </Button>
            </div>
            
            {officeExportWork && (
              <div className="mt-4 p-3 bg-muted rounded-md">
                <p className="app-section-subtitle">
                  <strong>Nota:</strong> Se exportarán solo los partes aprobados de la obra seleccionada agrupados por {officeExportPeriod === 'weekly' ? 'semanas' : 'meses'}.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Advanced Filters - Solo visible para rol de oficina */}
      {isOfi && (
      <Collapsible open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
        <Card className="work-card">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-primary" />
                  <CardTitle className="app-card-title">
                    {t('common.filter')}s Avanzados
                  </CardTitle>
                  {activeFiltersCount > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {activeFiltersCount} {activeFiltersCount === 1 ? 'filtro activo' : 'filtros activos'}
                    </Badge>
                  )}
                </div>
                <ChevronDown className={`h-5 w-5 text-primary transition-transform ${showAdvancedFilters ? '' : 'rotate-[-90deg]'}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Filtro por rango de fechas */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fecha inicio</label>
                  <input
                    type="date"
                    value={dateFilterStart}
                    onChange={(e) => setDateFilterStart(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fecha fin</label>
                  <input
                    type="date"
                    value={dateFilterEnd}
                    onChange={(e) => setDateFilterEnd(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                  />
                </div>
                
                {/* Filtro por estado de aprobación */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Estado de aprobación</label>
                  <Select value={approvalFilter} onValueChange={(value: any) => setApprovalFilter(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="approved">Aprobados</SelectItem>
                      <SelectItem value="not-approved">No aprobados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Filtro por encargado */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Encargado</label>
                  <Select value={foremanFilter} onValueChange={setForemanFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los encargados" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los encargados</SelectItem>
                      {uniqueForemen.map(foreman => (
                        <SelectItem key={foreman} value={foreman}>
                          {foreman}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Filtro por jefe de obra */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Jefe de Obra</label>
                  <Select value={siteManagerFilter} onValueChange={setSiteManagerFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los jefes de obra" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los jefes de obra</SelectItem>
                      {uniqueSiteManagers.map(manager => (
                        <SelectItem key={manager} value={manager}>
                          {manager}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Filtro por obra */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('common.filterByWork')}</label>
                  <Select value={selectedWorkFilter} onValueChange={setSelectedWorkFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('common.allWorks')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('common.allWorks')}</SelectItem>
                      {availableWorks.map(work => (
                        <SelectItem key={work.id} value={work.id}>
                          {work.number} - {work.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Botón para limpiar filtros */}
              {activeFiltersCount > 0 && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllFilters}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Limpiar todos los filtros
                  </Button>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
      )}

      {/* Reports Display */}
      <Card className="work-card">
        <CardHeader>
          <CardTitle className="app-card-title text-center">
            {`${t('workReports.title')} (${filteredReports.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredReports.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {isOfi 
                  ? t('workReports.noApprovedReports', 'No hay partes aprobados disponibles')
                  : (selectedWorkFilter && selectedWorkFilter !== 'all' ? t('workReports.noReportsForWork') : t('workReports.noReports'))
                }
              </h3>
              <p className="text-muted-foreground mb-6">
                {isOfi
                  ? t('workReports.noApprovedReportsDesc', 'Los partes estarán disponibles cuando sean completados y aprobados por un supervisor.')
                  : (selectedWorkFilter && selectedWorkFilter !== 'all'
                      ? t('workReports.noReportsForWorkDesc')
                      : t('workReports.createFirstReport')
                    )
                }
              </p>
              {!isOfi && (!selectedWorkFilter || selectedWorkFilter === 'all') && (
                <Button onClick={onCreateNew} className="btn-gradient">
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Primer Parte
                </Button>
              )}
            </div>
          ) : (
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mb-3">
                <TabsList className="grid w-full sm:w-auto grid-cols-3 gap-1">
                  <TabsTrigger value="byForeman" className="text-xs sm:text-sm px-2 sm:px-3">
                    <span className="hidden sm:inline">{isOfi ? t('workReports.byWorkTab') : t('workReports.byForemanTab')}</span>
                    <span className="sm:hidden">{isOfi ? t('navigation.works') : t('roles.foreman')}</span>
                  </TabsTrigger>
                  <TabsTrigger value="weekly" className="text-xs sm:text-sm px-2 sm:px-3">
                    <span className="hidden sm:inline">{t('workReports.weeklyTab')}</span>
                    <span className="sm:hidden">{t('workReports.weekly')}</span>
                  </TabsTrigger>
                  <TabsTrigger value="monthly" className="text-xs sm:text-sm px-2 sm:px-3">
                    <span className="hidden sm:inline">{t('workReports.monthlyTab')}</span>
                    <span className="sm:hidden">{t('workReports.monthly')}</span>
                  </TabsTrigger>
                </TabsList>
                {/* Hide export buttons for office role - they use the dedicated export section above */}
                {!isOfi && (
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={async () => {
                        try { await exportWeeklyReports(filteredReports); } catch (e) { /* no-op */ }
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" /> {t('workReports.excelWeekly')}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={async () => {
                        try { await exportMonthlyReports(filteredReports); } catch (e) { /* no-op */ }
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" /> {t('workReports.excelMonthly')}
                    </Button>
                  </div>
                )}
              </div>

              {/* Selection controls */}
              {filteredReports.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center gap-3 mb-4 p-3 bg-accent/30 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedReports.size === filteredReports.length}
                      onCheckedChange={selectAllReports}
                      id="select-all"
                    />
                    <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                      Seleccionar todos ({filteredReports.length})
                    </label>
                  </div>
                  {selectedReports.size > 0 && (
                    <div className="flex flex-col sm:flex-row items-center gap-2 ml-auto">
                      <Badge variant="secondary">
                        {selectedReports.size} seleccionados
                      </Badge>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <Button
                          onClick={downloadSelectedExcels}
                          disabled={isDownloadingExcelBulk}
                          size="sm"
                          variant="outline"
                          className="flex-1 sm:flex-none"
                        >
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          {isDownloadingExcelBulk ? 'Descargando...' : 'Descargar Excels (ZIP)'}
                        </Button>
                        <Button
                          onClick={handleBulkDownloadClick}
                          disabled={isDownloadingBulk}
                          size="sm"
                          className="flex-1 sm:flex-none"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {isDownloadingBulk ? 'Descargando...' : 'Descargar PDFs (ZIP)'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <TabsContent value="byForeman" className="space-y-4">
                {/* Si es rol ofi, agrupar por obra, si no, por encargado */}
                {(isOfi ? workGroups : foremanGroups).map(([groupName, groupReports]) => {
                  const canArchiveGroup = (isSiteManager || isAdmin || isMaster) && onArchive && groupReports.length > 0;
                  // IMPORTANTE: isOfi se resuelve de forma asíncrona. defaultOpen solo aplica en el primer render,
                  // así que forzamos remount al cambiar de rol para que en oficina se abran los grupos.
                  return (
                    <Collapsible key={`${groupName}-${isOfi ? 'ofi' : 'std'}`} defaultOpen={isOfi}>
                      <Card className="border-l-4 border-l-primary/50">
                        <CollapsibleTrigger asChild>
                          <CardHeader className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ChevronDown className="h-5 w-5 text-primary transition-transform data-[state=closed]:rotate-[-90deg]" />
                                {isOfi ? (
                                  <Building2 className="h-5 w-5 text-primary" />
                                ) : null}
                                <CardTitle className="app-card-title">{groupName}</CardTitle>
                              </div>
                              <div className="flex items-center gap-2">
                                {canArchiveGroup && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isArchiving}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleArchiveGroup(groupName, groupReports);
                                    }}
                                    className="text-muted-foreground hover:text-foreground gap-1"
                                    title={`Archivar todos los partes de ${groupName}`}
                                  >
                                    <Archive className="h-4 w-4" />
                                    <span className="hidden sm:inline text-xs">Archivar todos</span>
                                  </Button>
                                )}
                                <Badge variant="secondary">{groupReports.length} {groupReports.length === 1 ? t('workReports.part') : t('workReports.parts')}</Badge>
                              </div>
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="space-y-3 pt-0">
                            {groupReports.map((report) => (
                                <Card key={report.id} className="overflow-hidden">
                                <CardContent className="p-3 sm:p-4 space-y-3">
                                   {/* Header con checkbox y número de obra */}
                                   <div className="space-y-3">
                                     <div className="flex flex-col gap-2">
                                       <div className="flex items-center justify-between gap-2">
                                         <div className="flex items-center gap-3">
                                           <Checkbox
                                             checked={selectedReports.has(report.id)}
                                             onCheckedChange={() => toggleReportSelection(report.id)}
                                             id={`report-${report.id}`}
                                           />
                                           <Badge variant="outline" className="text-xs sm:text-sm shrink-0">
                                             Nº {report.workNumber || 'N/A'}
                                           </Badge>
                                         </div>
                                         {report.approved && (
                                           <Badge className="bg-success/10 text-success border-success/20 text-xs shrink-0">
                                             <CheckCircle className="h-3 w-3 mr-1" />
                                             <span className="hidden sm:inline">Aprobado</span>
                                             <span className="sm:hidden">✓</span>
                                           </Badge>
                                         )}
                                       </div>
                                        {getPendingSectionsCount(report) > 0 && (
                                          <Badge variant="destructive" className="text-xs w-fit">
                                            {getPendingSectionsCount(report)} {t('common.pendingSections')}: {getPendingSectionsNames(report)}
                                          </Badge>
                                        )}
                                     </div>
                                     <h3 className="font-semibold text-sm sm:text-base text-foreground line-clamp-2">
                                       {report.workName || 'Sin nombre de obra'}
                                     </h3>
                                   </div>

                                   {/* Fecha */}
                                   <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                                     <Calendar className="h-4 w-4 flex-shrink-0" />
                                     <span className="truncate">
                                       {report.date ? (
                                         <>
                                           {format(new Date(report.date), 'EEEE', { locale: dfLocale })},{' '}
                                           {format(new Date(report.date), 'd', { locale: dfLocale })} de{' '}
                                           {format(new Date(report.date), 'MMMM', { locale: dfLocale })} de{' '}
                                           {format(new Date(report.date), 'yyyy', { locale: dfLocale })}
                                         </>
                                       ) : 'Sin fecha'}
                                     </span>
                                   </div>

                                   {/* Marca de agua si fue editado */}
                                   {report.lastEditedBy && report.lastEditedAt && editorNames.get(String(report.lastEditedBy)) && (
                                     <div className="text-xs text-muted-foreground/60 italic border-l-2 border-muted pl-2">
                                       Editado por {editorNames.get(String(report.lastEditedBy))} el{' '}
                                       {format(new Date(report.lastEditedAt), "dd/MM/yyyy 'a las' HH:mm", { locale: es })}
                                     </div>
                                   )}

                                   {/* Separador */}
                                   <div className="border-t border-border my-3" />

                                   {/* Botones de acción en grid responsive */}
                                   <div className={`grid gap-2 ${isOfi ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
                                     {/* Solo mostrar descargas para rol ofi */}
                                      {isOfi ? (
                                        <>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDownloadExcel(report)}
                                            disabled={!report.approved}
                                            className="w-full"
                                            title={!report.approved ? 'Solo se pueden descargar partes aprobados' : ''}
                                          >
                                            <FileSpreadsheet className="h-4 w-4 mr-1" />
                                            <span className="text-xs">Excel</span>
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDownloadPDFClick(report)}
                                            disabled={!report.approved}
                                            className="w-full"
                                            title={!report.approved ? 'Solo se pueden descargar partes aprobados' : ''}
                                          >
                                            <FileText className="h-4 w-4 mr-1" />
                                            <span className="text-xs">PDF</span>
                                          </Button>
                                          {!report.approved && (
                                            <p className="col-span-2 text-xs text-muted-foreground text-center">
                                              Pendiente de aprobación
                                            </p>
                                          )}
                                        </>
                                      ) : (
                                       <>
                                         {canApprove && (
                                           report.approved ? (
                                             <Button
                                               variant="outline"
                                               size="sm"
                                               onClick={() => onUnapprove?.(report.id)}
                                               className="w-full text-warning hover:text-warning"
                                             >
                                               <XCircle className="h-4 w-4 mr-1" />
                                               <span className="text-xs">Revocar</span>
                                             </Button>
                                           ) : (
                                             <Button
                                               variant="outline"
                                               size="sm"
                                               onClick={() => onApprove?.(report.id)}
                                               className="w-full text-success hover:text-success"
                                             >
                                               <CheckCircle className="h-4 w-4 mr-1" />
                                               <span className="text-xs">{t('workReports.approve')}</span>
                                             </Button>
                                           )
                                         )}
                                         {!isOfi && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => onClone(report)}
                                              className="w-full"
                                            >
                                              <Copy className="h-4 w-4 mr-1" />
                                              <span className="text-xs">{t('workReports.clone')}</span>
                                            </Button>
                                          )}
                                         <Button
                                           variant="outline"
                                           size="sm"
                                           onClick={() => handleDownloadExcel(report)}
                                           className="w-full"
                                         >
                                           <FileSpreadsheet className="h-4 w-4 mr-1" />
                                           <span className="text-xs">Excel</span>
                                         </Button>
                                         <Button
                                           variant="outline"
                                           size="sm"
                                           onClick={() => handleDownloadPDFClick(report)}
                                           className="w-full"
                                         >
                                           <FileText className="h-4 w-4 mr-1" />
                                           <span className="text-xs">PDF</span>
                                         </Button>
                                         {canModifyReport(report) && (
                                           <>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onEdit(report, viewMode, groupReports)}
                                                className="w-full"
                                              >
                                                <Edit className="h-4 w-4 mr-1" />
                                                <span className="text-xs">{t('common.edit')}</span>
                                              </Button>
                                             <Button
                                               variant="outline"
                                               size="sm"
                                               onClick={() => onDelete(report.id)}
                                               className="w-full text-destructive hover:text-destructive"
                                             >
                                               <Trash2 className="h-4 w-4 mr-1" />
                                               <span className="text-xs">{t('common.delete')}</span>
                                             </Button>
                                           </>
                                         )}
                                         {report.status === 'completed' && isSuperAdmin && onReopenReport && (
                                           <Button
                                             variant="outline"
                                             size="sm"
                                             onClick={() => void onReopenReport(report)}
                                             className="w-full text-amber-600 hover:text-amber-800 border-amber-300"
                                             title="Reabrir parte (super admin)"
                                           >
                                             <LockOpen className="h-4 w-4 mr-1" />
                                             <span className="text-xs">Reabrir</span>
                                           </Button>
                                         )}
                                       </>
                                     )}
                                    </div>

                                   {/* Nueva fila de botones de estado */}
                                   <div className="grid grid-cols-3 gap-2 mt-2">
                                     <Button
                                       variant={report.status === 'completed' ? 'default' : 'outline'}
                                       size="sm"
                                       className={`w-full ${
                                         report.status === 'completed'
                                           ? 'bg-success text-white hover:bg-success/90'
                                           : 'text-success hover:bg-success/10 hover:text-success border-success/30'
                                       }`}
                                       title="Completado"
                                       disabled
                                     >
                                       <CheckCircle className="h-4 w-4 sm:mr-1" />
                                       <span className="text-xs hidden sm:inline">Completado</span>
                                     </Button>
                                      <Button
                                        variant={report.status === 'missing_data' ? 'default' : 'outline'}
                                        size="sm"
                                        className={`w-full ${
                                          report.status === 'missing_data'
                                            ? 'bg-warning text-white hover:bg-warning/90'
                                            : 'text-warning hover:bg-warning/10 hover:text-warning border-warning/30'
                                        }`}
                                        title="Faltan datos"
                                        disabled
                                      >
                                        <FileText className="h-4 w-4 sm:mr-1" />
                                        <span className="text-xs hidden sm:inline">Faltan datos</span>
                                      </Button>
                                      <Button
                                        variant={(report.status === 'missing_delivery_notes' || report.missingDeliveryNotes) ? 'default' : 'outline'}
                                        size="sm"
                                        className={`w-full ${
                                          (report.status === 'missing_delivery_notes' || report.missingDeliveryNotes)
                                            ? 'bg-destructive text-white hover:bg-destructive/90'
                                            : 'text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30'
                                        }`}
                                        title="Faltan albaranes"
                                        disabled
                                      >
                                        <FileBarChart className="h-4 w-4 sm:mr-1" />
                                        <span className="text-xs hidden sm:inline">Faltan albaranes</span>
                                      </Button>
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
              </TabsContent>

              <TabsContent value="weekly" className="space-y-4">
                {weeklyGroups.map(([weekKey, workGroups]) => {
                  // Get first report from first work group to calculate week range
                  const firstWorkReports = workGroups[0]?.[1] || [];
                  const firstDate = firstWorkReports.length > 0 ? new Date(firstWorkReports[0].date) : new Date();
                  const weekStart = startOfWeek(firstDate, { weekStartsOn: 1 });
                  const weekEnd = endOfWeek(firstDate, { weekStartsOn: 1 });
                  const weekRange = `${format(weekStart, 'dd/MM')} - ${format(weekEnd, 'dd/MM/yyyy')}`;
                  
                  // Calculate total reports in this week
                  const totalReports = workGroups.reduce((sum, [_, reports]) => sum + reports.length, 0);
                  
                  return (
                    <Collapsible key={weekKey} defaultOpen>
                      <Card className="border-l-4 border-l-primary/50">
                        <CollapsibleTrigger asChild>
                          <CardHeader className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ChevronDown className="h-5 w-5 text-primary transition-transform group-data-[state=closed]:rotate-[-90deg]" />
                                <CalendarDays className="h-5 w-5 text-primary" />
                                <CardTitle className="text-base">{weekKey}</CardTitle>
                              </div>
                              <Badge variant="secondary">{totalReports} {totalReports === 1 ? t('workReports.part') : t('workReports.parts')}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground ml-10">{weekRange}</p>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="space-y-3 pt-0">
                            {workGroups.map(([workKey, workReports]) => {
                              const [workNumber, workName] = workKey.split('|||');
                              
                              return (
                                <Collapsible key={workKey} defaultOpen>
                                  <Card className="border-l-2 border-l-accent">
                                    <CollapsibleTrigger asChild>
                                      <CardHeader className="pb-2 pt-3 cursor-pointer hover:bg-accent/30 transition-colors">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-sm">{workName}</span>
                                              <Badge variant="outline" className="text-xs">Nº {workNumber}</Badge>
                                            </div>
                                          </div>
                                          <Badge variant="secondary" className="text-xs">{workReports.length} {workReports.length === 1 ? t('workReports.part') : t('workReports.parts')}</Badge>
                                        </div>
                                      </CardHeader>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                       <CardContent className="space-y-2 pt-0 pb-3">
                                        {workReports.map((report) => (
                                           <Card key={report.id} className="overflow-hidden">
                                             <CardContent className="p-3 space-y-2">
                                               <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                                 <div className="flex items-center gap-2 flex-1 min-w-0">
                                                   <Checkbox
                                                     checked={selectedReports.has(report.id)}
                                                     onCheckedChange={() => toggleReportSelection(report.id)}
                                                     id={`weekly-report-${report.id}`}
                                                   />
                                                   <div className="flex-1 min-w-0 space-y-1">
                                                     <div className="flex items-center gap-2">
                                                       <span className="text-xs text-muted-foreground truncate">
                                                         {format(new Date(report.date), 'EEEE, dd MMM', { locale: es })}
                                                       </span>
                                                       {report.approved && (
                                                         <CheckCircle className="h-3 w-3 text-green-600 shrink-0" />
                                                       )}
                                                     </div>
                                                     {getPendingSectionsCount(report) > 0 && (
                                                       <Badge variant="destructive" className="text-xs w-fit">
                                                         {getPendingSectionsCount(report)} {t('common.pendingSections')}: {getPendingSectionsNames(report)}
                                                       </Badge>
                                                     )}
                                                   </div>
                                                 </div>
                                                <div className="flex items-center gap-1 ml-2">
                                                  {canApprove && (
                                                    report.approved ? (
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onUnapprove?.(report.id)}
                                                        className="h-7 w-7 p-0"
                                                      >
                                                        <XCircle className="h-3 w-3" />
                                                      </Button>
                                                    ) : (
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onApprove?.(report.id)}
                                                        className="h-7 w-7 p-0"
                                                      >
                                                        <CheckCircle className="h-3 w-3" />
                                                      </Button>
                                                    )
                                                  )}
                                                  {!isOfi && (
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => onClone(report)}
                                                      className="h-7 w-7 p-0"
                                                      title="Clonar"
                                                    >
                                                      <Copy className="h-3 w-3" />
                                                    </Button>
                                                  )}
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDownloadExcel(report)}
                                                    className="h-7 w-7 p-0"
                                                    title="Descargar Excel"
                                                  >
                                                    <FileSpreadsheet className="h-3 w-3" />
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDownloadPDFClick(report)}
                                                    className="h-7 w-7 p-0"
                                                    title="Descargar PDF"
                                                  >
                                                    <FileText className="h-3 w-3" />
                                                  </Button>
                                                  {canModifyReport(report) && (
                                                    <>
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onEdit(report, viewMode, workReports)}
                                                        className="h-7 w-7 p-0"
                                                      >
                                                        <Edit className="h-3 w-3" />
                                                      </Button>
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onDelete(report.id)}
                                                        className="h-7 w-7 p-0 text-destructive"
                                                      >
                                                        <Trash2 className="h-3 w-3" />
                                                      </Button>
                                                    </>
                                                  )}
                                                  {report.status === 'completed' && isSuperAdmin && onReopenReport && (
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => void onReopenReport(report)}
                                                      className="h-7 w-7 p-0 text-amber-600 hover:text-amber-800"
                                                      title="Reabrir parte (super admin)"
                                                    >
                                                      <LockOpen className="h-3 w-3" />
                                                    </Button>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Botones de estado */}
                                              <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-border">
                                                <Button
                                                  variant={report.status === 'completed' ? 'default' : 'outline'}
                                                  size="sm"
                                                  className={`h-7 ${
                                                    report.status === 'completed'
                                                      ? 'bg-success text-white hover:bg-success/90'
                                                      : 'text-success hover:bg-success/10 hover:text-success border-success/30'
                                                  }`}
                                                  title="Completado"
                                                  disabled
                                                >
                                                  <CheckCircle className="h-3 w-3 sm:mr-1" />
                                                  <span className="text-xs hidden sm:inline">Completado</span>
                                                </Button>
                                                <Button
                                                  variant={report.status === 'missing_data' ? 'default' : 'outline'}
                                                  size="sm"
                                                  className={`h-7 ${
                                                    report.status === 'missing_data'
                                                      ? 'bg-warning text-white hover:bg-warning/90'
                                                      : 'text-warning hover:bg-warning/10 hover:text-warning border-warning/30'
                                                  }`}
                                                  title="Faltan datos"
                                                  disabled
                                                >
                                                  <FileText className="h-3 w-3 sm:mr-1" />
                                                  <span className="text-xs hidden sm:inline">Faltan datos</span>
                                                </Button>
                                                <Button
                                                  variant={(report.status === 'missing_delivery_notes' || report.missingDeliveryNotes) ? 'default' : 'outline'}
                                                  size="sm"
                                                  className={`h-7 ${
                                                    (report.status === 'missing_delivery_notes' || report.missingDeliveryNotes)
                                                      ? 'bg-destructive text-white hover:bg-destructive/90'
                                                      : 'text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30'
                                                  }`}
                                                  title="Faltan albaranes"
                                                  disabled
                                                >
                                                  <FileBarChart className="h-3 w-3 sm:mr-1" />
                                                  <span className="text-xs hidden sm:inline">Faltan albaranes</span>
                                                </Button>
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
              </TabsContent>

              <TabsContent value="monthly" className="space-y-4">
                {monthlyGroups.map(([monthKey, workGroups]) => {
                  const [year, month] = monthKey.split('-');
                  const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                  const monthName = format(monthDate, 'MMMM yyyy', { locale: es });
                  
                  // Calculate total reports in this month
                  const totalReports = workGroups.reduce((sum, [_, reports]) => sum + reports.length, 0);
                  
                  return (
                    <Collapsible key={monthKey} defaultOpen>
                      <Card className="border-l-4 border-l-primary/50">
                        <CollapsibleTrigger asChild>
                          <CardHeader className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ChevronDown className="h-5 w-5 text-primary transition-transform group-data-[state=closed]:rotate-[-90deg]" />
                                <CalendarDays className="h-5 w-5 text-primary" />
                                <CardTitle className="app-card-title capitalize">{monthName}</CardTitle>
                              </div>
                              <Badge variant="secondary">{totalReports} {totalReports === 1 ? t('workReports.part') : t('workReports.parts')}</Badge>
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="space-y-3 pt-0">
                            {workGroups.map(([workKey, workReports]) => {
                              const [workNumber, workName] = workKey.split('|||');
                              
                              return (
                                <Collapsible key={workKey} defaultOpen>
                                  <Card className="border-l-2 border-l-accent">
                                    <CollapsibleTrigger asChild>
                                      <CardHeader className="pb-2 pt-3 cursor-pointer hover:bg-accent/30 transition-colors">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-sm">{workName}</span>
                                              <Badge variant="outline" className="text-xs">Nº {workNumber}</Badge>
                                            </div>
                                          </div>
                                          <Badge variant="secondary" className="text-xs">{workReports.length} {workReports.length === 1 ? t('workReports.part') : t('workReports.parts')}</Badge>
                                        </div>
                                      </CardHeader>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                       <CardContent className="space-y-2 pt-0 pb-3">
                                        {workReports.map((report) => (
                                           <Card key={report.id} className="overflow-hidden">
                                             <CardContent className="p-3 space-y-2">
                                               <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                                 <div className="flex items-center gap-2 flex-1 min-w-0">
                                                   <Checkbox
                                                     checked={selectedReports.has(report.id)}
                                                     onCheckedChange={() => toggleReportSelection(report.id)}
                                                     id={`monthly-report-${report.id}`}
                                                   />
                                                   <div className="flex-1 min-w-0 space-y-1">
                                                     <div className="flex items-center gap-2">
                                                       <span className="text-xs text-muted-foreground truncate">
                                                         {format(new Date(report.date), 'EEEE, dd MMM', { locale: es })}
                                                       </span>
                                                       {report.approved && (
                                                         <CheckCircle className="h-3 w-3 text-green-600 shrink-0" />
                                                       )}
                                                     </div>
                                                     {getPendingSectionsCount(report) > 0 && (
                                                       <Badge variant="destructive" className="text-xs w-fit">
                                                         {getPendingSectionsCount(report)} {t('common.pendingSections')}: {getPendingSectionsNames(report)}
                                                       </Badge>
                                                     )}
                                                   </div>
                                                 </div>
                                                <div className="flex items-center gap-1 ml-2">
                                                  {canApprove && (
                                                    report.approved ? (
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onUnapprove?.(report.id)}
                                                        className="h-7 w-7 p-0"
                                                      >
                                                        <XCircle className="h-3 w-3" />
                                                      </Button>
                                                    ) : (
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onApprove?.(report.id)}
                                                        className="h-7 w-7 p-0"
                                                      >
                                                        <CheckCircle className="h-3 w-3" />
                                                      </Button>
                                                    )
                                                  )}
                                                  {!isOfi && (
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => onClone(report)}
                                                      className="h-7 w-7 p-0"
                                                      title="Clonar"
                                                    >
                                                      <Copy className="h-3 w-3" />
                                                    </Button>
                                                  )}
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDownloadExcel(report)}
                                                    className="h-7 w-7 p-0"
                                                    title="Descargar Excel"
                                                  >
                                                    <FileSpreadsheet className="h-3 w-3" />
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDownloadPDFClick(report)}
                                                    className="h-7 w-7 p-0"
                                                    title="Descargar PDF"
                                                  >
                                                    <FileText className="h-3 w-3" />
                                                  </Button>
                                                  {canModifyReport(report) && (
                                                    <>
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onEdit(report, viewMode, workReports)}
                                                        className="h-7 w-7 p-0"
                                                      >
                                                        <Edit className="h-3 w-3" />
                                                      </Button>
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onDelete(report.id)}
                                                        className="h-7 w-7 p-0 text-destructive"
                                                      >
                                                        <Trash2 className="h-3 w-3" />
                                                      </Button>
                                                    </>
                                                  )}
                                                  {report.status === 'completed' && isSuperAdmin && onReopenReport && (
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => void onReopenReport(report)}
                                                      className="h-7 w-7 p-0 text-amber-600 hover:text-amber-800"
                                                      title="Reabrir parte (super admin)"
                                                    >
                                                      <LockOpen className="h-3 w-3" />
                                                    </Button>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Botones de estado */}
                                              <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-border">
                                                <Button
                                                  variant={report.status === 'completed' ? 'default' : 'outline'}
                                                  size="sm"
                                                  className={`h-7 ${
                                                    report.status === 'completed'
                                                      ? 'bg-success text-white hover:bg-success/90'
                                                      : 'text-success hover:bg-success/10 hover:text-success border-success/30'
                                                  }`}
                                                  title="Completado"
                                                  disabled
                                                >
                                                  <CheckCircle className="h-3 w-3 sm:mr-1" />
                                                  <span className="text-xs hidden sm:inline">Completado</span>
                                                </Button>
                                                <Button
                                                  variant={report.status === 'missing_data' ? 'default' : 'outline'}
                                                  size="sm"
                                                  className={`h-7 ${
                                                    report.status === 'missing_data'
                                                      ? 'bg-warning text-white hover:bg-warning/90'
                                                      : 'text-warning hover:bg-warning/10 hover:text-warning border-warning/30'
                                                  }`}
                                                  title="Faltan datos"
                                                  disabled
                                                >
                                                  <FileText className="h-3 w-3 sm:mr-1" />
                                                  <span className="text-xs hidden sm:inline">Faltan datos</span>
                                                </Button>
                                                <Button
                                                  variant={(report.status === 'missing_delivery_notes' || report.missingDeliveryNotes) ? 'default' : 'outline'}
                                                  size="sm"
                                                  className={`h-7 ${
                                                    (report.status === 'missing_delivery_notes' || report.missingDeliveryNotes)
                                                      ? 'bg-destructive text-white hover:bg-destructive/90'
                                                      : 'text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30'
                                                  }`}
                                                  title="Faltan albaranes"
                                                  disabled
                                                >
                                                  <FileBarChart className="h-3 w-3 sm:mr-1" />
                                                  <span className="text-xs hidden sm:inline">Faltan albaranes</span>
                                                </Button>
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
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* AdvancedReports dialog */}
      {!isOfi && (
        <AdvancedReports
          reports={reports}
          isOpen={showAdvancedReports}
          onClose={() => setShowAdvancedReports(false)}
        />
      )}

      {/* Diálogo para preguntar si incluir imágenes */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="app-dialog-title">Incluir imágenes en el PDF</DialogTitle>
            <DialogDescription className="app-page-subtitle">
              ¿Deseas incluir las imágenes de los albaranes y documentos en el PDF?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="app-btn-soft"
              onClick={() => {
                if (pendingReport) {
                  if (pendingAction === 'download') {
                    handleDownloadPDF(pendingReport, false);
                  } else {
                    handleViewPDF(pendingReport, false);
                  }
                }
              }}
            >
              No, sin imágenes
            </Button>
            <Button className="app-btn-primary"
              onClick={() => {
                if (pendingReport) {
                  if (pendingAction === 'download') {
                    handleDownloadPDF(pendingReport, true);
                  } else {
                    handleViewPDF(pendingReport, true);
                  }
                }
              }}
            >
              Sí, incluir imágenes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo para descarga masiva con opción de imágenes */}
      <Dialog open={showBulkImageDialog} onOpenChange={setShowBulkImageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="app-dialog-title">Descargar partes seleccionados</DialogTitle>
            <DialogDescription className="app-page-subtitle">
              Vas a descargar {selectedReports.size} {selectedReports.size === 1 ? 'parte' : 'partes'} de trabajo en formato PDF.
              ¿Deseas incluir las imágenes de los albaranes y documentos?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="app-btn-soft"
              onClick={() => downloadSelectedPDFs(false)}
              disabled={isDownloadingBulk}
            >
              No, sin imágenes
            </Button>
            <Button className="app-btn-primary"
              onClick={() => downloadSelectedPDFs(true)}
              disabled={isDownloadingBulk}
            >
              Sí, incluir imágenes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación de archivado masivo */}
      <Dialog open={showArchiveConfirmDialog} onOpenChange={setShowArchiveConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="app-dialog-title flex items-center gap-2">
              <Archive className="h-5 w-5" />
              Confirmar archivado
            </DialogTitle>
            <DialogDescription className="app-page-subtitle pt-4">
              {pendingArchiveGroup && (
                <>
                  ¿Estás seguro de que deseas archivar <strong>{pendingArchiveGroup.reports.length}</strong>{' '}
                  {pendingArchiveGroup.reports.length === 1 ? 'parte' : 'partes'} de{' '}
                  <strong>{pendingArchiveGroup.name}</strong>?
                  <br /><br />
                  Los partes archivados no aparecerán en la lista principal, pero podrás restaurarlos desde "Ver archivados".
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="app-btn-soft"
              onClick={() => {
                setShowArchiveConfirmDialog(false);
                setPendingArchiveGroup(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="app-btn-soft bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:text-destructive-foreground"
              onClick={confirmArchiveGroup}
              disabled={isArchiving}
            >
              {isArchiving ? 'Archivando...' : 'Archivar todos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showStatusWarning} onOpenChange={setShowStatusWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="app-dialog-title flex items-center gap-2 text-warning">
              <FileText className="h-5 w-5" />
              Parte No Completado
            </DialogTitle>
            <DialogDescription className="app-page-subtitle pt-4">
              {statusWarningMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="app-btn-primary" onClick={() => setShowStatusWarning(false)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visor de PDF Integrado */}
      <Dialog open={pdfViewerOpen} onOpenChange={handleClosePdfViewer}>
        <DialogContent className="max-w-6xl h-[90vh] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="app-dialog-title">Visualizador de Parte de Trabajo</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {pdfBuffer ? (
              <PdfViewer pdfBuffer={pdfBuffer} />
            ) : (
              pdfUrl && <PdfViewer pdfUrl={pdfUrl} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

