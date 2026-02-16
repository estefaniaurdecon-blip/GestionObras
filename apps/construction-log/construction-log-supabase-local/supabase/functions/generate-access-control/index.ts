import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AccessEntry {
  id: string;
  type: 'personal' | 'machinery';
  name: string;
  identifier: string;
  company: string;
  entryTime: string;
  exitTime?: string;
  activity: string;
  operator?: string;
  source?: 'subcontract' | 'rental';
}

Deno.const handler = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { workReportId } = await req.json();

    if (!workReportId) {
      return new Response(
        JSON.stringify({ error: 'workReportId es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generando control de acceso para parte: ${workReportId}`);

    // Obtener el parte de trabajo
    const { data: workReport, error: reportError } = await supabase
      .from('work_reports')
      .select('*')
      .eq('id', workReportId)
      .single();

    if (reportError || !workReport) {
      console.error('Error obteniendo parte:', reportError);
      return new Response(
        JSON.stringify({ error: 'Parte de trabajo no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Obtener el nombre del usuario que creó/modificó el parte (last_edited_by o created_by)
    const responsibleUserId = workReport.last_edited_by || workReport.created_by;
    let responsibleName = 'Sin responsable';
    
    if (responsibleUserId) {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', responsibleUserId)
        .single();
      
      if (userProfile?.full_name) {
        responsibleName = userProfile.full_name;
      }
    }

    const personalEntries: AccessEntry[] = [];
    const machineryEntries: AccessEntry[] = [];

    // Extraer personal de work_groups
    if (workReport.work_groups && Array.isArray(workReport.work_groups)) {
      workReport.work_groups.forEach((group: any) => {
        if (group.items && Array.isArray(group.items)) {
          group.items.forEach((worker: any, index: number) => {
            personalEntries.push({
              id: `personal-${group.company}-${index}-${Date.now()}`,
              type: 'personal',
              name: worker.name || 'Sin nombre',
              identifier: worker.dni || 'Sin DNI',
              company: group.company || 'Sin empresa',
              entryTime: '08:00',
              exitTime: worker.hours ? (8 + parseFloat(worker.hours)).toString().padStart(2, '0') + ':00' : '18:00',
              activity: worker.activity || worker.position || 'Sin especificar'
            });
          });
        }
      });
    }

    // Extraer maquinaria de subcontratas (machinery_groups)
    if (workReport.machinery_groups && Array.isArray(workReport.machinery_groups)) {
      workReport.machinery_groups.forEach((group: any) => {
        if (group.items && Array.isArray(group.items)) {
          group.items.forEach((machine: any, index: number) => {
            machineryEntries.push({
              id: `machinery-${group.company}-${index}-${Date.now()}`,
              type: 'machinery',
              name: machine.type || 'Sin tipo',
              identifier: machine.machineNumber || machine.plate || 'Sin matrícula',
              company: group.company || 'Sin empresa',
              entryTime: '08:00',
              exitTime: machine.hours ? (8 + parseFloat(machine.hours)).toString().padStart(2, '0') + ':00' : '18:00',
              activity: machine.activity || 'Sin especificar',
              operator: machine.operator || undefined,
              source: 'subcontract'
            });
          });
        }
      });
    }

    // Extraer maquinaria de alquiler
    if (workReport.work_id) {
      const reportDate = new Date(workReport.date);
      
      const { data: rentalMachinery } = await supabase
        .from('work_rental_machinery')
        .select('*')
        .eq('work_id', workReport.work_id)
        .order('delivery_date', { ascending: true });

      if (rentalMachinery && rentalMachinery.length > 0) {
        const activeMachinery = rentalMachinery.filter(machine => {
          const deliveryDate = new Date(machine.delivery_date);
          const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
          return deliveryDate <= reportDate && (!removalDate || removalDate >= reportDate);
        });

        activeMachinery.forEach((machine, index) => {
          // Calcular días de alquiler hasta la fecha del parte
          const deliveryDate = new Date(machine.delivery_date);
          const removalDate = machine.removal_date ? new Date(machine.removal_date) : null;
          const effectiveEndDate = removalDate && removalDate < reportDate ? removalDate : reportDate;
          const days = Math.ceil((effectiveEndDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          machineryEntries.push({
            id: `rental-${machine.provider}-${index}-${Date.now()}`,
            type: 'machinery',
            name: machine.type || 'Sin tipo',
            identifier: machine.machine_number || 'Sin número',
            company: machine.provider || 'Sin proveedor',
            entryTime: '08:00',
            exitTime: '18:00',
            activity: `Alquiler (${days} días)`,
            operator: undefined,
            source: 'rental'
          });
        });
      }
    }

    // Si no hay entradas, no crear control de acceso
    if (personalEntries.length === 0 && machineryEntries.length === 0) {
      console.log('No hay datos de personal o maquinaria, no se genera control de acceso');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No hay datos para generar control de acceso',
          created: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar si ya existe un control de acceso para esta fecha y obra
    const { data: existingReport } = await supabase
      .from('access_control_reports')
      .select('id')
      .eq('date', workReport.date)
      .eq('site_name', workReport.work_name)
      .eq('organization_id', workReport.organization_id)
      .maybeSingle();

    const accessControlData = {
      date: workReport.date,
      site_name: workReport.work_name,
      responsible: responsibleName,
      responsible_entry_time: '08:00',
      responsible_exit_time: undefined,
      observations: `Generado automáticamente desde el parte de trabajo del ${workReport.date}`,
      personal_entries: personalEntries,
      machinery_entries: machineryEntries,
      organization_id: workReport.organization_id,
      created_by: workReport.created_by
    };

    let result;
    if (existingReport) {
      // Actualizar el existente
      const { data, error } = await supabase
        .from('access_control_reports')
        .update(accessControlData)
        .eq('id', existingReport.id)
        .select()
        .single();

      if (error) {
        console.error('Error actualizando control de acceso:', error);
        throw error;
      }
      result = data;
      console.log(`Control de acceso actualizado: ${existingReport.id}`);
    } else {
      // Crear nuevo
      const { data, error } = await supabase
        .from('access_control_reports')
        .insert(accessControlData)
        .select()
        .single();

      if (error) {
        console.error('Error creando control de acceso:', error);
        throw error;
      }
      result = data;
      console.log(`Control de acceso creado: ${result.id}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: existingReport ? 'Control de acceso actualizado' : 'Control de acceso creado',
        accessControlId: result.id,
        created: !existingReport,
        personalCount: personalEntries.length,
        machineryCount: machineryEntries.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en generate-access-control:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
};

serve(handler);
export default handler;

