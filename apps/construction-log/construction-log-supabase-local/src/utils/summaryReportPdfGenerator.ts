import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { sanitizePdfFilename } from './securePdfFilename';
import { calculateOptimalSpacing, getAdaptiveSpacing, ContentMetrics } from './pdfSpacingOptimizer';
import { sanitizePdfText, wrapPdfText } from './pdfText';

interface SummaryReportData {
  statistics: any;
  anomalies: Array<{
    type: 'warning' | 'error' | 'info';
    title: string;
    description: string;
    affectedItems?: string[];
  }>;
  aiAnalysis: string;
  chartData: {
    monthlyTrends: Array<{
      month: string;
      workHours: number;
      machineryHours: number;
      materialCost: number;
      subcontractCost: number;
      reports: number;
    }>;
    costDistribution: Array<{
      name: string;
      value: number;
      color: string;
    }>;
    topCompanies: Array<{
      company: string;
      workHours: number;
      machineryHours: number;
      total: number;
    }>;
    topWorks: Array<{
      work: string;
      reports: number;
      workHours: number;
      materialCost: number;
    }>;
    dayDistribution: Array<{
      day: string;
      count: number;
    }>;
  };
  periodDescription: string;
}

interface GeneratorOptions {
  companyName?: string;
  companyLogo?: string;
  brandColor?: string;
}

// Estimate content metrics
const estimateContentMetrics = (data: SummaryReportData): ContentMetrics => {
  let contentHeight = 80; // Header
  let sectionCount = 10;
  let tableCount = 5;
  let lineCount = 50;
  
  // AI Analysis text
  const analysisLines = data.aiAnalysis.split('\n').length;
  contentHeight += analysisLines * 5;
  lineCount += analysisLines;
  
  // Tables
  contentHeight += data.chartData.topCompanies.length * 10 + 50;
  contentHeight += data.chartData.topWorks.length * 10 + 50;
  contentHeight += data.chartData.monthlyTrends.length * 10 + 50;
  contentHeight += data.anomalies.length * 30;
  
  return { totalContentHeight: contentHeight, sectionCount, tableCount, lineCount };
};

// Parse markdown sections from AI analysis
const parseMarkdownSections = (markdown: string): Array<{ title: string; content: string }> => {
  const sections: Array<{ title: string; content: string }> = [];
  const lines = markdown.split('\n');
  
  let currentTitle = '';
  let currentContent: string[] = [];
  
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
      }
      currentTitle = line.replace('## ', '').trim();
      currentContent = [];
    } else if (currentTitle) {
      currentContent.push(line);
    }
  }
  
  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
  }
  
  return sections;
};

// Clean markdown formatting for PDF
const cleanMarkdown = (text: string): string => {
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/###\s*/g, '')
    .replace(/##\s*/g, '')
    .replace(/#\s*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Clean problematic unicode characters
    .replace(/[•●○◦▪▸►]/g, '-')
    .replace(/&[a-zA-Z]+;/g, '') // Remove HTML entities
    .replace(/[\u2022\u2023\u2043\u2219]/g, '-') // Unicode bullets
    .trim();
};

// Draw simple bar chart
const drawBarChart = (
  doc: jsPDF, 
  data: Array<{ label: string; value: number }>, 
  x: number, 
  y: number, 
  width: number, 
  height: number,
  title: string,
  primaryColor: number[]
) => {
  if (data.length === 0) return y;
  
  const maxValue = Math.max(...data.map(d => d.value));
  const barHeight = Math.min(12, (height - 30) / data.length);
  const labelWidth = 70;
  const chartWidth = width - labelWidth - 30;
  
  // Title
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(title, x, y);
  y += 8;
  
  // Bars
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const item = data[i];
    const barWidth = maxValue > 0 ? (item.value / maxValue) * chartWidth : 0;
    
    // Label
    doc.setTextColor(60, 60, 60);
    const truncatedLabel = item.label.length > 25 ? item.label.substring(0, 22) + '...' : item.label;
    doc.text(truncatedLabel, x, y + barHeight / 2);
    
    // Bar background
    doc.setFillColor(240, 240, 240);
    doc.rect(x + labelWidth, y - 3, chartWidth, barHeight - 2, 'F');
    
    // Bar
    const lightColor = [
      Math.min(255, primaryColor[0] + 50),
      Math.min(255, primaryColor[1] + 50),
      Math.min(255, primaryColor[2] + 50),
    ];
    doc.setFillColor(lightColor[0], lightColor[1], lightColor[2]);
    doc.rect(x + labelWidth, y - 3, barWidth, barHeight - 2, 'F');
    
    // Value
    doc.setTextColor(60, 60, 60);
    doc.text(item.value.toLocaleString('es-ES', { maximumFractionDigits: 1 }), x + labelWidth + chartWidth + 5, y + barHeight / 2);
    
    y += barHeight;
  }
  
  return y + 5;
};

// Draw pie chart (simplified)
const drawPieChart = (
  doc: jsPDF,
  data: Array<{ name: string; value: number; color: string }>,
  x: number,
  y: number,
  radius: number,
  title: string,
  primaryColor: number[]
) => {
  if (data.length === 0) return y;
  
  // Title
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(title, x, y);
  y += 10;
  
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return y + 20;
  
  const centerX = x + radius + 10;
  const centerY = y + radius;
  
  let startAngle = -Math.PI / 2;
  const colors = [
    [110, 143, 86],
    [74, 124, 89],
    [139, 69, 19],
    [47, 79, 79],
    [178, 134, 78],
  ];
  
  // Draw pie segments (simplified as legend since jsPDF doesn't support arcs well)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  let legendY = y;
  const legendX = x;
  
  data.forEach((item, index) => {
    const percentage = ((item.value / total) * 100).toFixed(1);
    const color = colors[index % colors.length];
    
    // Color box
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(legendX, legendY, 10, 8, 'F');
    
    // Label
    doc.setTextColor(60, 60, 60);
    doc.text(`${item.name}: ${percentage}% (${item.value.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€)`, legendX + 15, legendY + 6);
    
    legendY += 12;
  });
  
  return legendY + 5;
};

export const generateSummaryReportPDF = async (
  data: SummaryReportData,
  options: GeneratorOptions = {}
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const MARGIN_LEFT = 15;
  const MARGIN_RIGHT = 15;
  const CONTENT_WIDTH = pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
  
  // Calculate spacing
  const metrics = estimateContentMetrics(data);
  const spacingConfig = calculateOptimalSpacing(doc, metrics);
  
  // Brand color
  let primaryR = 110, primaryG = 143, primaryB = 86;
  if (options.brandColor && /^#[0-9A-Fa-f]{6}$/.test(options.brandColor)) {
    const hex = options.brandColor.replace('#', '');
    primaryR = parseInt(hex.substring(0, 2), 16);
    primaryG = parseInt(hex.substring(2, 4), 16);
    primaryB = parseInt(hex.substring(4, 6), 16);
  }
  const primaryColor = [primaryR, primaryG, primaryB];
  
  let yPosition = 15;
  
  // Helper: check page break
  const checkPageBreak = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - 25) {
      doc.addPage();
      yPosition = 20;
      return true;
    }
    return false;
  };
  
  // ============ COVER PAGE ============
  // Logo
  if (options.companyLogo) {
    try {
      let format = 'PNG';
      if (options.companyLogo.includes('data:image/jpeg')) format = 'JPEG';
      doc.addImage(options.companyLogo, format, pageWidth / 2 - 20, yPosition, 40, 40);
      yPosition += 50;
    } catch (e) {
      console.error('Error adding logo:', e);
    }
  }
  
  // Title
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryR, primaryG, primaryB);
  doc.text('INFORME RESUMEN INTELIGENTE', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 12;
  
  // Subtitle
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Análisis Completo de Partes de Trabajo', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 10;
  
  // Company name
  if (options.companyName) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryR, primaryG, primaryB);
    doc.text(options.companyName, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 8;
  }
  
  // Period
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Período: ${data.periodDescription}`, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 6;
  
  // Generation date
  doc.setFontSize(10);
  doc.text(`Generado: ${format(new Date(), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })}`, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 20;
  
  // Divider
  doc.setDrawColor(primaryR, primaryG, primaryB);
  doc.setLineWidth(1);
  doc.line(MARGIN_LEFT + 30, yPosition, pageWidth - MARGIN_LEFT - 30, yPosition);
  yPosition += 15;
  
  // ============ EXECUTIVE SUMMARY BOXES ============
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryR, primaryG, primaryB);
  doc.text('RESUMEN EJECUTIVO', MARGIN_LEFT, yPosition);
  yPosition += getAdaptiveSpacing(12, 'section', spacingConfig);
  
  // Key metrics boxes
  const boxWidth = (CONTENT_WIDTH - 10) / 2;
  const boxHeight = 25;
  const stats = data.statistics;
  
  const keyMetrics = [
    { label: 'Total Partes', value: stats.totalReports?.toString() || '0' },
    { label: 'Horas Trabajo', value: `${(stats.totals?.workHours || 0).toFixed(1)}h` },
    { label: 'Horas Maquinaria', value: `${(stats.totals?.machineryHours || 0).toFixed(1)}h` },
    { label: 'Coste Materiales', value: `${(stats.totals?.materialCost || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })}€` },
  ];
  
  for (let i = 0; i < keyMetrics.length; i += 2) {
    const row = keyMetrics.slice(i, i + 2);
    row.forEach((metric, j) => {
      const boxX = MARGIN_LEFT + j * (boxWidth + 10);
      
      // Box background
      const lightColor = [
        Math.min(255, primaryR + (255 - primaryR) * 0.9),
        Math.min(255, primaryG + (255 - primaryG) * 0.9),
        Math.min(255, primaryB + (255 - primaryB) * 0.9),
      ];
      doc.setFillColor(lightColor[0], lightColor[1], lightColor[2]);
      doc.roundedRect(boxX, yPosition, boxWidth, boxHeight, 3, 3, 'F');
      
      // Border
      doc.setDrawColor(primaryR, primaryG, primaryB);
      doc.setLineWidth(0.5);
      doc.roundedRect(boxX, yPosition, boxWidth, boxHeight, 3, 3, 'S');
      
      // Label
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(metric.label, boxX + 5, yPosition + 10);
      
      // Value
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryR, primaryG, primaryB);
      doc.text(metric.value, boxX + 5, yPosition + 20);
    });
    yPosition += boxHeight + 5;
  }
  
  yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);
  
  // Additional stats table
  checkPageBreak(60);
  
  const statsData = [
    ['Partes Aprobados', `${stats.approvedReports || 0} (${stats.totalReports ? ((stats.approvedReports / stats.totalReports) * 100).toFixed(0) : 0}%)`],
    ['Trabajadores Registrados', `${stats.totals?.workersCount || 0}`],
    ['Horas Encargados', `${(stats.totals?.foremanHours || 0).toFixed(1)}h`],
    ['Coste Subcontratas', `${(stats.totals?.subcontractCost || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })}€`],
    ['Empresas Activas', `${Object.keys(stats.byCompany || {}).length}`],
    ['Obras con Actividad', `${Object.keys(stats.byWork || {}).length}`],
    ['Período', `${stats.dateRange?.earliest || '-'} a ${stats.dateRange?.latest || '-'}`],
  ];
  
  autoTable(doc, {
    startY: yPosition,
    head: [['Concepto', 'Valor']],
    body: statsData,
    margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { 
      fillColor: [primaryR, primaryG, primaryB],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    alternateRowStyles: { 
      fillColor: [Math.min(255, primaryR + (255 - primaryR) * 0.95), 
                  Math.min(255, primaryG + (255 - primaryG) * 0.95), 
                  Math.min(255, primaryB + (255 - primaryB) * 0.95)]
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold' }
    }
  });
  
  yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(15, 'section', spacingConfig);
  
  // ============ CHARTS PAGE ============
  doc.addPage();
  yPosition = 20;
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryR, primaryG, primaryB);
  doc.text('ANÁLISIS GRÁFICO', MARGIN_LEFT, yPosition);
  yPosition += getAdaptiveSpacing(15, 'section', spacingConfig);
  
  // Top Companies Bar Chart
  if (data.chartData.topCompanies.length > 0) {
    yPosition = drawBarChart(
      doc,
      data.chartData.topCompanies.map(c => ({ label: c.company, value: c.total })),
      MARGIN_LEFT,
      yPosition,
      CONTENT_WIDTH,
      120,
      'TOP 10 EMPRESAS POR HORAS',
      primaryColor
    );
    yPosition += getAdaptiveSpacing(15, 'section', spacingConfig);
  }
  
  checkPageBreak(80);
  
  // Cost Distribution
  if (data.chartData.costDistribution.length > 0) {
    yPosition = drawPieChart(
      doc,
      data.chartData.costDistribution,
      MARGIN_LEFT,
      yPosition,
      30,
      'DISTRIBUCIÓN DE COSTES',
      primaryColor
    );
    yPosition += getAdaptiveSpacing(15, 'section', spacingConfig);
  }
  
  checkPageBreak(80);
  
  // Monthly Trends Table
  if (data.chartData.monthlyTrends.length > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryR, primaryG, primaryB);
    doc.text('TENDENCIAS MENSUALES', MARGIN_LEFT, yPosition);
    yPosition += 8;
    
    const monthlyData = data.chartData.monthlyTrends.map(m => [
      m.month,
      m.reports.toString(),
      m.workHours.toFixed(1) + 'h',
      m.machineryHours.toFixed(1) + 'h',
      m.materialCost.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + '€',
    ]);
    
    autoTable(doc, {
      startY: yPosition,
      head: [['Mes', 'Partes', 'H. Trabajo', 'H. Maquinaria', 'Materiales']],
      body: monthlyData,
      margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { 
        fillColor: [primaryR, primaryG, primaryB],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
    });
    
    yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(15, 'section', spacingConfig);
  }
  
  // ============ TOP WORKS TABLE ============
  checkPageBreak(80);
  
  if (data.chartData.topWorks.length > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryR, primaryG, primaryB);
    doc.text('TOP OBRAS POR ACTIVIDAD', MARGIN_LEFT, yPosition);
    yPosition += 8;
    
    const worksData = data.chartData.topWorks.map(w => [
      w.work.length > 40 ? w.work.substring(0, 37) + '...' : w.work,
      w.reports.toString(),
      w.workHours.toFixed(1) + 'h',
      w.materialCost.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + '€',
    ]);
    
    autoTable(doc, {
      startY: yPosition,
      head: [['Obra', 'Partes', 'Horas', 'Materiales']],
      body: worksData,
      margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { 
        fillColor: [primaryR, primaryG, primaryB],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
    });
    
    yPosition = (doc as any).lastAutoTable.finalY + getAdaptiveSpacing(15, 'section', spacingConfig);
  }
  
  // ============ AI ANALYSIS SECTIONS ============
  doc.addPage();
  yPosition = 20;
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryR, primaryG, primaryB);
  doc.text('ANÁLISIS INTELIGENTE', MARGIN_LEFT, yPosition);
  yPosition += getAdaptiveSpacing(12, 'section', spacingConfig);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);
  doc.text('Generado mediante Inteligencia Artificial a partir de los datos de partes de trabajo', MARGIN_LEFT, yPosition);
  yPosition += getAdaptiveSpacing(10, 'section', spacingConfig);
  
  // Parse and render AI analysis sections
  const sections = parseMarkdownSections(data.aiAnalysis);
  
  for (const section of sections) {
    checkPageBreak(40);
    
    // Section title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryR, primaryG, primaryB);
    doc.text(section.title.toUpperCase(), MARGIN_LEFT, yPosition);
    yPosition += getAdaptiveSpacing(8, 'line', spacingConfig);
    
    // Underline
    doc.setDrawColor(primaryR, primaryG, primaryB);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_LEFT, yPosition - 2, MARGIN_LEFT + 60, yPosition - 2);
    yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);
    
    // Section content - process line by line for better control
    // Sanitize to avoid Unicode glyph/font corruption and keep wrapping stable
    const cleanContent = sanitizePdfText(cleanMarkdown(section.content));
    const rawLines = cleanContent.split('\n');
    
    // Always ensure helvetica font is set
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50, 50, 50);
    
    for (const rawLine of rawLines) {
      if (!rawLine.trim()) continue;
      
      // Reset font to ensure consistency
      doc.setFont('helvetica', 'normal');
      
      // Check if it's a bullet point
      const isBullet = rawLine.trim().startsWith('-') || rawLine.trim().startsWith('•');
      const textContent = isBullet 
        ? rawLine.trim().replace(/^[-•]\s*/, '') 
        : rawLine.trim();
      
      // Calculate available width for text
      const textWidth = isBullet ? CONTENT_WIDTH - 10 : CONTENT_WIDTH;
      const xPos = isBullet ? MARGIN_LEFT + 8 : MARGIN_LEFT;
      
      // Split text to fit within available width (also breaks very long tokens)
      const wrappedLines = wrapPdfText(doc, textContent, textWidth);
      
      for (let i = 0; i < wrappedLines.length; i++) {
        checkPageBreak(7);
        
        // Reset font before each line to prevent corruption
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);
        
        // Draw bullet only for first line of a bullet point
        if (isBullet && i === 0) {
          doc.setFillColor(primaryR, primaryG, primaryB);
          doc.circle(MARGIN_LEFT + 3, yPosition - 1.5, 1, 'F');
        }
        
        doc.text(wrappedLines[i], xPos, yPosition);
        yPosition += getAdaptiveSpacing(5, 'line', spacingConfig);
      }
    }
    
    yPosition += getAdaptiveSpacing(8, 'section', spacingConfig);
  }
  
  // ============ ANOMALIES SECTION ============
  if (data.anomalies.length > 0) {
    doc.addPage();
    yPosition = 20;
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryR, primaryG, primaryB);
    doc.text('ANOMALÍAS Y ALERTAS DETECTADAS', MARGIN_LEFT, yPosition);
    yPosition += getAdaptiveSpacing(15, 'section', spacingConfig);
    
    for (const anomaly of data.anomalies) {
      checkPageBreak(50);
      
      // Anomaly box
      const boxColor = anomaly.type === 'error' ? [220, 53, 69] :
                       anomaly.type === 'warning' ? [255, 193, 7] : [23, 162, 184];
      const bgColor = anomaly.type === 'error' ? [253, 237, 239] :
                      anomaly.type === 'warning' ? [255, 249, 230] : [232, 247, 252];
      
      // Calculate box height
      const descLines = doc.splitTextToSize(anomaly.description, CONTENT_WIDTH - 20);
      const itemsHeight = anomaly.affectedItems ? Math.min(anomaly.affectedItems.length, 5) * 5 : 0;
      const boxH = 20 + descLines.length * 5 + itemsHeight + 10;
      
      // Background
      doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
      doc.roundedRect(MARGIN_LEFT, yPosition, CONTENT_WIDTH, boxH, 3, 3, 'F');
      
      // Left border
      doc.setFillColor(boxColor[0], boxColor[1], boxColor[2]);
      doc.rect(MARGIN_LEFT, yPosition, 4, boxH, 'F');
      
      // Title
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(boxColor[0], boxColor[1], boxColor[2]);
      const icon = anomaly.type === 'error' ? '⛔' : anomaly.type === 'warning' ? '⚠️' : 'ℹ️';
      doc.text(`${icon} ${anomaly.title}`, MARGIN_LEFT + 10, yPosition + 10);
      
      // Description
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      let descY = yPosition + 18;
      for (const line of descLines) {
        doc.text(line, MARGIN_LEFT + 10, descY);
        descY += 5;
      }
      
      // Affected items
      if (anomaly.affectedItems && anomaly.affectedItems.length > 0) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100, 100, 100);
        descY += 3;
        for (const item of anomaly.affectedItems.slice(0, 5)) {
          doc.text(`• ${item}`, MARGIN_LEFT + 15, descY);
          descY += 5;
        }
        if (anomaly.affectedItems.length > 5) {
          doc.text(`... y ${anomaly.affectedItems.length - 5} más`, MARGIN_LEFT + 15, descY);
        }
      }
      
      yPosition += boxH + 8;
    }
  }
  
  // ============ FOOTER ============
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // Page number
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    // Footer text
    doc.text('Informe generado automáticamente con análisis de IA', MARGIN_LEFT, pageHeight - 10);
    doc.text(format(new Date(), 'dd/MM/yyyy HH:mm'), pageWidth - MARGIN_RIGHT, pageHeight - 10, { align: 'right' });
  }
  
  // Save
  const timestamp = format(new Date(), 'yyyy-MM-dd');
  const rawFilename = `Informe_Resumen_Inteligente_${timestamp}.pdf`;
  const filename = sanitizePdfFilename(rawFilename);
  doc.save(filename);
  
  return filename;
};
