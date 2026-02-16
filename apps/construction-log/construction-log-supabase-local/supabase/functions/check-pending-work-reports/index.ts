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

    // Calcular la fecha de hace 3 días
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];

    console.log(`Buscando partes sin completar desde el ${threeDaysAgoStr}`);

    // Buscar partes de trabajo sin completar de hace más de 3 días
    const { data: pendingReports, error: reportsError } = await supabase
      .from('work_reports')
      .select('id, work_id, work_name, work_number, date, created_by, organization_id, status')
      .neq('status', 'completed')
      .lte('date', threeDaysAgoStr);

    if (reportsError) throw reportsError;

    console.log(`Encontrados ${pendingReports?.length || 0} partes pendientes de más de 3 días`);

    const notifications = [];
    const processedUsers = new Set<string>(); // Evitar notificaciones duplicadas

    // Crear notificaciones para cada parte pendiente
    for (const report of pendingReports || []) {
      // Formatear la fecha del parte
      const reportDate = new Date(report.date);
      const formattedDate = reportDate.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      // Calcular días pendientes
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - reportDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const notificationKey = `${report.id}-${report.created_by}`;
      
      // 1. Notificar al creador del parte (si no se ha notificado ya)
      if (report.created_by && !processedUsers.has(notificationKey)) {
        notifications.push({
          user_id: report.created_by,
          organization_id: report.organization_id,
          type: 'work_report_overdue',
          title: 'Parte pendiente de completar',
          message: `El parte "${report.work_name}" (${report.work_number}) del ${formattedDate} lleva ${diffDays} días sin completarse`,
          related_id: report.id,
          read: false,
        });
        processedUsers.add(notificationKey);
      }

      // 2. Notificar a los jefes de obra asignados a esta obra (si existe work_id)
      if (report.work_id) {
        // Buscar jefes de obra de la organización
        const { data: siteManagers } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('organization_id', report.organization_id)
          .eq('role', 'site_manager');

        if (siteManagers && siteManagers.length > 0) {
          // Filtrar solo los asignados a esta obra
          const { data: assignedSiteManagers } = await supabase
            .from('work_assignments')
            .select('user_id')
            .eq('work_id', report.work_id)
            .in('user_id', siteManagers.map(sm => sm.user_id));

          if (assignedSiteManagers && assignedSiteManagers.length > 0) {
            for (const siteManager of assignedSiteManagers) {
              const smNotificationKey = `${report.id}-${siteManager.user_id}`;
              
              // Evitar notificar al creador dos veces si es jefe de obra
              if (!processedUsers.has(smNotificationKey)) {
                notifications.push({
                  user_id: siteManager.user_id,
                  organization_id: report.organization_id,
                  type: 'work_report_overdue',
                  title: 'Parte pendiente en tu obra',
                  message: `El parte "${report.work_name}" (${report.work_number}) del ${formattedDate} lleva ${diffDays} días sin completarse`,
                  related_id: report.id,
                  read: false,
                });
                processedUsers.add(smNotificationKey);
              }
            }
          }
        }
      }
    }

    // Insertar todas las notificaciones
    if (notifications.length > 0) {
      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notifError) throw notifError;

      console.log(`Enviadas ${notifications.length} notificaciones para partes pendientes`);
    }

    return new Response(
      JSON.stringify({ 
        message: `Procesados ${pendingReports?.length || 0} partes pendientes`,
        notifications_sent: notifications.length,
        reports_found: pendingReports?.length || 0
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

