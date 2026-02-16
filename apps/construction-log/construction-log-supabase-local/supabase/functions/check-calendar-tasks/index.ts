import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    console.log('🔐 Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('❌ No authorization header found');
      return new Response(
        JSON.stringify({ 
          error: 'No authorization header',
          urgentTasks: [],
          upcomingTasks: [],
          totalTasks: 0
        }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const accessToken = authHeader.replace('Bearer', '').trim();
    if (!accessToken) {
      console.error('❌ Authorization header without token');
      return new Response(
        JSON.stringify({ 
          error: 'Invalid authorization header',
          urgentTasks: [],
          upcomingTasks: [],
          totalTasks: 0
        }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      }
    );

    // Get current user (with fallback to token decode)
    console.log('👤 Getting user...');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(accessToken);

    let userId: string | null = user?.id ?? null;
    if (userError || !userId) {
      console.warn('⚠️ getUser failed or no user returned, trying to decode JWT payload');
      try {
        const parts = accessToken.split('.');
        if (parts.length === 3) {
          const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(payloadJson);
          userId = payload?.sub ?? null;
        }
      } catch (e) {
        console.error('❌ Failed to decode JWT:', e);
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ 
          error: 'User authentication failed',
          urgentTasks: [],
          upcomingTasks: [],
          totalTasks: 0
        }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('✅ User authenticated (id):', userId);

    // Get user's organization
    console.log('🏢 Getting organization...');
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('❌ Profile error:', profileError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to get user profile',
          urgentTasks: [],
          upcomingTasks: [],
          totalTasks: 0
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!profile?.organization_id) {
    	  console.warn('⚠️ No organization found for user');
      return new Response(
        JSON.stringify({ 
          error: 'Organization not found',
          urgentTasks: [],
          upcomingTasks: [],
          totalTasks: 0
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('✅ Organization found:', profile.organization_id);

    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    // Get upcoming tasks (up to 2 days)
    let tasks: any[] | null = null;
    let tasksError: any = null;

    const tasksResp = await supabaseClient
      .from('calendar_tasks')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .in('status', ['pending', 'in_progress'])
      .gte('task_date', now.toISOString().split('T')[0])
      .lte('task_date', twoDaysFromNow.toISOString().split('T')[0])
      .order('task_date', { ascending: true })
      .order('due_time', { ascending: true });

    tasks = tasksResp.data as any[] | null;
    tasksError = tasksResp.error;

    // Fallback attempt with minimal select if first query fails (shouldn't happen)
    if (tasksError) {
      console.warn('First tasks query failed, retrying with minimal select:', tasksError);
      const fallback = await supabaseClient
        .from('calendar_tasks')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .in('status', ['pending', 'in_progress']);
      tasks = fallback.data as any[] | null;
      tasksError = fallback.error;
    }

    if (tasksError) {
      console.error('Error fetching tasks after fallback:', tasksError);
      return new Response(
        JSON.stringify({ 
          error: tasksError.message || 'Failed to fetch tasks',
          urgentTasks: [],
          upcomingTasks: [],
          totalTasks: 0
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    tasks = tasks || [];

    // Filter and categorize tasks
    const urgentTasks: any[] = [];
    const upcomingTasks: any[] = [];

    for (const task of tasks || []) {
      // If task has no specific time, consider the entire day
      const taskDateTime = task.due_time 
        ? new Date(`${task.task_date}T${task.due_time}`)
        : new Date(`${task.task_date}T23:59:59`); // End of day if no time specified

      const hoursUntil = (taskDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const taskDate = new Date(task.task_date);
      const todayDate = new Date(now.toISOString().split('T')[0]);
      const isToday = taskDate.toISOString().split('T')[0] === todayDate.toISOString().split('T')[0];
      
      console.log(`Task: ${task.title}, Date: ${task.task_date}, Time: ${task.due_time}, Hours until: ${hoursUntil}, Is today: ${isToday}`);
      
      if (hoursUntil <= 0 && !isToday) {
        // Overdue task (not today)
        urgentTasks.push({
          ...task,
          urgencyLevel: 'overdue',
          hoursUntil: Math.abs(hoursUntil),
        });
      } else if (isToday || hoursUntil <= 24) {
        // Today's tasks or within 24 hours
        urgentTasks.push({
          ...task,
          urgencyLevel: isToday ? 'today' : hoursUntil <= 2 ? 'critical' : 'high',
          hoursUntil: Math.max(0, hoursUntil),
        });
      } else if (hoursUntil <= 48) {
        // Upcoming (less than 2 days)
        upcomingTasks.push({
          ...task,
          urgencyLevel: 'medium',
          hoursUntil,
        });
      }
    }

    console.log(`Found ${urgentTasks.length} urgent tasks and ${upcomingTasks.length} upcoming tasks`);

    return new Response(
      JSON.stringify({
        urgentTasks,
        upcomingTasks,
        totalTasks: (tasks || []).length,
        timestamp: now.toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in check-calendar-tasks:", error);
    const errMessage = typeof error === 'object' && error !== null
      ? ((error as any).message || (error as any).code || JSON.stringify(error))
      : String(error);
    return new Response(
      JSON.stringify({ 
        error: errMessage,
        urgentTasks: [],
        upcomingTasks: [],
        totalTasks: 0,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
export default handler;

