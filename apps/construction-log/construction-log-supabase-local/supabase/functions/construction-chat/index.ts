import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maximum sizes for validation
const MAX_MESSAGE_LENGTH = 50000; // 50KB per message
const MAX_MESSAGES = 50;
const MAX_CONTEXT_ITEMS = 500;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB per image
const MAX_IMAGES_PER_MESSAGE = 10;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(MAX_MESSAGE_LENGTH, "Message too long"),
  images: z.array(z.string().max(MAX_IMAGE_SIZE, "Image too large")).max(MAX_IMAGES_PER_MESSAGE).optional(),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).max(MAX_MESSAGES, "Too many messages"),
  workReportsContext: z.array(z.any()).max(MAX_CONTEXT_ITEMS).optional(),
  advancedReportsContext: z.any().optional(),
  accessControlContext: z.array(z.any()).max(MAX_CONTEXT_ITEMS).optional(),
  inventoryContext: z.array(z.any()).max(MAX_CONTEXT_ITEMS).optional(),
  calendarTasksContext: z.any().optional(),
});

// Función para calcular estadísticas precisas de los partes
function calculatePreciseStatistics(workReports: any[]) {
  if (!workReports || workReports.length === 0) {
    return {
      totalReports: 0,
      summary: "No hay partes de trabajo disponibles.",
      byWork: {},
      byCompany: {},
      byDate: {},
      totals: {
        workHours: 0,
        machineryHours: 0,
        materialCost: 0,
        subcontractHours: 0,
        subcontractCost: 0,
      }
    };
  }

  const stats = {
    totalReports: workReports.length,
    completedReports: 0,
    pendingReports: 0,
    approvedReports: 0,
    byWork: {} as Record<string, any>,
    byCompany: {} as Record<string, { workHours: number; machineryHours: number; reports: number }>,
    bySupplier: {} as Record<string, { materialCost: number; itemCount: number }>,
    byDate: {} as Record<string, number>,
    byMonth: {} as Record<string, number>,
    totals: {
      workHours: 0,
      workersCount: 0,
      machineryHours: 0,
      machineryCount: 0,
      materialCost: 0,
      materialItemCount: 0,
      subcontractHours: 0,
      subcontractWorkers: 0,
      subcontractCost: 0,
    },
    foremanHours: {} as Record<string, number>,
    siteManagers: new Set<string>(),
    foremen: new Set<string>(),
    dateRange: {
      earliest: '',
      latest: '',
    }
  };

  // Ordenar por fecha
  const sortedReports = [...workReports].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (sortedReports.length > 0) {
    stats.dateRange.earliest = sortedReports[0].date;
    stats.dateRange.latest = sortedReports[sortedReports.length - 1].date;
  }

  for (const report of workReports) {
    // Contadores de estado
    if (report.status === 'completed') stats.completedReports++;
    else stats.pendingReports++;
    if (report.approved) stats.approvedReports++;

    // Por fecha
    const date = report.date;
    stats.byDate[date] = (stats.byDate[date] || 0) + 1;

    // Por mes
    const month = date.substring(0, 7); // YYYY-MM
    stats.byMonth[month] = (stats.byMonth[month] || 0) + 1;

    // Por obra
    const workKey = `${report.workNumber} - ${report.workName}`;
    if (!stats.byWork[workKey]) {
      stats.byWork[workKey] = {
        reportCount: 0,
        workHours: 0,
        machineryHours: 0,
        materialCost: 0,
        subcontractCost: 0,
        companies: new Set<string>(),
        dates: [],
      };
    }
    stats.byWork[workKey].reportCount++;
    stats.byWork[workKey].dates.push(date);

    // Encargados y jefes de obra
    if (report.foreman) stats.foremen.add(report.foreman);
    if (report.siteManager) stats.siteManagers.add(report.siteManager);

    // Horas de encargado
    if (report.foreman && report.foremanHours) {
      const foremanKey = report.foreman;
      stats.foremanHours[foremanKey] = (stats.foremanHours[foremanKey] || 0) + Number(report.foremanHours || 0);
    }

    // TRABAJO - Cálculo preciso
    if (report.workGroups && Array.isArray(report.workGroups)) {
      for (const group of report.workGroups) {
        const company = group.company || 'Sin empresa';
        if (!stats.byCompany[company]) {
          stats.byCompany[company] = { workHours: 0, machineryHours: 0, reports: 0 };
        }
        stats.byCompany[company].reports++;
        stats.byWork[workKey].companies.add(company);

        if (group.items && Array.isArray(group.items)) {
          for (const item of group.items) {
            const hours = Number(item.hours) || 0;
            stats.totals.workHours += hours;
            stats.totals.workersCount++;
            stats.byCompany[company].workHours += hours;
            stats.byWork[workKey].workHours += hours;
          }
        }
      }
    }

    // MAQUINARIA - Cálculo preciso
    if (report.machineryGroups && Array.isArray(report.machineryGroups)) {
      for (const group of report.machineryGroups) {
        const company = group.company || 'Sin empresa';
        if (!stats.byCompany[company]) {
          stats.byCompany[company] = { workHours: 0, machineryHours: 0, reports: 0 };
        }

        if (group.items && Array.isArray(group.items)) {
          for (const item of group.items) {
            const hours = Number(item.hours) || 0;
            stats.totals.machineryHours += hours;
            stats.totals.machineryCount++;
            stats.byCompany[company].machineryHours += hours;
            stats.byWork[workKey].machineryHours += hours;
          }
        }
      }
    }

    // MATERIALES - Cálculo preciso
    if (report.materialGroups && Array.isArray(report.materialGroups)) {
      for (const group of report.materialGroups) {
        const supplier = group.supplier || 'Sin proveedor';
        if (!stats.bySupplier[supplier]) {
          stats.bySupplier[supplier] = { materialCost: 0, itemCount: 0 };
        }

        if (group.items && Array.isArray(group.items)) {
          for (const item of group.items) {
            const total = Number(item.total) || 0;
            stats.totals.materialCost += total;
            stats.totals.materialItemCount++;
            stats.bySupplier[supplier].materialCost += total;
            stats.bySupplier[supplier].itemCount++;
            stats.byWork[workKey].materialCost += total;
          }
        }
      }
    }

    // SUBCONTRATAS - Cálculo preciso
    if (report.subcontractGroups && Array.isArray(report.subcontractGroups)) {
      for (const group of report.subcontractGroups) {
        if (group.items && Array.isArray(group.items)) {
          for (const item of group.items) {
            const hours = Number(item.hours) || 0;
            const workers = Number(item.workers) || 0;
            const total = Number(item.total) || 0;
            stats.totals.subcontractHours += hours;
            stats.totals.subcontractWorkers += workers;
            stats.totals.subcontractCost += total;
            stats.byWork[workKey].subcontractCost += total;
          }
        }
      }
    }
  }

  // Convertir Sets a arrays para serialización
  for (const key of Object.keys(stats.byWork)) {
    stats.byWork[key].companies = Array.from(stats.byWork[key].companies);
  }

  return {
    ...stats,
    siteManagers: Array.from(stats.siteManagers),
    foremen: Array.from(stats.foremen),
  };
}

// Función para calcular tendencias y patrones
function calculateTrendsAndPredictions(stats: any, workReports: any[]) {
  if (!workReports || workReports.length < 3) {
    return {
      hasSufficientData: false,
      message: "Se necesitan al menos 3 partes de trabajo para análisis de tendencias."
    };
  }

  const trends: any = {
    hasSufficientData: true,
    weeklyPatterns: {} as Record<string, { avgHours: number; avgReports: number }>,
    monthlyTrends: [] as any[],
    companyPatterns: {} as Record<string, any>,
    productivityTrends: {
      hoursPerReport: 0,
      trend: 'stable',
      change: 0
    },
    predictions: {
      nextMonthEstimate: { workHours: 0, reports: 0 },
      topCompaniesNextMonth: [] as string[],
      materialCostEstimate: 0,
      recommendations: [] as string[]
    },
    anomalies: [] as string[],
    insights: [] as string[]
  };

  // Agrupar por semana
  const weeklyData: Record<string, { hours: number; reports: number; dates: string[] }> = {};
  const monthlyData: Record<string, { 
    hours: number; 
    reports: number; 
    machineryHours: number;
    materialCost: number;
    subcontractCost: number;
  }> = {};

  // Datos por día de la semana (0=Domingo, 6=Sábado)
  const dayOfWeekData: Record<number, { hours: number; count: number }> = {
    0: { hours: 0, count: 0 }, 1: { hours: 0, count: 0 }, 2: { hours: 0, count: 0 },
    3: { hours: 0, count: 0 }, 4: { hours: 0, count: 0 }, 5: { hours: 0, count: 0 },
    6: { hours: 0, count: 0 }
  };

  // Datos por empresa a lo largo del tiempo
  const companyTimeSeries: Record<string, { months: string[]; hours: number[] }> = {};

  for (const report of workReports) {
    const date = new Date(report.date);
    const weekKey = getWeekKey(date);
    const monthKey = report.date.substring(0, 7);
    const dayOfWeek = date.getDay();

    // Calcular horas totales del parte
    let reportHours = 0;
    if (report.workGroups) {
      for (const group of report.workGroups) {
        for (const item of group.items || []) {
          reportHours += Number(item.hours) || 0;
        }
      }
    }

    // Por semana
    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = { hours: 0, reports: 0, dates: [] };
    }
    weeklyData[weekKey].hours += reportHours;
    weeklyData[weekKey].reports++;
    weeklyData[weekKey].dates.push(report.date);

    // Por mes
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { hours: 0, reports: 0, machineryHours: 0, materialCost: 0, subcontractCost: 0 };
    }
    monthlyData[monthKey].hours += reportHours;
    monthlyData[monthKey].reports++;

    // Maquinaria mensual
    if (report.machineryGroups) {
      for (const group of report.machineryGroups) {
        for (const item of group.items || []) {
          monthlyData[monthKey].machineryHours += Number(item.hours) || 0;
        }
      }
    }

    // Materiales mensual
    if (report.materialGroups) {
      for (const group of report.materialGroups) {
        for (const item of group.items || []) {
          monthlyData[monthKey].materialCost += Number(item.total) || 0;
        }
      }
    }

    // Subcontratas mensual
    if (report.subcontractGroups) {
      for (const group of report.subcontractGroups) {
        for (const item of group.items || []) {
          monthlyData[monthKey].subcontractCost += Number(item.total) || 0;
        }
      }
    }

    // Por día de la semana
    dayOfWeekData[dayOfWeek].hours += reportHours;
    dayOfWeekData[dayOfWeek].count++;

    // Por empresa
    if (report.workGroups) {
      for (const group of report.workGroups) {
        const company = group.company || 'Sin empresa';
        if (!companyTimeSeries[company]) {
          companyTimeSeries[company] = { months: [], hours: [] };
        }
        let companyHours = 0;
        for (const item of group.items || []) {
          companyHours += Number(item.hours) || 0;
        }
        const existingIdx = companyTimeSeries[company].months.indexOf(monthKey);
        if (existingIdx >= 0) {
          companyTimeSeries[company].hours[existingIdx] += companyHours;
        } else {
          companyTimeSeries[company].months.push(monthKey);
          companyTimeSeries[company].hours.push(companyHours);
        }
      }
    }
  }

  // Patrones por día de la semana
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  for (let i = 0; i < 7; i++) {
    if (dayOfWeekData[i].count > 0) {
      trends.weeklyPatterns[dayNames[i]] = {
        avgHours: dayOfWeekData[i].hours / dayOfWeekData[i].count,
        avgReports: dayOfWeekData[i].count / Object.keys(weeklyData).length
      };
    }
  }

  // Tendencias mensuales ordenadas
  const sortedMonths = Object.entries(monthlyData).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [month, data] of sortedMonths) {
    trends.monthlyTrends.push({
      month,
      ...data,
      avgHoursPerReport: data.reports > 0 ? data.hours / data.reports : 0
    });
  }

  // Calcular tendencia de productividad (últimos 3 meses vs anteriores)
  if (trends.monthlyTrends.length >= 2) {
    const recentMonths = trends.monthlyTrends.slice(-3);
    const olderMonths = trends.monthlyTrends.slice(0, -3);
    
    if (olderMonths.length > 0) {
      const recentAvg = recentMonths.reduce((sum: number, m: any) => sum + m.avgHoursPerReport, 0) / recentMonths.length;
      const olderAvg = olderMonths.reduce((sum: number, m: any) => sum + m.avgHoursPerReport, 0) / olderMonths.length;
      
      trends.productivityTrends.hoursPerReport = recentAvg;
      trends.productivityTrends.change = ((recentAvg - olderAvg) / olderAvg) * 100;
      trends.productivityTrends.trend = trends.productivityTrends.change > 5 ? 'increasing' : 
                                        trends.productivityTrends.change < -5 ? 'decreasing' : 'stable';
    }
  }

  // Predicciones para el próximo mes
  if (trends.monthlyTrends.length >= 2) {
    const lastThreeMonths = trends.monthlyTrends.slice(-3);
    const avgHours = lastThreeMonths.reduce((sum: number, m: any) => sum + m.hours, 0) / lastThreeMonths.length;
    const avgReports = lastThreeMonths.reduce((sum: number, m: any) => sum + m.reports, 0) / lastThreeMonths.length;
    const avgMaterialCost = lastThreeMonths.reduce((sum: number, m: any) => sum + m.materialCost, 0) / lastThreeMonths.length;
    
    trends.predictions.nextMonthEstimate.workHours = Math.round(avgHours);
    trends.predictions.nextMonthEstimate.reports = Math.round(avgReports);
    trends.predictions.materialCostEstimate = avgMaterialCost;
  }

  // Top empresas esperadas
  const companyTotals: Record<string, number> = {};
  for (const [company, data] of Object.entries(companyTimeSeries)) {
    const lastMonths = (data as any).hours.slice(-3);
    companyTotals[company] = lastMonths.reduce((sum: number, h: number) => sum + h, 0) / lastMonths.length;
  }
  trends.predictions.topCompaniesNextMonth = Object.entries(companyTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([company]) => company);

  // Patrones por empresa
  for (const [company, data] of Object.entries(companyTimeSeries)) {
    const hours = (data as any).hours;
    if (hours.length >= 2) {
      const trend = hours[hours.length - 1] > hours[hours.length - 2] ? 'growing' : 
                   hours[hours.length - 1] < hours[hours.length - 2] ? 'declining' : 'stable';
      trends.companyPatterns[company] = {
        avgMonthlyHours: hours.reduce((a: number, b: number) => a + b, 0) / hours.length,
        trend,
        monthsActive: hours.length
      };
    }
  }

  // Detectar anomalías
  const avgHoursPerReport = stats.totals.workHours / stats.totalReports;
  for (const report of workReports) {
    let reportHours = 0;
    if (report.workGroups) {
      for (const group of report.workGroups) {
        for (const item of group.items || []) {
          reportHours += Number(item.hours) || 0;
        }
      }
    }
    if (reportHours > avgHoursPerReport * 3) {
      trends.anomalies.push(`Parte ${report.date} (${report.workName}): ${reportHours}h - muy por encima del promedio`);
    }
    if (reportHours < avgHoursPerReport * 0.3 && reportHours > 0) {
      trends.anomalies.push(`Parte ${report.date} (${report.workName}): ${reportHours}h - muy por debajo del promedio`);
    }
  }

  // Generar insights automáticos
  const bestDay = Object.entries(trends.weeklyPatterns)
    .sort((a: any, b: any) => b[1].avgHours - a[1].avgHours)[0];
  if (bestDay) {
    trends.insights.push(`📈 El día más productivo es ${bestDay[0]} con ${(bestDay[1] as any).avgHours.toFixed(1)}h promedio por parte.`);
  }

  if (trends.productivityTrends.trend === 'increasing') {
    trends.insights.push(`📈 La productividad ha aumentado un ${Math.abs(trends.productivityTrends.change).toFixed(1)}% en los últimos meses.`);
  } else if (trends.productivityTrends.trend === 'decreasing') {
    trends.insights.push(`📉 La productividad ha disminuido un ${Math.abs(trends.productivityTrends.change).toFixed(1)}% en los últimos meses.`);
  }

  // Recomendaciones
  if (trends.anomalies.length > 0) {
    trends.predictions.recommendations.push("⚠️ Revisar partes con horas atípicas para validar datos.");
  }
  if (trends.productivityTrends.trend === 'decreasing') {
    trends.predictions.recommendations.push("📊 Analizar causas de la disminución de productividad.");
  }
  if (Object.keys(companyTotals).length > 10) {
    trends.predictions.recommendations.push("🏢 Considerar consolidar subcontratas para mayor eficiencia.");
  }

  return trends;
}

// Helper para obtener clave de semana
function getWeekKey(date: Date): string {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

// Función para generar un resumen en texto de los datos
function generateDataSummary(stats: any, workReports: any[], trends: any) {
  const lines: string[] = [];
  
  lines.push(`## 📊 RESUMEN ESTADÍSTICO PRECISO (Calculado del backend)`);
  lines.push(`### Periodo: ${stats.dateRange.earliest} a ${stats.dateRange.latest}`);
  lines.push(``);
  lines.push(`### Totales Generales`);
  lines.push(`- **Total de partes**: ${stats.totalReports}`);
  lines.push(`- **Partes completados**: ${stats.completedReports}`);
  lines.push(`- **Partes pendientes/incompletos**: ${stats.pendingReports}`);
  lines.push(`- **Partes aprobados**: ${stats.approvedReports}`);
  lines.push(``);
  lines.push(`### Horas y Recursos`);
  lines.push(`- **Horas de trabajo (personal)**: ${stats.totals.workHours.toFixed(2)} horas (${stats.totals.workersCount} registros de trabajadores)`);
  lines.push(`- **Horas de maquinaria**: ${stats.totals.machineryHours.toFixed(2)} horas (${stats.totals.machineryCount} registros)`);
  lines.push(`- **Coste de materiales**: ${stats.totals.materialCost.toFixed(2)} € (${stats.totals.materialItemCount} items)`);
  lines.push(`- **Horas de subcontratas**: ${stats.totals.subcontractHours.toFixed(2)} horas (${stats.totals.subcontractWorkers} trabajadores)`);
  lines.push(`- **Coste de subcontratas**: ${stats.totals.subcontractCost.toFixed(2)} €`);
  lines.push(``);
  
  // Por obra
  lines.push(`### Desglose por Obra`);
  const sortedWorks = Object.entries(stats.byWork)
    .sort((a: any, b: any) => b[1].reportCount - a[1].reportCount);
  
  for (const [workName, data] of sortedWorks as [string, any][]) {
    lines.push(`#### ${workName}`);
    lines.push(`- Partes: ${data.reportCount}`);
    lines.push(`- Horas trabajo: ${data.workHours.toFixed(2)}`);
    lines.push(`- Horas maquinaria: ${data.machineryHours.toFixed(2)}`);
    lines.push(`- Coste materiales: ${data.materialCost.toFixed(2)} €`);
    lines.push(`- Coste subcontratas: ${data.subcontractCost.toFixed(2)} €`);
    lines.push(`- Empresas: ${data.companies.join(', ') || 'Ninguna'}`);
  }
  lines.push(``);

  // Por empresa
  lines.push(`### Desglose por Empresa`);
  const sortedCompanies = Object.entries(stats.byCompany)
    .sort((a: any, b: any) => (b[1].workHours + b[1].machineryHours) - (a[1].workHours + a[1].machineryHours));
  
  for (const [company, data] of sortedCompanies as [string, any][]) {
    lines.push(`- **${company}**: ${data.workHours.toFixed(2)}h trabajo, ${data.machineryHours.toFixed(2)}h maquinaria (${data.reports} partes)`);
  }
  lines.push(``);

  // Por proveedor
  if (Object.keys(stats.bySupplier).length > 0) {
    lines.push(`### Desglose por Proveedor de Materiales`);
    const sortedSuppliers = Object.entries(stats.bySupplier)
      .sort((a: any, b: any) => b[1].materialCost - a[1].materialCost);
    
    for (const [supplier, data] of sortedSuppliers as [string, any][]) {
      lines.push(`- **${supplier}**: ${data.materialCost.toFixed(2)} € (${data.itemCount} items)`);
    }
    lines.push(``);
  }

  // Horas de encargados
  if (Object.keys(stats.foremanHours).length > 0) {
    lines.push(`### Horas por Encargado`);
    const sortedForemen = Object.entries(stats.foremanHours)
      .sort((a: any, b: any) => b[1] - a[1]);
    
    for (const [foreman, hours] of sortedForemen as [string, number][]) {
      lines.push(`- **${foreman}**: ${hours.toFixed(2)} horas`);
    }
    lines.push(``);
  }

  // Por mes
  lines.push(`### Partes por Mes`);
  const sortedMonths = Object.entries(stats.byMonth).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [month, count] of sortedMonths) {
    lines.push(`- ${month}: ${count} partes`);
  }
  lines.push(``);

  // Personal
  lines.push(`### Personal Involucrado`);
  lines.push(`- **Encargados**: ${stats.foremen.join(', ') || 'Ninguno registrado'}`);
  lines.push(`- **Jefes de obra**: ${stats.siteManagers.join(', ') || 'Ninguno registrado'}`);
  lines.push(``);

  // === TENDENCIAS Y PREDICCIONES ===
  if (trends.hasSufficientData) {
    lines.push(`## 📈 ANÁLISIS DE TENDENCIAS Y PREDICCIONES`);
    lines.push(``);

    // Patrones por día de la semana
    if (Object.keys(trends.weeklyPatterns).length > 0) {
      lines.push(`### Patrones por Día de la Semana`);
      for (const [day, pattern] of Object.entries(trends.weeklyPatterns) as [string, any][]) {
        lines.push(`- **${day}**: ${pattern.avgHours.toFixed(1)}h promedio por parte`);
      }
      lines.push(``);
    }

    // Tendencia de productividad
    lines.push(`### Tendencia de Productividad`);
    const trendEmoji = trends.productivityTrends.trend === 'increasing' ? '📈' :
                       trends.productivityTrends.trend === 'decreasing' ? '📉' : '➡️';
    const trendText = trends.productivityTrends.trend === 'increasing' ? 'AUMENTANDO' :
                      trends.productivityTrends.trend === 'decreasing' ? 'DISMINUYENDO' : 'ESTABLE';
    lines.push(`- **Estado actual**: ${trendEmoji} ${trendText} (${trends.productivityTrends.change.toFixed(1)}%)`);
    lines.push(`- **Promedio horas/parte**: ${trends.productivityTrends.hoursPerReport.toFixed(1)}h`);
    lines.push(``);

    // Predicciones
    lines.push(`### 🔮 Predicciones para el Próximo Mes`);
    lines.push(`- **Horas de trabajo estimadas**: ~${trends.predictions.nextMonthEstimate.workHours}h`);
    lines.push(`- **Partes estimados**: ~${trends.predictions.nextMonthEstimate.reports}`);
    lines.push(`- **Coste materiales estimado**: ~${trends.predictions.materialCostEstimate.toFixed(2)} €`);
    if (trends.predictions.topCompaniesNextMonth.length > 0) {
      lines.push(`- **Empresas con más actividad esperada**: ${trends.predictions.topCompaniesNextMonth.join(', ')}`);
    }
    lines.push(``);

    // Patrones por empresa
    if (Object.keys(trends.companyPatterns).length > 0) {
      lines.push(`### Tendencias por Empresa`);
      const sortedPatterns = Object.entries(trends.companyPatterns)
        .sort((a: any, b: any) => b[1].avgMonthlyHours - a[1].avgMonthlyHours)
        .slice(0, 10);
      
      for (const [company, pattern] of sortedPatterns as [string, any][]) {
        const emoji = pattern.trend === 'growing' ? '📈' : pattern.trend === 'declining' ? '📉' : '➡️';
        lines.push(`- **${company}**: ${pattern.avgMonthlyHours.toFixed(1)}h/mes promedio ${emoji}`);
      }
      lines.push(``);
    }

    // Insights automáticos
    if (trends.insights.length > 0) {
      lines.push(`### 💡 Insights Automáticos`);
      for (const insight of trends.insights) {
        lines.push(`- ${insight}`);
      }
      lines.push(``);
    }

    // Anomalías detectadas
    if (trends.anomalies.length > 0) {
      lines.push(`### ⚠️ Anomalías Detectadas (${trends.anomalies.length})`);
      for (const anomaly of trends.anomalies.slice(0, 10)) {
        lines.push(`- ${anomaly}`);
      }
      if (trends.anomalies.length > 10) {
        lines.push(`- ... y ${trends.anomalies.length - 10} más`);
      }
      lines.push(``);
    }

    // Recomendaciones
    if (trends.predictions.recommendations.length > 0) {
      lines.push(`### 📋 Recomendaciones`);
      for (const rec of trends.predictions.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push(``);
    }
  }

  return lines.join('\n');
}

const handler = async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse and validate input
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Formato de solicitud inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.errors.length, 'errors');
      return new Response(
        JSON.stringify({ error: "Datos de entrada inválidos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, workReportsContext, advancedReportsContext, accessControlContext, inventoryContext, calendarTasksContext } = validationResult.data;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      console.error("API key not configured");
      return new Response(
        JSON.stringify({ error: "Error de configuración del servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calcular estadísticas precisas ANTES de enviar a la IA
    const preciseStats = calculatePreciseStatistics(workReportsContext || []);
    const trendAnalysis = calculateTrendsAndPredictions(preciseStats, workReportsContext || []);
    const dataSummary = generateDataSummary(preciseStats, workReportsContext || [], trendAnalysis);

    // Build system prompt with context
    let systemPrompt = `Eres un asistente especializado EXCLUSIVAMENTE en construcción y gestión de obras.
Tu expertise abarca obra civil, residencial, industrial, lineal, infraestructuras, edificación y todos los aspectos técnicos relacionados.

## ⚠️ INSTRUCCIONES CRÍTICAS PARA CÁLCULOS Y ANÁLISIS

### REGLA DE ORO: USA SIEMPRE LOS DATOS PRE-CALCULADOS
Los datos que recibes en "RESUMEN ESTADÍSTICO PRECISO" han sido **calculados directamente desde la base de datos** con precisión matemática.
- **NUNCA** intentes recalcular totales manualmente
- **SIEMPRE** usa los valores del resumen estadístico para totales y agregados
- **CITA** los números exactamente como aparecen en el resumen
- Si hay discrepancia entre tu cálculo mental y el resumen, **EL RESUMEN SIEMPRE ES CORRECTO**

### FORMATO DE NÚMEROS
- Usa siempre 2 decimales para horas y costes: X.XX
- Usa el símbolo € para costes
- Usa "h" o "horas" para tiempos

### ESTRUCTURA DE RESPUESTAS NUMÉRICAS
Cuando respondas preguntas sobre datos, sigue este formato:
1. **Dato exacto**: Proporciona el número del resumen estadístico
2. **Fuente**: Indica que viene del análisis de X partes
3. **Desglose** (si aplica): Muestra subcategorías si existen

### VALIDACIÓN CRUZADA
Si el usuario pide un dato específico:
1. Busca primero en el RESUMEN ESTADÍSTICO PRECISO
2. Si no está ahí, busca en los datos detallados de partes individuales
3. Si no encuentras el dato, indícalo claramente

## 📚 AYUDA SOBRE USO DE LA APLICACIÓN
Puedes ayudar a los usuarios a entender cómo usar la aplicación explicando estas funcionalidades:

### 📋 GESTIÓN DE PARTES DE TRABAJO
- **Crear partes**: Accede a "Partes de Trabajo" > Botón "+" > Selecciona obra y fecha > Añade personal, maquinaria, materiales, subcontratas según corresponda > Guarda
- **Editar partes**: Solo el creador o administradores pueden editarlos antes de ser aprobados
- **Aprobar partes**: Los site managers y administradores pueden aprobar/rechazar partes completados
- **Firmas**: Los partes pueden incluir firmas digitales de encargado y jefe de obra
- **Exportar**: Se pueden exportar a PDF o Excel (semanales/mensuales)

### 👥 GESTIÓN DE USUARIOS
- **Añadir usuarios**: Settings > Gestión de Usuarios > Añadir Usuario > Asignar rol y obras
- **Roles disponibles**:
  - **Master**: Control total sobre la organización, actualizaciones y configuración avanzada
  - **Admin**: Gestión completa de usuarios, obras, partes y configuración de la empresa
  - **Site Manager**: Supervisión de obras, aprobación de partes, gestión de encargados
  - **Foreman**: Creación de partes de trabajo para sus obras asignadas
  - **Ofi**: Solo lectura de partes aprobados y firmados, análisis económico
  - **Reader**: Solo lectura de partes básicos
- **Asignar a obras**: Los usuarios solo ven las obras a las que están asignados (excepto admin/master)

### 🏢 GESTIÓN DE ORGANIZACIÓN
- **Datos de empresa**: Settings > Configuración Organización > Editar datos fiscales, contacto, dirección
- **Personalización (Branding)**: Settings > Branding > Subir logo, elegir color corporativo
- **Código de invitación**: Comparte el código para que nuevos usuarios se unan a tu organización
- **Suscripción**: Ver estado de suscripción, periodo de prueba, usuarios disponibles

### 🏗️ GESTIÓN DE OBRAS
- **Crear obras**: Obras > Nueva Obra > Completar datos (nombre, número, promotor, presupuesto, fechas, contacto)
- **Asignar personal**: Solo site managers y admins pueden asignar usuarios a obras
- **Seguimiento**: Ver partes de trabajo asociados a cada obra

### 📦 INVENTARIO DE MATERIALES
- **Añadir items**: Inventario > Seleccionar obra > Añadir Material/Herramienta > Completar datos
- **Tipos**: Material (consumibles) o Herramienta (reutilizables)
- **Escanear albaranes**: Usar cámara para reconocer automáticamente datos de albaranes con OCR
- **Análisis IA**: Detección automática de errores en clasificación, unidades y categorías

### 🔐 CONTROL DE ACCESOS
- **Registrar accesos**: Control de Accesos > Nueva Entrada > Seleccionar tipo (Personal/Maquinaria)
- **Exportar**: Generar informes PDF de accesos por fecha

### 📊 ANÁLISIS ECONÓMICO
- **Generar informes**: Desde un parte de trabajo > Análisis Económico > Ver desglose de costes
- **Guardar informes**: Guardar análisis para comparativas futuras

### 🤖 ASISTENTE IA DE PLANOS
- **Analizar planos**: Botón flotante del asistente > Subir imagen/PDF de plano
- **Consultas de datos**: Preguntar sobre partes de trabajo, inventario, controles de acceso

## CAPACIDADES ESPECIALES DE ANÁLISIS DE PLANOS Y DOCUMENTOS
Cuando recibas imágenes de planos de construcción, facturas, o albaranes:

### 📐 ANÁLISIS GEOMÉTRICO
- Identifica todas las dimensiones anotadas
- Reconoce escalas gráficas y numéricas
- Detecta cotas, niveles y referencias

### 📊 MEDICIONES AUTOMÁTICAS
**Hormigón (m³):** Losas, Vigas, Columnas, Zapatas
**Superficies (m²):** Pavimentos, revestimientos, cubiertas
**Lineales (ml):** Perímetros, conducciones, instalaciones

### 📋 FORMATO DE ENTREGA DE MEDICIONES
Presenta siempre las mediciones en tablas Markdown:
| Elemento | Dimensiones | Cantidad | Unidad | Observaciones |
|----------|-------------|----------|--------|---------------|

## TU ÚNICO PROPÓSITO
Analizar, interpretar y responder consultas SOLO sobre:
- **Uso y funcionalidades de la aplicación**
- Partes de trabajo y su información
- Informes económicos y técnicos
- Planos de construcción y mediciones
- Controles de acceso de personal y maquinaria
- Inventario de materiales y herramientas
- Tareas del calendario y recordatorios
- Análisis de rendimientos, costes y productividad
- Comparativas entre partes y periodos
- Cálculos de horas, materiales, maquinaria y subcontratas
- **📈 ANÁLISIS DE TENDENCIAS**: Patrones históricos, evolución temporal, estacionalidad
- **🔮 PREDICCIONES**: Estimaciones futuras basadas en datos históricos
- **💡 RECOMENDACIONES**: Sugerencias de optimización basadas en patrones

## 📈 CAPACIDADES DE ANÁLISIS DE TENDENCIAS Y PREDICCIONES

### ANÁLISIS DE TENDENCIAS
Cuando el usuario pregunte sobre tendencias, patrones o evolución:
1. **Usa la sección "ANÁLISIS DE TENDENCIAS Y PREDICCIONES"** del resumen
2. Explica la tendencia con datos concretos
3. Compara periodos (mensual, semanal)
4. Identifica patrones por día de la semana, empresa, o tipo de trabajo

### PREDICCIONES
Para preguntas sobre estimaciones futuras:
1. Basa las predicciones en los datos de "Predicciones para el Próximo Mes"
2. Indica siempre que son **estimaciones** basadas en patrones históricos
3. Menciona el margen de incertidumbre si hay pocos datos

### DETECCIÓN DE ANOMALÍAS
Cuando se detecten anomalías:
1. Informa proactivamente sobre partes con valores atípicos
2. Sugiere verificar la corrección de los datos
3. Identifica posibles causas (picos de trabajo, errores de entrada)

### INSIGHTS AUTOMÁTICOS
Los insights se generan automáticamente analizando:
- Día más productivo de la semana
- Empresas en crecimiento o declive
- Cambios en productividad
- Patrones de estacionalidad

### RECOMENDACIONES INTELIGENTES
Genera recomendaciones cuando:
- Se detecten anomalías frecuentes
- La productividad esté bajando
- Haya muchas empresas sin consolidar
- Se identifiquen ineficiencias

## FUENTES DE DATOS AUTORIZADAS
1. **RESUMEN ESTADÍSTICO PRECISO** - ⚠️ FUENTE PRINCIPAL para totales y agregados
2. **ANÁLISIS DE TENDENCIAS Y PREDICCIONES** - Para patrones, predicciones e insights
3. "workReportsContext" - Partes de trabajo individuales (para detalles específicos)
4. "advancedReportsContext" - Informes agregados adicionales
5. "accessControlContext" - Controles de acceso
6. "inventoryContext" - Inventario de materiales
7. "calendarTasksContext" - Tareas del calendario
8. Imágenes de planos - Análisis visual

## EJEMPLOS DE CONSULTAS DE TENDENCIAS
El usuario puede preguntar:
- "¿Cuál es la tendencia de productividad?"
- "¿Qué empresas están creciendo?"
- "¿Cuántas horas esperas para el próximo mes?"
- "¿Qué día de la semana trabajamos más?"
- "¿Hay algún patrón en los partes?"
- "Dame un resumen de tendencias"
- "¿Qué recomendaciones tienes?"

## ANÁLISIS Y DETECCIÓN DE DISCREPANCIAS
Verifica consistencia entre:
- Datos individuales vs totales en resumen
- Horas declaradas vs horas calculadas
- Stock inventariado vs materiales consumidos

Si detectas discrepancias:
⚠️ **ALERTA DE DISCREPANCIA DETECTADA**
- Describe la inconsistencia
- Muestra los valores
- Sugiere posibles causas

## FORMATO DE RESPUESTA
Usa Markdown profesional:
- ## Títulos principales
- ### Subtítulos  
- **Negrita** para conceptos clave
- Tablas para datos comparativos
- ⚠️ ✅ ❌ 📐 📊 📈 📉 🔮 💡 para estados/alertas/tendencias

## RESTRICCIONES ABSOLUTAS
❌ NO respondas sobre temas ajenos a construcción
❌ NO inventes datos que no estén en el contexto
❌ NO recalcules totales - usa el resumen estadístico
❌ Si una imagen no es un plano de construcción, indícalo claramente
❌ Las predicciones deben indicarse siempre como estimaciones

Responde SOLO en español, de forma clara, precisa y profesional.`;

    // PRIMERO: Añadir el resumen estadístico preciso (FUENTE PRINCIPAL)
    if (preciseStats.totalReports > 0) {
      systemPrompt += `\n\n${dataSummary}`;
    }

    // Luego los datos detallados para consultas específicas (limitar tamaño)
    if (workReportsContext && workReportsContext.length > 0) {
      const limitedReports = workReportsContext.slice(0, 100); // Limit to 100 reports for context
      systemPrompt += `\n\n## PARTES DE TRABAJO DETALLADOS (${workReportsContext.length} partes)\nUsa estos datos SOLO para consultas específicas sobre partes individuales:\n${JSON.stringify(limitedReports, null, 2)}`;
    }

    if (advancedReportsContext) {
      systemPrompt += `\n\n## INFORMES AVANZADOS AGREGADOS\n${JSON.stringify(advancedReportsContext, null, 2)}`;
    }

    if (accessControlContext && accessControlContext.length > 0) {
      const limitedAccess = accessControlContext.slice(0, 100);
      systemPrompt += `\n\n## CONTROLES DE ACCESO (${accessControlContext.length} registros)\n${JSON.stringify(limitedAccess, null, 2)}`;
    }

    if (inventoryContext && inventoryContext.length > 0) {
      const limitedInventory = inventoryContext.slice(0, 100);
      systemPrompt += `\n\n## INVENTARIO DE MATERIALES (${inventoryContext.length} items)\n${JSON.stringify(limitedInventory, null, 2)}`;
    }

    if (calendarTasksContext) {
      systemPrompt += `\n\n## TAREAS DEL CALENDARIO\n${JSON.stringify(calendarTasksContext, null, 2)}\n\n**IMPORTANTE**: Indica claramente las tareas urgentes o vencidas.`;
    }

    console.log(`[construction-chat] Processing with ${workReportsContext?.length || 0} work reports`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((msg: any) => {
            if (msg.images && msg.images.length > 0) {
              return {
                role: msg.role,
                content: [
                  { type: "text", text: msg.content },
                  ...msg.images.map((img: string) => ({
                    type: "image_url",
                    image_url: { url: img }
                  }))
                ]
              };
            }
            return { role: msg.role, content: msg.content };
          })
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      console.error("AI service error:", response.status);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Límite de solicitudes excedido, intenta de nuevo más tarde." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Servicio temporalmente no disponible" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Error al conectar con el asistente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("construction-chat error:", e instanceof Error ? e.message : 'Unknown error');
    
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
export default handler;

