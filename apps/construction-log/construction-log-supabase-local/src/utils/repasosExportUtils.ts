import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WorkRepaso, RepasoSubcontractGroup } from '@/hooks/useWorkRepasos';
import { sanitizePdfFilename } from '@/utils/securePdfFilename';
import { calculateOptimalSpacing, getAdaptiveSpacing, ContentMetrics } from './pdfSpacingOptimizer';

type XlsxModule = typeof import('xlsx-js-style');

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En Proceso',
  completed: 'Completado',
};

interface ExportOptions {
  workName: string;
  workNumber: string;
}

// Estimate content metrics for repasos PDF
const estimateRepasosMetrics = (repasos: WorkRepaso[]): ContentMetrics => {
  let contentHeight = 60; // Header
  let sectionCount = 1;
  let tableCount = 1;
  let lineCount = 5;
  
  contentHeight += repasos.length * 15; // Main table
  
  const repasosWithSubcontracts = repasos.filter(r => r.subcontract_groups && r.subcontract_groups.length > 0);
  if (repasosWithSubcontracts.length > 0) {
    sectionCount++;
    tableCount++;
    contentHeight += repasosWithSubcontracts.reduce((sum, r) => {
      const groups = r.subcontract_groups || [];
      return sum + groups.reduce((gSum, g) => gSum + (g.workers?.length || 0) + (g.machinery?.length || 0), 0) * 12;
    }, 0) + 50;
  }
  
  const repasosWithImages = repasos.filter(r => r.before_image || r.after_image);
  if (repasosWithImages.length > 0) {
    contentHeight += repasosWithImages.length * 200; // Each image page
  }
  
  return { totalContentHeight: contentHeight, sectionCount, tableCount, lineCount };
};

// Función auxiliar para cargar imagen como base64
const loadImageAsBase64 = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

// Función para calcular horas totales de un repaso
const calculateTotalHours = (repaso: WorkRepaso): number => {
  if (!repaso.subcontract_groups || repaso.subcontract_groups.length === 0) return 0;
  return repaso.subcontract_groups.reduce((total, group) => {
    const workerHours = group.workers?.reduce((sum, w) => sum + (w.hours || 0), 0) || 0;
    const machineryHours = group.machinery?.reduce((sum, m) => sum + (m.hours || 0), 0) || 0;
    return total + workerHours + machineryHours;
  }, 0);
};

// Función para obtener empresas de subcontratas
const getCompaniesFromSubcontracts = (groups: RepasoSubcontractGroup[]): string => {
  if (!groups || groups.length === 0) return '-';
  return groups.map(g => g.company).filter(Boolean).join(', ') || '-';
};

export const exportRepasosToExcel = async (
  repasos: WorkRepaso[],
  options: ExportOptions
): Promise<void> => {
  const XLSX: XlsxModule = await import('xlsx-js-style');
  const { workName, workNumber } = options;

  // Crear workbook
  const wb = XLSX.utils.book_new();

  // ========== HOJA 1: Resumen de Repasos ==========
  const summaryData = repasos.map((repaso, index) => ({
    'Nº': index + 1,
    'Código': repaso.code,
    'Estado': STATUS_LABELS[repaso.status] || repaso.status,
    'Descripción': repaso.description,
    'Empresas': getCompaniesFromSubcontracts(repaso.subcontract_groups),
    'Horas Totales': calculateTotalHours(repaso),
    'Fecha Creación': new Date(repaso.created_at).toLocaleDateString('es-ES'),
    'Fecha Completado': repaso.completed_at 
      ? new Date(repaso.completed_at).toLocaleDateString('es-ES') 
      : '-',
  }));

  const summaryWs = XLSX.utils.aoa_to_sheet([
    [`Listado de Repasos - ${workNumber} - ${workName}`],
    [`Generado el: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}`],
    [],
    ['Nº', 'Código', 'Estado', 'Descripción', 'Empresas', 'Horas', 'F. Creación', 'F. Completado'],
    ...summaryData.map(row => [
      row['Nº'],
      row['Código'],
      row['Estado'],
      row['Descripción'],
      row['Empresas'],
      row['Horas Totales'],
      row['Fecha Creación'],
      row['Fecha Completado'],
    ]),
  ]);

  // Estilo para el título
  summaryWs['A1'].s = {
    font: { bold: true, sz: 14 },
    alignment: { horizontal: 'center' },
  };

  // Estilo para cabeceras
  const headerRow = 4;
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  cols.forEach(col => {
    const cell = summaryWs[`${col}${headerRow}`];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '2563EB' } },
        alignment: { horizontal: 'center' },
      };
    }
  });

  // Ajustar ancho de columnas
  summaryWs['!cols'] = [
    { wch: 5 },  // Nº
    { wch: 10 }, // Código
    { wch: 12 }, // Estado
    { wch: 40 }, // Descripción
    { wch: 25 }, // Empresas
    { wch: 8 },  // Horas
    { wch: 12 }, // F. Creación
    { wch: 12 }, // F. Completado
  ];

  // Merge para el título
  summaryWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];

  XLSX.utils.book_append_sheet(wb, summaryWs, 'Resumen');

  // ========== HOJA 2: Detalle de Subcontratas ==========
  const detailRows: any[][] = [
    ['Detalle de Personal y Maquinaria por Repaso'],
    [`Generado el: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}`],
    [],
    ['Código Repaso', 'Estado', 'Empresa', 'Tipo', 'Nombre/Tipo', 'Horas'],
  ];

  repasos.forEach(repaso => {
    if (repaso.subcontract_groups && repaso.subcontract_groups.length > 0) {
      repaso.subcontract_groups.forEach(group => {
        // Añadir trabajadores
        if (group.workers && group.workers.length > 0) {
          group.workers.forEach(worker => {
            detailRows.push([
              repaso.code,
              STATUS_LABELS[repaso.status] || repaso.status,
              group.company || '-',
              'Personal',
              worker.name || '-',
              worker.hours || 0,
            ]);
          });
        }
        // Añadir maquinaria
        if (group.machinery && group.machinery.length > 0) {
          group.machinery.forEach(machine => {
            detailRows.push([
              repaso.code,
              STATUS_LABELS[repaso.status] || repaso.status,
              group.company || '-',
              'Maquinaria',
              machine.type || '-',
              machine.hours || 0,
            ]);
          });
        }
      });
    }
  });

  const detailWs = XLSX.utils.aoa_to_sheet(detailRows);

  // Estilo para el título
  detailWs['A1'].s = {
    font: { bold: true, sz: 14 },
    alignment: { horizontal: 'center' },
  };

  // Estilo para cabeceras
  const detailCols = ['A', 'B', 'C', 'D', 'E', 'F'];
  detailCols.forEach(col => {
    const cell = detailWs[`${col}4`];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '059669' } },
        alignment: { horizontal: 'center' },
      };
    }
  });

  // Ajustar ancho de columnas
  detailWs['!cols'] = [
    { wch: 12 }, // Código Repaso
    { wch: 12 }, // Estado
    { wch: 25 }, // Empresa
    { wch: 12 }, // Tipo
    { wch: 25 }, // Nombre/Tipo
    { wch: 8 },  // Horas
  ];

  // Merge para el título
  detailWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

  XLSX.utils.book_append_sheet(wb, detailWs, 'Detalle Subcontratas');

  // Descargar archivo
  const filename = sanitizePdfFilename(`Repasos_${workNumber}_${workName}`);
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportRepasosToPdf = async (
  repasos: WorkRepaso[],
  options: ExportOptions
): Promise<void> => {
  const { workName, workNumber } = options;
  
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Calculate optimal spacing
  const metrics = estimateRepasosMetrics(repasos);
  const spacingConfig = calculateOptimalSpacing(doc, metrics);
  
  // Título
  doc.setFontSize(18);
  doc.setTextColor(37, 99, 235);
  doc.text(`Listado de Repasos`, pageWidth / 2, 15, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`${workNumber} - ${workName}`, pageWidth / 2, 23, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}`, pageWidth / 2, 30, { align: 'center' });

  // Resumen
  const completed = repasos.filter(r => r.status === 'completed').length;
  const pending = repasos.filter(r => r.status === 'pending').length;
  const inProgress = repasos.filter(r => r.status === 'in_progress').length;
  const totalHours = repasos.reduce((sum, r) => sum + calculateTotalHours(r), 0);

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total: ${repasos.length} | Pendientes: ${pending} | En Proceso: ${inProgress} | Completados: ${completed} | Horas Totales: ${totalHours}h`, 14, 38);

  // Tabla principal
  const tableData = repasos.map((repaso, index) => [
    (index + 1).toString(),
    repaso.code,
    STATUS_LABELS[repaso.status] || repaso.status,
    repaso.description.substring(0, 50) + (repaso.description.length > 50 ? '...' : ''),
    getCompaniesFromSubcontracts(repaso.subcontract_groups),
    `${calculateTotalHours(repaso)}h`,
  ]);

  autoTable(doc, {
    startY: 45,
    head: [['#', 'Código', 'Estado', 'Descripción', 'Empresas', 'Horas']],
    body: tableData,
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 20 },
      2: { cellWidth: 25 },
      3: { cellWidth: 90 },
      4: { cellWidth: 50 },
      5: { cellWidth: 20 },
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
  });

  // ========== Página de detalle de subcontratas ==========
  const repasosWithSubcontracts = repasos.filter(r => r.subcontract_groups && r.subcontract_groups.length > 0);
  
  if (repasosWithSubcontracts.length > 0) {
    doc.addPage();
    
    doc.setFontSize(16);
    doc.setTextColor(37, 99, 235);
    doc.text('Detalle de Personal y Maquinaria', pageWidth / 2, 15, { align: 'center' });

    const subcontractData: any[][] = [];
    
    repasosWithSubcontracts.forEach(repaso => {
      repaso.subcontract_groups.forEach(group => {
        // Añadir trabajadores
        if (group.workers && group.workers.length > 0) {
          group.workers.forEach(worker => {
            subcontractData.push([
              repaso.code,
              STATUS_LABELS[repaso.status],
              group.company || '-',
              'Personal',
              worker.name || '-',
              `${worker.hours || 0}h`,
            ]);
          });
        }
        // Añadir maquinaria
        if (group.machinery && group.machinery.length > 0) {
          group.machinery.forEach(machine => {
            subcontractData.push([
              repaso.code,
              STATUS_LABELS[repaso.status],
              group.company || '-',
              'Maquinaria',
              machine.type || '-',
              `${machine.hours || 0}h`,
            ]);
          });
        }
      });
    });

    autoTable(doc, {
      startY: 25,
      head: [['Código', 'Estado', 'Empresa', 'Tipo', 'Nombre/Tipo', 'Horas']],
      body: subcontractData,
      headStyles: {
        fillColor: [5, 150, 105],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [240, 253, 244],
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 30 },
        2: { cellWidth: 50 },
        3: { cellWidth: 25 },
        4: { cellWidth: 60 },
        5: { cellWidth: 20 },
      },
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
    });
  }

  // ========== Páginas con imágenes ==========
  const repasosWithImages = repasos.filter(r => r.before_image || r.after_image);
  
  if (repasosWithImages.length > 0) {
    for (const repaso of repasosWithImages) {
      doc.addPage();
      
      // Título del repaso
      doc.setFontSize(14);
      doc.setTextColor(37, 99, 235);
      doc.text(`${repaso.code} - Comparativa Visual`, 14, 15);
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`Estado: ${STATUS_LABELS[repaso.status]}`, 14, 23);
      doc.text(`Empresas: ${getCompaniesFromSubcontracts(repaso.subcontract_groups)}`, 14, 30);
      
      // Descripción
      doc.setFontSize(9);
      const splitDesc = doc.splitTextToSize(`Descripción: ${repaso.description}`, pageWidth - 28);
      doc.text(splitDesc, 14, 38);
      
      const imgY = 50;
      const imgWidth = 120;
      const imgHeight = 90;
      
      // Imagen ANTES
      doc.setFontSize(11);
      doc.setTextColor(220, 38, 38);
      doc.text('ANTES', 14, imgY);
      
      if (repaso.before_image) {
        try {
          const beforeImg = await loadImageAsBase64(repaso.before_image);
          if (beforeImg) {
            doc.addImage(beforeImg, 'JPEG', 14, imgY + 5, imgWidth, imgHeight);
          }
        } catch {
          doc.setFontSize(9);
          doc.setTextColor(150, 150, 150);
          doc.text('Imagen no disponible', 14, imgY + 50);
        }
      } else {
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(14, imgY + 5, imgWidth, imgHeight, 3, 3, 'FD');
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text('Sin imagen', 14 + imgWidth / 2, imgY + 50, { align: 'center' });
      }
      
      // Imagen DESPUÉS
      doc.setFontSize(11);
      doc.setTextColor(34, 197, 94);
      doc.text('DESPUÉS', 14 + imgWidth + 20, imgY);
      
      if (repaso.after_image) {
        try {
          const afterImg = await loadImageAsBase64(repaso.after_image);
          if (afterImg) {
            doc.addImage(afterImg, 'JPEG', 14 + imgWidth + 20, imgY + 5, imgWidth, imgHeight);
          }
        } catch {
          doc.setFontSize(9);
          doc.setTextColor(150, 150, 150);
          doc.text('Imagen no disponible', 14 + imgWidth + 20, imgY + 50);
        }
      } else {
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(14 + imgWidth + 20, imgY + 5, imgWidth, imgHeight, 3, 3, 'FD');
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text('Sin imagen', 14 + imgWidth + 20 + imgWidth / 2, imgY + 50, { align: 'center' });
      }
      
      // Información adicional - Personal y maquinaria
      let infoY = imgY + imgHeight + 15;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`Horas totales: ${calculateTotalHours(repaso)}h`, 14, infoY);
      
      if (repaso.subcontract_groups && repaso.subcontract_groups.length > 0) {
        infoY += 7;
        doc.setFontSize(8);
        repaso.subcontract_groups.forEach(group => {
          const workers = group.workers?.map(w => `${w.name} (${w.hours}h)`).join(', ') || '';
          const machinery = group.machinery?.map(m => `${m.type} (${m.hours}h)`).join(', ') || '';
          
          if (group.company) {
            doc.text(`• ${group.company}:`, 14, infoY);
            infoY += 5;
            if (workers) {
              doc.text(`  Personal: ${workers}`, 14, infoY);
              infoY += 5;
            }
            if (machinery) {
              doc.text(`  Maquinaria: ${machinery}`, 14, infoY);
              infoY += 5;
            }
          }
        });
      }
      
      if (repaso.completed_at) {
        doc.text(`Completado: ${new Date(repaso.completed_at).toLocaleDateString('es-ES')}`, 14, infoY + 5);
      }
    }
  }

  // Guardar PDF
  const filename = sanitizePdfFilename(`Repasos_${workNumber}_${workName}`);
  doc.save(`${filename}.pdf`);
};
