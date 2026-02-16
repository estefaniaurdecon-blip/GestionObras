import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WorkPostventa } from '@/hooks/useWorkPostventas';
import { sanitizePdfFilename } from '@/utils/securePdfFilename';

interface ExportContext {
  workName: string;
  workNumber: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En Proceso',
  completed: 'Completado',
};

// Calculate total hours from subcontract_groups
const calculateTotalHours = (postventa: WorkPostventa): number => {
  if (!postventa.subcontract_groups || postventa.subcontract_groups.length === 0) return 0;
  return postventa.subcontract_groups.reduce((total, group) => {
    const workerHours = group.workers?.reduce((sum, w) => sum + (w.hours || 0), 0) || 0;
    const machineryHours = group.machinery?.reduce((sum, m) => sum + (m.hours || 0), 0) || 0;
    return total + workerHours + machineryHours;
  }, 0);
};

// Get companies list from subcontract_groups
const getCompanies = (postventa: WorkPostventa): string => {
  if (!postventa.subcontract_groups || postventa.subcontract_groups.length === 0) {
    return postventa.assigned_company || '-';
  }
  const companies = postventa.subcontract_groups
    .map(g => g.company)
    .filter(c => c && c.trim())
    .join(', ');
  return companies || postventa.assigned_company || '-';
};

export const exportPostventasToExcel = async (
  postventas: WorkPostventa[],
  context: ExportContext
): Promise<void> => {
  const workbook = XLSX.utils.book_new();
  
  // Main sheet - Summary
  const summaryData = postventas.map(pv => ({
    'Código': pv.code,
    'Estado': STATUS_LABELS[pv.status] || pv.status,
    'Descripción': pv.description,
    'Empresas': getCompanies(pv),
    'Horas Totales': calculateTotalHours(pv),
    'Fecha Creación': new Date(pv.created_at).toLocaleDateString('es-ES'),
    'Fecha Completado': pv.completed_at 
      ? new Date(pv.completed_at).toLocaleDateString('es-ES') 
      : '-',
  }));

  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  
  // Set column widths
  summarySheet['!cols'] = [
    { wch: 10 },  // Código
    { wch: 12 },  // Estado
    { wch: 40 },  // Descripción
    { wch: 25 },  // Empresas
    { wch: 12 },  // Horas
    { wch: 14 },  // Fecha Creación
    { wch: 14 },  // Fecha Completado
  ];

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen Post-Ventas');

  // Detail sheet - Subcontracts breakdown
  const detailRows: any[] = [];
  postventas.forEach(pv => {
    if (pv.subcontract_groups && pv.subcontract_groups.length > 0) {
      pv.subcontract_groups.forEach(group => {
        // Workers
        group.workers?.forEach(worker => {
          detailRows.push({
            'Código PV': pv.code,
            'Empresa': group.company,
            'Tipo': 'Trabajador',
            'Nombre/Tipo': worker.name,
            'Horas': worker.hours,
          });
        });
        // Machinery
        group.machinery?.forEach(machine => {
          detailRows.push({
            'Código PV': pv.code,
            'Empresa': group.company,
            'Tipo': 'Maquinaria',
            'Nombre/Tipo': machine.type,
            'Horas': machine.hours,
          });
        });
      });
    }
  });

  if (detailRows.length > 0) {
    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    detailSheet['!cols'] = [
      { wch: 10 },
      { wch: 25 },
      { wch: 12 },
      { wch: 30 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle Subcontratas');
  }

  // Generate filename and save
  const safeWorkName = context.workName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '').trim();
  const fileName = `PostVentas_${context.workNumber}_${safeWorkName}.xlsx`;
  
  XLSX.writeFile(workbook, fileName);
};

export const exportPostventasToPdf = async (
  postventas: WorkPostventa[],
  context: ExportContext
): Promise<void> => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORME DE POST-VENTAS', pageWidth / 2, 20, { align: 'center' });
  
  // Work info
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Obra: ${context.workNumber} - ${context.workName}`, 14, 32);
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, 14, 38);

  // Stats summary
  const pending = postventas.filter(p => p.status === 'pending').length;
  const inProgress = postventas.filter(p => p.status === 'in_progress').length;
  const completed = postventas.filter(p => p.status === 'completed').length;
  const totalHours = postventas.reduce((sum, p) => sum + calculateTotalHours(p), 0);

  doc.text(`Total: ${postventas.length} | Pendientes: ${pending} | En Proceso: ${inProgress} | Completados: ${completed} | Horas: ${totalHours}h`, 14, 46);

  // Main table
  const tableData = postventas.map(pv => [
    pv.code,
    STATUS_LABELS[pv.status] || pv.status,
    pv.description.length > 60 ? pv.description.substring(0, 57) + '...' : pv.description,
    getCompanies(pv),
    `${calculateTotalHours(pv)}h`,
  ]);

  autoTable(doc, {
    startY: 52,
    head: [['Código', 'Estado', 'Descripción', 'Empresas', 'Horas']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [124, 58, 237], textColor: 255 }, // Purple theme for Post-Venta
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 22 },
      2: { cellWidth: 70 },
      3: { cellWidth: 45 },
      4: { cellWidth: 18 },
    },
  });

  // Generate filename and save
  const safeFileName = sanitizePdfFilename(`PostVentas_${context.workNumber}_${context.workName}`);
  doc.save(`${safeFileName}.pdf`);
};
