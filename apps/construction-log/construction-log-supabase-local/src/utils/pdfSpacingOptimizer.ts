import jsPDF from 'jspdf';

/**
 * PDF Spacing Optimizer
 * 
 * Utility to intelligently adjust line spacing in PDFs to ensure
 * the last page has at least 40% of its space occupied.
 */

// Minimum occupation threshold for the last page (40%)
const MIN_LAST_PAGE_OCCUPATION = 0.4;

// Default spacing values
const DEFAULT_SECTION_SPACING = 10;
const DEFAULT_LINE_SPACING = 6;

interface SpacingConfig {
  sectionSpacing: number;
  lineSpacing: number;
  tableMargin: number;
  headerMargin: number;
}

interface ContentMetrics {
  totalContentHeight: number;
  sectionCount: number;
  tableCount: number;
  lineCount: number;
}

/** Minimal shape for work report metric estimation */
interface WorkReportLike {
  workGroups?: { items?: unknown[] }[];
  machineryGroups?: { items?: unknown[] }[];
  materialGroups?: { items?: unknown[] }[];
  subcontractGroups?: { items?: { workerDetails?: unknown[] }[] }[];
  observations?: string;
  foremanEntries?: unknown[];
}

/** Minimal shape for economic report metric estimation */
interface EconomicReportLike {
  work_groups?: { items?: unknown[] }[];
  machinery_groups?: { items?: unknown[] }[];
  material_groups?: { items?: unknown[] }[];
  subcontract_groups?: { items?: unknown[] }[];
  rental_machinery_groups?: { items?: unknown[] }[];
}

/** Minimal shape for access control report metric estimation */
interface AccessControlReportLike {
  personalEntries?: { company?: string }[];
  machineryEntries?: { company?: string }[];
  observations?: string;
}

/**
 * Calculate optimal spacing multiplier based on content distribution
 */
export const calculateOptimalSpacing = (
  doc: jsPDF,
  contentMetrics: ContentMetrics,
  baseSpacing: SpacingConfig = {
    sectionSpacing: DEFAULT_SECTION_SPACING,
    lineSpacing: DEFAULT_LINE_SPACING,
    tableMargin: 10,
    headerMargin: 15
  }
): SpacingConfig => {
  const pageHeight = doc.internal.pageSize.height;
  const usableHeight = pageHeight - 40; // Top and bottom margins
  
  const { totalContentHeight, sectionCount, tableCount, lineCount } = contentMetrics;
  
  // Calculate how many pages the content will take
  const estimatedPages = Math.ceil(totalContentHeight / usableHeight);
  
  if (estimatedPages <= 1) {
    // Single page - no optimization needed
    return baseSpacing;
  }
  
  // Calculate space used on the last page
  const spaceBeforeLastPage = (estimatedPages - 1) * usableHeight;
  const lastPageContent = totalContentHeight - spaceBeforeLastPage;
  const lastPageOccupation = lastPageContent / usableHeight;
  
  // If last page occupation is less than threshold, we need to expand spacing
  if (lastPageOccupation < MIN_LAST_PAGE_OCCUPATION) {
    // Calculate how much extra space we need to add across all pages
    const targetLastPageContent = usableHeight * MIN_LAST_PAGE_OCCUPATION;
    const deficitOnLastPage = targetLastPageContent - lastPageContent;
    
    // We need to redistribute content, but we can't reduce pages
    // So we expand spacing to push more content to the last page
    // OR we compress to fit one less page if close enough
    
    // Check if we can fit in one less page by compressing
    const contentForOneLessPage = (estimatedPages - 1) * usableHeight;
    const compressionNeeded = totalContentHeight - contentForOneLessPage;
    
    // Calculate total adjustable spacing
    const totalAdjustableSpacing = 
      (sectionCount * baseSpacing.sectionSpacing) +
      (tableCount * baseSpacing.tableMargin) +
      (lineCount * baseSpacing.lineSpacing);
    
    // If compression is feasible (less than 30% reduction), compress
    if (compressionNeeded > 0 && compressionNeeded / totalAdjustableSpacing < 0.3) {
      const compressionFactor = 1 - (compressionNeeded / totalAdjustableSpacing);
      return {
        sectionSpacing: Math.max(6, baseSpacing.sectionSpacing * compressionFactor),
        lineSpacing: Math.max(4, baseSpacing.lineSpacing * compressionFactor),
        tableMargin: Math.max(6, baseSpacing.tableMargin * compressionFactor),
        headerMargin: Math.max(10, baseSpacing.headerMargin * compressionFactor)
      };
    }
    
    // Otherwise, expand spacing to better distribute content
    // Calculate expansion factor to move content to last page
    const contentToRedistribute = deficitOnLastPage;
    const expansionFactor = 1 + (contentToRedistribute / totalAdjustableSpacing);
    
    // Cap expansion to reasonable limits (max 50% increase)
    const cappedExpansion = Math.min(1.5, expansionFactor);
    
    return {
      sectionSpacing: baseSpacing.sectionSpacing * cappedExpansion,
      lineSpacing: baseSpacing.lineSpacing * cappedExpansion,
      tableMargin: baseSpacing.tableMargin * cappedExpansion,
      headerMargin: baseSpacing.headerMargin * cappedExpansion
    };
  }
  
  return baseSpacing;
};

/**
 * Pre-calculate content metrics for a work report PDF
 */
export const estimateWorkReportMetrics = (report: WorkReportLike): ContentMetrics => {
  let contentHeight = 60; // Header
  let sectionCount = 0;
  let tableCount = 0;
  let lineCount = 0;

  // Work groups
  if (report.workGroups?.length) {
    sectionCount++;
    report.workGroups.forEach((group) => {
      lineCount++;
      tableCount++;
      contentHeight += 40 + (group.items?.length || 0) * 10;
    });
  }

  // Machinery groups
  if (report.machineryGroups?.length) {
    sectionCount++;
    report.machineryGroups.forEach((group) => {
      lineCount++;
      tableCount++;
      contentHeight += 40 + (group.items?.length || 0) * 10;
    });
  }

  // Material groups
  if (report.materialGroups?.length) {
    sectionCount++;
    report.materialGroups.forEach((group) => {
      lineCount += 2;
      tableCount++;
      contentHeight += 50 + (group.items?.length || 0) * 10;
    });
  }

  // Subcontract groups
  if (report.subcontractGroups?.length) {
    sectionCount++;
    report.subcontractGroups.forEach((group) => {
      lineCount++;
      tableCount++;
      const workerDetails = group.items?.flatMap((i) => i.workerDetails || []) || [];
      contentHeight += 50 + (group.items?.length || 0) * 10 + workerDetails.length * 8;
    });
  }
  
  // Observations
  if (report.observations) {
    sectionCount++;
    const obsLength = report.observations.length;
    contentHeight += 30 + Math.ceil(obsLength / 80) * 6;
  }
  
  // Foreman entries
  if (report.foremanEntries?.length > 0) {
    sectionCount++;
    tableCount++;
    contentHeight += 40 + report.foremanEntries.length * 10;
  }
  
  // Footer/signatures
  contentHeight += 80;
  
  return {
    totalContentHeight: contentHeight,
    sectionCount,
    tableCount,
    lineCount
  };
};

/**
 * Pre-calculate content metrics for an economic report PDF
 */
export const estimateEconomicReportMetrics = (report: EconomicReportLike): ContentMetrics => {
  let contentHeight = 80; // Header and basic info
  let sectionCount = 0;
  let tableCount = 0;
  let lineCount = 4; // Basic info lines

  // Work groups
  if (report.work_groups?.length) {
    sectionCount++;
    report.work_groups.forEach((group) => {
      lineCount += 2;
      tableCount++;
      contentHeight += 50 + (group.items?.length || 0) * 12;
    });
  }

  // Machinery groups
  if (report.machinery_groups?.length) {
    sectionCount++;
    report.machinery_groups.forEach((group) => {
      lineCount += 2;
      tableCount++;
      contentHeight += 50 + (group.items?.length || 0) * 12;
    });
  }

  // Material groups
  if (report.material_groups?.length) {
    sectionCount++;
    report.material_groups.forEach((group) => {
      lineCount += 3;
      tableCount++;
      contentHeight += 60 + (group.items?.length || 0) * 12;
    });
  }

  // Subcontract groups
  if (report.subcontract_groups?.length) {
    sectionCount++;
    report.subcontract_groups.forEach((group) => {
      lineCount += 2;
      tableCount++;
      contentHeight += 50 + (group.items?.length || 0) * 12;
    });
  }

  // Rental machinery groups
  if (report.rental_machinery_groups?.length) {
    sectionCount++;
    report.rental_machinery_groups.forEach((group) => {
      tableCount++;
      contentHeight += 50 + (group.items?.length || 0) * 15;
    });
  }
  
  // Footer/total
  contentHeight += 50;
  
  return {
    totalContentHeight: contentHeight,
    sectionCount,
    tableCount,
    lineCount
  };
};

/**
 * Pre-calculate content metrics for access control PDF
 */
export const estimateAccessControlMetrics = (report: AccessControlReportLike): ContentMetrics => {
  let contentHeight = 100; // Header and report info
  let sectionCount = 0;
  let tableCount = 0;
  let lineCount = 3;

  const personalEntries = Array.isArray(report.personalEntries) ? report.personalEntries : [];
  const machineryEntries = Array.isArray(report.machineryEntries) ? report.machineryEntries : [];

  // Personal section
  if (personalEntries.length > 0) {
    sectionCount++;
    const companies = new Set(personalEntries.map((e) => e.company || 'Sin empresa'));
    tableCount += companies.size;
    lineCount += companies.size * 2;
    contentHeight += 30 + personalEntries.length * 12;
  }

  // Machinery section
  if (machineryEntries.length > 0) {
    sectionCount++;
    const companies = new Set(machineryEntries.map((e) => e.company || 'Sin empresa'));
    tableCount += companies.size;
    lineCount += companies.size * 2;
    contentHeight += 30 + machineryEntries.length * 12;
  }
  
  // Observations
  if (report.observations) {
    sectionCount++;
    contentHeight += 40;
  }
  
  // Summary
  sectionCount++;
  contentHeight += 40;
  
  return {
    totalContentHeight: contentHeight,
    sectionCount,
    tableCount,
    lineCount
  };
};

/**
 * Get adaptive spacing value based on calculated config
 */
export const getAdaptiveSpacing = (
  baseValue: number,
  type: 'section' | 'line' | 'table' | 'header',
  config: SpacingConfig
): number => {
  const ratio = (() => {
    switch (type) {
      case 'section':
        return config.sectionSpacing / DEFAULT_SECTION_SPACING;
      case 'line':
        return config.lineSpacing / DEFAULT_LINE_SPACING;
      case 'table':
        return config.tableMargin / 10;
      case 'header':
        return config.headerMargin / 15;
      default:
        return 1;
    }
  })();
  
  return Math.round(baseValue * ratio * 10) / 10;
};

export type { SpacingConfig, ContentMetrics };
