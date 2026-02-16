import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AccessReport, AccessEntry } from '@/types/accessControl';
import { isNative, saveBase64File } from './nativeFile';
import { sanitizePdfFilename } from './securePdfFilename';
import { 
  calculateOptimalSpacing, 
  estimateAccessControlMetrics, 
  getAdaptiveSpacing,
  SpacingConfig 
} from './pdfSpacingOptimizer';

// Extend jsPDF with autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: typeof autoTable;
  }
}

export const generateAccessControlPDF = async (report: AccessReport, companyLogo?: string, brandColor?: string) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  let yPosition = 20;

  // Calculate optimal spacing to ensure last page has at least 40% occupation
  const metrics = estimateAccessControlMetrics(report);
  const spacingConfig = calculateOptimalSpacing(doc, metrics);
  
  // Validar datos de entrada y proporcionar valores por defecto
  const personalEntries = Array.isArray(report.personalEntries) ? report.personalEntries : [];
  const machineryEntries = Array.isArray(report.machineryEntries) ? report.machineryEntries : [];
  
  // Filtrar entradas válidas: personal con DNI único, maquinaria con matrícula
  const seenDnis = new Set<string>();
  const validPersonalEntries = personalEntries.filter(e => {
    if (!e || typeof e !== 'object') return false;
    const dni = (e.identifier || '').trim();
    if (dni === '' || seenDnis.has(dni)) return false;
    seenDnis.add(dni);
    return true;
  });
  
  const validMachineryEntries = machineryEntries.filter(e => {
    if (!e || typeof e !== 'object') return false;
    return (e.identifier || '').trim() !== '';
  });
  
  // Solo maquinaria con operador se cuenta como empresa
  const machineryWithOperator = machineryEntries.filter(e => 
    e && (e.identifier || '').trim() !== '' && e.operator && e.operator.trim() !== ''
  );
  
  // Convert brand color from hex to RGB for jsPDF
  let primaryR = 132, primaryG = 143, primaryB = 107; // Default
  if (brandColor && /^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
    const hex = brandColor.replace('#', '');
    primaryR = parseInt(hex.substring(0, 2), 16);
    primaryG = parseInt(hex.substring(2, 4), 16);
    primaryB = parseInt(hex.substring(4, 6), 16);
  }
  
  const primaryColor = [primaryR, primaryG, primaryB] as [number, number, number];

  // Helper function to add company logo
  const addLogo = () => {
    if (companyLogo) {
      try {
        doc.addImage(companyLogo, 'JPEG', 15, 10, 30, 20);
      } catch (error) {
        console.warn('Could not add logo to PDF:', error);
      }
    }
  };

  // Add logo
  addLogo();

  // Header - Title (moved down to avoid overlap with logo)
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  const title = 'CONTROL DE ACCESOS';
  const titleWidth = doc.getTextWidth(title);
  doc.text(title, (pageWidth - titleWidth) / 2, yPosition + 15);
  
  yPosition += 25;

  // Report Info
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  const reportInfo = [
    `Fecha: ${new Date(report.date).toLocaleDateString('es-ES')}`,
    `Obra: ${report.siteName}`,
    `Responsable: ${report.responsible}`
  ];

  reportInfo.forEach((info, index) => {
    doc.text(info, 15, yPosition + (index * getAdaptiveSpacing(6, 'line', spacingConfig)));
  });

  // Add responsible hours if available
  if (report.responsibleEntryTime || report.responsibleExitTime) {
    yPosition += reportInfo.length * getAdaptiveSpacing(6, 'line', spacingConfig);
    const entryText = report.responsibleEntryTime ? `Entrada: ${report.responsibleEntryTime}` : '';
    const exitText = report.responsibleExitTime ? `Salida: ${report.responsibleExitTime}` : '';
    const hoursText = report.responsibleEntryTime && report.responsibleExitTime 
      ? `(${calculateHours(report.responsibleEntryTime, report.responsibleExitTime)} horas)` 
      : '';
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Horas Encargado: ${entryText} ${exitText} ${hoursText}`, 15, yPosition);
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
  }

  yPosition += getAdaptiveSpacing(25, 'section', spacingConfig);

  // Group entries by company for both personal and machinery (usando entradas válidas)
  const personalByCompany = groupEntriesByCompany(validPersonalEntries);
  // Usar TODA la maquinaria válida (subcontratas, propia y alquiler)
  const machineryByCompany = groupEntriesByCompany(validMachineryEntries);
  const allCompanies = [...new Set([...Object.keys(personalByCompany), ...Object.keys(machineryByCompany)])];

  // Personal Section
  if (validPersonalEntries.length > 0) {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryColor);
    doc.text('PERSONAL', 15, yPosition);
    yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

    // Personal entries by company
    allCompanies.forEach(company => {
      const companyPersonal = personalByCompany[company] || [];
      if (companyPersonal.length > 0) {
        // Company header
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`Empresa: ${company}`, 15, yPosition);
        yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);

        // Personal table for this company
        const personalData = companyPersonal.map(entry => {
          const row = [
            entry.name || '-',
            entry.identifier || '-',
            entry.entryTime || '-',
            entry.exitTime || '-',
            entry.activity || '-',
            calculateHours(entry.entryTime, entry.exitTime),
            '' // Placeholder for signature column
          ];
          return row;
        });

        autoTable(doc, {
          startY: yPosition,
          head: [['Nombre', 'DNI', 'Entrada', 'Salida', 'Actividad', 'Horas', 'Firma']],
          body: personalData,
          styles: {
            fontSize: 10,
            cellPadding: 3,
          },
          headStyles: {
            fillColor: primaryColor,
            textColor: 255,
            fontStyle: 'bold'
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245]
          },
          margin: { left: 15, right: 15 },
          columnStyles: {
            6: { cellWidth: 30 } // Firma column width
          },
          didDrawCell: (data) => {
            // Add signature image to the last column
            if (data.section === 'body' && data.column.index === 6) {
              const entry = companyPersonal?.[data.row.index];
              if (entry?.signature) {
                try {
                  const cellX = data.cell.x + 2;
                  const cellY = data.cell.y + 2;
                  const imgWidth = 26;
                  const imgHeight = data.cell.height - 4;
                  doc.addImage(entry.signature, 'PNG', cellX, cellY, imgWidth, imgHeight);
                } catch (error) {
                  console.warn('Could not add signature to table:', error);
                }
              }
            }
          }
        });

        yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(10, 'table', spacingConfig);

        // Add totals for this company
        const totalHours = companyPersonal.reduce((sum, entry) => {
          return sum + parseFloat(calculateHours(entry.entryTime, entry.exitTime));
        }, 0);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Total Personal ${company}: ${companyPersonal.length} trabajadores - ${totalHours.toFixed(1)} horas`, 15, yPosition);
        yPosition += getAdaptiveSpacing(10, 'line', spacingConfig);
      }
    });
  }

  // Check if we need a new page
  if (yPosition > pageHeight - 80) {
    doc.addPage();
    yPosition = 20;
  }

  // Machinery Section
  if (validMachineryEntries.length > 0) {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryColor);
    doc.text('MAQUINARIA', 15, yPosition);
    yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

    // Machinery entries by company
    allCompanies.forEach(company => {
      const companyMachinery = machineryByCompany[company] || [];
      if (companyMachinery.length > 0) {
        // Check if we need a new page
        if (yPosition > pageHeight - 60) {
          doc.addPage();
          yPosition = 20;
        }

        // Company header
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`Empresa: ${company}`, 15, yPosition);
        yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);

        // Machinery table for this company - incluye origen (subcontrata/alquiler/propia)
        const getSourceLabel = (source?: string) => {
          switch (source) {
            case 'subcontract': return 'Subcontrata';
            case 'rental': return 'Alquiler';
            default: return 'Propia';
          }
        };

        const machineryData = companyMachinery.map(entry => [
          entry.name || '-',
          entry.identifier || '-',
          getSourceLabel(entry.source),
          entry.entryTime || '-',
          entry.exitTime || '-',
          entry.operator || '-',
          entry.activity || '-',
          calculateHours(entry.entryTime, entry.exitTime)
        ]);

        autoTable(doc, {
          startY: yPosition,
          head: [['Tipo', 'Matrícula', 'Origen', 'Entrada', 'Salida', 'Operador', 'Actividad', 'Horas']],
          body: machineryData,
          styles: {
            fontSize: 9,
            cellPadding: 2,
          },
          headStyles: {
            fillColor: primaryColor,
            textColor: 255,
            fontStyle: 'bold'
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245]
          },
          margin: { left: 15, right: 15 },
          columnStyles: {
            2: { cellWidth: 22 } // Origen column
          }
        });

        yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(10, 'table', spacingConfig);

        // Add totals for this company
        const totalHours = companyMachinery.reduce((sum, entry) => {
          return sum + parseFloat(calculateHours(entry.entryTime, entry.exitTime));
        }, 0);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Total Maquinaria ${company}: ${companyMachinery.length} máquinas - ${totalHours.toFixed(1)} horas`, 15, yPosition);
        yPosition += getAdaptiveSpacing(10, 'line', spacingConfig);
      }
    });
  }

  // Observations
  if (report.observations) {
    if (yPosition > pageHeight - 40) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVACIONES', 15, yPosition);
    yPosition += getAdaptiveSpacing(8, 'section', spacingConfig);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const splitObservations = doc.splitTextToSize(report.observations, pageWidth - 30);
    doc.text(splitObservations, 15, yPosition);
    yPosition += splitObservations.length * getAdaptiveSpacing(5, 'line', spacingConfig) + getAdaptiveSpacing(10, 'section', spacingConfig);
  }

  // Summary totals
  if (yPosition > pageHeight - 30) {
    doc.addPage();
    yPosition = 20;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('RESUMEN TOTAL', 15, yPosition);
  yPosition += getAdaptiveSpacing(8, 'section', spacingConfig);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  const totalPersonal = validPersonalEntries.length;
  const totalMachinery = validMachineryEntries.length;
  const totalCompanies = allCompanies.length;

  const lineSpacing = getAdaptiveSpacing(6, 'line', spacingConfig);
  doc.text(`Total Personal: ${totalPersonal} trabajadores`, 15, yPosition);
  doc.text(`Total Maquinaria: ${totalMachinery} máquinas`, 15, yPosition + lineSpacing);
  doc.text(`Total Empresas: ${totalCompanies}`, 15, yPosition + lineSpacing * 2);

  // Footer
  const footerY = pageHeight - 20;
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')} a las ${new Date().toLocaleTimeString('es-ES')}`, 15, footerY);
  
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 30, footerY);
  }

  // Save the PDF - sanitize filename to prevent path traversal (GHSA-f8cm-6447-x5h2)
  const rawFileName = `control_accesos_${report.siteName.replace(/\s+/g, '_')}_${report.date}.pdf`;
  const fileName = sanitizePdfFilename(rawFileName);
  
  if (isNative()) {
    // En Android/iOS, usar Capacitor Filesystem
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    return saveBase64File(fileName, pdfBase64);
  } else {
    // En web, intentar usar File System Access API para elegir ubicación
    const pdfBlob = doc.output('blob');
    
    // Verificar si el navegador soporta showSaveFilePicker
    if ('showSaveFilePicker' in window) {
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
};

// Helper functions
const groupEntriesByCompany = (entries: AccessEntry[]): Record<string, AccessEntry[]> => {
  if (!Array.isArray(entries)) return {};
  return entries.reduce((acc, entry) => {
    if (!entry || typeof entry !== 'object') return acc;
    const company = entry.company || 'Sin empresa';
    if (!acc[company]) {
      acc[company] = [];
    }
    acc[company].push(entry);
    return acc;
  }, {} as Record<string, AccessEntry[]>);
};

const calculateHours = (entryTime?: string, exitTime?: string): string => {
  if (!entryTime || !exitTime) return '0.0';
  
  try {
    const entryParts = entryTime.split(':');
    const exitParts = exitTime.split(':');
    
    if (entryParts.length < 2 || exitParts.length < 2) return '0.0';
    
    const entryHour = parseInt(entryParts[0], 10) || 0;
    const entryMinute = parseInt(entryParts[1], 10) || 0;
    const exitHour = parseInt(exitParts[0], 10) || 0;
    const exitMinute = parseInt(exitParts[1], 10) || 0;
    
    const entryTotalMinutes = entryHour * 60 + entryMinute;
    const exitTotalMinutes = exitHour * 60 + exitMinute;
    
    let diffMinutes = exitTotalMinutes - entryTotalMinutes;
    if (diffMinutes < 0) {
      diffMinutes += 24 * 60; // Handle next day
    }
    
    // Restar 1 hora de descanso (14h-15h) si las horas trabajadas son más de 6 horas
    const totalHours = diffMinutes / 60;
    if (totalHours > 6) {
      diffMinutes -= 60; // Restar 1 hora de descanso
    }
    
    return (diffMinutes / 60).toFixed(1);
  } catch {
    return '0.0';
  }
};