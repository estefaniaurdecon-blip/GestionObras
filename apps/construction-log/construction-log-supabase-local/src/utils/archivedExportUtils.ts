import JSZip from 'jszip';
import { WorkReport } from '@/types/workReport';
import { generateWorkReportPDF } from './pdfGenerator';
import { format as formatDate } from 'date-fns';
import { es } from 'date-fns/locale';

type XlsxModule = typeof import('xlsx-js-style');

// Helper function to apply center alignment to all cells in a worksheet
const applyCenterAlignment = (worksheet: XlsxModule['WorkSheet'], XLSX: XlsxModule) => {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      if (!worksheet[cellAddress]) continue;
      
      if (!worksheet[cellAddress].s) {
        worksheet[cellAddress].s = {};
      }
      worksheet[cellAddress].s.alignment = { horizontal: 'center', vertical: 'center' };
    }
  }
};

/**
 * Genera un archivo Excel para un reporte individual
 */
export const generateSingleReportExcel = async (report: WorkReport): Promise<Blob> => {
  const XLSX = await import('xlsx-js-style');
  const wb = XLSX.utils.book_new();

  // 1. INFORMACIÓN GENERAL DEL PARTE
  const generalData = [{
    'Fecha': new Date(report.date).toLocaleDateString('es-ES'),
    'Nº Obra': report.workNumber || '',
    'Nombre Obra': report.workName || '',
    'Encargado': report.foreman || '',
    'Horas Encargado': report.foremanHours || 0,
    'Jefe de Obra': report.siteManager || '',
    'Observaciones': report.observations || ''
  }];
  const generalWs = XLSX.utils.json_to_sheet(generalData);
  generalWs['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, 
    { wch: 15 }, { wch: 20 }, { wch: 50 }
  ];
  applyCenterAlignment(generalWs, XLSX);
  XLSX.utils.book_append_sheet(wb, generalWs, 'Información General');

  // 2. MANO DE OBRA
  if (report.workGroups && report.workGroups.length > 0) {
    const workData: any[] = [];
    report.workGroups.forEach(group => {
      group.items.forEach(item => {
        workData.push({
          'Empresa': group.company || '',
          'Nombre': item.name || '',
          'Actividad': item.activity || '',
          'Horas': item.hours || 0,
          'Precio/Hora €': item.hourlyRate || 0,
          'Total €': item.total || 0
        });
      });
    });
    if (workData.length > 0) {
      const workWs = XLSX.utils.json_to_sheet(workData);
      workWs['!cols'] = [
        { wch: 25 }, { wch: 25 }, { wch: 30 }, 
        { wch: 10 }, { wch: 15 }, { wch: 15 }
      ];
      applyCenterAlignment(workWs, XLSX);
      XLSX.utils.book_append_sheet(wb, workWs, 'Mano de Obra');
    }
  }

  // 3. MAQUINARIA DE SUBCONTRATAS
  if (report.machineryGroups && report.machineryGroups.length > 0) {
    const machineryData: any[] = [];
    report.machineryGroups.forEach(group => {
      group.items.forEach(item => {
        machineryData.push({
          'Empresa': group.company || '',
          'Tipo Máquina': item.type || '',
          'Actividad': item.activity || '',
          'Horas': item.hours || 0,
          'Precio/Hora €': item.hourlyRate || 0,
          'Total €': item.total || 0
        });
      });
    });
    if (machineryData.length > 0) {
      const machineryWs = XLSX.utils.json_to_sheet(machineryData);
      machineryWs['!cols'] = [
        { wch: 25 }, { wch: 25 }, { wch: 30 }, 
        { wch: 10 }, { wch: 15 }, { wch: 15 }
      ];
      applyCenterAlignment(machineryWs, XLSX);
      XLSX.utils.book_append_sheet(wb, machineryWs, 'Maq. Subcontratas');
    }
  }

  // 4. MAQUINARIA DE ALQUILER
  if (report.workId) {
    const { data: rentalMachinery } = await supabase
      .from('work_rental_machinery')
      .select('*')
      .eq('work_id', report.workId)
      .order('delivery_date', { ascending: true });

    if (rentalMachinery && rentalMachinery.length > 0) {
      const reportDate = new Date(report.date);
      const activeMachinery = rentalMachinery.filter(machine => {
        const deliveryDate = new Date(machine.delivery_date);
        const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
        return deliveryDate <= reportDate && (!removalDate || removalDate >= reportDate);
      });

      if (activeMachinery.length > 0) {
        const rentalMachineryData: any[] = [];
        
        activeMachinery.forEach(machine => {
          const deliveryDate = new Date(machine.delivery_date);
          const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
          const effectiveEndDate = removalDate && removalDate < reportDate ? removalDate : reportDate;
          const totalDays = Math.ceil((effectiveEndDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const totalCost = totalDays * (machine.daily_rate || 0);

          rentalMachineryData.push({
            'Proveedor': machine.provider || '',
            'Tipo Máquina': machine.type || '',
            'Nº Máquina': machine.machine_number || '',
            'F. Entrega': formatDate(deliveryDate, 'dd/MM/yyyy', { locale: es }),
            'F. Recogida': machine.removal_date ? formatDate(new Date(machine.removal_date), 'dd/MM/yyyy', { locale: es }) : 'En uso',
            'Tarifa/día €': machine.daily_rate || 0,
            'Días': totalDays,
            'Total €': totalCost
          });
        });

        const rentalMachineryWs = XLSX.utils.json_to_sheet(rentalMachineryData);
        rentalMachineryWs['!cols'] = [
          { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, 
          { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }
        ];
        applyCenterAlignment(rentalMachineryWs, XLSX);
        XLSX.utils.book_append_sheet(wb, rentalMachineryWs, 'Maquinaria Alquiler');
      }
    }
  }

  // 5. MATERIALES
  if (report.materialGroups && report.materialGroups.length > 0) {
    const materialsData: any[] = [];
    report.materialGroups.forEach(group => {
      group.items.forEach(item => {
        materialsData.push({
          'Proveedor': group.supplier || '',
          'Nº Albarán': group.invoiceNumber || '',
          'Material': item.name || '',
          'Cantidad': item.quantity || 0,
          'Unidad': item.unit || '',
          'Precio Unit. €': item.unitPrice || 0,
          'Total €': item.total || 0
        });
      });
    });
    if (materialsData.length > 0) {
      const materialsWs = XLSX.utils.json_to_sheet(materialsData);
      materialsWs['!cols'] = [
        { wch: 25 }, { wch: 15 }, { wch: 30 }, 
        { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }
      ];
      applyCenterAlignment(materialsWs, XLSX);
      XLSX.utils.book_append_sheet(wb, materialsWs, 'Materiales');
    }
  }

  // 6. SUBCONTRATAS
  if (report.subcontractGroups && report.subcontractGroups.length > 0) {
    const subcontractData: any[] = [];
    report.subcontractGroups.forEach(group => {
      group.items.forEach(item => {
        subcontractData.push({
          'Empresa': group.company || '',
          'Partida Contratada': item.contractedPart || '',
          'Actividad': item.activity || '',
          'Nº Trabajadores': item.workers || 0,
          'Horas': item.hours || 0,
          'Precio/Hora €': item.hourlyRate || 0,
          'Tipo Unidad': item.unitType || '',
          'Cantidad': item.quantity || 0,
          'Precio Unitario €': item.unitPrice || 0,
          'Total €': item.total || 0
        });
      });
    });
    if (subcontractData.length > 0) {
      const subcontractWs = XLSX.utils.json_to_sheet(subcontractData);
      subcontractWs['!cols'] = [
        { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 12 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 15 }
      ];
      applyCenterAlignment(subcontractWs, XLSX);
      XLSX.utils.book_append_sheet(wb, subcontractWs, 'Subcontrata');
    }
  }

  // Generar blob
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

/**
 * Limpia caracteres no válidos para nombres de archivo
 */
const sanitizeFilename = (name: string): string => {
  return name.replace(/[/\\?%*:|"<>]/g, '_');
};

export type ExportFormat = 'pdf' | 'excel';

interface ExportResult {
  successCount: number;
  totalCount: number;
}

/**
 * Exportar un mes de reportes a ZIP
 */
export const exportMonthToZip = async (
  monthKey: string,
  reports: WorkReport[],
  exportFormat: ExportFormat,
  companyLogo?: string,
  brandColor?: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ blob: Blob; result: ExportResult; filename: string }> => {
  const zip = new JSZip();
  let successCount = 0;

  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    onProgress?.(i + 1, reports.length);
    
    try {
      const dateStr = formatDate(new Date(report.date), 'yyyy-MM-dd');
      const cleanWorkNumber = sanitizeFilename(report.workNumber || 'Obra');
      
      if (exportFormat === 'pdf') {
        const pdfBlob = await generateWorkReportPDF(
          report,
          true, // incluir imágenes
          companyLogo,
          brandColor,
          true // returnBlob
        );

        if (pdfBlob) {
          const fileName = `Parte_${cleanWorkNumber}_${dateStr}.pdf`;
          zip.file(fileName, pdfBlob);
          successCount++;
        }
      } else {
        const excelBlob = await generateSingleReportExcel(report);
        const fileName = `Parte_${cleanWorkNumber}_${dateStr}.xlsx`;
        zip.file(fileName, excelBlob);
        successCount++;
      }
    } catch (error) {
      console.error(`Error generating ${exportFormat} for report ${report.id}:`, error);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  
  // Generar nombre del ZIP
  const [year, month] = monthKey.split('-');
  const monthName = formatDate(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMMM', { locale: es });
  const firstReport = reports[0];
  const workNumber = sanitizeFilename(firstReport?.workNumber || 'Obra');
  const foreman = sanitizeFilename(firstReport?.foreman || 'Encargado');
  const formatSuffix = exportFormat === 'pdf' ? 'PDF' : 'Excel';
  const filename = `Partes_${workNumber}_${foreman}_${monthName}_${year}_${formatSuffix}.zip`;

  return {
    blob: zipBlob,
    result: { successCount, totalCount: reports.length },
    filename
  };
};

/**
 * Exportar todos los reportes archivados a ZIP
 */
export const exportAllArchivedToZip = async (
  reports: WorkReport[],
  exportFormat: ExportFormat,
  companyLogo?: string,
  brandColor?: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ blob: Blob; result: ExportResult; filename: string }> => {
  const zip = new JSZip();
  let successCount = 0;

  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    onProgress?.(i + 1, reports.length);
    
    try {
      const date = new Date(report.date);
      const yearMonth = formatDate(date, 'yyyy-MM');
      const dateStr = formatDate(date, 'yyyy-MM-dd');
      const cleanWorkNumber = sanitizeFilename(report.workNumber || 'Obra');
      
      if (exportFormat === 'pdf') {
        const pdfBlob = await generateWorkReportPDF(
          report,
          true, // incluir imágenes
          companyLogo,
          brandColor,
          true // returnBlob
        );

        if (pdfBlob) {
          const fileName = `${yearMonth}/Parte_${cleanWorkNumber}_${dateStr}.pdf`;
          zip.file(fileName, pdfBlob);
          successCount++;
        }
      } else {
        const excelBlob = await generateSingleReportExcel(report);
        const fileName = `${yearMonth}/Parte_${cleanWorkNumber}_${dateStr}.xlsx`;
        zip.file(fileName, excelBlob);
        successCount++;
      }
    } catch (error) {
      console.error(`Error generating ${exportFormat} for report ${report.id}:`, error);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  
  // Generar nombre del archivo
  const firstReport = reports[0];
  const workNumber = sanitizeFilename(firstReport?.workNumber || 'Obra');
  const foreman = sanitizeFilename(firstReport?.foreman || 'Encargado');
  const formatSuffix = exportFormat === 'pdf' ? 'PDF' : 'Excel';
  const dateStr = formatDate(new Date(), 'yyyy-MM-dd');
  const filename = `Partes_Archivados_${workNumber}_${foreman}_${dateStr}_${formatSuffix}.zip`;

  return {
    blob: zipBlob,
    result: { successCount, totalCount: reports.length },
    filename
  };
};

/**
 * Descargar blob como archivo
 */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
