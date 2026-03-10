import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WorkReport } from '@/types/workReport';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { sanitizePdfFilename } from './securePdfFilename';
import { calculateOptimalSpacing, getAdaptiveSpacing, SpacingConfig, ContentMetrics } from './pdfSpacingOptimizer';

interface ReportSummary {
  totalReports: number;
  totalWorkHours: number;
  totalMachineryHours: number;
  totalForemanHours: number;
  totalMaterials: number;
  totalSubcontractors: number;
  uniqueCompanies: number;
}

interface ComprehensiveReportOptions {
  title: string;
  period: string;
  summary: ReportSummary;
}

// Estimate content metrics for comprehensive report
const estimateComprehensiveReportMetrics = (reports: WorkReport[], options: ComprehensiveReportOptions): ContentMetrics => {
  let contentHeight = 60; // Header
  const sectionCount = 3; // Summary, daily, company
  const tableCount = 3;
  const lineCount = 10;
  
  contentHeight += 100; // Summary table
  contentHeight += reports.length * 12 + 50; // Daily table
  contentHeight += Object.keys(reports.reduce((acc, r) => {
    r.workGroups?.forEach(g => acc[g.company] = true);
    r.machineryGroups?.forEach(g => acc[g.company] = true);
    return acc;
  }, {} as Record<string, boolean>)).length * 12 + 50; // Company table
  
  return { totalContentHeight: contentHeight, sectionCount, tableCount, lineCount };
};

export const generateComprehensiveReportPDF = (
  reports: WorkReport[], 
  options: ComprehensiveReportOptions
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let yPosition = 20;

  // Calculate optimal spacing to ensure last page has at least 40% occupation
  const metrics = estimateComprehensiveReportMetrics(reports, options);
  const spacingConfig = calculateOptimalSpacing(doc, metrics);

  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(options.title, pageWidth / 2, yPosition, { align: 'center' });
  
  yPosition += getAdaptiveSpacing(15, 'section', spacingConfig);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Período: ${options.period}`, pageWidth / 2, yPosition, { align: 'center' });
  
  yPosition += getAdaptiveSpacing(10, 'line', spacingConfig);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.text('by Tony Bautista', pageWidth / 2, yPosition, { align: 'center' });
  
  yPosition += getAdaptiveSpacing(15, 'section', spacingConfig);

  // Summary section
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN EJECUTIVO', 20, yPosition);
  yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

  // Summary table
  const summaryData = [
    ['Total de Partes', options.summary.totalReports.toString()],
    ['Horas de Trabajo', options.summary.totalWorkHours.toFixed(1)],
    ['Horas de Maquinaria', options.summary.totalMachineryHours.toFixed(1)],
    ['Horas de Encargado de Obra', options.summary.totalForemanHours.toFixed(1)],
    ['Total Materiales', options.summary.totalMaterials.toString()],
    ['Total Subcontratas', options.summary.totalSubcontractors.toString()],
    ['Empresas Involucradas', options.summary.uniqueCompanies.toString()],
  ];

  autoTable(doc, {
    startY: yPosition,
    head: [['Concepto', 'Valor']],
    body: summaryData,
    margin: { left: 20, right: 20 },
    styles: { fontSize: 10 },
    headStyles: { fillColor: [110, 143, 86] },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 40, halign: 'center' }
    }
  });

  yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(20, 'section', spacingConfig);

  // Daily summary table
  if (yPosition > 200) {
    doc.addPage();
    yPosition = 20;
  }

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN DIARIO', 20, yPosition);
  yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

  // Group reports by date
  const dailySummary: { [date: string]: any } = {};
  
  reports.forEach(report => {
    const dateKey = format(new Date(report.date), 'dd/MM/yyyy', { locale: es });
    
    if (!dailySummary[dateKey]) {
      dailySummary[dateKey] = {
        date: dateKey,
        workName: report.workName || 'N/A',
        workHours: 0,
        machineryHours: 0,
        materials: 0,
        companies: new Set<string>()
      };
    }

    // Sum work hours
    const workHours = report.workGroups?.reduce((total, group) => 
      total + group.items.reduce((itemTotal, item) => itemTotal + (item.hours || 0), 0), 0) || 0;
    dailySummary[dateKey].workHours += workHours;

    // Sum machinery hours
    const machineryHours = report.machineryGroups?.reduce((total, group) => 
      total + group.items.reduce((itemTotal, item) => itemTotal + (item.hours || 0), 0), 0) || 0;
    dailySummary[dateKey].machineryHours += machineryHours;

    // Count materials
    const materialCount = report.materialGroups?.reduce((total, group) => total + group.items.length, 0) || 0;
    dailySummary[dateKey].materials += materialCount;

    // Collect companies
    report.workGroups?.forEach(group => dailySummary[dateKey].companies.add(group.company));
    report.machineryGroups?.forEach(group => dailySummary[dateKey].companies.add(group.company));
  });

  const dailyTableData = Object.values(dailySummary).map((day: any) => [
    day.date,
    day.workName,
    day.workHours.toFixed(1),
    day.machineryHours.toFixed(1),
    day.materials.toString(),
    day.companies.size.toString()
  ]);

  autoTable(doc, {
    startY: yPosition,
    head: [['Fecha', 'Obra', 'H. Trabajo', 'H. Maquinaria', 'Materiales', 'Empresas']],
    body: dailyTableData,
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
    headStyles: { fillColor: [110, 143, 86] },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 50 },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 25, halign: 'center' },
      4: { cellWidth: 25, halign: 'center' },
      5: { cellWidth: 20, halign: 'center' }
    }
  });

  yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(20, 'section', spacingConfig);

  // Company breakdown
  if (yPosition > 200) {
    doc.addPage();
    yPosition = 20;
  }

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('DESGLOSE POR EMPRESAS', 20, yPosition);
  yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);

  // Calculate company totals
  const companyTotals: { [company: string]: { workHours: number; machineryHours: number; } } = {};
  
  reports.forEach(report => {
    report.workGroups?.forEach(group => {
      if (!companyTotals[group.company]) {
        companyTotals[group.company] = { workHours: 0, machineryHours: 0 };
      }
      const hours = group.items.reduce((total, item) => total + (item.hours || 0), 0);
      companyTotals[group.company].workHours += hours;
    });

    report.machineryGroups?.forEach(group => {
      if (!companyTotals[group.company]) {
        companyTotals[group.company] = { workHours: 0, machineryHours: 0 };
      }
      const hours = group.items.reduce((total, item) => total + (item.hours || 0), 0);
      companyTotals[group.company].machineryHours += hours;
    });
  });

  const companyTableData = Object.entries(companyTotals)
    .sort(([,a], [,b]) => (b.workHours + b.machineryHours) - (a.workHours + a.machineryHours))
    .map(([company, totals]) => [
      company,
      totals.workHours.toFixed(1),
      totals.machineryHours.toFixed(1),
      (totals.workHours + totals.machineryHours).toFixed(1)
    ]);

  autoTable(doc, {
    startY: yPosition,
    head: [['Empresa', 'H. Trabajo', 'H. Maquinaria', 'Total Horas']],
    body: companyTableData,
    margin: { left: 20, right: 20 },
    styles: { fontSize: 10 },
    headStyles: { fillColor: [110, 143, 86] },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 30, halign: 'center' },
      3: { cellWidth: 30, halign: 'center', fontStyle: 'bold' }
    }
  });

  // Add footer with generation date
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })} - Página ${i} de ${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
  }

  // Save the PDF - sanitize filename to prevent path traversal (GHSA-f8cm-6447-x5h2)
  const titleSlug = options.title.replace(/\s+/g, '_');
  const dateFormatted = format(new Date(), 'dd-MM-yyyy');
  const rawFileName = `${titleSlug}_${dateFormatted}.pdf`;
  const fileName = sanitizePdfFilename(rawFileName);
  doc.save(fileName);
};