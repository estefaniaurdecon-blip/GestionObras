import { WorkReport } from '@/types/workReport';
import { isNative, blobToBase64, saveBase64File, textToBase64 } from './nativeFile';
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


export const exportToExcel = async (reports: WorkReport[]) => {
  // Si es un solo reporte, usar la función específica
  if (reports.length === 1) {
    return exportSingleReportToExcel(reports[0]);
  }

  const XLSX = await import('xlsx-js-style');

  // Create workbook para múltiples reportes
  const wb = XLSX.utils.book_new();

  // 1. RESUMEN GENERAL
  const summaryData = reports.map(report => ({
    'Fecha': new Date(report.date).toLocaleDateString('es-ES'),
    'Nº Obra': report.workNumber || '',
    'Nombre Obra': report.workName || '',
    'Encargado': report.foreman || '',
    'Horas Encargado': report.foremanHours || 0,
    'Jefe Obra': report.siteManager || ''
  }));
  const summaryWs = XLSX.utils.json_to_sheet(summaryData);
  summaryWs['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 20 }
  ];
  applyCenterAlignment(summaryWs, XLSX);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Resumen');

  // 2. MANO DE OBRA
  const workData: any[] = [];
  reports.forEach(report => {
    if (report.workGroups) {
      report.workGroups.forEach(group => {
        group.items.forEach(item => {
          workData.push({
            'Fecha': new Date(report.date).toLocaleDateString('es-ES'),
            'Nº Obra': report.workNumber || '',
            'Nombre Obra': report.workName || '',
            'Empresa': group.company || '',
            'Nombre': item.name || '',
            'Actividad': item.activity || '',
            'Horas': item.hours || 0,
            'Precio/Hora €': item.hourlyRate || 0,
            'Total €': item.total || 0
          });
        });
      });
    }
  });
  if (workData.length > 0) {
    const workWs = XLSX.utils.json_to_sheet(workData);
    workWs['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 25 }, 
      { wch: 25 }, { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 15 }
    ];
    applyCenterAlignment(workWs, XLSX);
    XLSX.utils.book_append_sheet(wb, workWs, 'Mano de Obra');
  }

  // 3. MAQUINARIA DE SUBCONTRATAS
  const machineryData: any[] = [];
  reports.forEach(report => {
    if (report.machineryGroups) {
      report.machineryGroups.forEach(group => {
        group.items.forEach(item => {
          machineryData.push({
            'Fecha': new Date(report.date).toLocaleDateString('es-ES'),
            'Nº Obra': report.workNumber || '',
            'Nombre Obra': report.workName || '',
            'Empresa': group.company || '',
            'Tipo Máquina': item.type || '',
            'Actividad': item.activity || '',
            'Horas': item.hours || 0,
            'Precio/Hora €': item.hourlyRate || 0,
            'Total €': item.total || 0
          });
        });
      });
    }
  });
  if (machineryData.length > 0) {
    const machineryWs = XLSX.utils.json_to_sheet(machineryData);
    machineryWs['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 25 }, 
      { wch: 25 }, { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 15 }
    ];
    applyCenterAlignment(machineryWs, XLSX);
    XLSX.utils.book_append_sheet(wb, machineryWs, 'Maq. Subcontratas');
  }

  // 4. MAQUINARIA DE ALQUILER
  const rentalMachineryData: any[] = [];
  
  // Obtener IDs únicos de obras para consultar la maquinaria de alquiler
  const workIds = [...new Set(reports.map(r => r.workId).filter(Boolean))];
  
  if (workIds.length > 0) {
    const { data: rentalMachinery } = await supabase
      .from('work_rental_machinery')
      .select('*')
      .in('work_id', workIds)
      .order('delivery_date', { ascending: true });

    if (rentalMachinery) {
      reports.forEach(report => {
        if (!report.workId) return;
        
        const reportDate = new Date(report.date);
        
        // Filtrar maquinaria activa en la fecha del reporte
        const activeMachinery = rentalMachinery.filter(machine => {
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
            'Fecha': new Date(report.date).toLocaleDateString('es-ES'),
            'Nº Obra': report.workNumber || '',
            'Nombre Obra': report.workName || '',
            'Proveedor': machine.provider || '',
            'Tipo Máquina': machine.type || '',
            'Nº Máquina': machine.machine_number || '',
            'F. Entrega': format(deliveryDate, 'dd/MM/yyyy', { locale: es }),
            'F. Recogida': machine.removal_date ? format(new Date(machine.removal_date), 'dd/MM/yyyy', { locale: es }) : 'En uso',
            'Tarifa/día €': machine.daily_rate || 0,
            'Días': totalDays,
            'Total €': totalCost
          });
        });
      });
    }
  }
  
  if (rentalMachineryData.length > 0) {
    const rentalMachineryWs = XLSX.utils.json_to_sheet(rentalMachineryData);
    rentalMachineryWs['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 25 }, 
      { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, 
      { wch: 12 }, { wch: 10 }, { wch: 15 }
    ];
    applyCenterAlignment(rentalMachineryWs, XLSX);
    XLSX.utils.book_append_sheet(wb, rentalMachineryWs, 'Maquinaria Alquiler');
  }

  // 5. MATERIALES
  const materialsData: any[] = [];
  reports.forEach(report => {
    if (report.materialGroups) {
      report.materialGroups.forEach(group => {
        group.items.forEach(item => {
          materialsData.push({
            'Fecha': new Date(report.date).toLocaleDateString('es-ES'),
            'Nº Obra': report.workNumber || '',
            'Nombre Obra': report.workName || '',
            'Proveedor': group.supplier || '',
            'Nº Albarán': group.invoiceNumber || '',
            'Material': item.name || '',
            'Cantidad': item.quantity || 0,
            'Unidad': item.unit || '',
            'Precio Unit. €': item.unitPrice || 0,
            'Total €': item.total || 0
          });
        });
      });
    }
  });
  if (materialsData.length > 0) {
    const materialsWs = XLSX.utils.json_to_sheet(materialsData);
    materialsWs['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 25 }, { wch: 15 }, 
      { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }
    ];
    applyCenterAlignment(materialsWs, XLSX);
    XLSX.utils.book_append_sheet(wb, materialsWs, 'Materiales');
  }

  // 6. SUBCONTRATAS
  const subcontractData: any[] = [];
  reports.forEach(report => {
    if (report.subcontractGroups) {
      report.subcontractGroups.forEach(group => {
        group.items.forEach(item => {
          subcontractData.push({
            'Fecha': new Date(report.date).toLocaleDateString('es-ES'),
            'Nº Obra': report.workNumber || '',
            'Nombre Obra': report.workName || '',
            'Empresa': group.company || '',
            'Partida Contratada': item.contractedPart || '',
            'Actividad': item.activity || '',
            'Nº Trabajadores': item.workers || 0,
            'Horas': item.hours || 0,
            'Precio/Hora €': item.hourlyRate || 0,
            'Tipo Unidad': item.unitType || '',
            'Cantidad': item.quantity || 0,
            'Precio Unitario €': item.unitPrice || 0,
            'Total €': item.total || 0
          });
        });
      });
    }
  });
  if (subcontractData.length > 0) {
    const subcontractWs = XLSX.utils.json_to_sheet(subcontractData);
    subcontractWs['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, 
      { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 15 }
    ];
    applyCenterAlignment(subcontractWs, XLSX);
    XLSX.utils.book_append_sheet(wb, subcontractWs, 'Subcontrata');
  }

  // 7. REPASOS ACTIVOS
  const repasosData: any[] = [];
  const statusLabels: Record<string, string> = {
    pending: 'Pendiente',
    in_progress: 'En Proceso',
    completed: 'Completado',
  };

  // Fetch repasos for all works
  if (workIds.length > 0) {
    const { data: allRepasos } = await supabase
      .from('work_repasos')
      .select('*')
      .in('work_id', workIds)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: true });

    if (allRepasos) {
      reports.forEach(report => {
        if (!report.workId) return;
        
        const reportRepasos = allRepasos.filter(r => r.work_id === report.workId);
        reportRepasos.forEach(repaso => {
          repasosData.push({
            'Fecha': new Date(report.date).toLocaleDateString('es-ES'),
            'Nº Obra': report.workNumber || '',
            'Nombre Obra': report.workName || '',
            'Código': repaso.code || '',
            'Estado': statusLabels[repaso.status] || repaso.status,
            'Descripción': repaso.description || '',
            'Empresa Asignada': repaso.assigned_company || '-',
            'Horas Estimadas': repaso.estimated_hours || 0,
            'Horas Reales': repaso.actual_hours || 0,
          });
        });
      });
    }
  }

  if (repasosData.length > 0) {
    const repasosWs = XLSX.utils.json_to_sheet(repasosData);
    repasosWs['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 15 },
      { wch: 40 }, { wch: 25 }, { wch: 15 }, { wch: 15 }
    ];
    applyCenterAlignment(repasosWs, XLSX);
    XLSX.utils.book_append_sheet(wb, repasosWs, 'Repasos Activos');
  }

  // Generar nombre de archivo
  const dateFormatted = format(new Date(), 'dd-MM-yyyy');
  const fileName = `Partes_${dateFormatted}.xlsx`;
  
  // Save file
  if (isNative()) {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    return saveBase64File(fileName, wbout, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } else {
    XLSX.writeFile(wb, fileName);
    return Promise.resolve();
  }
};

export const exportSingleReportToExcel = async (report: WorkReport) => {
  const XLSX = await import('xlsx-js-style');
  const wb = XLSX.utils.book_new();

  // 1. INFORMACIÓN GENERAL DEL PARTE
  const generalData = [{
    'Fecha': new Date(report.date).toLocaleDateString('es-ES'),
    'Nº Obra': report.workNumber || '',
    'Nombre Obra': report.workName || '',
    'Encargado': report.foreman || '',
    'Horas Encargado': report.foremanHours || 0,
    'Jefe de Obra': report.siteManager || '',
    'Observaciones': report.observations || ''
  }];
  const generalWs = XLSX.utils.json_to_sheet(generalData);
  generalWs['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, 
    { wch: 15 }, { wch: 20 }, { wch: 50 }
  ];
  applyCenterAlignment(generalWs, XLSX);
  XLSX.utils.book_append_sheet(wb, generalWs, 'Información General');

  // 2. MANO DE OBRA (Parte Económica)
  if (report.workGroups && report.workGroups.length > 0) {
    const workData: any[] = [];
    report.workGroups.forEach(group => {
      group.items.forEach(item => {
        workData.push({
          'Empresa': group.company || '',
          'Nombre': item.name || '',
          'Actividad': item.activity || '',
          'Horas': item.hours || 0,
          'Precio/Hora €': item.hourlyRate || 0,
          'Total €': item.total || 0
        });
      });
    });
    const workWs = XLSX.utils.json_to_sheet(workData);
    workWs['!cols'] = [
      { wch: 25 }, { wch: 25 }, { wch: 30 }, 
      { wch: 10 }, { wch: 15 }, { wch: 15 }
    ];
    applyCenterAlignment(workWs, XLSX);
    XLSX.utils.book_append_sheet(wb, workWs, 'Mano de Obra');
  }

  // 3. MAQUINARIA DE SUBCONTRATAS (Parte Económica)
  if (report.machineryGroups && report.machineryGroups.length > 0) {
    const machineryData: any[] = [];
    report.machineryGroups.forEach(group => {
      group.items.forEach(item => {
        machineryData.push({
          'Empresa': group.company || '',
          'Tipo Máquina': item.type || '',
          'Actividad': item.activity || '',
          'Horas': item.hours || 0,
          'Precio/Hora €': item.hourlyRate || 0,
          'Total €': item.total || 0
        });
      });
    });
    const machineryWs = XLSX.utils.json_to_sheet(machineryData);
    machineryWs['!cols'] = [
      { wch: 25 }, { wch: 25 }, { wch: 30 }, 
      { wch: 10 }, { wch: 15 }, { wch: 15 }
    ];
    applyCenterAlignment(machineryWs, XLSX);
    XLSX.utils.book_append_sheet(wb, machineryWs, 'Maq. Subcontratas');
  }

  // 4. MAQUINARIA DE ALQUILER
  if (report.workId) {
    const { data: rentalMachinery } = await supabase
      .from('work_rental_machinery')
      .select('*')
      .eq('work_id', report.workId)
      .order('delivery_date', { ascending: true });

    if (rentalMachinery && rentalMachinery.length > 0) {
      const reportDate = new Date(report.date);
      
      // Filtrar maquinaria activa en la fecha del reporte
      const activeMachinery = rentalMachinery.filter(machine => {
        const deliveryDate = new Date(machine.delivery_date);
        const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
        return deliveryDate <= reportDate && (!removalDate || removalDate >= reportDate);
      });

      if (activeMachinery.length > 0) {
        const rentalMachineryData: any[] = [];
        
        activeMachinery.forEach(machine => {
          const deliveryDate = new Date(machine.delivery_date);
          // Usar la fecha del reporte o la fecha de recogida, lo que sea menor
          const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
          const effectiveEndDate = removalDate && removalDate < reportDate ? removalDate : reportDate;
          const totalDays = Math.ceil((effectiveEndDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const totalCost = totalDays * (machine.daily_rate || 0);

          rentalMachineryData.push({
            'Proveedor': machine.provider || '',
            'Tipo Máquina': machine.type || '',
            'Nº Máquina': machine.machine_number || '',
            'F. Entrega': format(deliveryDate, 'dd/MM/yyyy', { locale: es }),
            'F. Recogida': machine.removal_date ? format(new Date(machine.removal_date), 'dd/MM/yyyy', { locale: es }) : 'En uso',
            'Tarifa/día €': machine.daily_rate || 0,
            'Días': totalDays,
            'Total €': totalCost
          });
        });

        const rentalMachineryWs = XLSX.utils.json_to_sheet(rentalMachineryData);
        rentalMachineryWs['!cols'] = [
          { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, 
          { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }
        ];
        applyCenterAlignment(rentalMachineryWs, XLSX);
        XLSX.utils.book_append_sheet(wb, rentalMachineryWs, 'Maquinaria Alquiler');
      }
    }
  }

  // 5. MATERIALES (Parte Económica)
  if (report.materialGroups && report.materialGroups.length > 0) {
    const materialsData: any[] = [];
    report.materialGroups.forEach(group => {
      group.items.forEach(item => {
        materialsData.push({
          'Proveedor': group.supplier || '',
          'Nº Albarán': group.invoiceNumber || '',
          'Material': item.name || '',
          'Cantidad': item.quantity || 0,
          'Unidad': item.unit || '',
          'Precio Unit. €': item.unitPrice || 0,
          'Total €': item.total || 0
        });
      });
    });
    const materialsWs = XLSX.utils.json_to_sheet(materialsData);
    materialsWs['!cols'] = [
      { wch: 25 }, { wch: 15 }, { wch: 30 }, 
      { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }
    ];
    applyCenterAlignment(materialsWs, XLSX);
    XLSX.utils.book_append_sheet(wb, materialsWs, 'Materiales');
  }

  // 6. SUBCONTRATA (Parte Económica)
  if (report.subcontractGroups && report.subcontractGroups.length > 0) {
    const subcontractData: any[] = [];
    report.subcontractGroups.forEach(group => {
      group.items.forEach(item => {
        subcontractData.push({
          'Empresa': group.company || '',
          'Partida Contratada': item.contractedPart || '',
          'Actividad': item.activity || '',
          'Nº Trabajadores': item.workers || 0,
          'Horas': item.hours || 0,
          'Precio/Hora €': item.hourlyRate || 0,
          'Tipo Unidad': item.unitType || '',
          'Cantidad': item.quantity || 0,
          'Precio Unitario €': item.unitPrice || 0,
          'Total €': item.total || 0
        });
      });
    });
    const subcontractWs = XLSX.utils.json_to_sheet(subcontractData);
    subcontractWs['!cols'] = [
      { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 12 }, 
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, 
      { wch: 15 }, { wch: 15 }
    ];
    applyCenterAlignment(subcontractWs, XLSX);
    XLSX.utils.book_append_sheet(wb, subcontractWs, 'Subcontrata');
  }

  // 7. REPASOS ACTIVOS
  if (report.workId) {
    const { data: activeRepasos } = await supabase
      .from('work_repasos')
      .select('*')
      .eq('work_id', report.workId)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: true });

    if (activeRepasos && activeRepasos.length > 0) {
      const statusLabels: Record<string, string> = {
        pending: 'Pendiente',
        in_progress: 'En Proceso',
        completed: 'Completado',
      };

      const repasosData: any[] = activeRepasos.map(repaso => ({
        'Código': repaso.code || '',
        'Estado': statusLabels[repaso.status] || repaso.status,
        'Descripción': repaso.description || '',
        'Empresa Asignada': repaso.assigned_company || '-',
        'Horas Estimadas': repaso.estimated_hours || 0,
        'Horas Reales': repaso.actual_hours || 0,
        'Fecha Creación': new Date(repaso.created_at).toLocaleDateString('es-ES'),
      }));

      const repasosWs = XLSX.utils.json_to_sheet(repasosData);
      repasosWs['!cols'] = [
        { wch: 12 }, { wch: 15 }, { wch: 40 }, { wch: 25 }, 
        { wch: 15 }, { wch: 15 }, { wch: 15 }
      ];
      applyCenterAlignment(repasosWs, XLSX);
      XLSX.utils.book_append_sheet(wb, repasosWs, 'Repasos Activos');
    }
  }

  const dateFormatted = format(new Date(report.date), 'dd-MM-yyyy');
  const foremanName = (report.foreman || 'sin_encargado').replace(/\s+/g, '_');
  const fileName = `Parte_${dateFormatted}_${foremanName}_${report.workNumber || 'sin_numero'}.xlsx`;
  
  if (isNative()) {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    return saveBase64File(fileName, wbout, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } else {
    XLSX.writeFile(wb, fileName);
    return Promise.resolve();
  }
};


