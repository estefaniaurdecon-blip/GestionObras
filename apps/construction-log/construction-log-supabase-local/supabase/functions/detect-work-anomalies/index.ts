import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Anomaly {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  details: Record<string, unknown>;
  workReportId?: string;
  workId?: string;
}

interface WorkReportData {
  id: string;
  date: string;
  work_name: string;
  work_number: string;
  work_id: string | null;
  organization_id: string;
  created_by: string | null;
  foreman: string | null;
  work_groups: unknown[];
  machinery_groups: unknown[];
  material_groups: unknown[];
  subcontract_groups: unknown[];
  status: string | null;
  missing_delivery_notes: boolean;
  created_at: string;
}

// Calculate statistics for anomaly detection
function calculateStats(values: number[]): { mean: number; stdDev: number; min: number; max: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0, min: 0, max: 0 };
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return {
    mean,
    stdDev,
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

// Check if a value is an outlier (beyond 2 standard deviations)
function isOutlier(value: number, stats: { mean: number; stdDev: number }): boolean {
  if (stats.stdDev === 0) return false;
  return Math.abs(value - stats.mean) > 2 * stats.stdDev;
}

// Extract total hours from a work report
function extractTotalHours(report: WorkReportData): number {
  let total = 0;
  
  // Work groups
  if (Array.isArray(report.work_groups)) {
    for (const group of report.work_groups as Record<string, unknown>[]) {
      if (Array.isArray(group?.items)) {
        for (const item of group.items as Record<string, unknown>[]) {
          total += Number(item?.hours) || 0;
        }
      }
    }
  }
  
  // Machinery groups
  if (Array.isArray(report.machinery_groups)) {
    for (const group of report.machinery_groups as Record<string, unknown>[]) {
      if (Array.isArray(group?.items)) {
        for (const item of group.items as Record<string, unknown>[]) {
          total += Number(item?.hours) || 0;
        }
      }
    }
  }
  
  // Subcontract groups
  if (Array.isArray(report.subcontract_groups)) {
    for (const group of report.subcontract_groups as Record<string, unknown>[]) {
      if (Array.isArray(group?.items)) {
        for (const item of group.items as Record<string, unknown>[]) {
          total += Number(item?.hours) || 0;
        }
      }
    }
  }
  
  return total;
}

// Extract total material cost from a work report
function extractMaterialCost(report: WorkReportData): number {
  let total = 0;
  
  if (Array.isArray(report.material_groups)) {
    for (const group of report.material_groups as Record<string, unknown>[]) {
      if (Array.isArray(group?.items)) {
        for (const item of group.items as Record<string, unknown>[]) {
          total += Number(item?.total) || 0;
        }
      }
    }
  }
  
  return total;
}

// Detect anomalies in work reports
function detectAnomalies(
  reports: WorkReportData[],
  organizationId: string
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  
  if (reports.length < 5) {
    // Not enough data for statistical analysis
    return anomalies;
  }
  
  // Calculate baseline statistics
  const hoursPerReport = reports.map(r => extractTotalHours(r));
  const hoursStats = calculateStats(hoursPerReport);
  
  const materialsPerReport = reports.map(r => extractMaterialCost(r));
  const materialStats = calculateStats(materialsPerReport.filter(m => m > 0));
  
  // Check recent reports (last 7 days)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentReports = reports.filter(r => new Date(r.date) >= sevenDaysAgo);
  
  for (const report of recentReports) {
    const reportHours = extractTotalHours(report);
    const reportMaterials = extractMaterialCost(report);
    
    // Check for unusually high hours
    if (reportHours > 0 && isOutlier(reportHours, hoursStats) && reportHours > hoursStats.mean) {
      const percentAbove = ((reportHours - hoursStats.mean) / hoursStats.mean * 100).toFixed(0);
      anomalies.push({
        type: 'high_hours',
        severity: reportHours > hoursStats.mean + 3 * hoursStats.stdDev ? 'critical' : 'warning',
        title: 'Horas inusualmente altas',
        message: `El parte de ${report.work_name} del ${report.date} tiene ${reportHours.toFixed(1)}h, un ${percentAbove}% por encima del promedio (${hoursStats.mean.toFixed(1)}h)`,
        details: {
          reportHours,
          averageHours: hoursStats.mean,
          stdDev: hoursStats.stdDev
        },
        workReportId: report.id,
        workId: report.work_id || undefined
      });
    }
    
    // Check for unusually low hours (might indicate incomplete data)
    if (reportHours > 0 && reportHours < hoursStats.mean * 0.3 && hoursStats.mean > 10) {
      anomalies.push({
        type: 'low_hours',
        severity: 'info',
        title: 'Horas inusualmente bajas',
        message: `El parte de ${report.work_name} del ${report.date} tiene solo ${reportHours.toFixed(1)}h, muy por debajo del promedio (${hoursStats.mean.toFixed(1)}h). ¿Está completo?`,
        details: {
          reportHours,
          averageHours: hoursStats.mean
        },
        workReportId: report.id,
        workId: report.work_id || undefined
      });
    }
    
    // Check for unusually high material costs
    if (reportMaterials > 0 && materialStats.mean > 0 && isOutlier(reportMaterials, materialStats) && reportMaterials > materialStats.mean) {
      const percentAbove = ((reportMaterials - materialStats.mean) / materialStats.mean * 100).toFixed(0);
      anomalies.push({
        type: 'high_material_cost',
        severity: reportMaterials > materialStats.mean + 3 * materialStats.stdDev ? 'critical' : 'warning',
        title: 'Coste de materiales inusualmente alto',
        message: `El parte de ${report.work_name} del ${report.date} tiene un coste de materiales de ${reportMaterials.toFixed(2)}€, un ${percentAbove}% por encima del promedio`,
        details: {
          reportCost: reportMaterials,
          averageCost: materialStats.mean,
          stdDev: materialStats.stdDev
        },
        workReportId: report.id,
        workId: report.work_id || undefined
      });
    }
    
    // Check for missing delivery notes older than 3 days
    if (report.missing_delivery_notes) {
      const reportDate = new Date(report.date);
      const daysSincreReport = Math.floor((now.getTime() - reportDate.getTime()) / (24 * 60 * 60 * 1000));
      
      if (daysSincreReport >= 3) {
        anomalies.push({
          type: 'missing_delivery_notes',
          severity: daysSincreReport >= 7 ? 'critical' : 'warning',
          title: 'Albaranes pendientes',
          message: `El parte de ${report.work_name} del ${report.date} tiene albaranes pendientes desde hace ${daysSincreReport} días`,
          details: {
            daysPending: daysSincreReport,
            reportDate: report.date
          },
          workReportId: report.id,
          workId: report.work_id || undefined
        });
      }
    }
  }
  
  // Check for duplicate work on same day (same worker in multiple reports)
  const workersByDate = new Map<string, Map<string, string[]>>();
  
  for (const report of recentReports) {
    if (!Array.isArray(report.work_groups)) continue;
    
    for (const group of report.work_groups as Record<string, unknown>[]) {
      if (!Array.isArray(group?.items)) continue;
      
      for (const item of group.items as Record<string, unknown>[]) {
        const workerName = String(item?.name || '').trim().toLowerCase();
        if (!workerName) continue;
        
        const dateKey = report.date;
        if (!workersByDate.has(dateKey)) {
          workersByDate.set(dateKey, new Map());
        }
        
        const dateWorkers = workersByDate.get(dateKey)!;
        if (!dateWorkers.has(workerName)) {
          dateWorkers.set(workerName, []);
        }
        
        dateWorkers.get(workerName)!.push(report.work_name);
      }
    }
  }
  
  // Report workers appearing in multiple works on same day
  for (const [date, workers] of workersByDate.entries()) {
    for (const [workerName, works] of workers.entries()) {
      if (works.length > 1) {
        const uniqueWorks = [...new Set(works)];
        if (uniqueWorks.length > 1) {
          anomalies.push({
            type: 'duplicate_worker',
            severity: 'warning',
            title: 'Trabajador en múltiples obras',
            message: `El trabajador "${workerName}" aparece en ${uniqueWorks.length} obras diferentes el ${date}: ${uniqueWorks.join(', ')}`,
            details: {
              workerName,
              date,
              works: uniqueWorks
            }
          });
        }
      }
    }
  }
  
  // Check for stagnant works (no reports in last 5 days for active works)
  const workLastReport = new Map<string, { date: Date; name: string; workId: string }>();
  
  for (const report of reports) {
    if (!report.work_id) continue;
    
    const reportDate = new Date(report.date);
    const existing = workLastReport.get(report.work_id);
    
    if (!existing || reportDate > existing.date) {
      workLastReport.set(report.work_id, {
        date: reportDate,
        name: report.work_name,
        workId: report.work_id
      });
    }
  }
  
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  for (const [workId, lastReport] of workLastReport.entries()) {
    // Only check works that had activity in the last 30 days but not in the last 5
    if (lastReport.date < fiveDaysAgo && lastReport.date > thirtyDaysAgo) {
      const daysSinceReport = Math.floor((now.getTime() - lastReport.date.getTime()) / (24 * 60 * 60 * 1000));
      
      anomalies.push({
        type: 'stagnant_work',
        severity: daysSinceReport >= 10 ? 'warning' : 'info',
        title: 'Obra sin actividad reciente',
        message: `La obra "${lastReport.name}" no tiene partes desde hace ${daysSinceReport} días`,
        details: {
          daysSinceLastReport: daysSinceReport,
          lastReportDate: lastReport.date.toISOString().split('T')[0]
        },
        workId
      });
    }
  }
  
  return anomalies;
}

const handler = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all organizations
    const { data: organizations, error: orgError } = await supabase
      .from('organizations')
      .select('id, name');

    if (orgError) throw orgError;

    let totalAnomalies = 0;
    let totalNotifications = 0;

    for (const org of organizations || []) {
      // Get work reports from the last 90 days for this organization
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: workReports, error: wrError } = await supabase
        .from('work_reports')
        .select('id, date, work_name, work_number, work_id, organization_id, created_by, foreman, work_groups, machinery_groups, material_groups, subcontract_groups, status, missing_delivery_notes, created_at')
        .eq('organization_id', org.id)
        .gte('date', ninetyDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (wrError) {
        console.error(`Error fetching reports for org ${org.id}:`, wrError);
        continue;
      }

      if (!workReports || workReports.length < 5) {
        continue; // Not enough data
      }

      // Detect anomalies
      const anomalies = detectAnomalies(workReports as WorkReportData[], org.id);
      totalAnomalies += anomalies.length;

      if (anomalies.length === 0) continue;

      // Get admin users for this organization
      const { data: admins, error: adminError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('organization_id', org.id)
        .in('role', ['admin', 'master', 'site_manager']);

      if (adminError) {
        console.error(`Error fetching admins for org ${org.id}:`, adminError);
        continue;
      }

      // Check existing notifications to avoid duplicates
      const today = new Date().toISOString().split('T')[0];
      
      for (const anomaly of anomalies) {
        // Create a unique key for this anomaly
        const anomalyKey = `${anomaly.type}_${anomaly.workReportId || anomaly.workId || 'general'}_${today}`;
        
        // Check if we already sent this notification today
        const { data: existingNotifications } = await supabase
          .from('notifications')
          .select('id')
          .eq('organization_id', org.id)
          .eq('type', 'anomaly_detected')
          .gte('created_at', `${today}T00:00:00Z`)
          .contains('metadata', { anomalyKey });

        if (existingNotifications && existingNotifications.length > 0) {
          continue; // Already notified about this today
        }

        // Create notifications for each admin
        for (const admin of admins || []) {
          const { error: notifError } = await supabase
            .from('notifications')
            .insert({
              user_id: admin.user_id,
              organization_id: org.id,
              type: 'anomaly_detected',
              title: `⚠️ ${anomaly.title}`,
              message: anomaly.message,
              related_id: anomaly.workReportId || anomaly.workId || null,
              metadata: {
                anomalyType: anomaly.type,
                severity: anomaly.severity,
                details: anomaly.details,
                anomalyKey
              },
              read: false
            });

          if (notifError) {
            console.error('Error creating notification:', notifError);
          } else {
            totalNotifications++;
          }
        }
      }
    }

    console.log(`Anomaly detection complete: ${totalAnomalies} anomalies found, ${totalNotifications} notifications sent`);

    return new Response(
      JSON.stringify({
        success: true,
        anomaliesDetected: totalAnomalies,
        notificationsSent: totalNotifications
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in detect-work-anomalies:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
export default handler;

