import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WorkReport } from '@/types/workReport';
import { 
  WasteEntryDB, 
  WasteTypeDB, 
  WasteManagerDB,
  getActionTypeLabel, 
  getContainerSizeDBLabel,
  CONTAINER_SIZES_DB 
} from '@/types/wasteDatabase';
import { isNative, saveBase64File } from './nativeFile';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { sanitizePdfFilename } from './securePdfFilename';
import { 
  calculateOptimalSpacing, 
  estimateWorkReportMetrics, 
  getAdaptiveSpacing,
  SpacingConfig 
} from './pdfSpacingOptimizer';

export { generateComprehensiveReportPDF } from './comprehensiveReportGenerator';

// Extend jsPDF with autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: typeof autoTable;
  }
}

// Status labels for repasos
const REPASO_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En Proceso',
  completed: 'Completado',
};

export const generateWorkReportPDF = async (
  report: WorkReport, 
  includeImages: boolean = false, 
  companyLogo?: string, 
  brandColor?: string,
  returnBlob: boolean = false
) => {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    let yPosition = 20;

    // Calculate optimal spacing to ensure last page has at least 40% occupation
    const metrics = estimateWorkReportMetrics(report);
    const spacingConfig = calculateOptimalSpacing(doc, metrics);

    // Convert brand color from hex to RGB for jsPDF
    let primaryR = 120, primaryG = 143, primaryB = 86; // Default green
    if (brandColor && /^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
      const hex = brandColor.replace('#', '');
      primaryR = parseInt(hex.substring(0, 2), 16);
      primaryG = parseInt(hex.substring(2, 4), 16);
      primaryB = parseInt(hex.substring(4, 6), 16);
    }

    // Add company logo if available
    if (companyLogo) {
      try {
        doc.addImage(companyLogo, 'JPEG', 20, yPosition, 30, 30);
      } catch (error) {
        console.warn('Could not add logo to PDF:', error);
      }
    }

  // Header information
  doc.setFontSize(18);
  doc.text('PARTE DE TRABAJO', pageWidth / 2, yPosition + 15, { align: 'center' });
  
  yPosition += 40;
  
  // Basic information
  doc.setFontSize(12);
  doc.text(`Nº OBRA: ${report.workNumber || 'N/A'}`, 20, yPosition);
  doc.text(`FECHA: ${new Date(report.date).toLocaleDateString()}`, pageWidth - 80, yPosition);
  
  yPosition += getAdaptiveSpacing(10, 'line', spacingConfig);
  doc.text(`OBRA: ${report.workName || 'N/A'}`, 20, yPosition);
  
  yPosition += getAdaptiveSpacing(20, 'section', spacingConfig);

  // Work groups section
  if (report.workGroups && report.workGroups.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MANO DE OBRA', 20, yPosition);
    doc.setFont('helvetica', 'normal');
    yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

    report.workGroups.forEach((group) => {
      doc.setFontSize(11);
      doc.text(`Empresa: ${group.company}`, 20, yPosition);
      yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);

      if (group.items && group.items.length > 0) {
        const tableData = group.items.map(item => [
          item.name || '',
          item.activity || '',
          item.hours ? item.hours.toString() : '0',
          item.hours ? item.hours.toString() : '0'
        ]);

        autoTable(doc, {
          startY: yPosition,
          head: [['Nombre', 'Actividad', 'Horas', 'Total Horas']],
          body: tableData,
          margin: { left: 20 },
          styles: { fontSize: 9 },
          headStyles: { fillColor: [primaryR, primaryG, primaryB], textColor: [255, 255, 255] },
        });

        yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(10, 'table', spacingConfig);
      }
    });
  }

  // Machinery groups section
  if (report.machineryGroups && report.machineryGroups.length > 0) {
    if (yPosition > pageHeight - 70) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MAQUINARIA DE SUBCONTRATAS', 20, yPosition);
    doc.setFont('helvetica', 'normal');
    yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

    report.machineryGroups.forEach((group) => {
      doc.setFontSize(11);
      doc.text(`Empresa: ${group.company}`, 20, yPosition);
      yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);

      if (group.items && group.items.length > 0) {
        const tableData = group.items.map(item => [
          item.type,
          item.activity,
          item.hours.toString(),
          item.total.toString()
        ]);

        autoTable(doc, {
          startY: yPosition,
          head: [['Tipo Máquina', 'Actividad', 'Horas', 'Total']],
          body: tableData,
          margin: { left: 20 },
          styles: { fontSize: 9 },
          headStyles: { fillColor: [primaryR, primaryG, primaryB], textColor: [255, 255, 255] },
        });

        yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(10, 'table', spacingConfig);
      }
    });
  }

  // Rental Machinery section
  if (report.workId) {
    try {
      const { data: rentalMachinery } = await supabase
        .from('work_rental_machinery')
        .select('*')
        .eq('work_id', report.workId)
        .order('delivery_date', { ascending: true });

      if (rentalMachinery && rentalMachinery.length > 0) {
        // Filter machinery active on the report date
        const reportDate = new Date(report.date);
        const activeMachinery = rentalMachinery.filter(machine => {
          const deliveryDate = new Date(machine.delivery_date);
          const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
          return deliveryDate <= reportDate && (!removalDate || removalDate >= reportDate);
        });

        if (activeMachinery.length > 0) {
          if (yPosition > pageHeight - 70) {
            doc.addPage();
            yPosition = 20;
          }

          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('MAQUINARIA DE ALQUILER', 20, yPosition);
          doc.setFont('helvetica', 'normal');
          yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

          const tableData = activeMachinery.map(machine => {
            const deliveryDate = new Date(machine.delivery_date);
            // Usar la fecha del reporte o la fecha de recogida, lo que sea menor
            const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
            const effectiveEndDate = removalDate && removalDate < reportDate ? removalDate : reportDate;
            const totalDays = Math.ceil((effectiveEndDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const totalCost = totalDays * (machine.daily_rate || 0);

            return [
              machine.type || '',
              machine.provider || '',
              format(deliveryDate, 'dd/MM/yyyy', { locale: es }),
              machine.removal_date ? format(new Date(machine.removal_date), 'dd/MM/yyyy', { locale: es }) : 'En uso',
              (machine.daily_rate || 0).toFixed(2) + ' €',
              totalDays.toString(),
              totalCost.toFixed(2) + ' €'
            ];
          });

          autoTable(doc, {
            startY: yPosition,
            head: [['Tipo', 'Proveedor', 'F. Entrega', 'F. Recogida', 'Tarifa/día', 'Días', 'Total']],
            body: tableData,
            margin: { left: 20 },
            styles: { fontSize: 9 },
          headStyles: { fillColor: [primaryR, primaryG, primaryB], textColor: [255, 255, 255] },
          });

          yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(10, 'table', spacingConfig);
        }
      }
    } catch (error) {
      console.error('Error fetching rental machinery for PDF:', error);
    }
  }

  // Materials section
  if (report.materialGroups && report.materialGroups.length > 0) {
    if (yPosition > pageHeight - 70) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MATERIALES', 20, yPosition);
    doc.setFont('helvetica', 'normal');
    yPosition += getAdaptiveSpacing(6, 'section', spacingConfig);

    report.materialGroups.forEach((group) => {
      doc.setFontSize(11);
      doc.text(`Proveedor: ${group.supplier}`, 20, yPosition);
      yPosition += getAdaptiveSpacing(4, 'line', spacingConfig);
      doc.text(`Nº Albarán: ${group.invoiceNumber}`, 20, yPosition);
      yPosition += getAdaptiveSpacing(4, 'line', spacingConfig);

      if (group.items && group.items.length > 0) {
        const tableData = group.items.map(item => [
          item.name,
          item.quantity.toString(),
          item.unit,
          item.unitPrice.toString(),
          item.total.toString()
        ]);

        autoTable(doc, {
          startY: yPosition,
          head: [['Material', 'Cantidad', 'Unidad', 'Precio Unit.', 'Total']],
          body: tableData,
          margin: { left: 20 },
          styles: { fontSize: 9 },
           headStyles: { fillColor: [primaryR, primaryG, primaryB], textColor: [255, 255, 255] },
        });

        yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(6, 'table', spacingConfig);
      }
    });
  }

  // Subcontract section
  if (report.subcontractGroups && report.subcontractGroups.some(g => g.items.length > 0)) {
    if (yPosition > pageHeight - 70) {
      doc.addPage();
      yPosition = 20;
    }
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('SUBCONTRATA', 20, yPosition);
    doc.setFont('helvetica', 'normal');
    yPosition += getAdaptiveSpacing(6, 'section', spacingConfig);

    report.subcontractGroups.forEach(group => {
      if (group.items.length > 0) {
        // Check for page break
        if (yPosition > pageHeight - 60) {
          doc.addPage();
          yPosition = 20;
        }
        
        // Calcular total de trabajadores del grupo desde los items
        let totalWorkersFromItems = 0;
        let totalHours = 0;
        
        group.items.forEach(item => {
          if (item.workerDetails && item.workerDetails.length > 0) {
            // Si hay detalles de trabajadores, usar esos datos
            totalWorkersFromItems += item.workerDetails.length;
            totalHours += item.workerDetails.reduce((sum, w) => sum + (w.hours || 0), 0);
          } else if (item.unitType === 'hora' || !item.unitType) {
            // Solo contar trabajadores si es unidad tipo hora
            totalWorkersFromItems += item.workers || 0;
            totalHours += (item.workers || 0) * (item.hours || 0);
          }
        });
        
        // Usar el total de items si hay, o el campo totalWorkers del grupo como respaldo
        const totalWorkers = totalWorkersFromItems > 0 ? totalWorkersFromItems : (group.totalWorkers || 0);
        
        // Añadir nombre de empresa del grupo con número de trabajadores
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Empresa: ${group.company} - ${totalWorkers} trabajador${totalWorkers !== 1 ? 'es' : ''}`, 20, yPosition);
        yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);
        doc.setFont('helvetica', 'normal');

        const tableData = group.items.map(item => {
          const workerCount = item.workerDetails?.length || item.workers || 0;
          const itemTotalHours = item.workerDetails?.reduce((sum, w) => sum + (w.hours || 0), 0) || item.total;
          return [
            item.contractedPart,
            item.activity,
            workerCount.toString(),
            item.hours.toString(),
            itemTotalHours.toString()
          ];
        });

        autoTable(doc, {
          startY: yPosition,
          head: [['Partida Contratada', 'Actividad', 'Nº Trab.', 'Horas', 'Total Horas']],
          body: tableData,
          margin: { left: 20 },
          styles: { fontSize: 9 },
          headStyles: { fillColor: [primaryR, primaryG, primaryB], textColor: [255, 255, 255] },
        });

        yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(4, 'table', spacingConfig);
        
        // Mostrar detalle de trabajadores si hay workerDetails
        const allWorkerDetails = group.items.flatMap(item => 
          (item.workerDetails || []).map(w => ({
            ...w,
            activity: item.activity,
            contractedPart: item.contractedPart
          }))
        );
        
        if (allWorkerDetails.length > 0) {
          // Check for page break
          if (yPosition > pageHeight - 40) {
            doc.addPage();
            yPosition = 20;
          }
          
          doc.setFontSize(8);
          doc.setFont('helvetica', 'italic');
          doc.text('Detalle de trabajadores:', 25, yPosition);
          yPosition += getAdaptiveSpacing(4, 'line', spacingConfig);
          
          const workerTableData = allWorkerDetails.map(w => [
            w.name || '-',
            w.dni || '-',
            w.category || '-',
            `${w.hours || 0}h`
          ]);
          
          autoTable(doc, {
            startY: yPosition,
            head: [['Nombre', 'DNI', 'Categoría', 'Horas']],
            body: workerTableData,
            margin: { left: 25, right: 20 },
            styles: { fontSize: 8 },
            headStyles: { fillColor: [180, 180, 180], textColor: [0, 0, 0], fontStyle: 'bold' },
            columnStyles: {
              0: { cellWidth: 60 },
              1: { cellWidth: 30 },
              2: { cellWidth: 40 },
              3: { cellWidth: 20 },
            },
          });
          
          yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(4, 'table', spacingConfig);
        }
        
        // Resumen de totales por empresa
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text(`Total: ${totalWorkers} trabajadores, ${totalHours} horas`, 20, yPosition);
        doc.setFont('helvetica', 'normal');
        yPosition += getAdaptiveSpacing(8, 'line', spacingConfig);
      }
    });
  }

  // Waste Management / RCDs Section - Fetch from relational table
  if (report.id) {
    try {
      const { data: wasteEntries } = await supabase
        .from('work_report_waste_entries')
        .select(`
          *,
          waste_type:waste_type_id(id, name, ler_code, is_hazardous),
          manager:manager_id(id, company_name)
        `)
        .eq('work_report_id', report.id)
        .order('created_at', { ascending: true });

      if (wasteEntries && wasteEntries.length > 0) {
        if (yPosition > pageHeight - 70) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('REGISTRO DE GESTIÓN DE RESIDUOS (RCDs)', 20, yPosition);
        doc.setFont('helvetica', 'normal');
        yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

        const wasteTableData = wasteEntries.map((entry: any) => {
          const isContainer = entry.operation_mode === 'container_management';
          
          // Tipo/Vehículo
          const typeVehicle = isContainer 
            ? `Contenedor ${entry.container_size ? getContainerSizeDBLabel(entry.container_size) : ''}` 
            : (entry.vehicle_type || 'Transporte');
          
          // Identificación
          const identification = isContainer ? (entry.container_id || '-') : (entry.vehicle_plate || '-');
          
          // Acción
          const action = getActionTypeLabel(entry.action_type);
          
          // Residuo
          const wasteType = entry.waste_type?.name || '-';
          const lerCode = entry.waste_type?.ler_code ? ` (${entry.waste_type.ler_code})` : '';
          const hazardous = entry.waste_type?.is_hazardous ? ' ⚠️' : '';
          
          // Gestor/Destino
          const providerDestination = entry.destination_plant || entry.manager_name || entry.manager?.company_name || '-';
          
          // Volumen/Peso
          let volumeWeight = '-';
          if (entry.volume_m3) {
            volumeWeight = `${entry.volume_m3} m³`;
          } else if (entry.weight_tn) {
            volumeWeight = `${entry.weight_tn} Tn`;
          }
          
          return [typeVehicle, identification, action, `${wasteType}${lerCode}${hazardous}`, providerDestination, volumeWeight];
        });

        autoTable(doc, {
          startY: yPosition,
          head: [['Tipo/Vehículo', 'Identificación', 'Acción', 'Residuo', 'Gestor/Destino', 'Vol./Peso']],
          body: wasteTableData,
          margin: { left: 20, right: 20 },
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { 
            fillColor: [100, 100, 100], 
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 25 },
            2: { cellWidth: 25 },
            3: { cellWidth: 35 },
            4: { cellWidth: 35 },
            5: { cellWidth: 20, halign: 'center' },
          },
          alternateRowStyles: { fillColor: [245, 245, 245] },
        });

        yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(10, 'table', spacingConfig);
      }
    } catch (error) {
      console.error('Error fetching waste entries for PDF:', error);
    }
  }

  // Active Repasos section
  if (report.workId) {
    try {
      const { data: activeRepasos } = await supabase
        .from('work_repasos')
        .select('*')
        .eq('work_id', report.workId)
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: true });

      if (activeRepasos && activeRepasos.length > 0) {
        if (yPosition > pageHeight - 70) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('REPASOS ACTIVOS', 20, yPosition);
        doc.setFont('helvetica', 'normal');
        yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

        // Summary
        const pendingCount = activeRepasos.filter(r => r.status === 'pending').length;
        const inProgressCount = activeRepasos.filter(r => r.status === 'in_progress').length;
        const totalEstimatedHours = activeRepasos.reduce((sum, r) => sum + (r.estimated_hours || 0), 0);

        doc.setFontSize(9);
        doc.text(`Total: ${activeRepasos.length} | Pendientes: ${pendingCount} | En Proceso: ${inProgressCount} | Horas Est.: ${totalEstimatedHours}h`, 20, yPosition);
        yPosition += getAdaptiveSpacing(8, 'line', spacingConfig);

        const tableData = activeRepasos.map(repaso => [
          repaso.code || '',
          REPASO_STATUS_LABELS[repaso.status] || repaso.status,
          (repaso.description || '').substring(0, 40) + ((repaso.description || '').length > 40 ? '...' : ''),
          repaso.assigned_company || '-',
          `${repaso.estimated_hours || 0}h`
        ]);

        autoTable(doc, {
          startY: yPosition,
          head: [['Código', 'Estado', 'Descripción', 'Empresa', 'Horas Est.']],
          body: tableData,
          margin: { left: 20 },
          styles: { fontSize: 8 },
          headStyles: { fillColor: [primaryR, primaryG, primaryB], textColor: [255, 255, 255] },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 25 },
            2: { cellWidth: 60 },
            3: { cellWidth: 40 },
            4: { cellWidth: 20 },
          },
        });

        yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(10, 'table', spacingConfig);
      }
    } catch (error) {
      console.error('Error fetching active repasos for PDF:', error);
    }
  }

  // Observations
  if (report.observations) {
    if (yPosition > pageHeight - 60) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVACIONES:', 20, yPosition);
    doc.setFont('helvetica', 'normal');
    yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);
    
    const splitText = doc.splitTextToSize(report.observations, pageWidth - 40);
    doc.text(splitText, 20, yPosition);
    yPosition += splitText.length * 5;
  }

  // Foreman Entries Section (múltiples encargados/capataces)
  if (report.foremanEntries && report.foremanEntries.length > 0) {
    if (yPosition > pageHeight - 70) {
      doc.addPage();
      yPosition = 20;
    }

    // Añadir más espacio antes del título
    yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('ENCARGADOS, CAPATACES Y RECURSOS PREVENTIVOS', 20, yPosition);
    doc.setFont('helvetica', 'normal');
    yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

    const tableData = report.foremanEntries.map(entry => [
      entry.role === 'capataz'
        ? 'Capataz' 
        : entry.role === 'recurso_preventivo' 
          ? 'Recurso Preventivo' 
          : 'Encargado',
      entry.name || '',
      `${entry.hours || 0}h`,
    ]);

    // Añadir fila de total
    const totalHours = report.foremanEntries.reduce((sum, e) => sum + (e.hours || 0), 0);
    tableData.push(['', 'TOTAL HORAS', `${totalHours}h`]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Cargo', 'Nombre', 'Horas']],
      body: tableData,
      margin: { left: 20 },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [primaryR, primaryG, primaryB], textColor: [255, 255, 255] },
      bodyStyles: { halign: 'left' },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 100 },
        2: { cellWidth: 25, halign: 'center' },
      },
      didParseCell: (data) => {
        // Destacar la fila de total
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });

    yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(10, 'table', spacingConfig);
  }

  // Footer
  if (yPosition > pageHeight - 80) {
    doc.addPage();
    yPosition = 20;
  }

  yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);
  doc.setFontSize(11);
  
  // Encargado Principal en una línea
  doc.text(`Encargado Principal: ${report.foreman || 'N/A'}`, 20, yPosition);
  doc.text(`Jefe de Obra: ${report.siteManager || 'N/A'}`, pageWidth / 2 + 10, yPosition);
  
  // Horas del encargado en línea separada para evitar solapamiento
  yPosition += getAdaptiveSpacing(8, 'line', spacingConfig);
  doc.text(`Horas Encargado: ${report.foremanHours || 0}h`, 20, yPosition);
  
  // Add signatures if available
  yPosition += getAdaptiveSpacing(15, 'section', spacingConfig);
  const signatureWidth = 60;
  const signatureHeight = 30;
  
  if (report.foremanSignature || report.siteManagerSignature) {
    doc.setFontSize(9);
    
    if (report.foremanSignature) {
      try {
        doc.text('Firma Encargado:', 20, yPosition);
        doc.addImage(report.foremanSignature, 'PNG', 20, yPosition + 5, signatureWidth, signatureHeight);
      } catch (error) {
        console.warn('Could not add foreman signature to PDF:', error);
      }
    }
    
    if (report.siteManagerSignature) {
      try {
        doc.text('Firma Jefe de Obra:', pageWidth / 2 + 20, yPosition);
        doc.addImage(report.siteManagerSignature, 'PNG', pageWidth / 2 + 20, yPosition + 5, signatureWidth, signatureHeight);
      } catch (error) {
        console.warn('Could not add site manager signature to PDF:', error);
      }
    }
  }

  // Agregar marca de agua si el parte fue editado por un jefe de obra
  if (report.lastEditedBy && report.lastEditedAt) {
    try {
      yPosition += 50;
      
      // Obtener nombre del editor
      const { data: editorProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', report.lastEditedBy)
        .single();
      
      if (editorProfile?.full_name) {
        // Marca de agua tenue
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150); // Gris tenue
        const editedDate = format(new Date(report.lastEditedAt), "dd/MM/yyyy 'a las' HH:mm", { locale: es });
        const watermarkText = `Editado por ${editorProfile.full_name} el ${editedDate}`;
        doc.text(watermarkText, pageWidth / 2, yPosition, { align: 'center' });
        doc.setTextColor(0, 0, 0); // Restaurar color negro
      }
    } catch (error) {
      console.warn('Could not add edit watermark:', error);
    }
  }

  // Anexo de imágenes
  const images: Array<{
    data: string;
    section: string;
    company: string;
    invoice?: string;
    date?: string;
  }> = [];

  // Recopilar imágenes de mano de obra
  report.workGroups?.forEach((group) => {
    if (group.documentImage) {
      images.push({
        data: group.documentImage,
        section: 'MANO DE OBRA',
        company: group.company,
      });
    }
  });

  // Recopilar imágenes de maquinaria
  report.machineryGroups?.forEach((group) => {
    if (group.documentImage) {
      images.push({
        data: group.documentImage,
        section: 'MAQUINARIA',
        company: group.company,
      });
    }
  });

  // Recopilar imágenes de materiales
  report.materialGroups?.forEach((group) => {
    if (group.documentImage) {
      images.push({
        data: group.documentImage,
        section: 'MATERIALES',
        company: group.supplier,
        invoice: group.invoiceNumber,
        date: group.extractedDate,
      });
    }
  });

  // Recopilar imágenes de subcontratas
  report.subcontractGroups?.forEach((group) => {
    if (group.documentImage) {
      images.push({
        data: group.documentImage,
        section: 'SUBCONTRATA',
        company: group.company,
      });
    }
  });

  // Función para obtener una URL válida de Supabase Storage
  const getValidImageUrl = async (originalUrl: string): Promise<string> => {
    if (!originalUrl) return '';
    
    // Si ya es base64, devolverlo directamente
    if (originalUrl.startsWith('data:')) {
      return originalUrl;
    }
    
    // Si es una URL firmada de Supabase Storage (antigua), convertir a URL pública
    if (originalUrl.includes('/storage/v1/object/sign/')) {
      try {
        // Extraer el path del archivo de la URL firmada
        const urlObj = new URL(originalUrl);
        const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/sign\/([^?]+)/);
        if (pathMatch) {
          const bucketAndPath = pathMatch[1];
          const [bucket, ...pathParts] = bucketAndPath.split('/');
          const filePath = pathParts.join('/');
          
          // Usar URL pública (el bucket work-report-images es público ahora)
          const { data } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);
          
          return data.publicUrl;
        }
      } catch (error) {
        console.error('Error generando URL pública:', error);
      }
    }
    
    // Si es una URL pública de Supabase Storage, usarla directamente
    if (originalUrl.includes('/storage/v1/object/public/')) {
      return originalUrl;
    }
    
    return originalUrl;
  };

  // Función para convertir URL a base64
  const convertUrlToBase64 = async (url: string): Promise<string> => {
    if (url.startsWith('data:')) {
      return url; // Ya es base64
    }
    
    try {
      // Obtener URL válida primero
      const validUrl = await getValidImageUrl(url);
      
      const response = await fetch(validUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error convirtiendo URL a base64:', error, 'URL:', url);
      throw error;
    }
  };

  // Función para obtener dimensiones de imagen
  const getImageDimensions = (base64: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        resolve({ width: 800, height: 600 }); // Valores por defecto
      };
      img.src = base64;
    });
  };

  // Añadir anexo con imágenes SOLO si el usuario lo ha solicitado
  if (includeImages && images.length > 0) {
    doc.addPage();
    doc.setFontSize(16);
    doc.text('ANEXO DE IMÁGENES', pageWidth / 2, 20, { align: 'center' });

    yPosition = 35;
    const margin = 20;
    const availableWidth = pageWidth - (2 * margin);
    const maxImgHeight = 120; // Altura máxima por imagen
    const imageSpacing = 15;

    for (let index = 0; index < images.length; index++) {
      const image = images[index];
      
      // Convertir imagen a base64 primero
      let imgData: string;
      let imgWidth: number;
      let imgHeight: number;
      
      try {
        imgData = await convertUrlToBase64(image.data);
        const dimensions = await getImageDimensions(imgData);
        
        // Calcular dimensiones manteniendo relación de aspecto
        const aspectRatio = dimensions.width / dimensions.height;
        
        if (aspectRatio > 1) {
          // Imagen horizontal
          imgWidth = Math.min(availableWidth, dimensions.width * 0.4);
          imgHeight = imgWidth / aspectRatio;
          if (imgHeight > maxImgHeight) {
            imgHeight = maxImgHeight;
            imgWidth = imgHeight * aspectRatio;
          }
        } else {
          // Imagen vertical o cuadrada
          imgHeight = Math.min(maxImgHeight, dimensions.height * 0.4);
          imgWidth = imgHeight * aspectRatio;
          if (imgWidth > availableWidth) {
            imgWidth = availableWidth;
            imgHeight = imgWidth / aspectRatio;
          }
        }
      } catch (error) {
        console.error('Error procesando imagen:', error);
        continue; // Saltar esta imagen si hay error
      }
      
      // Calcular información del encabezado
      let headerLines = 2;
      if (image.invoice) headerLines++;
      if (image.date) headerLines++;
      const headerHeight = headerLines * 6 + 5;
      
      const totalItemHeight = headerHeight + imgHeight + imageSpacing;
      
      // Si no cabe en la página actual, crear nueva página
      if (yPosition + totalItemHeight > pageHeight - 20) {
        doc.addPage();
        yPosition = 20;
      }
      
      // Añadir encabezado de la imagen
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Imagen ${index + 1}:`, margin, yPosition);
      yPosition += 6;
      
      doc.setFontSize(9);
      doc.text(`${image.section} - ${image.section === 'MATERIALES' ? 'Proveedor' : 'Empresa'}: ${image.company}`, margin, yPosition);
      yPosition += 6;
      
      if (image.invoice) {
        doc.text(`Nº Albarán: ${image.invoice}`, margin, yPosition);
        yPosition += 6;
      }
      
      if (image.date) {
        const formattedDate = new Date(image.date).toLocaleDateString('es-ES');
        doc.text(`Fecha del albarán: ${formattedDate}`, margin, yPosition);
        yPosition += 6;
      }
      
      doc.setFont('helvetica', 'normal');
      yPosition += 5;

      // Añadir la imagen centrada
      try {
        const xPosition = margin + (availableWidth - imgWidth) / 2;
        doc.addImage(imgData, 'JPEG', xPosition, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + imageSpacing;
      } catch (error) {
        console.error('Error al añadir imagen al PDF:', error);
        doc.setFontSize(8);
        doc.text('[Error al cargar la imagen]', margin, yPosition);
        yPosition += 10;
      }
    }
  }

  // Save the PDF - sanitize filename to prevent path traversal (GHSA-f8cm-6447-x5h2)
  const dateFormatted = format(new Date(report.date), 'dd-MM-yyyy');
  const foremanName = (report.foreman || 'sin_encargado').replace(/\s+/g, '_');
  const rawFileName = `Parte_${dateFormatted}_${foremanName}_${report.workNumber || 'sin_numero'}.pdf`;
  const fileName = sanitizePdfFilename(rawFileName);
  
  // Si se solicita retornar el blob (para exportación masiva), simplemente retornarlo
  if (returnBlob) {
    return doc.output('blob');
  }
  
  if (isNative()) {
    // En Android/iOS, usar Capacitor Filesystem
    try {
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      await saveBase64File(fileName, pdfBase64, 'application/pdf');
      return Promise.resolve();
    } catch (error) {
      console.error('Error guardando PDF en dispositivo nativo:', error);
      throw new Error('No se pudo guardar el PDF en el dispositivo. Verifica los permisos de almacenamiento.');
    }
  } else {
    // En web, intentar usar File System Access API para elegir ubicación cuando sea posible
    const pdfBlob = doc.output('blob');
    
    const isInIframe = (() => {
      try { return window.self !== window.top; } catch { return true; }
    })();
    
    // Verificar si el navegador soporta showSaveFilePicker y no estamos en iframe
    if (!isInIframe && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'PDF Document',
            accept: { 'application/pdf': ['.pdf'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(pdfBlob);
        await writable.close();
        return Promise.resolve();
      } catch (err) {
        // Usuario canceló o error - usar método tradicional
        if ((err as Error).name !== 'AbortError') {
          console.warn('Error con showSaveFilePicker:', err);
        }
      }
    }
    
    // Fallback: descarga tradicional
    doc.save(fileName);
    return Promise.resolve();
  }
  } catch (error) {
    console.error('Error general generando PDF:', error);
    throw new Error(`Error al generar el PDF: ${error instanceof Error ? error.message : 'Error desconocido'}`);
  }
};