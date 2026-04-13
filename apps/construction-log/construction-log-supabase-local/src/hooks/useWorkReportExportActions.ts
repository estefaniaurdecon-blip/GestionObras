import { useState } from 'react';
import { WorkReport } from '@/types/workReport';
import { generateWorkReportPDF } from '@/utils/pdfGenerator';
import { listRentalMachinery } from '@/integrations/api/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import JSZip from 'jszip';

export interface UseWorkReportExportActionsParams {
  filteredReports: WorkReport[];
  isOfi: boolean;
  isSiteManager: boolean;
  isAdmin: boolean;
  isMaster: boolean;
  companyLogo?: string;
  brandColor?: string;
  trackDownload: (reportId: string, type: 'pdf' | 'excel') => Promise<void>;
}

export interface UseWorkReportExportActionsResult {
  // State
  pdfViewerOpen: boolean;
  pdfUrl: string;
  pdfBuffer: Uint8Array | null;
  showImageDialog: boolean;
  pendingReport: WorkReport | null;
  pendingAction: 'view' | 'download';
  showStatusWarning: boolean;
  statusWarningMessage: string;
  selectedReports: Set<string>;
  isDownloadingBulk: boolean;
  isDownloadingExcelBulk: boolean;
  showBulkImageDialog: boolean;
  // Setters exposed for dialog onOpenChange callbacks
  setPdfViewerOpen: (v: boolean) => void;
  setShowImageDialog: (v: boolean) => void;
  setShowStatusWarning: (v: boolean) => void;
  setShowBulkImageDialog: (v: boolean) => void;
  // Functions
  toggleReportSelection: (reportId: string) => void;
  selectAllReports: () => void;
  handleBulkDownloadClick: () => void;
  downloadSelectedPDFs: (includeImages: boolean) => Promise<void>;
  downloadSelectedExcels: () => Promise<void>;
  handleViewPDFClick: (report: WorkReport) => void;
  handleViewPDF: (report: WorkReport, includeImages?: boolean) => Promise<void>;
  handleClosePdfViewer: () => void;
  handleDownloadPDFClick: (report: WorkReport) => void;
  handleDownloadPDF: (report: WorkReport, includeImages?: boolean) => Promise<void>;
  handleDownloadExcel: (report: WorkReport) => Promise<void>;
}

export function useWorkReportExportActions({
  filteredReports,
  isOfi,
  isSiteManager,
  isAdmin,
  isMaster,
  companyLogo,
  brandColor,
  trackDownload,
}: UseWorkReportExportActionsParams): UseWorkReportExportActionsResult {
  const { toast } = useToast();

  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [pdfBuffer, setPdfBuffer] = useState<Uint8Array | null>(null);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [pendingReport, setPendingReport] = useState<WorkReport | null>(null);
  const [pendingAction, setPendingAction] = useState<'view' | 'download'>('download');
  const [showStatusWarning, setShowStatusWarning] = useState(false);
  const [statusWarningMessage, setStatusWarningMessage] = useState('');
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [isDownloadingBulk, setIsDownloadingBulk] = useState(false);
  const [isDownloadingExcelBulk, setIsDownloadingExcelBulk] = useState(false);
  const [showBulkImageDialog, setShowBulkImageDialog] = useState(false);

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

  // Select / deselect all filtered reports
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
        title: 'No hay partes seleccionados',
        description: 'Selecciona al menos un parte de trabajo para descargar',
        variant: 'destructive',
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
      const reportsToDownload = filteredReports.filter(r =>
        selectedReports.has(r.id) && (!isOfi || r.approved === true)
      );

      if (reportsToDownload.length === 0) {
        toast({
          title: 'Sin partes para descargar',
          description: isOfi
            ? 'Solo se pueden descargar partes aprobados. Ninguno de los seleccionados está aprobado.'
            : 'No hay partes seleccionados para descargar',
          variant: 'destructive',
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
            brandColor,
            true // returnBlob
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

        if (isSiteManager || isAdmin || isMaster || isOfi) {
          for (const report of reportsToDownload) {
            await trackDownload(report.id, 'pdf');
          }
        }

        toast({
          title: 'Descarga completada',
          description: `Se han descargado ${successCount} partes en ZIP${failCount > 0 ? ` (${failCount} fallaron)` : ''}`,
        });

        setSelectedReports(new Set());
      } else {
        throw new Error('No se pudo generar ningún PDF');
      }
    } catch (error) {
      console.error('Error downloading PDFs:', error);
      toast({
        title: 'Error al descargar',
        description: 'Hubo un problema al generar los PDFs',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingBulk(false);
    }
  };

  // Download selected reports as Excel files in a ZIP
  const downloadSelectedExcels = async () => {
    if (selectedReports.size === 0) {
      toast({
        title: 'No hay partes seleccionados',
        description: 'Selecciona al menos un parte de trabajo para descargar',
        variant: 'destructive',
      });
      return;
    }

    setIsDownloadingExcelBulk(true);

    try {
      const { exportSingleReportToExcel: _unused } = await import('@/utils/exportUtils');
      const XLSX = await import('xlsx-js-style');
      const zip = new JSZip();
      const reportsToDownload = filteredReports.filter(r =>
        selectedReports.has(r.id) && (!isOfi || r.approved === true)
      );

      if (reportsToDownload.length === 0) {
        toast({
          title: 'Sin partes para descargar',
          description: isOfi
            ? 'Solo se pueden descargar partes aprobados. Ninguno de los seleccionados está aprobado.'
            : 'No hay partes seleccionados para descargar',
          variant: 'destructive',
        });
        setIsDownloadingExcelBulk(false);
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const report of reportsToDownload) {
        try {
          // Fetch rental machinery data for this report
          let rentalMachineryData: {
            provider: string;
            type: string;
            machine_number: string;
            delivery_date: string;
            daily_rate: number;
          }[] = [];
          if (report.workId) {
            const projectId = Number(report.workId);
            if (Number.isFinite(projectId)) {
              const rentalRows = await listRentalMachinery({ projectId, limit: 500 });
              rentalMachineryData = rentalRows
                .map(row => ({
                  provider: row.provider || '',
                  type: row.name || row.description || '',
                  machine_number: String(row.id),
                  delivery_date: row.start_date,
                  daily_rate:
                    typeof row.price === 'number'
                      ? row.price
                      : Number.isFinite(Number(row.price))
                        ? Number(row.price)
                        : 0,
                }))
                .sort(
                  (a, b) =>
                    new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime()
                );
            }
          }

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
            ['Observaciones', report.observations || ''],
          ];
          const wsGeneral = XLSX.utils.aoa_to_sheet(generalData);
          XLSX.utils.book_append_sheet(wb, wsGeneral, 'Info General');

          // Work groups sheet
          if (report.workGroups && report.workGroups.length > 0) {
            const workData: (string | number)[][] = [['Empresa', 'Trabajador', 'Horas', 'Actividad']];
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
            const machData: (string | number)[][] = [['Empresa', 'Tipo Maquinaria', 'Horas', 'Actividad']];
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
            const rentalData: (string | number)[][] = [['Proveedor', 'Tipo', 'Nº Máquina', 'Fecha Entrega', 'Tarifa Diaria']];
            rentalMachineryData.forEach(item => {
              rentalData.push([
                item.provider,
                item.type,
                item.machine_number,
                format(new Date(item.delivery_date), 'dd/MM/yyyy'),
                item.daily_rate || '',
              ]);
            });
            const wsRental = XLSX.utils.aoa_to_sheet(rentalData);
            XLSX.utils.book_append_sheet(wb, wsRental, 'Maq. Alquiler');
          }

          // Materials sheet
          if (report.materialGroups && report.materialGroups.length > 0) {
            const matData: (string | number)[][] = [['Proveedor', 'Material', 'Cantidad', 'Unidad', 'Nº Albarán']];
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
            const subData: (string | number)[][] = [['Empresa', 'Trabajos Realizados']];
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

        if (isSiteManager || isAdmin || isMaster || isOfi) {
          for (const report of reportsToDownload) {
            await trackDownload(report.id, 'excel');
          }
        }

        toast({
          title: 'Descarga completada',
          description: `Se han descargado ${successCount} partes Excel en ZIP${failCount > 0 ? ` (${failCount} fallaron)` : ''}`,
        });

        setSelectedReports(new Set());
      } else {
        throw new Error('No se pudo generar ningún Excel');
      }
    } catch (error) {
      console.error('Error downloading Excels:', error);
      toast({
        title: 'Error al descargar',
        description: 'Hubo un problema al generar los archivos Excel',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingExcelBulk(false);
    }
  };

  // Show image-inclusion dialog before PDF view
  const handleViewPDFClick = (report: WorkReport) => {
    setPendingReport(report);
    setPendingAction('view');
    setShowImageDialog(true);
  };

  // Generate and open a PDF in the integrated viewer
  const handleViewPDF = async (report: WorkReport, includeImages: boolean = false) => {
    try {
      const jsPDF = (await import('jspdf')).default;
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 20;

      doc.setFontSize(22);
      doc.setTextColor(10, 10, 10);
      doc.text('PARTE DE TRABAJO', pageWidth / 2, y, { align: 'center' });
      y += 14;

      doc.setFontSize(12);
      doc.text(`Nº OBRA: ${report.workNumber || 'N/A'}`, 20, y);
      doc.text(`FECHA: ${new Date(report.date).toLocaleDateString()}`, pageWidth - 80, y);
      y += 10;
      doc.text(`OBRA: ${report.workName || 'N/A'}`, 20, y);
      y += 8;

      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.line(15, y, pageWidth - 15, y);
      y += 8;

      autoTable(doc, {
        head: [['Campo', 'Valor']],
        body: [
          ['Encargado', report.foreman || '-'],
          ['Jefe de obra', report.siteManager || '-'],
        ],
        startY: y,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [230, 230, 230] },
        margin: { left: 15, right: 15 },
      });

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);

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
      console.error('Error viewing PDF:', error);
      toast({
        title: 'Error',
        description: 'No se pudo generar el PDF.',
        variant: 'destructive',
      });
    }
  };

  // Close PDF viewer and revoke object URL
  const handleClosePdfViewer = () => {
    setPdfViewerOpen(false);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl('');
    }
    setPdfBuffer(null);
  };

  // Show status warning or image dialog before downloading a single PDF
  const handleDownloadPDFClick = (report: WorkReport) => {
    if (report.status !== 'completed') {
      const statusMessages: Record<string, string> = {
        missing_data: 'Este parte tiene datos incompletos. Complete todos los datos antes de descargar.',
        missing_delivery_notes:
          'Este parte tiene albaranes pendientes. Adjunte todos los albaranes antes de descargar.',
      };
      setStatusWarningMessage(
        statusMessages[report.status] ||
          'Este parte no está completado. Complete el parte antes de descargar.'
      );
      setShowStatusWarning(true);
      return;
    }

    setPendingReport(report);
    setPendingAction('download');
    setShowImageDialog(true);
  };

  const handleDownloadPDF = async (report: WorkReport, includeImages: boolean = false) => {
    try {
      await generateWorkReportPDF(report, includeImages, companyLogo, brandColor);

      if (isSiteManager || isAdmin || isMaster) {
        await trackDownload(report.id, 'pdf');
      }

      toast({
        title: 'PDF descargado',
        description: 'El parte de trabajo se ha descargado correctamente.',
      });
      setShowImageDialog(false);
      setPendingReport(null);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: 'Error',
        description: 'No se pudo descargar el PDF.',
        variant: 'destructive',
      });
    }
  };

  // Download a single report as Excel
  const handleDownloadExcel = async (report: WorkReport) => {
    if (report.status !== 'completed') {
      const statusMessages: Record<string, string> = {
        missing_data:
          'Este parte tiene datos incompletos. Complete todos los datos antes de exportar a Excel.',
        missing_delivery_notes:
          'Este parte tiene albaranes pendientes. Adjunte todos los albaranes antes de exportar a Excel.',
      };
      setStatusWarningMessage(
        statusMessages[report.status] ||
          'Este parte no está completado. Complete el parte antes de exportar a Excel.'
      );
      setShowStatusWarning(true);
      return;
    }

    try {
      const { exportSingleReportToExcel } = await import('@/utils/exportUtils');
      await exportSingleReportToExcel(report);

      if (isSiteManager || isAdmin || isMaster) {
        await trackDownload(report.id, 'excel');
      }

      toast({
        title: 'Excel descargado',
        description: 'El parte de trabajo se ha exportado a Excel con pestañas separadas.',
      });
    } catch (error) {
      console.error('Error downloading Excel:', error);
      toast({
        title: 'Error',
        description: 'No se pudo exportar a Excel.',
        variant: 'destructive',
      });
    }
  };

  return {
    // State
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
    // Setters
    setPdfViewerOpen,
    setShowImageDialog,
    setShowStatusWarning,
    setShowBulkImageDialog,
    // Functions
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
  };
}
