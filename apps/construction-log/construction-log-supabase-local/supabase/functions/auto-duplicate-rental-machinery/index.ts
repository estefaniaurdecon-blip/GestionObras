import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Festivos nacionales de España 2025-2026
const SPANISH_HOLIDAYS_2025 = [
  '2025-01-01', // Año Nuevo
  '2025-01-06', // Reyes
  '2025-04-18', // Viernes Santo
  '2025-05-01', // Fiesta del Trabajo
  '2025-08-15', // Asunción de la Virgen
  '2025-10-12', // Fiesta Nacional de España
  '2025-11-01', // Todos los Santos
  '2025-12-06', // Día de la Constitución
  '2025-12-08', // Inmaculada Concepción
  '2025-12-25', // Navidad
];

const SPANISH_HOLIDAYS_2026 = [
  '2026-01-01', // Año Nuevo
  '2026-01-06', // Reyes
  '2026-04-03', // Viernes Santo
  '2026-05-01', // Fiesta del Trabajo
  '2026-08-15', // Asunción de la Virgen
  '2026-10-12', // Fiesta Nacional de España
  '2026-11-01', // Todos los Santos
  '2026-12-06', // Día de la Constitución
  '2026-12-08', // Inmaculada Concepción
  '2026-12-25', // Navidad
];

const ALL_SPANISH_HOLIDAYS = [...SPANISH_HOLIDAYS_2025, ...SPANISH_HOLIDAYS_2026];

// Función para calcular días laborables (excluyendo sábados, domingos y festivos)
function calculateWorkingDays(startDate: Date, endDate: Date, holidays: string[] = []): number {
  const allHolidays = [...ALL_SPANISH_HOLIDAYS, ...holidays];
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    const dateStr = current.toISOString().split('T')[0];
    
    // Excluir sábados (6) y domingos (0) y festivos
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !allHolidays.includes(dateStr)) {
      count++;
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

interface RentalMachineryItem {
  id: string;
  type: string;
  provider: string;
  machineNumber: string;
  deliveryDate: string;
  removalDate?: string;
  totalDays: number;
  dailyRate?: number;
  total: number;
  assignments: Array<{
    id: string;
    company?: string;
    operator?: string;
    activity?: string;
    startDate: string;
    endDate?: string;
    days: number;
  }>;
  fuelRefills: Array<{
    id: string;
    date: string;
    liters: number;
    pricePerLiter?: number;
    total: number;
  }>;
}

interface WorkReport {
  id: string;
  workNumber: string;
  date: string;
  workName: string;
  workId?: string;
  foreman: string;
  foremanHours: number;
  siteManager: string;
  observations: string;
  workGroups: any[];
  machineryGroups: any[];
  materialGroups: any[];
  subcontractGroups: any[];
  rentalMachineryGroups: Array<{
    id: string;
    items: RentalMachineryItem[];
  }>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  approved?: boolean;
  approvedBy?: string;
  approvedAt?: string;
  status?: string;
  organization_id?: string;
}

Deno.const handler = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 🔒 SEGURIDAD: Validar secreto para cron jobs
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    const providedSecret = authHeader?.replace('Bearer ', '');
    
    if (cronSecret && providedSecret !== cronSecret) {
      console.error('Unauthorized cron request - invalid secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    const dayOfWeek = today.getDay();
    const todayStr = today.toISOString().split('T')[0];
    
    // No ejecutar en sábado (6), domingo (0) o festivos
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log('Hoy es fin de semana, no se duplican partes');
      return new Response(
        JSON.stringify({ message: 'Fin de semana, no se procesan partes' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (ALL_SPANISH_HOLIDAYS.includes(todayStr)) {
      console.log(`Hoy es festivo (${todayStr}), no se duplican partes`);
      return new Response(
        JSON.stringify({ message: 'Festivo, no se procesan partes', date: todayStr }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Procesando partes marcados para clonación automática para fecha: ${todayStr}`);

    // Obtener festivos personalizados de todas las organizaciones
    const { data: customHolidays } = await supabase
      .from('custom_holidays')
      .select('organization_id, date');
    
    // Crear un mapa de festivos por organización
    const holidaysByOrg = new Map<string, string[]>();
    if (customHolidays) {
      for (const holiday of customHolidays) {
        if (!holidaysByOrg.has(holiday.organization_id)) {
          holidaysByOrg.set(holiday.organization_id, []);
        }
        holidaysByOrg.get(holiday.organization_id)!.push(holiday.date);
      }
    }

    // Obtener SOLO los partes marcados para clonación automática (auto_clone_next_day = true)
    const { data: reportsToClone, error: fetchError } = await supabase
      .from('work_reports')
      .select('*')
      .eq('auto_clone_next_day', true)
      .lt('date', todayStr)
      .order('date', { ascending: false });

    if (fetchError) {
      console.error('Error obteniendo partes:', fetchError);
      throw fetchError;
    }

    if (!reportsToClone || reportsToClone.length === 0) {
      console.log('No hay partes marcados para clonación automática');
      return new Response(
        JSON.stringify({ message: 'No hay partes marcados para clonación', duplicated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Encontrados ${reportsToClone.length} partes marcados para clonación`);

    let duplicatedCount = 0;
    const reportsToCreate: any[] = [];
    const reportIdsToUpdate: string[] = [];

    // Obtener partes que ya existen para hoy para evitar duplicados
    const { data: todayReports } = await supabase
      .from('work_reports')
      .select('work_number, work_id')
      .eq('date', todayStr);

    const existingTodayKeys = new Set(
      (todayReports || []).map(r => `${r.work_number}-${r.work_id || 'null'}`)
    );

    for (const report of reportsToClone) {
      const reportKey = `${report.work_number}-${report.work_id || 'null'}`;
      
      // Obtener festivos personalizados de la organización
      const orgCustomHolidays = holidaysByOrg.get(report.organization_id) || [];
      
      // Verificar si ya existe un parte para hoy con este work_number y work_id
      if (existingTodayKeys.has(reportKey)) {
        console.log(`Parte ${reportKey} ya existe para ${todayStr}, omitiendo duplicación`);
        // Desactivar el flag incluso si ya existe
        reportIdsToUpdate.push(report.id);
        continue;
      }

      const rentalMachineryGroups = (report.rental_machinery_groups || []) as any[];

      // Filtrar maquinaria activa (con deliveryDate pero sin removalDate o removalDate >= hoy)
      const activeRentalGroups = rentalMachineryGroups.map(group => ({
        ...group,
        items: (group.items || []).filter((item: RentalMachineryItem) => {
          const hasDeliveryDate = !!item.deliveryDate;
          const noRemovalDate = !item.removalDate;
          const removalDateInFuture = item.removalDate && item.removalDate >= todayStr;
          
          return hasDeliveryDate && (noRemovalDate || removalDateInFuture);
        })
      })).filter(group => group.items.length > 0);

      // Actualizar días en las asignaciones activas SOLO si hay maquinaria activa
      const updatedRentalGroups = activeRentalGroups.length > 0 
        ? activeRentalGroups.map(group => ({
            ...group,
            items: group.items.map((item: RentalMachineryItem) => {
              // Calcular totalDays laborables desde deliveryDate hasta hoy (sin sábados, domingos y festivos)
              const deliveryDate = new Date(item.deliveryDate);
              const workingDays = calculateWorkingDays(deliveryDate, today, orgCustomHolidays);
              
              // Actualizar asignaciones activas
              const updatedAssignments = (item.assignments || []).map(assignment => {
                const assignmentStartDate = new Date(assignment.startDate);
                const assignmentNoEndDate = !assignment.endDate;
                const assignmentEndDateInFuture = assignment.endDate && assignment.endDate >= todayStr;
                
                if (assignmentNoEndDate || assignmentEndDateInFuture) {
                  // Calcular días laborables desde startDate hasta hoy (con festivos personalizados)
                  const assignmentWorkingDays = calculateWorkingDays(assignmentStartDate, today, orgCustomHolidays);
                  return {
                    ...assignment,
                    days: assignmentWorkingDays
                  };
                }
                return assignment;
              });

              return {
                ...item,
                totalDays: workingDays,
                total: item.dailyRate ? workingDays * item.dailyRate : 0,
                assignments: updatedAssignments
              };
            })
          }))
        : rentalMachineryGroups; // Usar grupos originales si no hay maquinaria activa

      // Crear nuevo parte duplicando solo datos de texto + firma del encargado
      // NO clonar: material_groups (albaranes), imágenes de documentos, firma del jefe de obra
      
      // Función para eliminar documentImage de los grupos
      const removeDocumentImages = (groups: any[]) => 
        (groups || []).map(group => ({
          ...group,
          documentImage: undefined,
          items: (group.items || []).map((item: any) => ({
            ...item,
            documentImage: undefined
          }))
        }));

      const newReport = {
        work_number: report.work_number,
        date: todayStr,
        work_name: report.work_name,
        work_id: report.work_id,
        foreman: report.foreman,
        foreman_hours: report.foreman_hours,
        foreman_signature: report.foreman_signature || null, // SÍ clonar firma del encargado
        site_manager: report.site_manager,
        site_manager_signature: null, // NO clonar firma del jefe de obra
        observations: report.observations,
        work_groups: removeDocumentImages(report.work_groups), // Sin imágenes
        machinery_groups: removeDocumentImages(report.machinery_groups), // Sin imágenes
        material_groups: [], // NO clonar albaranes escaneados - son documentos únicos
        subcontract_groups: removeDocumentImages(report.subcontract_groups), // Sin imágenes
        rental_machinery_groups: updatedRentalGroups,
        created_by: report.created_by,
        organization_id: report.organization_id,
        status: report.status
      };

      reportsToCreate.push(newReport);
      // Marcar este reporte para desactivar el flag
      reportIdsToUpdate.push(report.id);
    }

    // Insertar todos los nuevos partes
    if (reportsToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from('work_reports')
        .insert(reportsToCreate);

      if (insertError) {
        console.error('Error insertando nuevos partes:', insertError);
        throw insertError;
      }

      duplicatedCount = reportsToCreate.length;
      console.log(`Se crearon ${duplicatedCount} partes automáticos`);
    }

    // Desactivar el flag auto_clone_next_day en los partes originales
    if (reportIdsToUpdate.length > 0) {
      const { error: updateError } = await supabase
        .from('work_reports')
        .update({ auto_clone_next_day: false })
        .in('id', reportIdsToUpdate);

      if (updateError) {
        console.error('Error desactivando flags de clonación:', updateError);
      } else {
        console.log(`Se desactivaron ${reportIdsToUpdate.length} flags de clonación automática`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Se clonaron ${duplicatedCount} partes de trabajo completos para ${todayStr}`,
        duplicated: duplicatedCount,
        date: todayStr,
        flags_disabled: reportIdsToUpdate.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en auto-duplicate-rental-machinery:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
};

serve(handler);
export default handler;

