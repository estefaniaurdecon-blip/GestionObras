import * as XLSX from 'xlsx-js-style';
import { AccessReport } from '@/types/accessControl';
import { format } from 'date-fns';

// Helper function to apply center alignment to all cells in a worksheet
const applyCenterAlignment = (worksheet: XLSX.WorkSheet) => {
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

export const exportAccessControlToExcel = (reports: AccessReport[]) => {
  const workbook = XLSX.utils.book_new();

  // Resumen general (con entradas válidas)
  const summaryData: any[] = [
    ['RESUMEN DE CONTROLES DE ACCESO'],
    [''],
    ['Período:', reports.length > 0 ? `${reports[reports.length - 1]?.date} - ${reports[0]?.date}` : 'Sin datos'],
    ['Total Informes:', reports.length],
    [''],
    ['TOTALES POR CATEGORÍA'],
    ['Personal Total:', reports.reduce((sum, r) => {
      const seenDnis = new Set<string>();
      return sum + r.personalEntries.filter(e => {
        const dni = e.identifier.trim();
        if (dni === '' || seenDnis.has(dni)) return false;
        seenDnis.add(dni);
        return true;
      }).length;
    }, 0)],
    ['Maquinaria Total:', reports.reduce((sum, r) => sum + r.machineryEntries.filter(e => e.identifier.trim() !== '').length, 0)],
    [''],
    ['DETALLE POR INFORME'],
    ['Fecha', 'Obra', 'Responsable', 'Personal', 'Maquinaria', 'Observaciones']
  ];

  reports.forEach(report => {
    const seenDnis = new Set<string>();
    const validPersonal = report.personalEntries.filter(e => {
      const dni = e.identifier.trim();
      if (dni === '' || seenDnis.has(dni)) return false;
      seenDnis.add(dni);
      return true;
    }).length;
    
    const validMachinery = report.machineryEntries.filter(e => e.identifier.trim() !== '').length;
    
    summaryData.push([
      report.date,
      report.siteName,
      report.responsible,
      validPersonal,
      validMachinery,
      report.observations || ''
    ]);
  });

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  applyCenterAlignment(summarySheet);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

  // Personal sheet (con entradas válidas)
  const personalData: any[] = [
    ['REGISTRO DE PERSONAL'],
    [''],
    ['Fecha', 'Obra', 'Nombre', 'DNI', 'Empresa', 'Entrada', 'Salida', 'Horas', 'Actividad']
  ];

  reports.forEach(report => {
    const seenDnis = new Set<string>();
    report.personalEntries
      .filter(e => {
        const dni = e.identifier.trim();
        if (dni === '' || seenDnis.has(dni)) return false;
        seenDnis.add(dni);
        return true;
      })
      .forEach(entry => {
        const hours = calculateHours(entry.entryTime, entry.exitTime);
        personalData.push([
          report.date,
          report.siteName,
          entry.name,
          entry.identifier,
          entry.company,
          entry.entryTime,
          entry.exitTime || '',
          hours,
          entry.activity
        ]);
      });
  });

  const personalSheet = XLSX.utils.aoa_to_sheet(personalData);
  applyCenterAlignment(personalSheet);
  XLSX.utils.book_append_sheet(workbook, personalSheet, 'Personal');

  // Machinery sheet (con entradas válidas)
  const machineryData: any[] = [
    ['REGISTRO DE MAQUINARIA'],
    [''],
    ['Fecha', 'Obra', 'Tipo', 'Matrícula', 'Empresa', 'Entrada', 'Salida', 'Horas', 'Operador', 'Actividad']
  ];

  reports.forEach(report => {
    report.machineryEntries
      .filter(e => e.identifier.trim() !== '')
      .forEach(entry => {
        const hours = calculateHours(entry.entryTime, entry.exitTime);
        machineryData.push([
          report.date,
          report.siteName,
          entry.name,
          entry.identifier,
          entry.company,
          entry.entryTime,
          entry.exitTime || '',
          hours,
          entry.operator || '',
          entry.activity
        ]);
      });
  });

  const machinerySheet = XLSX.utils.aoa_to_sheet(machineryData);
  applyCenterAlignment(machinerySheet);
  XLSX.utils.book_append_sheet(workbook, machinerySheet, 'Maquinaria');

  // Companies summary sheet (con entradas válidas)
  const companiesData: any[] = [
    ['RESUMEN POR EMPRESA'],
    [''],
    ['Empresa', 'Personal', 'Maquinaria', 'Total Horas Personal', 'Total Horas Maquinaria']
  ];

  const companiesMap = new Map<string, {
    personal: number;
    machinery: number;
    personalHours: number;
    machineryHours: number;
  }>();

  reports.forEach(report => {
    const seenDnis = new Set<string>();
    report.personalEntries
      .filter(e => {
        const dni = e.identifier.trim();
        if (dni === '' || seenDnis.has(dni)) return false;
        seenDnis.add(dni);
        return true;
      })
      .forEach(entry => {
        const company = companiesMap.get(entry.company) || {
          personal: 0,
          machinery: 0,
          personalHours: 0,
          machineryHours: 0
        };
        company.personal++;
        company.personalHours += parseFloat(calculateHours(entry.entryTime, entry.exitTime));
        companiesMap.set(entry.company, company);
      });

    report.machineryEntries
      .filter(e => e.identifier.trim() !== '' && e.operator && e.operator.trim() !== '')
      .forEach(entry => {
        const company = companiesMap.get(entry.company) || {
          personal: 0,
          machinery: 0,
          personalHours: 0,
          machineryHours: 0
        };
        company.machinery++;
        company.machineryHours += parseFloat(calculateHours(entry.entryTime, entry.exitTime));
        companiesMap.set(entry.company, company);
      });
  });

  Array.from(companiesMap.entries()).forEach(([companyName, data]) => {
    companiesData.push([
      companyName,
      data.personal,
      data.machinery,
      data.personalHours.toFixed(1),
      data.machineryHours.toFixed(1)
    ]);
  });

  const companiesSheet = XLSX.utils.aoa_to_sheet(companiesData);
  applyCenterAlignment(companiesSheet);
  XLSX.utils.book_append_sheet(workbook, companiesSheet, 'Por Empresa');

  // Style the workbook
  const range = XLSX.utils.decode_range(summarySheet['!ref'] || 'A1');
  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      if (!summarySheet[cellAddress]) continue;
      
      // Header styling
      if (row === 0 || row === 5 || row === 9) {
        summarySheet[cellAddress].s = {
          font: { bold: true, sz: 14 },
          fill: { fgColor: { rgb: "428BCA" } }
        };
      }
    }
  }

  // Generate filename
  const dateFormatted = format(new Date(), 'dd-MM-yyyy');
  const filename = `Control_Accesos_${dateFormatted}.xlsx`;

  // Save file
  XLSX.writeFile(workbook, filename);
};

const calculateHours = (entryTime: string, exitTime?: string): string => {
  if (!exitTime) return '0.0';
  
  const [entryHour, entryMinute] = entryTime.split(':').map(Number);
  const [exitHour, exitMinute] = exitTime.split(':').map(Number);
  
  const entryTotalMinutes = entryHour * 60 + entryMinute;
  const exitTotalMinutes = exitHour * 60 + exitMinute;
  
  let diffMinutes = exitTotalMinutes - entryTotalMinutes;
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60; // Handle next day
  }
  
  return (diffMinutes / 60).toFixed(1);
};