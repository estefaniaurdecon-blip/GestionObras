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

    const today = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();

    // Solo enviar recordatorios entre las 17:00 y 20:00
    if (currentHour < 17 || currentHour >= 20) {
      return new Response(
        JSON.stringify({ message: "Fuera del horario de recordatorios" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar partes de trabajo sin completar del día de hoy
    const { data: incompleteReports, error: reportsError } = await supabase
      .from('work_reports')
      .select('id, work_name, work_number, created_by, organization_id, status')
      .eq('date', today)
      .neq('status', 'completed');

    if (reportsError) throw reportsError;

    console.log(`Encontrados ${incompleteReports?.length || 0} partes sin cerrar`);

    const notifications = [];
    
    // Crear notificaciones para cada parte sin cerrar
    for (const report of incompleteReports || []) {
      const notification = {
        user_id: report.created_by,
        organization_id: report.organization_id,
        type: 'work_report_pending',
        title: 'Parte sin cerrar',
        message: `El parte "${report.work_name}" (${report.work_number}) del día de hoy aún no ha sido completado`,
        related_id: report.id,
        read: false,
      };

      notifications.push(notification);
    }

    // Insertar todas las notificaciones
    if (notifications.length > 0) {
      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notifError) throw notifError;

      console.log(`Enviadas ${notifications.length} notificaciones`);
    }

    return new Response(
      JSON.stringify({ 
        message: `Procesados ${notifications.length} recordatorios`,
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

