import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req) => {
  if (req.method === "OPTIONS") {
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);

    const notifications = [];

    // Verificar obras que terminan pronto
    const { data: expiringWorks, error: worksError } = await supabase
      .from('works')
      .select('id, name, number, end_date, organization_id')
      .gte('end_date', today.toISOString().split('T')[0])
      .lte('end_date', sevenDaysFromNow.toISOString().split('T')[0]);

    if (worksError) throw worksError;

    // Obtener usuarios asignados a estas obras
    for (const work of expiringWorks || []) {
      const { data: assignments, error: assignError } = await supabase
        .from('work_assignments')
        .select('user_id')
        .eq('work_id', work.id);

      if (assignError) continue;

      const daysUntilExpiry = Math.ceil(
        (new Date(work.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      for (const assignment of assignments || []) {
        notifications.push({
          user_id: assignment.user_id,
          organization_id: work.organization_id,
          type: 'work_expiry_warning',
          title: 'Obra próxima a finalizar',
          message: `La obra "${work.name}" (${work.number}) finalizará en ${daysUntilExpiry} día${daysUntilExpiry > 1 ? 's' : ''}`,
          related_id: work.id,
          read: false,
        });
      }
    }

    // Verificar maquinaria de alquiler próxima a retirar
    const { data: expiringMachinery, error: machineryError } = await supabase
      .from('work_rental_machinery')
      .select('id, type, machine_number, removal_date, work_id, organization_id')
      .gte('removal_date', today.toISOString().split('T')[0])
      .lte('removal_date', sevenDaysFromNow.toISOString().split('T')[0])
      .is('removal_date', null);

    if (!machineryError && expiringMachinery) {
      for (const machinery of expiringMachinery) {
        // Obtener usuarios asignados a la obra
        const { data: workAssignments, error: workAssignError } = await supabase
          .from('work_assignments')
          .select('user_id')
          .eq('work_id', machinery.work_id);

        if (workAssignError) continue;

        const daysUntilRemoval = Math.ceil(
          (new Date(machinery.removal_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        for (const assignment of workAssignments || []) {
          notifications.push({
            user_id: assignment.user_id,
            organization_id: machinery.organization_id,
            type: 'machinery_expiry_warning',
            title: 'Maquinaria próxima a retirar',
            message: `${machinery.type} (${machinery.machine_number}) debe retirarse en ${daysUntilRemoval} día${daysUntilRemoval > 1 ? 's' : ''}`,
            related_id: machinery.id,
            read: false,
          });
        }
      }
    }

    // Insertar todas las notificaciones
    if (notifications.length > 0) {
      // Evitar duplicados: verificar notificaciones existentes
      const uniqueNotifications = [];
      
      for (const notif of notifications) {
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', notif.user_id)
          .eq('type', notif.type)
          .eq('related_id', notif.related_id)
          .eq('read', false)
          .maybeSingle();

        if (!existing) {
          uniqueNotifications.push(notif);
        }
      }

      if (uniqueNotifications.length > 0) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert(uniqueNotifications);

        if (notifError) throw notifError;

        console.log(`Enviadas ${uniqueNotifications.length} alertas de vencimiento`);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: `Procesadas ${notifications.length} alertas de vencimiento`,
        count: notifications.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
};

serve(handler);
export default handler;

