import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WorkReport {
  id: string;
  date: string;
  workName: string;
  workNumber: string;
  foreman?: string;
  foremanHours?: number;
  siteManager?: string;
  status: string;
  approved: boolean;
  workGroups?: any[];
  machineryGroups?: any[];
  materialGroups?: any[];
  subcontractGroups?: any[];
  observations?: string;
}

// Calculate comprehensive statistics from work reports
function calculateStatistics(reports: WorkReport[]) {
  const stats = {
    totalReports: reports.length,
    completedReports: 0,
    approvedReports: 0,
    pendingReports: 0,
    
    totals: {
      workHours: 0,
      workersCount: 0,
      machineryHours: 0,
      machineryCount: 0,
      materialCost: 0,
      materialItems: 0,
      subcontractCost: 0,
      subcontractWorkers: 0,
      foremanHours: 0,
    },
    
    byWork: {} as Record<string, {
      reportCount: number;
      workHours: number;
      machineryHours: number;
      materialCost: number;
      subcontractCost: number;
      companies: Set<string>;
    }>,
    
    byCompany: {} as Record<string, {
      workHours: number;
      machineryHours: number;
      reportCount: number;
    }>,
    
    bySupplier: {} as Record<string, {
      materialCost: number;
      itemCount: number;
    }>,
    
    byMonth: {} as Record<string, {
      reports: number;
      workHours: number;
      machineryHours: number;
      materialCost: number;
      subcontractCost: number;
    }>,
    
    byDayOfWeek: {} as Record<string, number>,
    
    dateRange: {
      earliest: '',
      latest: '',
    },
    
    foremen: new Set<string>(),
    siteManagers: new Set<string>(),
  };

  // Sort by date
  const sortedReports = [...reports].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (sortedReports.length > 0) {
    stats.dateRange.earliest = sortedReports[0].date;
    stats.dateRange.latest = sortedReports[sortedReports.length - 1].date;
  }

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  for (const report of reports) {
    // Status counts
    if (report.status === 'completed') stats.completedReports++;
    else stats.pendingReports++;
    if (report.approved) stats.approvedReports++;

    // Foreman hours
    if (report.foremanHours) {
      stats.totals.foremanHours += Number(report.foremanHours);
    }

    // Track people
    if (report.foreman) stats.foremen.add(report.foreman);
    if (report.siteManager) stats.siteManagers.add(report.siteManager);

    // By month
    const monthKey = report.date.substring(0, 7);
    if (!stats.byMonth[monthKey]) {
      stats.byMonth[monthKey] = { reports: 0, workHours: 0, machineryHours: 0, materialCost: 0, subcontractCost: 0 };
    }
    stats.byMonth[monthKey].reports++;

    // By day of week
    const date = new Date(report.date);
    const dayName = dayNames[date.getDay()];
    stats.byDayOfWeek[dayName] = (stats.byDayOfWeek[dayName] || 0) + 1;

    // By work
    const workKey = `${report.workNumber} - ${report.workName}`;
    if (!stats.byWork[workKey]) {
      stats.byWork[workKey] = {
        reportCount: 0,
        workHours: 0,
        machineryHours: 0,
        materialCost: 0,
        subcontractCost: 0,
        companies: new Set<string>(),
      };
    }
    stats.byWork[workKey].reportCount++;

    // Work groups
    if (report.workGroups && Array.isArray(report.workGroups)) {
      for (const group of report.workGroups) {
        const company = group.company || 'Sin empresa';
        stats.byWork[workKey].companies.add(company);
        
        if (!stats.byCompany[company]) {
          stats.byCompany[company] = { workHours: 0, machineryHours: 0, reportCount: 0 };
        }
        stats.byCompany[company].reportCount++;

        if (group.items && Array.isArray(group.items)) {
          for (const item of group.items) {
            const hours = Number(item.hours) || 0;
            stats.totals.workHours += hours;
            stats.totals.workersCount++;
            stats.byCompany[company].workHours += hours;
            stats.byWork[workKey].workHours += hours;
            stats.byMonth[monthKey].workHours += hours;
          }
        }
      }
    }

    // Machinery groups
    if (report.machineryGroups && Array.isArray(report.machineryGroups)) {
      for (const group of report.machineryGroups) {
        const company = group.company || 'Sin empresa';
        if (!stats.byCompany[company]) {
          stats.byCompany[company] = { workHours: 0, machineryHours: 0, reportCount: 0 };
        }

        if (group.items && Array.isArray(group.items)) {
          for (const item of group.items) {
            const hours = Number(item.hours) || 0;
            stats.totals.machineryHours += hours;
            stats.totals.machineryCount++;
            stats.byCompany[company].machineryHours += hours;
            stats.byWork[workKey].machineryHours += hours;
            stats.byMonth[monthKey].machineryHours += hours;
          }
        }
      }
    }

    // Material groups
    if (report.materialGroups && Array.isArray(report.materialGroups)) {
      for (const group of report.materialGroups) {
        const supplier = group.supplier || 'Sin proveedor';
        if (!stats.bySupplier[supplier]) {
          stats.bySupplier[supplier] = { materialCost: 0, itemCount: 0 };
        }

        if (group.items && Array.isArray(group.items)) {
          for (const item of group.items) {
            const cost = Number(item.total) || (Number(item.quantity) * Number(item.unitPrice)) || 0;
            stats.totals.materialCost += cost;
            stats.totals.materialItems++;
            stats.bySupplier[supplier].materialCost += cost;
            stats.bySupplier[supplier].itemCount++;
            stats.byWork[workKey].materialCost += cost;
            stats.byMonth[monthKey].materialCost += cost;
          }
        }
      }
    }

    // Subcontract groups
    if (report.subcontractGroups && Array.isArray(report.subcontractGroups)) {
      for (const group of report.subcontractGroups) {
        if (group.items && Array.isArray(group.items)) {
          for (const item of group.items) {
            const cost = Number(item.total) || 0;
            const workers = Number(item.workers) || 0;
            stats.totals.subcontractCost += cost;
            stats.totals.subcontractWorkers += workers;
            stats.byWork[workKey].subcontractCost += cost;
            stats.byMonth[monthKey].subcontractCost += cost;
          }
        }
      }
    }
  }

  // Convert sets to arrays for serialization
  const serializable: any = { ...stats };
  serializable.foremen = Array.from(stats.foremen);
  serializable.siteManagers = Array.from(stats.siteManagers);
  
  for (const key of Object.keys(serializable.byWork)) {
    serializable.byWork[key] = {
      ...serializable.byWork[key],
      companies: Array.from(serializable.byWork[key].companies),
    };
  }

  return serializable;
}

// Detect anomalies and potential issues
function detectAnomalies(reports: WorkReport[], stats: any) {
  const anomalies: Array<{
    type: 'warning' | 'error' | 'info';
    title: string;
    description: string;
    affectedItems?: string[];
  }> = [];

  const avgHoursPerReport = stats.totals.workHours / stats.totalReports || 0;

  // Check for reports with unusually high or low hours
  const highHoursReports: string[] = [];
  const lowHoursReports: string[] = [];
  const missingDataReports: string[] = [];
  const duplicateSuspects: string[] = [];

  const dateWorkCombos: Record<string, string[]> = {};

  for (const report of reports) {
    let reportHours = 0;
    if (report.workGroups) {
      for (const group of report.workGroups) {
        for (const item of group.items || []) {
          reportHours += Number(item.hours) || 0;
        }
      }
    }

    // High hours anomaly
    if (reportHours > avgHoursPerReport * 3 && avgHoursPerReport > 0) {
      highHoursReports.push(`${report.date} - ${report.workName} (${reportHours.toFixed(1)}h)`);
    }

    // Low hours anomaly
    if (reportHours < avgHoursPerReport * 0.2 && reportHours > 0 && avgHoursPerReport > 0) {
      lowHoursReports.push(`${report.date} - ${report.workName} (${reportHours.toFixed(1)}h)`);
    }

    // Missing data check
    const hasWork = report.workGroups && report.workGroups.length > 0;
    const hasMachinery = report.machineryGroups && report.machineryGroups.length > 0;
    const hasMaterials = report.materialGroups && report.materialGroups.length > 0;
    
    if (!hasWork && !hasMachinery && !hasMaterials) {
      missingDataReports.push(`${report.date} - ${report.workName}`);
    }

    // Duplicate detection
    const combo = `${report.date}_${report.workNumber}`;
    if (!dateWorkCombos[combo]) dateWorkCombos[combo] = [];
    dateWorkCombos[combo].push(report.id);
  }

  // Check for potential duplicates
  for (const [combo, ids] of Object.entries(dateWorkCombos)) {
    if (ids.length > 1) {
      duplicateSuspects.push(combo.replace('_', ' - Obra '));
    }
  }

  // Add anomalies
  if (highHoursReports.length > 0) {
    anomalies.push({
      type: 'warning',
      title: 'Partes con horas inusualmente altas',
      description: `Se detectaron ${highHoursReports.length} partes con horas significativamente superiores al promedio (${avgHoursPerReport.toFixed(1)}h).`,
      affectedItems: highHoursReports.slice(0, 10),
    });
  }

  if (lowHoursReports.length > 0) {
    anomalies.push({
      type: 'info',
      title: 'Partes con pocas horas registradas',
      description: `Se detectaron ${lowHoursReports.length} partes con muy pocas horas comparado con el promedio.`,
      affectedItems: lowHoursReports.slice(0, 10),
    });
  }

  if (missingDataReports.length > 0) {
    anomalies.push({
      type: 'error',
      title: 'Partes sin datos de trabajo',
      description: `Se encontraron ${missingDataReports.length} partes sin información de mano de obra, maquinaria ni materiales.`,
      affectedItems: missingDataReports.slice(0, 10),
    });
  }

  if (duplicateSuspects.length > 0) {
    anomalies.push({
      type: 'warning',
      title: 'Posibles partes duplicados',
      description: `Se detectaron ${duplicateSuspects.length} combinaciones de fecha/obra con múltiples partes.`,
      affectedItems: duplicateSuspects.slice(0, 10),
    });
  }

  // Check for works without recent activity
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const workLastActivity: Record<string, string> = {};
  for (const report of reports) {
    const workKey = `${report.workNumber} - ${report.workName}`;
    if (!workLastActivity[workKey] || report.date > workLastActivity[workKey]) {
      workLastActivity[workKey] = report.date;
    }
  }

  const inactiveWorks = Object.entries(workLastActivity)
    .filter(([_, date]) => new Date(date) < thirtyDaysAgo)
    .map(([work, date]) => `${work} (último: ${date})`);

  if (inactiveWorks.length > 0) {
    anomalies.push({
      type: 'info',
      title: 'Obras sin actividad reciente',
      description: `${inactiveWorks.length} obras no tienen partes en los últimos 30 días.`,
      affectedItems: inactiveWorks.slice(0, 10),
    });
  }

  return anomalies;
}

// Generate AI analysis prompt
function generateAnalysisPrompt(stats: any, anomalies: any[], periodDescription: string) {
  return `Eres un experto analista de gestión de obras de construcción. Analiza los siguientes datos de partes de trabajo y genera un informe ejecutivo completo.

## DATOS DEL PERÍODO: ${periodDescription}

### RESUMEN GENERAL
- Total de partes: ${stats.totalReports}
- Partes completados: ${stats.completedReports}
- Partes aprobados: ${stats.approvedReports}
- Rango de fechas: ${stats.dateRange.earliest} a ${stats.dateRange.latest}

### TOTALES DE RECURSOS
- Horas de mano de obra: ${stats.totals.workHours.toFixed(1)}h (${stats.totals.workersCount} registros)
- Horas de maquinaria: ${stats.totals.machineryHours.toFixed(1)}h (${stats.totals.machineryCount} registros)
- Coste de materiales: ${stats.totals.materialCost.toFixed(2)}€ (${stats.totals.materialItems} items)
- Coste subcontratas: ${stats.totals.subcontractCost.toFixed(2)}€ (${stats.totals.subcontractWorkers} trabajadores)
- Horas de encargados: ${stats.totals.foremanHours.toFixed(1)}h

### DESGLOSE POR OBRA
${Object.entries(stats.byWork).map(([work, data]: [string, any]) => 
  `- ${work}: ${data.reportCount} partes, ${data.workHours.toFixed(1)}h trabajo, ${data.materialCost.toFixed(2)}€ materiales`
).join('\n')}

### TOP 10 EMPRESAS POR HORAS
${Object.entries(stats.byCompany)
  .sort((a: any, b: any) => (b[1].workHours + b[1].machineryHours) - (a[1].workHours + a[1].machineryHours))
  .slice(0, 10)
  .map(([company, data]: [string, any]) => 
    `- ${company}: ${(data.workHours + data.machineryHours).toFixed(1)}h total`
  ).join('\n')}

### TOP 5 PROVEEDORES DE MATERIALES
${Object.entries(stats.bySupplier)
  .sort((a: any, b: any) => b[1].materialCost - a[1].materialCost)
  .slice(0, 5)
  .map(([supplier, data]: [string, any]) => 
    `- ${supplier}: ${data.materialCost.toFixed(2)}€ (${data.itemCount} items)`
  ).join('\n')}

### DISTRIBUCIÓN POR DÍA DE LA SEMANA
${Object.entries(stats.byDayOfWeek).map(([day, count]) => `- ${day}: ${count} partes`).join('\n')}

### ANOMALÍAS DETECTADAS
${anomalies.length === 0 ? 'No se detectaron anomalías significativas.' : anomalies.map(a => 
  `⚠️ ${a.title}: ${a.description}${a.affectedItems ? '\n  Ejemplos: ' + a.affectedItems.slice(0, 3).join(', ') : ''}`
).join('\n')}

---

GENERA UN INFORME EJECUTIVO EN ESPAÑOL con las siguientes secciones (usa markdown):

## 1. RESUMEN EJECUTIVO
Un párrafo con los puntos más relevantes del período analizado.

## 2. ANÁLISIS DE PRODUCTIVIDAD
- Evalúa la distribución de horas entre obras
- Identifica patrones de trabajo
- Calcula métricas clave (horas promedio por parte, etc.)

## 3. ANÁLISIS ECONÓMICO
- Desglose de costes principales
- Identificación de los mayores centros de coste
- Comparativa entre categorías

## 4. ANÁLISIS DE RECURSOS HUMANOS
- Distribución de empresas y trabajadores
- Carga de trabajo de encargados
- Concentración de recursos

## 5. PROBLEMAS DETECTADOS
- Lista de anomalías e incongruencias encontradas
- Posibles errores en los datos
- Áreas que requieren revisión

## 6. CONCLUSIONES
- Puntos fuertes identificados
- Áreas de mejora
- Tendencias observadas

## 7. RECOMENDACIONES
- Acciones correctivas para los problemas detectados
- Sugerencias de optimización
- Próximos pasos recomendados

Sé específico, usa datos numéricos concretos, y formula recomendaciones accionables.`;
}

const handler = async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { workReports, filters, organizationId } = await req.json();

    if (!workReports || !Array.isArray(workReports)) {
      return new Response(
        JSON.stringify({ error: "workReports array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize reports
    const normalizedReports: WorkReport[] = workReports.map(r => ({
      id: r.id,
      date: r.date,
      workName: r.workName || r.work_name || '',
      workNumber: r.workNumber || r.work_number || '',
      foreman: r.foreman || '',
      foremanHours: r.foremanHours || r.foreman_hours || 0,
      siteManager: r.siteManager || r.site_manager || '',
      status: r.status || 'completed',
      approved: r.approved || false,
      workGroups: r.workGroups || r.work_groups || [],
      machineryGroups: r.machineryGroups || r.machinery_groups || [],
      materialGroups: r.materialGroups || r.material_groups || [],
      subcontractGroups: r.subcontractGroups || r.subcontract_groups || [],
      observations: r.observations || '',
    }));

    // Calculate statistics
    const stats = calculateStatistics(normalizedReports);
    
    // Detect anomalies
    const anomalies = detectAnomalies(normalizedReports, stats);

    // Prepare period description
    const periodDescription = filters?.period || 
      `${stats.dateRange.earliest} al ${stats.dateRange.latest}`;

    // Call AI for analysis
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const prompt = generateAnalysisPrompt(stats, anomalies, periodDescription);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { 
            role: "system", 
            content: "Eres un experto analista de gestión de obras de construcción. Genera informes ejecutivos profesionales, detallados y accionables en español." 
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiAnalysis = aiData.choices?.[0]?.message?.content || '';

    // Prepare chart data for PDF
    const chartData = {
      // Monthly trends
      monthlyTrends: Object.entries(stats.byMonth)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, data]: [string, any]) => ({
          month,
          workHours: data.workHours,
          machineryHours: data.machineryHours,
          materialCost: data.materialCost,
          subcontractCost: data.subcontractCost,
          reports: data.reports,
        })),
      
      // Cost distribution
      costDistribution: [
        { name: 'Mano de Obra', value: stats.totals.workHours * 25, color: '#6E8F56' }, // Estimate cost
        { name: 'Maquinaria', value: stats.totals.machineryHours * 50, color: '#4A7C59' },
        { name: 'Materiales', value: stats.totals.materialCost, color: '#8B4513' },
        { name: 'Subcontratas', value: stats.totals.subcontractCost, color: '#2F4F4F' },
      ],
      
      // Top companies
      topCompanies: Object.entries(stats.byCompany)
        .sort((a: any, b: any) => (b[1].workHours + b[1].machineryHours) - (a[1].workHours + a[1].machineryHours))
        .slice(0, 10)
        .map(([company, data]: [string, any]) => ({
          company,
          workHours: data.workHours,
          machineryHours: data.machineryHours,
          total: data.workHours + data.machineryHours,
        })),
      
      // Top works
      topWorks: Object.entries(stats.byWork)
        .sort((a: any, b: any) => b[1].reportCount - a[1].reportCount)
        .slice(0, 10)
        .map(([work, data]: [string, any]) => ({
          work,
          reports: data.reportCount,
          workHours: data.workHours,
          materialCost: data.materialCost,
        })),
      
      // Day of week distribution
      dayDistribution: Object.entries(stats.byDayOfWeek)
        .map(([day, count]) => ({ day, count: count as number })),
    };

    return new Response(
      JSON.stringify({
        success: true,
        statistics: stats,
        anomalies,
        aiAnalysis,
        chartData,
        periodDescription,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating summary report:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
export default handler;

