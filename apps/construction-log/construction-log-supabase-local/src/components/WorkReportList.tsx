import { useState, useMemo, useEffect } from 'react';
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
import { exportToExcel } from '@/utils/exportUtils';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/hooks/useOrganization';
import { useWorkReportDownloads } from '@/hooks/useWorkReportDownloads';
import JSZip from 'jszip';

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
  canApprove = false,
  companyLogo,
  onReload,
  isReloading = false
}: WorkReportListProps) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { isSiteManager, isAdmin, isOfi, isMaster } = useUserPermissions();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const { trackDownload } = useWorkReportDownloads();
  const [selectedWork, setSelectedWork] = useState('');
  const [dateRange, setDateRange] = useState('weekly');
  const [showAdvancedReports, setShowAdvancedReports] = useState(false);
  const [viewMode, setViewMode] = useState<'byForeman' | 'weekly' | 'monthly'>('byForeman');
  const dfLocale = useMemo(() => {
    const map: Record<string, any> = { es, en: enUS, 'en-US': enUS, fr, it, de: deLocale };
    return map[i18n.language] || es;
  }, [i18n.language]);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [pdfBuffer, setPdfBuffer] = useState<Uint8Array | null>(null);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [pendingReport, setPendingReport] = useState<WorkReport | null>(null);
  const [pendingAction, setPendingAction] = useState<'view' | 'download'>('download');
  const [selectedWorkFilter, setSelectedWorkFilter] = useState<string>('');
  const [availableWorks, setAvailableWorks] = useState<Array<{id: string, number: string, name: string}>>([]);
  const [showStatusWarning, setShowStatusWarning] = useState(false);
  const [statusWarningMessage, setStatusWarningMessage] = useState('');
  
  // Archive dialog state
  const [showArchivedDialog, setShowArchivedDialog] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showArchiveConfirmDialog, setShowArchiveConfirmDialog] = useState(false);
  const [pendingArchiveGroup, setPendingArchiveGroup] = useState<{ name: string; reports: WorkReport[] } | null>(null);
  
  // Advanced filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dateFilterStart, setDateFilterStart] = useState<string>('');
  const [dateFilterEnd, setDateFilterEnd] = useState<string>('');
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'approved' | 'not-approved'>('all');
  const [foremanFilter, setForemanFilter] = useState<string>('');
  const [siteManagerFilter, setSiteManagerFilter] = useState<string>('');
  
  // Status filter from summary cards
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  
  // Office role export filters
  const [officeExportWork, setOfficeExportWork] = useState<string>('');
  const [officeExportPeriod, setOfficeExportPeriod] = useState<'weekly' | 'monthly'>('weekly');
  
  // Map para almacenar nombres de editores por user_id
  const [editorNames, setEditorNames] = useState<Map<string, string>>(new Map());

  // Selection state for bulk PDF/Excel download
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [isDownloadingBulk, setIsDownloadingBulk] = useState(false);
  const [isDownloadingExcelBulk, setIsDownloadingExcelBulk] = useState(false);
  const [showBulkImageDialog, setShowBulkImageDialog] = useState(false);



  // Cargar obras disponibles desde los partes
  useEffect(() => {
    const loadWorks = async () => {
      if (!user) return;

      try {
        // Obtener obras asignadas al usuario
        const { data: assignments, error: assignError } = await supabase
          .from('work_assignments')
          .select('work_id')
          .eq('user_id', user.id);

        if (assignError) throw assignError;

        if (assignments && assignments.length > 0) {
          const workIds = assignments.map(a => a.work_id);
          
          // Obtener los detalles de las obras
          const { data: works, error: worksError } = await supabase
            .from('works')
            .select('id, number, name')
            .in('id', workIds);

          if (worksError) throw worksError;
          
          if (works) {
            setAvailableWorks(works);
          }
        }
      } catch (error) {
        console.error('Error loading works:', error);
      }
    };

    loadWorks();
  }, [user]);

  // Cargar nombres de editores para reportes que han sido editados
  useEffect(() => {
    const loadEditorNames = async () => {
      const editorIds = new Set<string>();
      reports.forEach(report => {
        if (report.lastEditedBy) {
          editorIds.add(report.lastEditedBy);
        }
      });

      if (editorIds.size === 0) return;

      try {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(editorIds));

        if (error) throw error;

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


  // Filtrar partes archivados (para el dialog)
  const archivedReports = useMemo(() => {
    return reports.filter(r => r.isArchived === true);
  }, [reports]);

  // Reportes base para las estadísticas (respetando el rol del usuario)
  // El rol ofi solo debe ver estadísticas de reportes con status='completed'
  const reportsForStats = useMemo(() => {
    let baseReports = reports.filter(r => !r.isArchived);
    
    // Si el usuario es solo ofi (no admin ni master), filtrar a solo completed
    if (isOfi && !isAdmin && !isMaster) {
      baseReports = baseReports.filter(r => r.status === 'completed');
    }
    
    return baseReports;
  }, [reports, isOfi, isAdmin, isMaster]);

  // Filtrar reportes con todos los filtros aplicados (excluyendo archivados)
  const filteredReports = useMemo(() => {
    // Secciones que cuentan para determinar si está completado
    const totalSections: WorkReportSection[] = [
      'work_groups',
      'machinery_groups',
      'subcontract_groups',
      'observations'
    ];
    
    // PRIMERO: Excluir partes archivados
    let filtered = reports.filter(r => !r.isArchived);
    
    // Filtro por estado desde las tarjetas de resumen
    if (statusFilter !== 'all') {
      filtered = filtered.filter(report => {
        const completedSections = report.completedSections || [];
        const allSectionsCompleted = totalSections.every(section => 
          completedSections.includes(section)
        );
        const isCompleted = allSectionsCompleted || report.status === 'completed';
        
        switch (statusFilter) {
          case 'completed':
            return isCompleted;
          case 'pending':
            return !isCompleted;
          case 'approved':
            return isCompleted && report.approved === true;
          case 'not-approved':
            return isCompleted && !report.approved;
          default:
            return true;
        }
      });
    }
    
    // Filtro por obra
    if (selectedWorkFilter && selectedWorkFilter !== 'all') {
      filtered = filtered.filter(r => r.workId === selectedWorkFilter);
    }
    
    // Filtro por rango de fechas
    if (dateFilterStart) {
      filtered = filtered.filter(r => new Date(r.date) >= new Date(dateFilterStart));
    }
    if (dateFilterEnd) {
      filtered = filtered.filter(r => new Date(r.date) <= new Date(dateFilterEnd));
    }
    
    // Filtro por estado de aprobación (del filtro avanzado)
    if (approvalFilter === 'approved') {
      filtered = filtered.filter(r => r.approved === true);
    } else if (approvalFilter === 'not-approved') {
      filtered = filtered.filter(r => !r.approved);
    }
    
    // Filtro por encargado (normalizado a Title Case)
    if (foremanFilter && foremanFilter !== 'all') {
      filtered = filtered.filter(r => {
        const normalizedForeman = r.foreman
          ?.toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        return normalizedForeman === foremanFilter;
      });
    }
    
    // Filtro por jefe de obra (normalizado a Title Case)
    if (siteManagerFilter && siteManagerFilter !== 'all') {
      filtered = filtered.filter(r => {
        const normalizedSiteManager = r.siteManager
          ?.toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        return normalizedSiteManager === siteManagerFilter;
      });
    }
    
    return filtered;
  }, [reports, statusFilter, selectedWorkFilter, dateFilterStart, dateFilterEnd, approvalFilter, foremanFilter, siteManagerFilter]);

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

  // Toggle report selection
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

  // Select all filtered reports
  const selectAllReports = () => {
    if (selectedReports.size === filteredReports.length) {
      setSelectedReports(new Set());
    } else {
      setSelectedReports(new Set(filteredReports.map(r => r.id)));
    }
  };

  // Show dialog to ask about images for bulk download
  const handleBulkDownloadClick = () => {
    if (selectedReports.size === 0) {
      toast({
        title: "No hay partes seleccionados",
        description: "Selecciona al menos un parte de trabajo para descargar",
        variant: "destructive"
      });
      return;
    }
    setShowBulkImageDialog(true);
  };

  // Download selected reports as PDFs in a ZIP file
  const downloadSelectedPDFs = async (includeImages: boolean) => {
    setShowBulkImageDialog(false);
    setIsDownloadingBulk(true);
    
    try {
      const zip = new JSZip();
      // Para rol oficina, solo descargar partes aprobados
      const reportsToDownload = filteredReports.filter(r => 
        selectedReports.has(r.id) && (!isOfi || r.approved === true)
      );

      if (reportsToDownload.length === 0) {
        toast({
          title: "Sin partes para descargar",
          description: isOfi 
            ? "Solo se pueden descargar partes aprobados. Ninguno de los seleccionados está aprobado."
            : "No hay partes seleccionados para descargar",
          variant: "destructive"
        });
        setIsDownloadingBulk(false);
        return;
      }
      
      let successCount = 0;
      let failCount = 0;

      for (const report of reportsToDownload) {
        try {
          const pdfBlob = await generateWorkReportPDF(
            report,
            includeImages,
            companyLogo,
            organization?.brand_color,
            true  // returnBlob
          );

          if (pdfBlob) {
            const fileName = `Parte_${report.workNumber}_${format(new Date(report.date), 'yyyy-MM-dd')}.pdf`;
            zip.file(fileName, pdfBlob);
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          console.error(`Error generating PDF for report ${report.id}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Partes_PDF_${format(new Date(), 'yyyy-MM-dd')}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Registrar las descargas para notificaciones de modificación
        if (isSiteManager || isAdmin || isMaster || isOfi) {
          for (const report of reportsToDownload) {
            await trackDownload(report.id, 'pdf');
          }
        }

        toast({
          title: "Descarga completada",
          description: `Se han descargado ${successCount} partes en ZIP${failCount > 0 ? ` (${failCount} fallaron)` : ''}`,
        });

        // Clear selection after successful download
        setSelectedReports(new Set());
      } else {
        throw new Error("No se pudo generar ningún PDF");
      }
    } catch (error) {
      console.error('Error downloading PDFs:', error);
      toast({
        title: "Error al descargar",
        description: "Hubo un problema al generar los PDFs",
        variant: "destructive"
      });
    } finally {
      setIsDownloadingBulk(false);
    }
  };

  // Download selected reports as Excel files in a ZIP
  const downloadSelectedExcels = async () => {
    if (selectedReports.size === 0) {
      toast({
        title: "No hay partes seleccionados",
        description: "Selecciona al menos un parte de trabajo para descargar",
        variant: "destructive"
      });
      return;
    }

    setIsDownloadingExcelBulk(true);
    
    try {
      const { exportSingleReportToExcel } = await import('@/utils/exportUtils');
      const XLSX = await import('xlsx-js-style');
      const zip = new JSZip();
      // Para rol oficina, solo descargar partes aprobados
      const reportsToDownload = filteredReports.filter(r => 
        selectedReports.has(r.id) && (!isOfi || r.approved === true)
      );

      if (reportsToDownload.length === 0) {
        toast({
          title: "Sin partes para descargar",
          description: isOfi 
            ? "Solo se pueden descargar partes aprobados. Ninguno de los seleccionados está aprobado."
            : "No hay partes seleccionados para descargar",
          variant: "destructive"
        });
        setIsDownloadingExcelBulk(false);
        return;
      }
      
      let successCount = 0;
      let failCount = 0;

      for (const report of reportsToDownload) {
        try {
          // We need to generate the Excel as a blob/buffer
          // Import the export function and modify to return workbook
          const { supabase } = await import('@/integrations/supabase/client');
          
          // Fetch rental machinery data for this report
          let rentalMachineryData: any[] = [];
          if (report.workId) {
            const { data } = await supabase
              .from('work_rental_machinery')
              .select('*')
              .eq('work_id', report.workId);
            if (data) rentalMachineryData = data;
          }

          // Create workbook for this report
          const wb = XLSX.utils.book_new();
          
          // General Info sheet
          const generalData = [
            ['PARTE DE TRABAJO'],
            [],
            ['Nº Obra', report.workNumber || 'N/A'],
            ['Nombre Obra', report.workName || 'N/A'],
            ['Fecha', format(new Date(report.date), 'dd/MM/yyyy')],
            ['Encargado', report.foreman || 'N/A'],
            ['Jefe de Obra', report.siteManager || 'N/A'],
            ['Horas Encargado', report.foremanHours?.toString() || '0'],
            [],
            ['Observaciones', report.observations || '']
          ];
          const wsGeneral = XLSX.utils.aoa_to_sheet(generalData);
          XLSX.utils.book_append_sheet(wb, wsGeneral, 'Info General');

          // Work groups sheet
          if (report.workGroups && report.workGroups.length > 0) {
            const workData: any[][] = [['Empresa', 'Trabajador', 'Horas', 'Actividad']];
            report.workGroups.forEach(group => {
              group.items.forEach(item => {
                workData.push([group.company, item.name, item.hours, item.activity || '']);
              });
            });
            const wsWork = XLSX.utils.aoa_to_sheet(workData);
            XLSX.utils.book_append_sheet(wb, wsWork, 'Mano de Obra');
          }

          // Machinery groups sheet
          if (report.machineryGroups && report.machineryGroups.length > 0) {
            const machData: any[][] = [['Empresa', 'Tipo Maquinaria', 'Horas', 'Actividad']];
            report.machineryGroups.forEach(group => {
              group.items.forEach(item => {
                machData.push([group.company, item.type, item.hours, item.activity || '']);
              });
            });
            const wsMach = XLSX.utils.aoa_to_sheet(machData);
            XLSX.utils.book_append_sheet(wb, wsMach, 'Maquinaria');
          }

          // Rental machinery sheet
          if (rentalMachineryData.length > 0) {
            const rentalData: any[][] = [['Proveedor', 'Tipo', 'Nº Máquina', 'Fecha Entrega', 'Tarifa Diaria']];
            rentalMachineryData.forEach(item => {
              rentalData.push([
                item.provider,
                item.type,
                item.machine_number,
                format(new Date(item.delivery_date), 'dd/MM/yyyy'),
                item.daily_rate || ''
              ]);
            });
            const wsRental = XLSX.utils.aoa_to_sheet(rentalData);
            XLSX.utils.book_append_sheet(wb, wsRental, 'Maq. Alquiler');
          }

          // Materials sheet
          if (report.materialGroups && report.materialGroups.length > 0) {
            const matData: any[][] = [['Proveedor', 'Material', 'Cantidad', 'Unidad', 'Nº Albarán']];
            report.materialGroups.forEach(group => {
              group.items.forEach(item => {
                matData.push([group.supplier, item.name, item.quantity, item.unit, group.invoiceNumber || '']);
              });
            });
            const wsMat = XLSX.utils.aoa_to_sheet(matData);
            XLSX.utils.book_append_sheet(wb, wsMat, 'Materiales');
          }

          // Subcontracts sheet
          if (report.subcontractGroups && report.subcontractGroups.length > 0) {
            const subData: any[][] = [['Empresa', 'Trabajos Realizados']];
            report.subcontractGroups.forEach(group => {
              group.items.forEach(item => {
                subData.push([group.company, item.activity]);
              });
            });
            const wsSub = XLSX.utils.aoa_to_sheet(subData);
            XLSX.utils.book_append_sheet(wb, wsSub, 'Subcontratas');
          }

          // Generate Excel buffer
          const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const fileName = `Parte_${report.workNumber}_${format(new Date(report.date), 'yyyy-MM-dd')}.xlsx`;
          zip.file(fileName, excelBuffer);
          successCount++;
        } catch (error) {
          console.error(`Error generating Excel for report ${report.id}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Partes_Excel_${format(new Date(), 'yyyy-MM-dd')}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Registrar las descargas
        if (isSiteManager || isAdmin || isMaster || isOfi) {
          for (const report of reportsToDownload) {
            await trackDownload(report.id, 'excel');
          }
        }

        toast({
          title: "Descarga completada",
          description: `Se han descargado ${successCount} partes Excel en ZIP${failCount > 0 ? ` (${failCount} fallaron)` : ''}`,
        });

        setSelectedReports(new Set());
      } else {
        throw new Error("No se pudo generar ningún Excel");
      }
    } catch (error) {
      console.error('Error downloading Excels:', error);
      toast({
        title: "Error al descargar",
        description: "Hubo un problema al generar los archivos Excel",
        variant: "destructive"
      });
    } finally {
      setIsDownloadingExcelBulk(false);
    }
  };

  // Mostrar diálogo para preguntar si quiere incluir imágenes
  const handleViewPDFClick = (report: WorkReport) => {
    setPendingReport(report);
    setPendingAction('view');
    setShowImageDialog(true);
  };

  // Función para visualizar PDF en un visor integrado
  const handleViewPDF = async (report: WorkReport, includeImages: boolean = false) => {
    try {
      const jsPDF = (await import('jspdf')).default;
      const { default: autoTable } = await import('jspdf-autotable');
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let y = 20;

      // Título visible grande
      doc.setFontSize(22);
      doc.setTextColor(10, 10, 10);
      doc.text('PARTE DE TRABAJO', pageWidth / 2, y, { align: 'center' });
      y += 14;

      // Datos básicos claramente visibles
      doc.setFontSize(12);
      doc.text(`Nº OBRA: ${report.workNumber || 'N/A'}`, 20, y);
      doc.text(`FECHA: ${new Date(report.date).toLocaleDateString()}`, pageWidth - 80, y);
      y += 10;
      doc.text(`OBRA: ${report.workName || 'N/A'}`, 20, y);
      y += 8;

      // Separador visible
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.line(15, y, pageWidth - 15, y);
      y += 8;

      // Tabla mínima para asegurar contenido visible
      autoTable(doc, {
        head: [["Campo", "Valor"]],
        body: [
          ["Encargado", report.foreman || "-"],
          ["Jefe de obra", report.siteManager || "-"],
        ],
        startY: y,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [230, 230, 230] },
        margin: { left: 15, right: 15 }
      });

      // Exportar como Blob para usar blob: URL
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);

      // Limpiar URL previa y setear
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl('');
      }
      setPdfUrl(url);
      setPdfBuffer(null);
      setPdfViewerOpen(true);
      setShowImageDialog(false);
      setPendingReport(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo generar el PDF.',
        variant: 'destructive',
      });
    }
  };

  // Limpiar URL del PDF al cerrar el visor
  const handleClosePdfViewer = () => {
    setPdfViewerOpen(false);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl('');
    }
    setPdfBuffer(null);
  };

  // Mostrar diálogo antes de descargar PDF
  const handleDownloadPDFClick = (report: WorkReport) => {
    // Validar estado del parte
    if (report.status !== 'completed') {
      const statusMessages = {
        'missing_data': 'Este parte tiene datos incompletos. Complete todos los datos antes de descargar.',
        'missing_delivery_notes': 'Este parte tiene albaranes pendientes. Adjunte todos los albaranes antes de descargar.'
      };
      setStatusWarningMessage(statusMessages[report.status as 'missing_data' | 'missing_delivery_notes'] || 'Este parte no está completado. Complete el parte antes de descargar.');
      setShowStatusWarning(true);
      return;
    }
    
    setPendingReport(report);
    setPendingAction('download');
    setShowImageDialog(true);
  };

  const handleDownloadPDF = async (report: WorkReport, includeImages: boolean = false) => {
    try {
      const brandColor = organization?.brand_color || undefined;
      await generateWorkReportPDF(report, includeImages, companyLogo, brandColor);
      
      // Registrar la descarga para notificaciones de modificación
      if (isSiteManager || isAdmin || isMaster) {
        await trackDownload(report.id, 'pdf');
      }
      
      toast({
        title: "PDF descargado",
        description: "El parte de trabajo se ha descargado correctamente.",
      });
      setShowImageDialog(false);
      setPendingReport(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo descargar el PDF.",
        variant: "destructive",
      });
    }
  };

  // Función para descargar Excel de un solo parte
  const handleDownloadExcel = async (report: WorkReport) => {
    // Validar estado del parte
    if (report.status !== 'completed') {
      const statusMessages = {
        'missing_data': 'Este parte tiene datos incompletos. Complete todos los datos antes de exportar a Excel.',
        'missing_delivery_notes': 'Este parte tiene albaranes pendientes. Adjunte todos los albaranes antes de exportar a Excel.'
      };
      setStatusWarningMessage(statusMessages[report.status as 'missing_data' | 'missing_delivery_notes'] || 'Este parte no está completado. Complete el parte antes de exportar a Excel.');
      setShowStatusWarning(true);
      return;
    }
    
    try {
      const { exportSingleReportToExcel } = await import('@/utils/exportUtils');
      await exportSingleReportToExcel(report);
      
      // Registrar la descarga para notificaciones de modificación
      if (isSiteManager || isAdmin || isMaster) {
        await trackDownload(report.id, 'excel');
      }
      
      toast({
        title: "Excel descargado",
        description: "El parte de trabajo se ha exportado a Excel con pestañas separadas.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo exportar a Excel.",
        variant: "destructive",
      });
    }
  };

  // Helper function to check if user can edit/delete a report
  const canModifyReport = (report: WorkReport) => {
    // El creador siempre puede modificar
    if (report.createdBy === user?.id) return true;
    
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

  // Función auxiliar para obtener el número de semana del año
  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // Agrupar partes por semanas, luego por obra
  const weeklyGroups = useMemo(() => {
    const groups = new Map<string, Map<string, WorkReport[]>>();
    
    filteredReports.forEach(report => {
      const reportDate = new Date(report.date);
      const year = reportDate.getFullYear();
      const weekNum = getWeekNumber(reportDate);
      const weekKey = `${year}-S${weekNum.toString().padStart(2, '0')}`;
      const workKey = `${report.workNumber}|||${report.workName}`; // Using ||| as separator
      
      if (!groups.has(weekKey)) {
        groups.set(weekKey, new Map());
      }
      
      const weekGroup = groups.get(weekKey)!;
      if (!weekGroup.has(workKey)) {
        weekGroup.set(workKey, []);
      }
      weekGroup.get(workKey)!.push(report);
    });
    
    // Convert to array and sort weeks descending
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([weekKey, workGroups]) => {
        // Sort works by work number
        const sortedWorkGroups = Array.from(workGroups.entries())
          .sort(([a], [b]) => {
            const [numA] = a.split('|||');
            const [numB] = b.split('|||');
            return numA.localeCompare(numB);
          });
        return [weekKey, sortedWorkGroups] as const;
      });
  }, [filteredReports]);

  // Agrupar partes por meses, luego por obra
  const monthlyGroups = useMemo(() => {
    const groups = new Map<string, Map<string, WorkReport[]>>();
    
    filteredReports.forEach(report => {
      const reportDate = new Date(report.date);
      const monthKey = `${reportDate.getFullYear()}-${(reportDate.getMonth() + 1).toString().padStart(2, '0')}`;
      const workKey = `${report.workNumber}|||${report.workName}`; // Using ||| as separator
      
      if (!groups.has(monthKey)) {
        groups.set(monthKey, new Map());
      }
      
      const monthGroup = groups.get(monthKey)!;
      if (!monthGroup.has(workKey)) {
        monthGroup.set(workKey, []);
      }
      monthGroup.get(workKey)!.push(report);
    });
    
    // Convert to array and sort months descending
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, workGroups]) => {
        // Sort works by work number
        const sortedWorkGroups = Array.from(workGroups.entries())
          .sort(([a], [b]) => {
            const [numA] = a.split('|||');
            const [numB] = b.split('|||');
            return numA.localeCompare(numB);
          });
        return [monthKey, sortedWorkGroups] as const;
      });
  }, [filteredReports]);

  // Obtener lista única de encargados y jefes de obra
  const uniqueForemen = useMemo(() => {
    const foremenSet = new Set<string>();
    reports.forEach(report => {
      if (report.foreman) {
        const normalized = report.foreman
          .toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        foremenSet.add(normalized);
      }
    });
    return Array.from(foremenSet).sort();
  }, [reports]);

  const uniqueSiteManagers = useMemo(() => {
    const managersSet = new Set<string>();
    reports.forEach(report => {
      if (report.siteManager) {
        const normalized = report.siteManager
          .toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        managersSet.add(normalized);
      }
    });
    return Array.from(managersSet).sort();
  }, [reports]);

  // Agrupar partes por encargado (normalizando a Title Case para evitar duplicados)
  const foremanGroups = useMemo(() => {
    const groups = new Map<string, WorkReport[]>();
    
    filteredReports.forEach(report => {
      // Normalizar el nombre del encargado a Title Case
      const rawForeman = report.foreman || 'Sin Encargado';
      const foremanName = rawForeman === 'Sin Encargado' 
        ? rawForeman 
        : rawForeman
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
      
      if (!groups.has(foremanName)) {
        groups.set(foremanName, []);
      }
      groups.get(foremanName)!.push(report);
    });
    
    // Ordenar por nombre de encargado alfabéticamente
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredReports]);

  // Agrupar partes por obra (para rol ofi)
  const workGroups = useMemo(() => {
    const groups = new Map<string, WorkReport[]>();
    
    filteredReports.forEach(report => {
      const workKey = `${report.workNumber || 'N/A'} - ${report.workName || 'Sin nombre'}`;
      
      if (!groups.has(workKey)) {
        groups.set(workKey, []);
      }
      groups.get(workKey)!.push(report);
    });
    
    // Ordenar por número de obra alfabéticamente
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredReports]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportData(file);
      event.target.value = ''; // Reset input
    }
  };

  const uniqueWorks = [...new Set(reports.map(r => r.workName).filter(Boolean))];
  
  const clearAllFilters = () => {
    setSelectedWorkFilter('');
    setDateFilterStart('');
    setDateFilterEnd('');
    setApprovalFilter('all');
    setForemanFilter('');
    setSiteManagerFilter('');
  };
  
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
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">{t('workReports.title')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('workReports.description')}</p>
        </div>
        
        {/* Resumen de estados - usar reportes filtrados por rol para las estadísticas */}
        <WorkReportStatusSummary 
          reports={reportsForStats} 
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />
        
        {!isOfi && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <Button onClick={onCreateNew} className="btn-gradient w-full">
              <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              <span className="text-sm sm:text-base">{t('workReports.createReport')}</span>
            </Button>
            {onGoToToday && (
              <Button 
                onClick={onGoToToday} 
                variant="default"
                className="w-full"
              >
                <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                <span className="text-sm sm:text-base">{t('workReports.goToToday')}</span>
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
                  <p className="text-xs text-muted-foreground">
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
            <CardTitle className="flex items-center justify-center gap-2 text-center text-lg sm:text-xl">
              <Download className="h-5 w-5 text-primary" />
              Exportación de Informes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center mb-4">
              Selecciona la obra y el período para exportar los partes aprobados
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Selector de obra */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Seleccionar Obra</label>
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
                <label className="text-sm font-medium">Período de Exportación</label>
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
                className="w-full"
                variant="outline"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Exportar a Excel
              </Button>
              <Button
                onClick={() => handleOfficeExport('pdf')}
                disabled={!officeExportWork}
                className="w-full btn-gradient"
              >
                <FileText className="h-4 w-4 mr-2" />
                Exportar PDFs
              </Button>
            </div>
            
            {officeExportWork && (
              <div className="mt-4 p-3 bg-muted rounded-md">
                <p className="text-xs text-muted-foreground">
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
                  <CardTitle className="text-base sm:text-lg">
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
          <CardTitle className="text-center text-lg sm:text-xl">
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
                                <CardTitle className="text-base font-semibold">{groupName}</CardTitle>
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
                                   {report.lastEditedBy && report.lastEditedAt && editorNames.get(report.lastEditedBy) && (
                                     <div className="text-xs text-muted-foreground/60 italic border-l-2 border-muted pl-2">
                                       Editado por {editorNames.get(report.lastEditedBy)} el{' '}
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
                                <CardTitle className="text-base capitalize">{monthName}</CardTitle>
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
            <DialogTitle>Incluir imágenes en el PDF</DialogTitle>
            <DialogDescription>
              ¿Deseas incluir las imágenes de los albaranes y documentos en el PDF?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
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
            <Button
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
            <DialogTitle>Descargar partes seleccionados</DialogTitle>
            <DialogDescription>
              Vas a descargar {selectedReports.size} {selectedReports.size === 1 ? 'parte' : 'partes'} de trabajo en formato PDF.
              ¿Deseas incluir las imágenes de los albaranes y documentos?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => downloadSelectedPDFs(false)}
              disabled={isDownloadingBulk}
            >
              No, sin imágenes
            </Button>
            <Button
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
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              Confirmar archivado
            </DialogTitle>
            <DialogDescription className="pt-4">
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
              onClick={() => {
                setShowArchiveConfirmDialog(false);
                setPendingArchiveGroup(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
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
            <DialogTitle className="flex items-center gap-2 text-warning">
              <FileText className="h-5 w-5" />
              Parte No Completado
            </DialogTitle>
            <DialogDescription className="pt-4">
              {statusWarningMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowStatusWarning(false)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visor de PDF Integrado */}
      <Dialog open={pdfViewerOpen} onOpenChange={handleClosePdfViewer}>
        <DialogContent className="max-w-6xl h-[90vh] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>Visualizador de Parte de Trabajo</DialogTitle>
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
