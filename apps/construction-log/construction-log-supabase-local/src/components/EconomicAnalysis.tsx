import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { WorkReport } from '@/types/workReport';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { exportToExcel } from '@/utils/exportUtils';
import { exportWeeklyReports, exportMonthlyReports } from '@/utils/weeklyMonthlyExportUtils';
import { generateComprehensiveReportPDF } from '@/utils/comprehensiveReportGenerator';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface EconomicAnalysisProps {
  reports: WorkReport[];
}

type PeriodType = 'daily' | 'weekly' | 'monthly';

export const EconomicAnalysis = ({ reports }: EconomicAnalysisProps) => {
  const [periodType, setPeriodType] = useState<PeriodType>('daily');
  const [selectedWork, setSelectedWork] = useState<string>('all');
  const [rentalMachinery, setRentalMachinery] = useState<any[]>([]);

  // Cargar maquinaria de alquiler
  useEffect(() => {
    const loadRentalMachinery = async () => {
      try {
        const { data, error } = await supabase
          .from('work_rental_machinery')
          .select('*')
          .order('delivery_date', { ascending: false });

        if (error) throw error;
        setRentalMachinery(data || []);
      } catch (error) {
        console.error('Error loading rental machinery:', error);
      }
    };

    loadRentalMachinery();
  }, []);

  // Get unique works
  const availableWorks = useMemo(() => {
    const works = new Set(reports.map(r => r.workName).filter(Boolean));
    return Array.from(works).sort();
  }, [reports]);

  // Filter reports by selected work and ONLY completed reports
  const filteredReports = useMemo(() => {
    const completedReports = reports.filter(r => r.status === 'completed'); // Solo partes completados
    if (selectedWork === 'all') return completedReports;
    return completedReports.filter(r => r.workName === selectedWork);
  }, [reports, selectedWork]);

  // Calculate economic totals for a report
  const calculateReportCost = (report: WorkReport): number => {
    let total = 0;

    // Work groups - solo si hay precio
    report.workGroups?.forEach(group => {
      group.items.forEach(item => {
        const hourlyRate = Number(item.hourlyRate) || 0;
        const hours = Number(item.hours) || 0;
        if (hourlyRate > 0) {
          total += hours * hourlyRate;
        }
      });
    });

    // Machinery groups - solo si hay precio
    report.machineryGroups?.forEach(group => {
      group.items.forEach(item => {
        const hourlyRate = Number(item.hourlyRate) || 0;
        const hours = Number(item.hours) || 0;
        if (hourlyRate > 0) {
          total += hours * hourlyRate;
        }
      });
    });

    // Material groups - solo si hay precio
    report.materialGroups?.forEach(group => {
      group.items.forEach(item => {
        const unitPrice = Number(item.unitPrice) || 0;
        const quantity = Number(item.quantity) || 0;
        if (unitPrice > 0) {
          total += quantity * unitPrice;
        }
      });
    });

    // Subcontract groups - solo si hay precio
    report.subcontractGroups?.forEach(group => {
      group.items.forEach(item => {
        const unitType = item.unitType || 'hora';
        if (unitType === 'hora') {
          const hourlyRate = Number(item.hourlyRate) || 0;
          const workers = Number(item.workers) || 0;
          const hours = Number(item.hours) || 0;
          if (hourlyRate > 0) {
            total += workers * hours * hourlyRate;
          }
        } else {
          const unitPrice = Number(item.unitPrice) || 0;
          const quantity = Number(item.quantity) || 0;
          if (unitPrice > 0) {
            total += quantity * unitPrice;
          }
        }
      });
    });

    // Rental machinery desde work_rental_machinery
    const reportWorkIds = new Set([report.workId].filter(Boolean));
    const relevantRental = rentalMachinery.filter(rm => 
      rm.work_id && reportWorkIds.has(rm.work_id)
    );
    
    relevantRental.forEach(item => {
      const deliveryDate = new Date(item.delivery_date);
      const removalDate = item.removal_date ? new Date(item.removal_date) : new Date();
      const reportDate = new Date(report.date);
      
      // Solo incluir si la maquinaria estaba activa en la fecha del reporte
      if (deliveryDate <= reportDate && reportDate <= removalDate) {
        const totalDays = Math.ceil((removalDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
        const dailyRate = Number(item.daily_rate) || 0;
        if (dailyRate > 0) {
          total += totalDays * dailyRate;
        }
      }
    });

    return total;
  };

  // Group reports by period
  const groupedData = useMemo(() => {
    const groups: Record<string, { 
      period: string;
      reports: WorkReport[];
      totalCost: number;
      totalHours: number;
      reportCount: number;
    }> = {};

    filteredReports.forEach(report => {
      const date = new Date(report.date);
      let key: string;
      let label: string;

      if (periodType === 'daily') {
        key = report.date;
        label = new Date(report.date).toLocaleDateString('es-ES');
      } else if (periodType === 'weekly') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay() + 1);
        key = weekStart.toISOString().split('T')[0];
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        label = `${weekStart.toLocaleDateString('es-ES')} - ${weekEnd.toLocaleDateString('es-ES')}`;
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        label = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      }

      if (!groups[key]) {
        groups[key] = {
          period: label,
          reports: [],
          totalCost: 0,
          totalHours: 0,
          reportCount: 0,
        };
      }

      const cost = calculateReportCost(report);
      let hours = 0;

      report.workGroups?.forEach(g => g.items.forEach(i => hours += i.hours || 0));
      report.machineryGroups?.forEach(g => g.items.forEach(i => hours += i.hours || 0));

      groups[key].reports.push(report);
      groups[key].totalCost += cost;
      groups[key].totalHours += hours;
      groups[key].reportCount += 1;
    });

    return Object.values(groups).sort((a, b) => {
      const dateA = new Date(a.reports[0].date);
      const dateB = new Date(b.reports[0].date);
      return dateA.getTime() - dateB.getTime();
    });
  }, [filteredReports, periodType]);

  // Chart data for cost evolution
  const costChartData = useMemo(() => {
    return groupedData.map(g => ({
      period: g.period,
      cost: g.totalCost,
      hours: g.totalHours,
    }));
  }, [groupedData]);

  // Pie chart data for cost distribution by type
  const costByTypeData = useMemo(() => {
    let workCost = 0;
    let machineryCost = 0;
    let materialCost = 0;
    let subcontractCost = 0;
    let rentalCost = 0;

    filteredReports.forEach(report => {
      report.workGroups?.forEach(g => g.items.forEach(i => {
        const hourlyRate = Number(i.hourlyRate) || 0;
        const hours = Number(i.hours) || 0;
        if (hourlyRate > 0) {
          workCost += hours * hourlyRate;
        }
      }));

      report.machineryGroups?.forEach(g => g.items.forEach(i => {
        const hourlyRate = Number(i.hourlyRate) || 0;
        const hours = Number(i.hours) || 0;
        if (hourlyRate > 0) {
          machineryCost += hours * hourlyRate;
        }
      }));

      report.materialGroups?.forEach(g => g.items.forEach(i => {
        const unitPrice = Number(i.unitPrice) || 0;
        const quantity = Number(i.quantity) || 0;
        if (unitPrice > 0) {
          materialCost += quantity * unitPrice;
        }
      }));

      report.subcontractGroups?.forEach(g => g.items.forEach(i => {
        const unitType = i.unitType || 'hora';
        if (unitType === 'hora') {
          const hourlyRate = Number(i.hourlyRate) || 0;
          const workers = Number(i.workers) || 0;
          const hours = Number(i.hours) || 0;
          if (hourlyRate > 0) {
            subcontractCost += workers * hours * hourlyRate;
          }
        } else {
          const unitPrice = Number(i.unitPrice) || 0;
          const quantity = Number(i.quantity) || 0;
          if (unitPrice > 0) {
            subcontractCost += quantity * unitPrice;
          }
        }
      }));

      // Rental machinery desde work_rental_machinery
      const reportWorkIds = new Set([report.workId].filter(Boolean));
      const relevantRental = rentalMachinery.filter(rm => 
        rm.work_id && reportWorkIds.has(rm.work_id)
      );
      
      relevantRental.forEach(item => {
        const deliveryDate = new Date(item.delivery_date);
        const removalDate = item.removal_date ? new Date(item.removal_date) : new Date();
        const reportDate = new Date(report.date);
        
        // Solo incluir si la maquinaria estaba activa en la fecha del reporte
        if (deliveryDate <= reportDate && reportDate <= removalDate) {
          const totalDays = Math.ceil((removalDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
          const dailyRate = Number(item.daily_rate) || 0;
          if (dailyRate > 0) {
            rentalCost += totalDays * dailyRate;
          }
        }
      });
    });

    return [
      { name: 'Mano de Obra', value: workCost, color: '#3b82f6' },
      { name: 'Maquinaria', value: machineryCost, color: '#10b981' },
      { name: 'Materiales', value: materialCost, color: '#f59e0b' },
      { name: 'Subcontratas', value: subcontractCost, color: '#ef4444' },
      { name: 'Alquiler Maquinaria', value: rentalCost, color: '#8b5cf6' },
    ].filter(item => item.value > 0);
  }, [filteredReports]);

  // Analysis by companies (work and machinery)
  const companyAnalysis = useMemo(() => {
    const companies: Record<string, {
      name: string;
      workHours: number;
      workCost: number;
      machineryHours: number;
      machineryCost: number;
      totalCost: number;
    }> = {};

    filteredReports.forEach(report => {
      // Work groups
      report.workGroups?.forEach(group => {
        const companyName = (group.company || '').trim();
        if (!companyName) return; // Skip empty company names
        
        // Usar minúsculas para la clave pero mantener el nombre original
        const companyKey = companyName.toLowerCase();
        
        if (!companies[companyKey]) {
          companies[companyKey] = {
            name: companyName, // Mantener el formato original
            workHours: 0,
            workCost: 0,
            machineryHours: 0,
            machineryCost: 0,
            totalCost: 0,
          };
        }
        group.items.forEach(item => {
          const hourlyRate = Number(item.hourlyRate) || 0;
          const hours = Number(item.hours) || 0;
          if (hourlyRate > 0) {
            const cost = hours * hourlyRate;
            companies[companyKey].workHours += hours;
            companies[companyKey].workCost += cost;
            companies[companyKey].totalCost += cost;
          }
        });
      });

      // Machinery groups
      report.machineryGroups?.forEach(group => {
        const companyName = (group.company || '').trim();
        if (!companyName) return; // Skip empty company names
        
        // Usar minúsculas para la clave pero mantener el nombre original
        const companyKey = companyName.toLowerCase();
        
        if (!companies[companyKey]) {
          companies[companyKey] = {
            name: companyName, // Mantener el formato original
            workHours: 0,
            workCost: 0,
            machineryHours: 0,
            machineryCost: 0,
            totalCost: 0,
          };
        }
        group.items.forEach(item => {
          const hourlyRate = Number(item.hourlyRate) || 0;
          const hours = Number(item.hours) || 0;
          if (hourlyRate > 0) {
            const cost = hours * hourlyRate;
            companies[companyKey].machineryHours += hours;
            companies[companyKey].machineryCost += cost;
            companies[companyKey].totalCost += cost;
          }
        });
      });
    });

    return Object.values(companies).sort((a, b) => b.totalCost - a.totalCost);
  }, [filteredReports]);

  // Analysis by material suppliers
  const supplierAnalysis = useMemo(() => {
    const suppliers: Record<string, {
      name: string;
      totalCost: number;
      itemCount: number;
    }> = {};

    filteredReports.forEach(report => {
      report.materialGroups?.forEach(group => {
        const supplierName = (group.supplier || '').trim();
        if (!supplierName) return; // Skip empty supplier names
        
        // Usar minúsculas para la clave pero mantener el nombre original
        const supplierKey = supplierName.toLowerCase();
        
        if (!suppliers[supplierKey]) {
          suppliers[supplierKey] = {
            name: supplierName, // Mantener el formato original
            totalCost: 0,
            itemCount: 0,
          };
        }
        group.items.forEach(item => {
          const unitPrice = Number(item.unitPrice) || 0;
          const quantity = Number(item.quantity) || 0;
          if (unitPrice > 0) {
            const cost = quantity * unitPrice;
            suppliers[supplierKey].totalCost += cost;
            suppliers[supplierKey].itemCount += 1;
          }
        });
      });
    });

    return Object.values(suppliers).sort((a, b) => b.totalCost - a.totalCost);
  }, [filteredReports]);

  // Analysis by rental machinery providers desde work_rental_machinery
  const rentalProviderAnalysis = useMemo(() => {
    const providers: Record<string, {
      name: string;
      totalDays: number;
      totalCost: number;
      fuelCost: number;
      rentalCost: number;
    }> = {};

    const reportWorkIds = new Set(filteredReports.map(r => r.workId).filter(Boolean));
    const relevantRental = rentalMachinery.filter(rm => 
      rm.work_id && reportWorkIds.has(rm.work_id)
    );

    relevantRental.forEach(item => {
      const providerName = (item.provider || '').trim();
      if (!providerName) return;
      
      const providerKey = providerName.toLowerCase();
      
      if (!providers[providerKey]) {
        providers[providerKey] = {
          name: providerName,
          totalDays: 0,
          totalCost: 0,
          fuelCost: 0,
          rentalCost: 0,
        };
      }
      
      const deliveryDate = new Date(item.delivery_date);
      const removalDate = item.removal_date ? new Date(item.removal_date) : new Date();
      const totalDays = Math.ceil((removalDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      const dailyRate = Number(item.daily_rate) || 0;
      const rentalCost = dailyRate > 0 ? totalDays * dailyRate : 0;
      
      providers[providerKey].totalDays += totalDays;
      providers[providerKey].rentalCost += rentalCost;
      providers[providerKey].totalCost += rentalCost;
    });

    return Object.values(providers).sort((a, b) => b.totalCost - a.totalCost);
  }, [filteredReports, rentalMachinery]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalCost = groupedData.reduce((sum, g) => sum + g.totalCost, 0);
    const totalHours = groupedData.reduce((sum, g) => sum + g.totalHours, 0);
    const totalReports = groupedData.reduce((sum, g) => sum + g.reportCount, 0);
    const avgCostPerReport = totalReports > 0 ? totalCost / totalReports : 0;

    return { totalCost, totalHours, totalReports, avgCostPerReport };
  }, [groupedData]);

  const handleExportExcel = async () => {
    try {
      if (periodType === 'weekly') {
        await exportWeeklyReports(filteredReports);
      } else if (periodType === 'monthly') {
        await exportMonthlyReports(filteredReports);
      } else {
        await exportToExcel(filteredReports);
      }
      toast({
        title: "Exportado correctamente",
        description: "El archivo Excel se ha generado correctamente.",
      });
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast({
        title: "Error al exportar",
        description: "No se pudo generar el archivo Excel.",
        variant: "destructive",
      });
    }
  };

  const handleExportPDF = async () => {
    try {
      const totalWorkHours = filteredReports.reduce((sum, r) => 
        sum + (r.workGroups?.reduce((s, g) => 
          s + g.items.reduce((is, i) => is + (i.hours || 0), 0), 0) || 0), 0);
      const totalMachineryHours = filteredReports.reduce((sum, r) => 
        sum + (r.machineryGroups?.reduce((s, g) => 
          s + g.items.reduce((is, i) => is + (i.hours || 0), 0), 0) || 0), 0);
      const totalForemanHours = filteredReports.reduce((sum, r) => 
        sum + (r.foremanHours || 0), 0);

      await generateComprehensiveReportPDF(filteredReports, {
        title: 'Análisis Económico',
        period: `${periodType === 'daily' ? 'Diario' : periodType === 'weekly' ? 'Semanal' : 'Mensual'}`,
        summary: {
          totalReports: summaryStats.totalReports,
          totalWorkHours,
          totalMachineryHours,
          totalForemanHours,
          totalMaterials: filteredReports.reduce((sum, r) => 
            sum + (r.materialGroups?.reduce((s, g) => s + g.items.length, 0) || 0), 0),
          totalSubcontractors: filteredReports.reduce((sum, r) => 
            sum + (r.subcontractGroups?.reduce((s, g) => s + g.items.length, 0) || 0), 0),
          uniqueCompanies: new Set(filteredReports.flatMap(r => 
            r.workGroups?.map(g => g.company) || [])).size,
        },
      });
      toast({
        title: "PDF generado",
        description: "El informe PDF se ha generado correctamente.",
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error al generar PDF",
        description: "No se pudo generar el informe PDF.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Análisis y Resúmenes Económicos</CardTitle>
          <CardDescription>
            Visualiza y analiza los costes agrupados por período
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Por Días</SelectItem>
                  <SelectItem value="weekly">Por Semanas</SelectItem>
                  <SelectItem value="monthly">Por Meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select value={selectedWork} onValueChange={setSelectedWork}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las obras</SelectItem>
                  {availableWorks.map(work => (
                    <SelectItem key={work} value={work}>{work}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleExportExcel} variant="outline">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button onClick={handleExportPDF} variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Coste Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summaryStats.totalCost.toFixed(2)} €</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Horas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summaryStats.totalHours.toFixed(1)} h</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Nº Partes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summaryStats.totalReports}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Coste Medio/Parte</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summaryStats.avgCostPerReport.toFixed(2)} €</div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <Tabs defaultValue="evolution" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="evolution">Evolución</TabsTrigger>
              <TabsTrigger value="distribution">Distribución</TabsTrigger>
              <TabsTrigger value="companies">Empresas</TabsTrigger>
              <TabsTrigger value="suppliers">Proveedores</TabsTrigger>
              <TabsTrigger value="table">Tabla</TabsTrigger>
            </TabsList>

            <TabsContent value="evolution" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Evolución de Costes por Período</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={costChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="period" 
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip cursor={false} />
                      <Legend />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="cost" 
                        stroke="#3b82f6" 
                        name="Coste (€)"
                        strokeWidth={2}
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="hours" 
                        stroke="#10b981" 
                        name="Horas"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="distribution" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Distribución de Costes por Tipo</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <PieChart>
                      <Pie
                        data={costByTypeData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.name}: ${entry.value.toFixed(0)}€`}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {costByTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip cursor={false} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="companies" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Análisis por Empresas</CardTitle>
                  <CardDescription>Desglose de horas y costes por empresa (Mano de Obra y Maquinaria)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[150px]">Empresa</TableHead>
                          <TableHead className="text-right bg-blue-50 dark:bg-blue-950">Horas M.O.</TableHead>
                          <TableHead className="text-right bg-blue-50 dark:bg-blue-950">Coste M.O.</TableHead>
                          <TableHead className="text-right bg-green-50 dark:bg-green-950">Horas Maq.</TableHead>
                          <TableHead className="text-right bg-green-50 dark:bg-green-950">Coste Maq.</TableHead>
                          <TableHead className="text-right font-bold">Coste Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {companyAnalysis.map((company, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{company.name}</TableCell>
                            <TableCell className="text-right bg-blue-50 dark:bg-blue-950">{company.workHours.toFixed(1)} h</TableCell>
                            <TableCell className="text-right bg-blue-50 dark:bg-blue-950">{company.workCost.toFixed(2)} €</TableCell>
                            <TableCell className="text-right bg-green-50 dark:bg-green-950">{company.machineryHours.toFixed(1)} h</TableCell>
                            <TableCell className="text-right bg-green-50 dark:bg-green-950">{company.machineryCost.toFixed(2)} €</TableCell>
                            <TableCell className="text-right font-bold">{company.totalCost.toFixed(2)} €</TableCell>
                          </TableRow>
                        ))}
                        {companyAnalysis.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              No hay datos de empresas en los partes seleccionados
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {companyAnalysis.length > 0 && (
                    <div className="mt-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={companyAnalysis.slice(0, 10)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="name" 
                            angle={-45}
                            textAnchor="end"
                            height={100}
                          />
                          <YAxis />
                          <Tooltip cursor={false} />
                          <Legend />
                          <Bar dataKey="workCost" fill="#3b82f6" name="Mano de Obra (€)" />
                          <Bar dataKey="machineryCost" fill="#10b981" name="Maquinaria (€)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="suppliers" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Proveedores de Materiales</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Proveedor</TableHead>
                          <TableHead className="text-right">Nº Items</TableHead>
                          <TableHead className="text-right">Coste Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierAnalysis.map((supplier, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{supplier.name}</TableCell>
                            <TableCell className="text-right">{supplier.itemCount}</TableCell>
                            <TableCell className="text-right">{supplier.totalCost.toFixed(2)} €</TableCell>
                          </TableRow>
                        ))}
                        {supplierAnalysis.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              No hay proveedores de materiales
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Proveedores de Maquinaria de Alquiler</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Proveedor</TableHead>
                          <TableHead className="text-right">Días Totales</TableHead>
                          <TableHead className="text-right">Coste Alquiler</TableHead>
                          <TableHead className="text-right">Coste Combustible</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rentalProviderAnalysis.map((provider, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{provider.name}</TableCell>
                            <TableCell className="text-right">{provider.totalDays.toFixed(1)}</TableCell>
                            <TableCell className="text-right">{provider.rentalCost.toFixed(2)} €</TableCell>
                            <TableCell className="text-right">{provider.fuelCost.toFixed(2)} €</TableCell>
                            <TableCell className="text-right font-bold">{provider.totalCost.toFixed(2)} €</TableCell>
                          </TableRow>
                        ))}
                        {rentalProviderAnalysis.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                              No hay proveedores de alquiler
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="table" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Resumen Detallado por Período</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Período</TableHead>
                        <TableHead className="text-right">Nº Partes</TableHead>
                        <TableHead className="text-right">Total Horas</TableHead>
                        <TableHead className="text-right">Coste Total</TableHead>
                        <TableHead className="text-right">Coste Medio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedData.map((group, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{group.period}</TableCell>
                          <TableCell className="text-right">{group.reportCount}</TableCell>
                          <TableCell className="text-right">{group.totalHours.toFixed(1)} h</TableCell>
                          <TableCell className="text-right">{group.totalCost.toFixed(2)} €</TableCell>
                          <TableCell className="text-right">
                            {(group.totalCost / group.reportCount).toFixed(2)} €
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
