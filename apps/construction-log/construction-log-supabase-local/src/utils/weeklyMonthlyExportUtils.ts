import { WorkReport } from '@/types/workReport';
import { isNative, saveBase64File } from './nativeFile';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/api/legacySupabaseRemoved';

type XlsxModule = typeof import('xlsx-js-style');
type XlsxWorkSheet = import('xlsx-js-style').WorkSheet;

// Helper function to apply center alignment to all cells in a worksheet
const applyCenterAlignment = (worksheet: XlsxWorkSheet, XLSX: XlsxModule) => {
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

// Función auxiliar para obtener el número de semana del año
const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

// Función auxiliar para obtener el rango de fechas de una semana
const getWeekRange = (date: Date): string => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  return `${monday.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} - ${sunday.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
};

// Función para agrupar partes por semanas
export const exportWeeklyReports = async (reports: WorkReport[], workName?: string) => {
  // Los reports ya vienen filtrados desde AdvancedReports
  if (reports.length === 0) {
    throw new Error('No hay partes para exportar');
  }

  const XLSX = await import('xlsx-js-style');

  // Agrupar partes por semana
  const weeklyGroups = new Map<string, WorkReport[]>();
  
  reports.forEach(report => {
    const reportDate = new Date(report.date);
    const year = reportDate.getFullYear();
    const weekNum = getWeekNumber(reportDate);
    const weekKey = `${year}-S${weekNum.toString().padStart(2, '0')}`;
    
    if (!weeklyGroups.has(weekKey)) {
      weeklyGroups.set(weekKey, []);
    }
    weeklyGroups.get(weekKey)!.push(report);
  });

  // Crear workbook
  const wb = XLSX.utils.book_new();

  // Obtener toda la maquinaria de alquiler de las obras de los reportes
  const allWorkIds = [...new Set(reports.map(r => r.workId).filter(Boolean))];
  let allRentalMachinery: any[] = [];
  
  if (allWorkIds.length > 0) {
    const { data } = await supabase
      .from('work_rental_machinery')
      .select('*')
      .in('work_id', allWorkIds);
    
    if (data) {
      allRentalMachinery = data;
    }
  }

  // Crear hoja de resumen semanal
  const summaryData: any[] = [];
  
  Array.from(weeklyGroups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([weekKey, weekReports]) => {
      const firstDate = new Date(weekReports[0].date);
      const weekRange = getWeekRange(firstDate);
      
      const totalWorkHours = weekReports.reduce((sum, report) => {
        return sum + (report.workGroups?.reduce((groupSum, group) => 
          groupSum + group.items.reduce((itemSum, item) => itemSum + (item.hours || 0), 0), 0) || 0);
      }, 0);
      
      const totalMachineryHours = weekReports.reduce((sum, report) => {
        return sum + (report.machineryGroups?.reduce((groupSum, group) => 
          groupSum + group.items.reduce((itemSum, item) => itemSum + (item.hours || 0), 0), 0) || 0);
      }, 0);
      
      // Calcular días totales de maquinaria de alquiler activa en la semana
      let totalRentalMachineryDays = 0;
      
      weekReports.forEach(report => {
        if (!report.workId) return;
        const reportDate = new Date(report.date);
        
        const activeMachinery = allRentalMachinery.filter(machine => {
          if (machine.work_id !== report.workId) return false;
          const deliveryDate = new Date(machine.delivery_date);
          const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
          return deliveryDate <= reportDate && (!removalDate || removalDate >= reportDate);
        });

        activeMachinery.forEach(machine => {
          const deliveryDate = new Date(machine.delivery_date);
          const removalDate = machine.removal_date ? new Date(machine.removal_date) : reportDate;
          const days = Math.ceil((removalDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          totalRentalMachineryDays += days;
        });
      });
      
      const totalMaterialsCost = weekReports.reduce((sum, report) => {
        return sum + (report.materialGroups?.reduce((groupSum, group) => 
          groupSum + group.items.reduce((itemSum, item) => itemSum + (item.total || 0), 0), 0) || 0);
      }, 0);

      const totalSubcontractCost = weekReports.reduce((sum, report) => {
        return sum + (report.subcontractGroups?.reduce((groupSum, group) => 
          groupSum + group.items.reduce((itemSum, item) => itemSum + (item.total || 0), 0), 0) || 0);
      }, 0);

      summaryData.push({
        'Semana': weekKey,
        'Rango de Fechas': weekRange,
        'Nº Partes': weekReports.length,
        'Horas Mano de Obra': totalWorkHours.toFixed(2),
        'Horas Maquinaria': totalMachineryHours.toFixed(2),
        'Días Maquinaria Alquiler': totalRentalMachineryDays.toFixed(2),
        'Coste Materiales €': totalMaterialsCost.toFixed(2),
        'Coste Subcontratas €': totalSubcontractCost.toFixed(2),
        'Obras': [...new Set(weekReports.map(r => r.workName))].join(', ')
      });
    });

  const summaryWs = XLSX.utils.json_to_sheet(summaryData);
  
  // Aplicar anchos de columna
  summaryWs['!cols'] = [
    { wch: 12 }, // Semana
    { wch: 25 }, // Rango de Fechas
    { wch: 10 }, // Nº Partes
    { wch: 18 }, // Horas Mano de Obra
    { wch: 18 }, // Horas Maquinaria
    { wch: 22 }, // Días Maquinaria Alquiler
    { wch: 18 }, // Coste Materiales
    { wch: 18 }, // Coste Subcontratas
    { wch: 40 }  // Obras
  ];
  applyCenterAlignment(summaryWs, XLSX);
  
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Resumen Semanal');

  // Recopilar todos los datos por categoría
  const workData: any[] = [];
  const machineryData: any[] = [];
  const rentalMachineryData: any[] = [];
  const materialData: any[] = [];
  const subcontractData: any[] = [];

  reports.forEach(report => {
    const reportDateStr = new Date(report.date).toLocaleDateString('es-ES');
    const reportDate = new Date(report.date);
    const weekNum = getWeekNumber(reportDate);
    const weekKey = `${reportDate.getFullYear()}-S${weekNum.toString().padStart(2, '0')}`;
    
    // Mano de obra
    report.workGroups?.forEach(group => {
      group.items.forEach(item => {
        workData.push({
          'Semana': weekKey,
          'Fecha': reportDateStr,
          'Nº Obra': report.workNumber || '',
          'Obra': report.workName || '',
          'Empresa': group.company || '',
          'Trabajador': item.name || '',
          'Actividad': item.activity || '',
          'Horas': item.hours || 0,
          'Precio/Hora €': item.hourlyRate || 0,
          'Total €': item.total || 0
        });
      });
    });

    // Maquinaria de Subcontratas
    report.machineryGroups?.forEach(group => {
      group.items.forEach(item => {
        machineryData.push({
          'Semana': weekKey,
          'Fecha': reportDateStr,
          'Nº Obra': report.workNumber || '',
          'Obra': report.workName || '',
          'Empresa': group.company || '',
          'Máquina': item.type || '',
          'Actividad': item.activity || '',
          'Horas': item.hours || 0,
          'Precio/Hora €': item.hourlyRate || 0,
          'Total €': item.total || 0
        });
      });
    });

    // Maquinaria de Alquiler
    if (report.workId) {
      const reportDate = new Date(report.date);
      
      const activeMachinery = allRentalMachinery.filter(machine => {
        if (machine.work_id !== report.workId) return false;
        const deliveryDate = new Date(machine.delivery_date);
        const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
        return deliveryDate <= reportDate && (!removalDate || removalDate >= reportDate);
      });

      activeMachinery.forEach(machine => {
        const deliveryDate = new Date(machine.delivery_date);
        // Usar la fecha del reporte o la fecha de recogida, lo que sea menor
        const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
        const effectiveEndDate = removalDate && removalDate < reportDate ? removalDate : reportDate;
        const totalDays = Math.ceil((effectiveEndDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const totalCost = totalDays * (machine.daily_rate || 0);

        rentalMachineryData.push({
          'Semana': weekKey,
          'Fecha': reportDateStr,
          'Nº Obra': report.workNumber || '',
          'Obra': report.workName || '',
          'Proveedor': machine.provider || '',
          'Máquina': machine.type || '',
          'Nº Máquina': machine.machine_number || '',
          'Días': totalDays,
          'Tarifa/día €': machine.daily_rate || 0,
          'Total €': totalCost
        });
      });
    }

    // Materiales
    report.materialGroups?.forEach(group => {
      group.items.forEach(item => {
        materialData.push({
          'Semana': weekKey,
          'Fecha': reportDateStr,
          'Nº Obra': report.workNumber || '',
          'Obra': report.workName || '',
          'Proveedor': group.supplier || '',
          'Albarán': group.invoiceNumber || '',
          'Material': item.name || '',
          'Cantidad': item.quantity || 0,
          'Unidad': item.unit || '',
          'Precio Unit. €': item.unitPrice || 0,
          'Total €': item.total || 0
        });
      });
    });

    // Subcontratas
    report.subcontractGroups?.forEach(group => {
      group.items.forEach(item => {
        subcontractData.push({
          'Semana': weekKey,
          'Fecha': reportDateStr,
          'Nº Obra': report.workNumber || '',
          'Obra': report.workName || '',
          'Empresa': group.company || '',
          'Partida': item.contractedPart || '',
          'Actividad': item.activity || '',
          'Trabajadores': item.workers || 0,
          'Horas': item.hours || 0,
          'Precio/Hora €': item.hourlyRate || 0,
          'Total €': item.total || 0
        });
      });
    });
  });

  // Crear pestaña de Mano de Obra
  if (workData.length > 0) {
    const workWs = XLSX.utils.json_to_sheet(workData);
    workWs['!cols'] = [
      { wch: 12 }, // Semana
      { wch: 12 }, // Fecha
      { wch: 10 }, // Nº Obra
      { wch: 25 }, // Obra
      { wch: 20 }, // Empresa
      { wch: 25 }, // Trabajador
      { wch: 30 }, // Actividad
      { wch: 10 }, // Horas
      { wch: 14 }, // Precio/Hora
      { wch: 12 }  // Total
    ];
    applyCenterAlignment(workWs, XLSX);
    XLSX.utils.book_append_sheet(wb, workWs, 'Mano de Obra');
  }

  // Crear pestaña de Maquinaria de Subcontratas
  if (machineryData.length > 0) {
    const machineryWs = XLSX.utils.json_to_sheet(machineryData);
    machineryWs['!cols'] = [
      { wch: 12 }, // Semana
      { wch: 12 }, // Fecha
      { wch: 10 }, // Nº Obra
      { wch: 25 }, // Obra
      { wch: 20 }, // Empresa
      { wch: 25 }, // Máquina
      { wch: 30 }, // Actividad
      { wch: 10 }, // Horas
      { wch: 14 }, // Precio/Hora
      { wch: 12 }  // Total
    ];
    applyCenterAlignment(machineryWs, XLSX);
    XLSX.utils.book_append_sheet(wb, machineryWs, 'Maq. Subcontratas');
  }

  // Crear pestaña de Maquinaria Alquiler
  if (rentalMachineryData.length > 0) {
    const rentalWs = XLSX.utils.json_to_sheet(rentalMachineryData);
    rentalWs['!cols'] = [
      { wch: 12 }, // Semana
      { wch: 12 }, // Fecha
      { wch: 10 }, // Nº Obra
      { wch: 25 }, // Obra
      { wch: 20 }, // Proveedor
      { wch: 25 }, // Máquina
      { wch: 15 }, // Nº Máquina
      { wch: 10 }, // Días
      { wch: 14 }, // Tarifa Diaria
      { wch: 12 }  // Total
    ];
    applyCenterAlignment(rentalWs, XLSX);
    XLSX.utils.book_append_sheet(wb, rentalWs, 'Maquinaria Alquiler');
  }

  // Crear pestaña de Materiales
  if (materialData.length > 0) {
    const materialWs = XLSX.utils.json_to_sheet(materialData);
    materialWs['!cols'] = [
      { wch: 12 }, // Semana
      { wch: 12 }, // Fecha
      { wch: 10 }, // Nº Obra
      { wch: 25 }, // Obra
      { wch: 20 }, // Proveedor
      { wch: 15 }, // Albarán
      { wch: 30 }, // Material
      { wch: 10 }, // Cantidad
      { wch: 10 }, // Unidad
      { wch: 14 }, // Precio Unit.
      { wch: 12 }  // Total
    ];
    applyCenterAlignment(materialWs, XLSX);
    XLSX.utils.book_append_sheet(wb, materialWs, 'Materiales');
  }

  // Crear pestaña de Subcontrata
  if (subcontractData.length > 0) {
    const subcontractWs = XLSX.utils.json_to_sheet(subcontractData);
    subcontractWs['!cols'] = [
      { wch: 12 }, // Semana
      { wch: 12 }, // Fecha
      { wch: 10 }, // Nº Obra
      { wch: 25 }, // Obra
      { wch: 20 }, // Empresa
      { wch: 30 }, // Partida
      { wch: 30 }, // Actividad
      { wch: 12 }, // Trabajadores
      { wch: 10 }, // Horas
      { wch: 14 }, // Precio/Hora
      { wch: 12 }  // Total
    ];
    applyCenterAlignment(subcontractWs, XLSX);
    XLSX.utils.book_append_sheet(wb, subcontractWs, 'Subcontrata');
  }

  // Guardar archivo
  const dateFormatted = format(new Date(), 'dd-MM-yyyy');
  const fileName = `Partes_Semanales_${dateFormatted}.xlsx`;
  
  if (isNative()) {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    await saveBase64File(fileName, wbout, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } else {
    XLSX.writeFile(wb, fileName);
  }
};

// Función para agrupar partes por meses
export const exportMonthlyReports = async (reports: WorkReport[], workName?: string) => {
  // Los reports ya vienen filtrados desde AdvancedReports
  if (reports.length === 0) {
    throw new Error('No hay partes para exportar');
  }

  const XLSX = await import('xlsx-js-style');

  // Agrupar partes por mes
  const monthlyGroups = new Map<string, WorkReport[]>();
  
  reports.forEach(report => {
    const reportDate = new Date(report.date);
    const monthKey = `${reportDate.getFullYear()}-${(reportDate.getMonth() + 1).toString().padStart(2, '0')}`;
    
    if (!monthlyGroups.has(monthKey)) {
      monthlyGroups.set(monthKey, []);
    }
    monthlyGroups.get(monthKey)!.push(report);
  });

  // Crear workbook
  const wb = XLSX.utils.book_new();

  // Obtener toda la maquinaria de alquiler de las obras de los reportes
  const allWorkIds = [...new Set(reports.map(r => r.workId).filter(Boolean))];
  let allRentalMachinery: any[] = [];
  
  if (allWorkIds.length > 0) {
    const { data } = await supabase
      .from('work_rental_machinery')
      .select('*')
      .in('work_id', allWorkIds);
    
    if (data) {
      allRentalMachinery = data;
    }
  }

  // Crear hoja de resumen mensual
  const summaryData: any[] = [];
  
  Array.from(monthlyGroups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([monthKey, monthReports]) => {
      const [year, month] = monthKey.split('-');
      const monthName = new Date(parseInt(year), parseInt(month) - 1, 1)
        .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      
      const totalWorkHours = monthReports.reduce((sum, report) => {
        return sum + (report.workGroups?.reduce((groupSum, group) => 
          groupSum + group.items.reduce((itemSum, item) => itemSum + (item.hours || 0), 0), 0) || 0);
      }, 0);
      
      const totalMachineryHours = monthReports.reduce((sum, report) => {
        return sum + (report.machineryGroups?.reduce((groupSum, group) => 
          groupSum + group.items.reduce((itemSum, item) => itemSum + (item.hours || 0), 0), 0) || 0);
      }, 0);
      
      // Calcular días totales de maquinaria de alquiler activa en el mes
      let totalRentalMachineryDays = 0;
      
      monthReports.forEach(report => {
        if (!report.workId) return;
        const reportDate = new Date(report.date);
        
        const activeMachinery = allRentalMachinery.filter(machine => {
          if (machine.work_id !== report.workId) return false;
          const deliveryDate = new Date(machine.delivery_date);
          const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
          return deliveryDate <= reportDate && (!removalDate || removalDate >= reportDate);
        });

        activeMachinery.forEach(machine => {
          const deliveryDate = new Date(machine.delivery_date);
          const removalDate = machine.removal_date ? new Date(machine.removal_date) : reportDate;
          const days = Math.ceil((removalDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          totalRentalMachineryDays += days;
        });
      });
      
      const totalMaterialsCost = monthReports.reduce((sum, report) => {
        return sum + (report.materialGroups?.reduce((groupSum, group) => 
          groupSum + group.items.reduce((itemSum, item) => itemSum + (item.total || 0), 0), 0) || 0);
      }, 0);

      const totalSubcontractCost = monthReports.reduce((sum, report) => {
        return sum + (report.subcontractGroups?.reduce((groupSum, group) => 
          groupSum + group.items.reduce((itemSum, item) => itemSum + (item.total || 0), 0), 0) || 0);
      }, 0);

      const uniqueWorks = [...new Set(monthReports.map(r => r.workName))];

      summaryData.push({
        'Mes': monthName,
        'Nº Partes': monthReports.length,
        'Horas Mano de Obra': totalWorkHours.toFixed(2),
        'Horas Maquinaria': totalMachineryHours.toFixed(2),
        'Días Maquinaria Alquiler': totalRentalMachineryDays.toFixed(2),
        'Coste Materiales €': totalMaterialsCost.toFixed(2),
        'Coste Subcontratas €': totalSubcontractCost.toFixed(2),
        'Nº Obras': uniqueWorks.length,
        'Obras': uniqueWorks.join(', ')
      });
    });

  const summaryWs = XLSX.utils.json_to_sheet(summaryData);
  
  // Aplicar anchos de columna
  summaryWs['!cols'] = [
    { wch: 20 }, // Mes
    { wch: 10 }, // Nº Partes
    { wch: 18 }, // Horas Mano de Obra
    { wch: 18 }, // Horas Maquinaria
    { wch: 22 }, // Días Maquinaria Alquiler
    { wch: 18 }, // Coste Materiales
    { wch: 18 }, // Coste Subcontratas
    { wch: 10 }, // Nº Obras
    { wch: 50 }  // Obras
  ];
  applyCenterAlignment(summaryWs, XLSX);
  
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Resumen Mensual');

  // Recopilar todos los datos por categoría
  const workData: any[] = [];
  const machineryData: any[] = [];
  const rentalMachineryData: any[] = [];
  const materialData: any[] = [];
  const subcontractData: any[] = [];

  reports.forEach(report => {
    const reportDateStr = new Date(report.date).toLocaleDateString('es-ES');
    const reportDate = new Date(report.date);
    const monthKey = `${reportDate.getFullYear()}-${(reportDate.getMonth() + 1).toString().padStart(2, '0')}`;
    const [year, month] = monthKey.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1, 1)
      .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    
    // Mano de obra
    report.workGroups?.forEach(group => {
      group.items.forEach(item => {
        workData.push({
          'Mes': monthName,
          'Fecha': reportDateStr,
          'Nº Obra': report.workNumber || '',
          'Obra': report.workName || '',
          'Empresa': group.company || '',
          'Trabajador': item.name || '',
          'Actividad': item.activity || '',
          'Horas': item.hours || 0,
          'Precio/Hora €': item.hourlyRate || 0,
          'Total €': item.total || 0
        });
      });
    });

    // Maquinaria de Subcontratas
    report.machineryGroups?.forEach(group => {
      group.items.forEach(item => {
        machineryData.push({
          'Mes': monthName,
          'Fecha': reportDateStr,
          'Nº Obra': report.workNumber || '',
          'Obra': report.workName || '',
          'Empresa': group.company || '',
          'Máquina': item.type || '',
          'Actividad': item.activity || '',
          'Horas': item.hours || 0,
          'Precio/Hora €': item.hourlyRate || 0,
          'Total €': item.total || 0
        });
      });
    });

    // Maquinaria de Alquiler
    if (report.workId) {
      const reportDate = new Date(report.date);
      
      const activeMachinery = allRentalMachinery.filter(machine => {
        if (machine.work_id !== report.workId) return false;
        const deliveryDate = new Date(machine.delivery_date);
        const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
        return deliveryDate <= reportDate && (!removalDate || removalDate >= reportDate);
      });

      activeMachinery.forEach(machine => {
        const deliveryDate = new Date(machine.delivery_date);
        // Usar la fecha del reporte o la fecha de recogida, lo que sea menor
        const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
        const effectiveEndDate = removalDate && removalDate < reportDate ? removalDate : reportDate;
        const totalDays = Math.ceil((effectiveEndDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const totalCost = totalDays * (machine.daily_rate || 0);

        rentalMachineryData.push({
          'Mes': monthName,
          'Fecha': reportDateStr,
          'Nº Obra': report.workNumber || '',
          'Obra': report.workName || '',
          'Proveedor': machine.provider || '',
          'Máquina': machine.type || '',
          'Nº Máquina': machine.machine_number || '',
          'Días': totalDays,
          'Tarifa/día €': machine.daily_rate || 0,
          'Total €': totalCost
        });
      });
    }

    // Materiales
    report.materialGroups?.forEach(group => {
      group.items.forEach(item => {
        materialData.push({
          'Mes': monthName,
          'Fecha': reportDateStr,
          'Nº Obra': report.workNumber || '',
          'Obra': report.workName || '',
          'Proveedor': group.supplier || '',
          'Albarán': group.invoiceNumber || '',
          'Material': item.name || '',
          'Cantidad': item.quantity || 0,
          'Unidad': item.unit || '',
          'Precio Unit. €': item.unitPrice || 0,
          'Total €': item.total || 0
        });
      });
    });

    // Subcontratas
    report.subcontractGroups?.forEach(group => {
      group.items.forEach(item => {
        subcontractData.push({
          'Mes': monthName,
          'Fecha': reportDateStr,
          'Nº Obra': report.workNumber || '',
          'Obra': report.workName || '',
          'Empresa': group.company || '',
          'Partida': item.contractedPart || '',
          'Actividad': item.activity || '',
          'Trabajadores': item.workers || 0,
          'Horas': item.hours || 0,
          'Precio/Hora €': item.hourlyRate || 0,
          'Total €': item.total || 0
        });
      });
    });
  });

  // Crear pestaña de Mano de Obra
  if (workData.length > 0) {
    const workWs = XLSX.utils.json_to_sheet(workData);
    workWs['!cols'] = [
      { wch: 20 }, // Mes
      { wch: 12 }, // Fecha
      { wch: 10 }, // Nº Obra
      { wch: 25 }, // Obra
      { wch: 20 }, // Empresa
      { wch: 25 }, // Trabajador
      { wch: 30 }, // Actividad
      { wch: 10 }, // Horas
      { wch: 14 }, // Precio/Hora
      { wch: 12 }  // Total
    ];
    applyCenterAlignment(workWs, XLSX);
    XLSX.utils.book_append_sheet(wb, workWs, 'Mano de Obra');
  }

  // Crear pestaña de Maquinaria de Subcontratas
  if (machineryData.length > 0) {
    const machineryWs = XLSX.utils.json_to_sheet(machineryData);
    machineryWs['!cols'] = [
      { wch: 20 }, // Mes
      { wch: 12 }, // Fecha
      { wch: 10 }, // Nº Obra
      { wch: 25 }, // Obra
      { wch: 20 }, // Empresa
      { wch: 25 }, // Máquina
      { wch: 30 }, // Actividad
      { wch: 10 }, // Horas
      { wch: 14 }, // Precio/Hora
      { wch: 12 }  // Total
    ];
    applyCenterAlignment(machineryWs, XLSX);
    XLSX.utils.book_append_sheet(wb, machineryWs, 'Maq. Subcontratas');
  }

  // Crear pestaña de Maquinaria Alquiler
  if (rentalMachineryData.length > 0) {
    const rentalWs = XLSX.utils.json_to_sheet(rentalMachineryData);
    rentalWs['!cols'] = [
      { wch: 20 }, // Mes
      { wch: 12 }, // Fecha
      { wch: 10 }, // Nº Obra
      { wch: 25 }, // Obra
      { wch: 20 }, // Proveedor
      { wch: 25 }, // Máquina
      { wch: 15 }, // Nº Máquina
      { wch: 10 }, // Días
      { wch: 14 }, // Tarifa Diaria
      { wch: 12 }  // Total
    ];
    applyCenterAlignment(rentalWs, XLSX);
    XLSX.utils.book_append_sheet(wb, rentalWs, 'Maquinaria Alquiler');
  }

  // Crear pestaña de Materiales
  if (materialData.length > 0) {
    const materialWs = XLSX.utils.json_to_sheet(materialData);
    materialWs['!cols'] = [
      { wch: 20 }, // Mes
      { wch: 12 }, // Fecha
      { wch: 10 }, // Nº Obra
      { wch: 25 }, // Obra
      { wch: 20 }, // Proveedor
      { wch: 15 }, // Albarán
      { wch: 30 }, // Material
      { wch: 10 }, // Cantidad
      { wch: 10 }, // Unidad
      { wch: 14 }, // Precio Unit.
      { wch: 12 }  // Total
    ];
    applyCenterAlignment(materialWs, XLSX);
    XLSX.utils.book_append_sheet(wb, materialWs, 'Materiales');
  }

  // Crear pestaña de Subcontrata
  if (subcontractData.length > 0) {
    const subcontractWs = XLSX.utils.json_to_sheet(subcontractData);
    subcontractWs['!cols'] = [
      { wch: 20 }, // Mes
      { wch: 12 }, // Fecha
      { wch: 10 }, // Nº Obra
      { wch: 25 }, // Obra
      { wch: 20 }, // Empresa
      { wch: 30 }, // Partida
      { wch: 30 }, // Actividad
      { wch: 12 }, // Trabajadores
      { wch: 10 }, // Horas
      { wch: 14 }, // Precio/Hora
      { wch: 12 }  // Total
    ];
    applyCenterAlignment(subcontractWs, XLSX);
    XLSX.utils.book_append_sheet(wb, subcontractWs, 'Subcontrata');
  }

  // Guardar archivo
  const dateFormatted = format(new Date(), 'dd-MM-yyyy');
  const fileName = `Partes_Mensuales_${dateFormatted}.xlsx`;
  
  if (isNative()) {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    await saveBase64File(fileName, wbout, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } else {
    XLSX.writeFile(wb, fileName);
  }
};
