import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { sanitizePdfFilename } from './securePdfFilename';
import { 
  calculateOptimalSpacing, 
  estimateEconomicReportMetrics, 
  getAdaptiveSpacing,
  SpacingConfig 
} from './pdfSpacingOptimizer';

interface SavedEconomicReport {
  id: string;
  work_report_id: string;
  work_name: string;
  work_number: string;
  date: string;
  foreman: string;
  site_manager: string;
  work_groups: any[];
  machinery_groups: any[];
  material_groups: any[];
  subcontract_groups: any[];
  rental_machinery_groups: any[];
  total_amount: number;
  created_at: string;
}

// Color corporativo - Olive Green (from index.css: --primary: 85 25% 45%)
const PRIMARY_COLOR: [number, number, number] = [120, 143, 86]; // RGB conversion of HSL(85, 25%, 45%)
const TEXT_COLOR: [number, number, number] = [255, 255, 255];

export const generateEconomicReportPDF = (report: SavedEconomicReport, companyLogo?: string) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  let yPosition = 20;

  // Calculate optimal spacing to ensure last page has at least 40% occupation
  const metrics = estimateEconomicReportMetrics(report);
  const spacingConfig = calculateOptimalSpacing(doc, metrics);

  // Add company logo if available
  if (companyLogo) {
    try {
      doc.addImage(companyLogo, 'JPEG', 20, yPosition, 30, 30);
    } catch (error) {
      console.warn('Could not add logo to PDF:', error);
    }
  }

  // Header - PARTE ECONÓMICO
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('PARTE ECONÓMICO', pageWidth / 2, yPosition + 15, { align: 'center' });
  
  yPosition += 40;

  // Basic Information
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nº OBRA: ${report.work_number || 'N/A'}`, 20, yPosition);
  doc.text(`FECHA: ${format(new Date(report.date), 'dd/MM/yyyy', { locale: es })}`, pageWidth - 80, yPosition);
  
  yPosition += getAdaptiveSpacing(10, 'line', spacingConfig);
  doc.text(`OBRA: ${report.work_name || 'N/A'}`, 20, yPosition);
  
  yPosition += getAdaptiveSpacing(7, 'line', spacingConfig);
  if (report.foreman) {
    doc.text(`ENCARGADO: ${report.foreman}`, 20, yPosition);
    yPosition += getAdaptiveSpacing(7, 'line', spacingConfig);
  }
  if (report.site_manager) {
    doc.text(`JEFE DE OBRA: ${report.site_manager}`, 20, yPosition);
    yPosition += getAdaptiveSpacing(7, 'line', spacingConfig);
  }

  yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

  // Work Groups (Mano de Obra)
  if (report.work_groups && report.work_groups.length > 0) {
    if (yPosition > pageHeight - 80) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MANO DE OBRA', 20, yPosition);
    yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

    report.work_groups.forEach((group) => {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`Empresa: ${group.company}`, 20, yPosition);
      yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);

      if (group.items && group.items.length > 0) {
        const tableData = group.items.map((item: any) => {
          const hourlyRate = Number(item.hourlyRate) || 0;
          const hours = Number(item.hours) || 0;
          const total = hourlyRate > 0 ? hours * hourlyRate : 0;
          
          return [
            item.name || '',
            item.activity || '',
            hours.toString(),
            `${hourlyRate.toFixed(2)} €`,
            `${total.toFixed(2)} €`
          ];
        });

        autoTable(doc, {
          startY: yPosition,
          head: [['Nombre', 'Actividad', 'Horas', 'Precio/Hora', 'Total']],
          body: tableData,
          margin: { left: 20 },
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { 
            fillColor: PRIMARY_COLOR, 
            textColor: TEXT_COLOR,
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            2: { halign: 'center' },
            3: { halign: 'right' },
            4: { halign: 'right', fontStyle: 'bold' }
          }
        });

        yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(10, 'table', spacingConfig);

        // Group subtotal
        const groupTotal = group.items.reduce((sum: number, item: any) => {
          const hourlyRate = Number(item.hourlyRate) || 0;
          const hours = Number(item.hours) || 0;
          return sum + (hourlyRate > 0 ? hours * hourlyRate : 0);
        }, 0);
        doc.setFont('helvetica', 'bold');
        doc.text(`Subtotal ${group.company}: ${groupTotal.toFixed(2)} €`, pageWidth - 60, yPosition, { align: 'right' });
        yPosition += getAdaptiveSpacing(10, 'line', spacingConfig);
      }
    });
  }

  // Machinery Groups (Maquinaria)
  if (report.machinery_groups && report.machinery_groups.length > 0) {
    if (yPosition > pageHeight - 80) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MAQUINARIA', 20, yPosition);
    yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

    report.machinery_groups.forEach((group) => {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`Empresa: ${group.company}`, 20, yPosition);
      yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);

      if (group.items && group.items.length > 0) {
        const tableData = group.items.map((item: any) => {
          const hourlyRate = Number(item.hourlyRate) || 0;
          const hours = Number(item.hours) || 0;
          const total = hourlyRate > 0 ? hours * hourlyRate : 0;
          
          return [
            item.type || '',
            item.activity || '',
            hours.toString(),
            `${hourlyRate.toFixed(2)} €`,
            `${total.toFixed(2)} €`
          ];
        });

        autoTable(doc, {
          startY: yPosition,
          head: [['Tipo', 'Actividad', 'Horas', 'Precio/Hora', 'Total']],
          body: tableData,
          margin: { left: 20 },
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { 
            fillColor: PRIMARY_COLOR, 
            textColor: TEXT_COLOR,
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            2: { halign: 'center' },
            3: { halign: 'right' },
            4: { halign: 'right', fontStyle: 'bold' }
          }
        });

        yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(10, 'table', spacingConfig);

        // Group subtotal
        const groupTotal = group.items.reduce((sum: number, item: any) => {
          const hourlyRate = Number(item.hourlyRate) || 0;
          const hours = Number(item.hours) || 0;
          return sum + (hourlyRate > 0 ? hours * hourlyRate : 0);
        }, 0);
        doc.setFont('helvetica', 'bold');
        doc.text(`Subtotal ${group.company}: ${groupTotal.toFixed(2)} €`, pageWidth - 60, yPosition, { align: 'right' });
        yPosition += getAdaptiveSpacing(10, 'line', spacingConfig);
      }
    });
  }

  // Material Groups (Materiales)
  if (report.material_groups && report.material_groups.length > 0) {
    if (yPosition > pageHeight - 80) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MATERIALES', 20, yPosition);
    yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

    report.material_groups.forEach((group) => {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`Proveedor: ${group.supplier}`, 20, yPosition);
      yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);
      doc.setFont('helvetica', 'normal');
      doc.text(`Nº Albarán: ${group.invoiceNumber || 'N/A'}`, 20, yPosition);
      yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);

      if (group.items && group.items.length > 0) {
        const tableData = group.items.map((item: any) => {
          const unitPrice = Number(item.unitPrice) || 0;
          const quantity = Number(item.quantity) || 0;
          const total = unitPrice > 0 ? quantity * unitPrice : 0;
          
          return [
            item.name || '',
            quantity.toString(),
            item.unit || '',
            `${unitPrice.toFixed(2)} €`,
            `${total.toFixed(2)} €`
          ];
        });

        autoTable(doc, {
          startY: yPosition,
          head: [['Material', 'Cantidad', 'Unidad', 'Precio Unit.', 'Total']],
          body: tableData,
          margin: { left: 20 },
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { 
            fillColor: PRIMARY_COLOR, 
            textColor: TEXT_COLOR,
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            1: { halign: 'center' },
            3: { halign: 'right' },
            4: { halign: 'right', fontStyle: 'bold' }
          }
        });

        yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(10, 'table', spacingConfig);

        // Group subtotal
        const groupTotal = group.items.reduce((sum: number, item: any) => {
          const unitPrice = Number(item.unitPrice) || 0;
          const quantity = Number(item.quantity) || 0;
          return sum + (unitPrice > 0 ? quantity * unitPrice : 0);
        }, 0);
        doc.setFont('helvetica', 'bold');
        doc.text(`Subtotal ${group.supplier}: ${groupTotal.toFixed(2)} €`, pageWidth - 60, yPosition, { align: 'right' });
        yPosition += getAdaptiveSpacing(10, 'line', spacingConfig);
      }
    });
  }

  // Subcontract Groups (Subcontratas)
  if (report.subcontract_groups && report.subcontract_groups.length > 0) {
    if (yPosition > pageHeight - 80) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('SUBCONTRATAS', 20, yPosition);
    yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

    report.subcontract_groups.forEach((group) => {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`Empresa: ${group.company}`, 20, yPosition);
      yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);

      if (group.items && group.items.length > 0) {
        const tableData = group.items.map((item: any) => {
          const unitType = item.unitType || 'hora';
          const isHourBased = unitType === 'hora';
          
          let total = 0;
          if (isHourBased) {
            const hourlyRate = Number(item.hourlyRate) || 0;
            const workers = Number(item.workers) || 0;
            const hours = Number(item.hours) || 0;
            total = hourlyRate > 0 ? workers * hours * hourlyRate : 0;
          } else {
            const unitPrice = Number(item.unitPrice) || 0;
            const quantity = Number(item.quantity) || 0;
            total = unitPrice > 0 ? quantity * unitPrice : 0;
          }
          
          return [
            item.contractedPart || '',
            item.activity || '',
            isHourBased ? item.workers?.toString() || '0' : (item.quantity?.toString() || '0'),
            isHourBased ? (item.hours?.toString() || '0') : unitType,
            isHourBased ? `${(Number(item.hourlyRate) || 0).toFixed(2)} €` : `${(Number(item.unitPrice) || 0).toFixed(2)} €`,
            `${total.toFixed(2)} €`
          ];
        });

        autoTable(doc, {
          startY: yPosition,
          head: [['Partida', 'Actividad', 'Cant./Trab.', 'Horas/Unidad', 'Precio', 'Total']],
          body: tableData,
          margin: { left: 20 },
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { 
            fillColor: PRIMARY_COLOR, 
            textColor: TEXT_COLOR,
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            2: { halign: 'center' },
            3: { halign: 'center' },
            4: { halign: 'right' },
            5: { halign: 'right', fontStyle: 'bold' }
          }
        });

        yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(10, 'table', spacingConfig);

        // Group subtotal
        const groupTotal = group.items.reduce((sum: number, item: any) => {
          const unitType = item.unitType || 'hora';
          const isHourBased = unitType === 'hora';
          
          let itemTotal = 0;
          if (isHourBased) {
            const hourlyRate = Number(item.hourlyRate) || 0;
            const workers = Number(item.workers) || 0;
            const hours = Number(item.hours) || 0;
            itemTotal = hourlyRate > 0 ? workers * hours * hourlyRate : 0;
          } else {
            const unitPrice = Number(item.unitPrice) || 0;
            const quantity = Number(item.quantity) || 0;
            itemTotal = unitPrice > 0 ? quantity * unitPrice : 0;
          }
          
          return sum + itemTotal;
        }, 0);
        doc.setFont('helvetica', 'bold');
        doc.text(`Subtotal ${group.company}: ${groupTotal.toFixed(2)} €`, pageWidth - 60, yPosition, { align: 'right' });
        yPosition += getAdaptiveSpacing(10, 'line', spacingConfig);
      }
    });
  }

  // Rental Machinery Groups (Maquinaria de Alquiler)
  if (report.rental_machinery_groups && report.rental_machinery_groups.length > 0) {
    if (yPosition > pageHeight - 80) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MAQUINARIA DE ALQUILER', 20, yPosition);
    yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

    report.rental_machinery_groups.forEach((group) => {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 20;
      }

      if (group.items && group.items.length > 0) {
        const tableData: any[] = [];
        
        group.items.forEach((item: any) => {
          const dailyRate = Number(item.dailyRate) || 0;
          const totalDays = Number(item.totalDays) || 0;
          const total = dailyRate > 0 ? totalDays * dailyRate : 0;
          
          // Main rental item
          tableData.push([
            item.type || '',
            item.activity || '',
            totalDays.toString(),
            `${dailyRate.toFixed(2)} €`,
            `${total.toFixed(2)} €`
          ]);

          // Fuel refills if any
          if (item.fuelRefills && item.fuelRefills.length > 0) {
            item.fuelRefills.forEach((refill: any) => {
              tableData.push([
                `  └─ Repostaje`,
                `${refill.liters || 0}L a ${(refill.pricePerLiter || 0).toFixed(2)}€/L`,
                '',
                '',
                `${refill.total ? refill.total.toFixed(2) : '0.00'} €`
              ]);
            });
          }
        });

        autoTable(doc, {
          startY: yPosition,
          head: [['Tipo', 'Actividad', 'Días', 'Precio/Día', 'Total']],
          body: tableData,
          margin: { left: 20 },
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { 
            fillColor: PRIMARY_COLOR, 
            textColor: TEXT_COLOR,
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            2: { halign: 'center' },
            3: { halign: 'right' },
            4: { halign: 'right', fontStyle: 'bold' }
          }
        });

        yPosition = (doc as any).lastAutoTable.finalY + 10;
      }
    });
  }

  // TOTAL GENERAL
  if (yPosition > pageHeight - 30) {
    doc.addPage();
    yPosition = 20;
  }

  yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);
  doc.setDrawColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
  doc.setLineWidth(0.5);
  doc.line(20, yPosition, pageWidth - 20, yPosition);
  yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL GENERAL: ${Number(report.total_amount).toFixed(2)} €`, pageWidth - 20, yPosition, { align: 'right' });

  yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);
  doc.line(20, yPosition, pageWidth - 20, yPosition);

  // Footer
  const footerY = pageHeight - 15;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text(`Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`, pageWidth / 2, footerY, { align: 'center' });

  // Save PDF - sanitize filename to prevent path traversal (GHSA-f8cm-6447-x5h2)
  const dateFormatted = format(new Date(report.date), 'dd-MM-yyyy');
  const foremanName = (report.foreman || 'sin_encargado').replace(/\s+/g, '_');
  const rawFileName = `Parte_${dateFormatted}_${foremanName}_${report.work_number}.pdf`;
  const fileName = sanitizePdfFilename(rawFileName);
  
  // Para Capacitor (Android/iOS), guardar usando el sistema de archivos nativo
  if ((window as any).Capacitor?.isNativePlatform()) {
    import('./nativeFile').then(async ({ blobToBase64, saveBase64File }) => {
      const pdfBlob = doc.output('blob');
      const base64 = await blobToBase64(pdfBlob);
      await saveBase64File(fileName, base64);
    });
  } else {
    // Para web/Electron, descarga estándar del navegador
    doc.save(fileName);
  }
};
