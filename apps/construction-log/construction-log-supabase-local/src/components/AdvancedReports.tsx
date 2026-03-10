import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { WorkReport } from '@/types/workReport';
import { exportToExcel } from '@/utils/exportUtils';
import { exportWeeklyReports, exportMonthlyReports } from '@/utils/weeklyMonthlyExportUtils';
import { generateSummaryReportPDF } from '@/utils/summaryReportPdfGenerator';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Download, FileText, Clock, Truck, Edit2, Save, X, Trash2, Euro, TrendingUp, Brain, Loader2 } from 'lucide-react';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getWeek, getMonth, getYear } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/hooks/useOrganization';
import {
  generateSummaryReport,
  listErpWorkReports,
  listManagedUserAssignments,
  listProjects,
  listRentalMachinery,
  listSavedEconomicReports,
} from '@/integrations/api/client';
import { mapApiWorkReportToLegacyWorkReport } from '@/services/workReportContract';

interface AdvancedReportsProps {
  reports: WorkReport[];
  isOpen: boolean;
  onClose: () => void;
}

export const AdvancedReports: React.FC<AdvancedReportsProps> = ({
  reports: initialReports,
  isOpen,
  onClose
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { organization } = useOrganization();
  const [selectedWork, setSelectedWork] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [availableWorks, setAvailableWorks] = useState<Array<{id: string, number: string, name: string}>>([]);
  const [realtimeReports, setRealtimeReports] = useState<WorkReport[]>(initialReports);
  const [editingRentalItem, setEditingRentalItem] = useState<{reportId: string, groupId: string, item: any} | null>(null);
  const [editedValues, setEditedValues] = useState<{deliveryDate?: string, removalDate?: string, dailyRate?: number}>({});
  const [economicReports, setEconomicReports] = useState<any[]>([]);
  const [rentalMachinery, setRentalMachinery] = useState<any[]>([]);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // Cargar partes de trabajo
  useEffect(() => {
    if (!user || !isOpen) return;

    const loadReports = async () => {
      try {
        const data = await listErpWorkReports({ limit: 500 });
        const statusFilter = new Set(['completed', 'missing_data', 'missing_delivery_notes']);
        const normalized: WorkReport[] = data
          .filter(r => statusFilter.has(r.status))
          .map(mapApiWorkReportToLegacyWorkReport);
        setRealtimeReports(normalized);
      } catch (error) {
        console.error('Error loading reports:', error);
      }
    };

    loadReports();
  }, [user, isOpen]);

  // Cargar obras disponibles
  useEffect(() => {
    const loadWorks = async () => {
      if (!user) return;

      try {
        const [workIds, allProjects] = await Promise.all([
          listManagedUserAssignments(Number(user.id)),
          listProjects(),
        ]);
        const workIdSet = new Set(workIds);
        const works = allProjects
          .filter(p => workIdSet.has(p.id))
          .map(p => ({ id: String(p.id), number: String(p.code ?? p.id), name: p.name }));
        setAvailableWorks(works);
      } catch (error) {
        console.error('Error loading works:', error);
      }
    };

    loadWorks();
  }, [user, isOpen]);

  // Cargar reportes económicos
  useEffect(() => {
    const loadEconomicReports = async () => {
      if (!user || !isOpen) return;

      try {
        const data = await listSavedEconomicReports();
        setEconomicReports(data || []);
      } catch (error) {
        console.error('Error loading economic reports:', error);
      }
    };

    loadEconomicReports();
  }, [user, isOpen]);

  // Cargar maquinaria de alquiler
  useEffect(() => {
    const loadRentalMachinery = async () => {
      if (!user || !isOpen) return;

      try {
        const data = await listRentalMachinery();
        setRentalMachinery(data.map(m => ({
          ...m,
          work_id: m.project_id,
          delivery_date: m.start_date,
          removal_date: m.end_date,
          daily_rate: m.price != null ? Number(m.price) : 0,
          type: m.name,
        })));
      } catch (error) {
        console.error('Error loading rental machinery:', error);
      }
    };

    loadRentalMachinery();
  }, [user, isOpen]);

  const getDateRange = (range: string) => {
    const today = new Date();
    switch (range) {
      case 'weekly':
        return { start: startOfWeek(today, { locale: es }), end: endOfWeek(today, { locale: es }) };
      case 'monthly':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'quarterly':
        return { start: subDays(today, 90), end: today };
      case 'yearly':
        return { start: subDays(today, 365), end: today };
      case 'custom':
        return {
          start: startDate ? new Date(startDate) : subDays(today, 30),
          end: endDate ? new Date(endDate) : today
        };
      default:
        return { start: new Date(2000, 0, 1), end: new Date(2100, 11, 31) };
    }
  };

  const filteredReports = useMemo(() => {
    let filtered = realtimeReports;

    if (selectedWork && selectedWork !== 'all') {
      filtered = filtered.filter(r => r.workId === selectedWork);
    }

    const { start, end } = getDateRange(dateRange);
    filtered = filtered.filter(r => {
      const reportDate = new Date(r.date);
      return reportDate >= start && reportDate <= end;
    });

    return filtered;
  }, [realtimeReports, selectedWork, dateRange, startDate, endDate]);

  // Análisis de horas del encargado por días, semanas y meses
  const foremanHoursAnalysis = useMemo(() => {
    const daily: { [key: string]: number } = {};
    const weekly: { [key: string]: number } = {};
    const monthly: { [key: string]: number } = {};

    filteredReports.forEach(report => {
      const date = new Date(report.date);
      const dayKey = format(date, 'dd/MM/yyyy', { locale: es });
      const weekKey = `Sem ${getWeek(date, { locale: es })} - ${getYear(date)}`;
      const monthKey = format(date, 'MMMM yyyy', { locale: es });

      daily[dayKey] = (daily[dayKey] || 0) + (report.foremanHours || 0);
      weekly[weekKey] = (weekly[weekKey] || 0) + (report.foremanHours || 0);
      monthly[monthKey] = (monthly[monthKey] || 0) + (report.foremanHours || 0);
    });

    return {
      daily: Object.entries(daily).map(([period, hours]) => ({ period, hours })),
      weekly: Object.entries(weekly).map(([period, hours]) => ({ period, hours })),
      monthly: Object.entries(monthly).map(([period, hours]) => ({ period, hours }))
    };
  }, [filteredReports]);

  // Análisis de trabajadores agrupados por empresa
  const workersByCompany = useMemo(() => {
    const companies: { [company: string]: { workers: { name: string, hours: number }[], totalHours: number } } = {};

    filteredReports.forEach(report => {
      report.workGroups?.forEach(group => {
        if (!companies[group.company]) {
          companies[group.company] = { workers: [], totalHours: 0 };
        }

        group.items.forEach(item => {
          const existing = companies[group.company].workers.find(w => w.name === item.name);
          if (existing) {
            existing.hours += item.hours;
          } else {
            companies[group.company].workers.push({ name: item.name, hours: item.hours });
          }
          companies[group.company].totalHours += item.hours;
        });
      });
    });

    return companies;
  }, [filteredReports]);

  // Análisis de maquinaria de subcontrata
  const subcontractMachinery = useMemo(() => {
    const machinery: { [company: string]: { items: { type: string, hours: number }[], totalHours: number } } = {};

    filteredReports.forEach(report => {
      report.machineryGroups?.forEach(group => {
        if (!machinery[group.company]) {
          machinery[group.company] = { items: [], totalHours: 0 };
        }

        group.items.forEach(item => {
          const existing = machinery[group.company].items.find(m => m.type === item.type);
          if (existing) {
            existing.hours += item.hours;
          } else {
            machinery[group.company].items.push({ type: item.type, hours: item.hours });
          }
          machinery[group.company].totalHours += item.hours;
        });
      });
    });

    return machinery;
  }, [filteredReports]);

  // Análisis de maquinaria de alquiler desde la tabla work_rental_machinery
  const rentalMachineryAnalysis = useMemo(() => {
    const analysis: { 
      [provider: string]: { 
        [work: string]: { 
          items: any[];
          totalDays: number;
        } 
      } 
    } = {};
    
    // Obtener work_ids de los reportes filtrados
    const workIds = new Set(filteredReports.map(r => r.workId).filter(Boolean));
    
    // Filtrar maquinaria de alquiler por las obras de los reportes
    const relevantRental = rentalMachinery.filter(rm => 
      rm.work_id && workIds.has(rm.work_id)
    );
    
    relevantRental.forEach(item => {
      const provider = item.provider?.trim();
      if (!provider) return;
      
      // Buscar el nombre de la obra
      const report = filteredReports.find(r => r.workId === item.work_id);
      const work = report ? `${report.workNumber} - ${report.workName}` : 'Obra desconocida';
      
      // Calcular días
      const deliveryDate = new Date(item.delivery_date);
      const removalDate = item.removal_date ? new Date(item.removal_date) : new Date();
      const totalDays = Math.ceil((removalDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      
      if (!analysis[provider]) analysis[provider] = {};
      if (!analysis[provider][work]) analysis[provider][work] = { items: [], totalDays: 0 };
      
      analysis[provider][work].items.push({
        ...item,
        totalDays,
        deliveryDate: item.delivery_date,
        removalDate: item.removal_date,
        dailyRate: item.daily_rate || 0,
        type: item.type,
        machineNumber: item.machine_number,
      });
      analysis[provider][work].totalDays += totalDays;
    });

    return analysis;
  }, [filteredReports, rentalMachinery]);

  // Conteo de partes por obra
  const reportsByWork = useMemo(() => {
    const workCounts: { [work: string]: number } = {};

    filteredReports.forEach(report => {
      const workKey = `${report.workNumber} - ${report.workName}`;
      workCounts[workKey] = (workCounts[workKey] || 0) + 1;
    });

    return Object.entries(workCounts).map(([work, count]) => ({ work, count }));
  }, [filteredReports]);

  // Análisis económico completo
  const economicAnalysis = useMemo(() => {
    // Filtrar reportes económicos según filtros seleccionados
    let filteredEconomic = economicReports;
    
    if (selectedWork && selectedWork !== 'all') {
      const selectedWorkData = availableWorks.find(w => w.id === selectedWork);
      if (selectedWorkData) {
        filteredEconomic = filteredEconomic.filter(r => 
          r.work_number === selectedWorkData.number
        );
      }
    }

    const { start, end } = getDateRange(dateRange);
    filteredEconomic = filteredEconomic.filter(r => {
      const reportDate = new Date(r.date);
      return reportDate >= start && reportDate <= end;
    });

    // Calcular costos por categoría
    const costsByCategory = {
      manoDeObra: 0,
      maquinaria: 0,
      materiales: 0,
      subcontratas: 0,
      alquiler: 0,
    };

    const costsByWork: { [work: string]: number } = {};
    const costsByMonth: { [month: string]: { [category: string]: number } } = {};
    const providerCosts: { [provider: string]: number } = {};

    filteredEconomic.forEach(report => {
      const workKey = `${report.work_number} - ${report.work_name}`;
      const monthKey = format(new Date(report.date), 'MMM yyyy', { locale: es });
      
      if (!costsByWork[workKey]) costsByWork[workKey] = 0;
      if (!costsByMonth[monthKey]) {
        costsByMonth[monthKey] = {
          manoDeObra: 0,
          maquinaria: 0,
          materiales: 0,
          subcontratas: 0,
          alquiler: 0,
        };
      }

      // Mano de obra
      if (report.work_groups) {
        report.work_groups.forEach((group: any) => {
          let groupTotal = 0;
          if (group.items) {
            group.items.forEach((item: any) => {
              const cost = (item.hours || 0) * (item.hourlyRate || 0);
              groupTotal += cost;
              costsByCategory.manoDeObra += cost;
            });
          }
          if (group.company) {
            providerCosts[group.company] = (providerCosts[group.company] || 0) + groupTotal;
          }
          costsByMonth[monthKey].manoDeObra += groupTotal;
        });
      }

      // Maquinaria
      if (report.machinery_groups) {
        report.machinery_groups.forEach((group: any) => {
          let groupTotal = 0;
          if (group.items) {
            group.items.forEach((item: any) => {
              const cost = (item.hours || 0) * (item.hourlyRate || 0);
              groupTotal += cost;
              costsByCategory.maquinaria += cost;
            });
          }
          if (group.company) {
            providerCosts[group.company] = (providerCosts[group.company] || 0) + groupTotal;
          }
          costsByMonth[monthKey].maquinaria += groupTotal;
        });
      }

      // Materiales
      if (report.material_groups) {
        report.material_groups.forEach((group: any) => {
          let groupTotal = 0;
          if (group.items) {
            group.items.forEach((item: any) => {
              const cost = (item.quantity || 0) * (item.unitPrice || 0);
              groupTotal += cost;
              costsByCategory.materiales += cost;
            });
          }
          if (group.supplier) {
            providerCosts[group.supplier] = (providerCosts[group.supplier] || 0) + groupTotal;
          }
          costsByMonth[monthKey].materiales += groupTotal;
        });
      }

      // Subcontratas
      if (report.subcontract_groups) {
        report.subcontract_groups.forEach((group: any) => {
          let groupTotal = 0;
          if (group.items) {
            group.items.forEach((item: any) => {
              let cost = 0;
              if (item.unitType === 'hora') {
                cost = (item.workers || 0) * (item.hours || 0) * (item.hourlyRate || 0);
              } else {
                cost = (item.quantity || 0) * (item.unitPrice || 0);
              }
              groupTotal += cost;
              costsByCategory.subcontratas += cost;
            });
          }
          if (group.company) {
            providerCosts[group.company] = (providerCosts[group.company] || 0) + groupTotal;
          }
          costsByMonth[monthKey].subcontratas += groupTotal;
        });
      }

      // Alquiler de maquinaria desde work_rental_machinery
      const workIds = new Set(filteredEconomic.map((r: any) => {
        const report = availableWorks.find(w => w.number === r.work_number);
        return report?.id;
      }).filter(Boolean));
      
      const relevantRental = rentalMachinery.filter(rm => 
        rm.work_id && workIds.has(rm.work_id)
      );
      
      relevantRental.forEach(item => {
        const deliveryDate = new Date(item.delivery_date);
        const removalDate = item.removal_date ? new Date(item.removal_date) : new Date();
        const totalDays = Math.ceil((removalDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
        const dailyRate = item.daily_rate || 0;
        const cost = totalDays * dailyRate;
        
        costsByCategory.alquiler += cost;
        
        const monthKey = format(deliveryDate, 'MMM yyyy', { locale: es });
        if (!costsByMonth[monthKey]) {
          costsByMonth[monthKey] = {
            manoDeObra: 0,
            maquinaria: 0,
            materiales: 0,
            subcontratas: 0,
            alquiler: 0,
          };
        }
        costsByMonth[monthKey].alquiler += cost;
        
        if (item.provider) {
          providerCosts[item.provider] = (providerCosts[item.provider] || 0) + cost;
        }
      });

      costsByWork[workKey] += report.total_amount || 0;
    });

    // Convertir a arrays para gráficos
    const categoryData = [
      { name: 'Mano de Obra', value: costsByCategory.manoDeObra, color: 'hsl(var(--chart-1))' },
      { name: 'Maquinaria', value: costsByCategory.maquinaria, color: 'hsl(var(--chart-2))' },
      { name: 'Materiales', value: costsByCategory.materiales, color: 'hsl(var(--chart-3))' },
      { name: 'Subcontratas', value: costsByCategory.subcontratas, color: 'hsl(var(--chart-4))' },
      { name: 'Alquiler', value: costsByCategory.alquiler, color: 'hsl(var(--chart-5))' },
    ].filter(item => item.value > 0);

    const workData = Object.entries(costsByWork)
      .map(([work, cost]) => ({ work, cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    const monthlyTrendData = Object.entries(costsByMonth).map(([month, costs]) => ({
      month,
      ...costs,
      total: Object.values(costs).reduce((sum, val) => sum + val, 0),
    }));

    const topProviders = Object.entries(providerCosts)
      .map(([provider, cost]) => ({ provider, cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    const totalCost = Object.values(costsByCategory).reduce((sum, val) => sum + val, 0);

    return {
      categoryData,
      workData,
      monthlyTrendData,
      topProviders,
      totalCost,
      reportCount: filteredEconomic.length,
    };
  }, [economicReports, selectedWork, dateRange, startDate, endDate, availableWorks]);

  const handleSaveRentalEdit = async () => {
    // DESHABILITADO - La maquinaria de alquiler ahora se gestiona desde Obras
    return;
  };

  const handleDeleteRentalItem = async () => {
    // DESHABILITADO - La maquinaria de alquiler ahora se gestiona desde Obras
    return;
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-7xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">Informes Avanzados</CardTitle>
              <CardDescription>Análisis detallado de partes de trabajo</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <Label>Obra</Label>
              <Select value={selectedWork} onValueChange={setSelectedWork}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las obras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las obras</SelectItem>
                  {availableWorks.map(work => (
                    <SelectItem key={work.id} value={work.id}>
                      {work.number} - {work.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Período</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los datos</SelectItem>
                  <SelectItem value="weekly">Esta semana</SelectItem>
                  <SelectItem value="monthly">Este mes</SelectItem>
                  <SelectItem value="quarterly">Últimos 3 meses</SelectItem>
                  <SelectItem value="yearly">Último año</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateRange === 'custom' && (
              <>
                <div>
                  <Label>Fecha Inicio</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <Label>Fecha Fin</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </>
            )}
          </div>

          {/* Tarjetas de resumen */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6 text-center">
                <FileText className="h-10 w-10 mx-auto mb-2 text-primary" />
                <div className="text-3xl font-bold">{filteredReports.length}</div>
                <div className="text-sm text-muted-foreground">Total Partes</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <Clock className="h-10 w-10 mx-auto mb-2 text-primary" />
                <div className="text-3xl font-bold">
                  {filteredReports.reduce((sum, r) => sum + (r.foremanHours || 0), 0).toFixed(1)}
                </div>
                <div className="text-sm text-muted-foreground">Horas Encargado</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <Euro className="h-10 w-10 mx-auto mb-2 text-primary" />
                <div className="text-3xl font-bold">
                  {economicAnalysis.totalCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                </div>
                <div className="text-sm text-muted-foreground">Costo Total</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <Truck className="h-10 w-10 mx-auto mb-2 text-primary" />
                <div className="text-3xl font-bold">
                  {Object.keys(rentalMachineryAnalysis).length}
                </div>
                <div className="text-sm text-muted-foreground">Proveedores Alquiler</div>
              </CardContent>
            </Card>
          </div>

          {filteredReports.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No hay datos para mostrar con los filtros seleccionados
            </div>
          ) : (
            <Tabs defaultValue="foreman" className="space-y-4">
              <TabsList className="inline-flex w-full overflow-x-auto md:grid md:grid-cols-6">
                <TabsTrigger value="foreman" className="flex-shrink-0">Encargado</TabsTrigger>
                <TabsTrigger value="workers" className="flex-shrink-0">Trabajadores</TabsTrigger>
                <TabsTrigger value="machinery" className="flex-shrink-0">Maquinaria</TabsTrigger>
                <TabsTrigger value="rental" className="flex-shrink-0">Alquiler</TabsTrigger>
                <TabsTrigger value="reports" className="flex-shrink-0">Partes/Obra</TabsTrigger>
                <TabsTrigger value="economic" className="flex-shrink-0">Económico</TabsTrigger>
              </TabsList>

              {/* Horas del Encargado */}
              <TabsContent value="foreman" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Horas del Encargado por Período</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h3 className="font-semibold mb-3">Por Días</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={foremanHoursAnalysis.daily.slice(-14)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" fontSize={10} />
                          <YAxis />
                          <Tooltip cursor={false} />
                          <Bar dataKey="hours" fill="hsl(var(--primary))" name="Horas" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-3">Por Semanas</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={foremanHoursAnalysis.weekly}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" fontSize={10} />
                          <YAxis />
                          <Tooltip cursor={false} />
                          <Bar dataKey="hours" fill="hsl(var(--chart-2))" name="Horas" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-3">Por Meses</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={foremanHoursAnalysis.monthly}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" fontSize={10} />
                          <YAxis />
                          <Tooltip cursor={false} />
                          <Bar dataKey="hours" fill="hsl(var(--chart-3))" name="Horas" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Trabajadores por Empresa */}
              <TabsContent value="workers" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Trabajadores Agrupados por Empresa</CardTitle>
                    <CardDescription>Total de horas trabajadas por empresa y trabajador</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {Object.entries(workersByCompany).map(([company, data]) => (
                        <AccordionItem key={company} value={company}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex justify-between w-full pr-4">
                              <span className="font-semibold">{company}</span>
                              <span className="text-sm text-muted-foreground">
                                {data.totalHours.toFixed(1)} horas
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-2 pl-4">
                              {data.workers.map((worker, idx) => (
                                <div key={idx} className="flex justify-between p-2 bg-muted/50 rounded">
                                  <span>{worker.name}</span>
                                  <span className="font-medium">{worker.hours.toFixed(1)}h</span>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Maquinaria de Subcontrata */}
              <TabsContent value="machinery" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Maquinaria de Subcontrata</CardTitle>
                    <CardDescription>Horas de maquinaria agrupadas por empresa</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {Object.entries(subcontractMachinery).map(([company, data]) => (
                        <AccordionItem key={company} value={company}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex justify-between w-full pr-4">
                              <span className="font-semibold">{company}</span>
                              <span className="text-sm text-muted-foreground">
                                {data.totalHours.toFixed(1)} horas
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-2 pl-4">
                              {data.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between p-2 bg-muted/50 rounded">
                                  <span>{item.type}</span>
                                  <span className="font-medium">{item.hours.toFixed(1)}h</span>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Maquinaria de Alquiler */}
              <TabsContent value="rental" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Maquinaria de Alquiler por Proveedor y Obra</CardTitle>
                    <CardDescription>Fichas editables de maquinaria alquilada</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {Object.entries(rentalMachineryAnalysis).map(([provider, works]) => (
                        <div key={provider} className="border rounded-lg p-4">
                          <h3 className="font-semibold text-lg mb-4">{provider}</h3>
                          {Object.entries(works).map(([work, data]) => (
                            <div key={work} className="border-l-4 border-primary pl-4 mb-4">
                              <div className="flex justify-between items-center mb-2">
                                <h4 className="font-medium">{work}</h4>
                                <span className="text-sm font-bold bg-primary/10 px-3 py-1 rounded-full">
                                  Total: {data.totalDays} días
                                </span>
                              </div>
                              <div className="grid gap-2 mt-2">
                                {data.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center p-3 bg-muted rounded">
                                    <div className="flex-1">
                                      <div className="font-medium">{item.type}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {format(new Date(item.deliveryDate), 'dd/MM/yyyy')} - 
                                        {item.removalDate ? format(new Date(item.removalDate), 'dd/MM/yyyy') : 'En uso'}
                                      </div>
                                      <div className="text-sm mt-1">
                                        {item.totalDays} días × {item.dailyRate ? `${item.dailyRate}€` : '-'} = {item.total ? `${item.total}€` : '-'}
                                      </div>
                                    </div>
                                    <Dialog>
                                      <DialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setEditingRentalItem({ 
                                              reportId: (item as any).reportId, 
                                              groupId: (item as any).groupId, 
                                              item 
                                            });
                                            setEditedValues({
                                              deliveryDate: item.deliveryDate,
                                              removalDate: item.removalDate,
                                              dailyRate: item.dailyRate
                                            });
                                          }}
                                        >
                                          <Edit2 className="h-4 w-4" />
                                        </Button>
                                      </DialogTrigger>
                                      <DialogContent>
                                        <DialogHeader>
                                          <DialogTitle>Editar Maquinaria de Alquiler</DialogTitle>
                                          <DialogDescription>
                                            {item.type} - {provider}
                                          </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-4">
                                          <div>
                                            <Label>Fecha Entrega</Label>
                                            <Input
                                              type="date"
                                              value={editedValues.deliveryDate || item.deliveryDate}
                                              onChange={(e) => setEditedValues(prev => ({ ...prev, deliveryDate: e.target.value }))}
                                            />
                                          </div>
                                          <div>
                                            <Label>Fecha Baja (opcional)</Label>
                                            <Input
                                              type="date"
                                              value={editedValues.removalDate || item.removalDate || ''}
                                              onChange={(e) => setEditedValues(prev => ({ ...prev, removalDate: e.target.value }))}
                                            />
                                          </div>
                                          <div>
                                            <Label>Tarifa Diaria (€)</Label>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              value={editedValues.dailyRate !== undefined ? editedValues.dailyRate : (item.dailyRate || '')}
                                              onChange={(e) => setEditedValues(prev => ({ ...prev, dailyRate: parseFloat(e.target.value) || 0 }))}
                                            />
                                          </div>
                                        </div>
                                        <DialogFooter className="flex justify-between">
                                          <Button 
                                            variant="destructive"
                                            onClick={handleDeleteRentalItem}
                                          >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Eliminar
                                          </Button>
                                          <Button onClick={handleSaveRentalEdit}>
                                            <Save className="h-4 w-4 mr-2" />
                                            Guardar Cambios
                                          </Button>
                                        </DialogFooter>
                                      </DialogContent>
                                    </Dialog>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Número de Partes por Obra */}
              <TabsContent value="reports" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Número de Partes por Obra</CardTitle>
                    <CardDescription>Cantidad de partes generados por cada obra</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {reportsByWork.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-muted rounded">
                          <span className="font-medium">{item.work}</span>
                          <span className="text-2xl font-bold text-primary">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Análisis Económico */}
              <TabsContent value="economic" className="space-y-4">
                {economicAnalysis.reportCount === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      No hay datos económicos disponibles con los filtros seleccionados
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Costos por Categoría */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" />
                          Distribución de Costos por Categoría
                        </CardTitle>
                        <CardDescription>
                          Total: {economicAnalysis.totalCost.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Gráfico de Pastel */}
                          <div>
                            <ResponsiveContainer width="100%" height={300}>
                              <PieChart>
                                <Pie
                                  data={economicAnalysis.categoryData}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                                  outerRadius={100}
                                  fill="#8884d8"
                                  dataKey="value"
                                >
                                  {economicAnalysis.categoryData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  cursor={false}
                                  formatter={(value: any) => `${value.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          
                          {/* Lista de Categorías */}
                          <div className="space-y-3">
                            {economicAnalysis.categoryData.map((item, idx) => (
                              <div key={idx} className="p-3 rounded-lg" style={{ backgroundColor: `${item.color}20` }}>
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold">{item.name}</span>
                                  <span className="text-lg font-bold">
                                    {item.value.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                                  </span>
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {((item.value / economicAnalysis.totalCost) * 100).toFixed(1)}% del total
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Tendencia Mensual */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Evolución de Costos por Mes</CardTitle>
                        <CardDescription>Tendencia de gastos distribuidos por categoría</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={350}>
                          <LineChart data={economicAnalysis.monthlyTrendData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" fontSize={11} />
                            <YAxis fontSize={11} />
                            <Tooltip
                              cursor={false}
                              formatter={(value: any) => `${value.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="manoDeObra" stroke="hsl(var(--chart-1))" name="Mano de Obra" strokeWidth={2} />
                            <Line type="monotone" dataKey="maquinaria" stroke="hsl(var(--chart-2))" name="Maquinaria" strokeWidth={2} />
                            <Line type="monotone" dataKey="materiales" stroke="hsl(var(--chart-3))" name="Materiales" strokeWidth={2} />
                            <Line type="monotone" dataKey="subcontratas" stroke="hsl(var(--chart-4))" name="Subcontratas" strokeWidth={2} />
                            <Line type="monotone" dataKey="alquiler" stroke="hsl(var(--chart-5))" name="Alquiler" strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Costos por Obra */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Top 10 Obras por Costo</CardTitle>
                        <CardDescription>Obras con mayor inversión económica</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={400}>
                          <BarChart data={economicAnalysis.workData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" fontSize={11} />
                            <YAxis dataKey="work" type="category" width={200} fontSize={10} />
                            <Tooltip
                              cursor={false}
                              formatter={(value: any) => `${value.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`}
                            />
                            <Bar dataKey="cost" fill="hsl(var(--primary))" name="Costo Total" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Top Proveedores */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Top 10 Proveedores/Empresas por Gasto</CardTitle>
                        <CardDescription>Principales proveedores por volumen económico</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {economicAnalysis.topProviders.map((provider, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between items-center p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                                  {idx + 1}
                                </div>
                                <span className="font-medium">{provider.provider}</span>
                              </div>
                              <span className="text-lg font-bold">
                                {provider.cost.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                  </>
                )}
              </TabsContent>
            </Tabs>
          )}


          {/* Botones de exportación */}
          <div className="flex flex-wrap gap-2 justify-center">
            {/* Botón destacado para informe resumen IA */}
            <Button
              onClick={async () => {
                if (filteredReports.length === 0) {
                  toast({ title: "Sin datos", description: "No hay partes para analizar", variant: "destructive" });
                  return;
                }
                
                setIsGeneratingSummary(true);
                try {
                  // Preparar descripción del período
                  const periodLabel = dateRange === 'all' ? 'Todo el historial' :
                    dateRange === 'weekly' ? 'Esta semana' :
                    dateRange === 'monthly' ? 'Este mes' :
                    dateRange === 'quarterly' ? 'Últimos 3 meses' :
                    dateRange === 'yearly' ? 'Último año' :
                    `${startDate} a ${endDate}`;
                  
                  toast({ 
                    title: "Generando informe...", 
                    description: "Analizando datos con IA. Esto puede tardar unos segundos." 
                  });
                  
                  const data = await generateSummaryReport({
                    workReports: filteredReports as unknown as Record<string, unknown>[],
                    filters: {
                      period: periodLabel,
                      work: selectedWork !== 'all' ? availableWorks.find(w => w.id === selectedWork)?.name : 'Todas',
                    },
                    organizationId: organization?.id,
                  });
                  
                  if (!data.success) {
                    throw new Error(data.error || 'Error al generar el informe');
                  }

                  const pdfAnomalies = data.anomalies as Array<{
                    type: 'error' | 'info' | 'warning';
                    title: string;
                    description: string;
                    affectedItems?: string[];
                  }>;
                  const pdfChartData = data.chartData as {
                    monthlyTrends: Array<{
                      month: string;
                      workHours: number;
                      machineryHours: number;
                      materialCost: number;
                      subcontractCost: number;
                      reports: number;
                    }>;
                    costDistribution: Array<{ name: string; value: number; color: string }>;
                    topCompanies: Array<{ company: string; workHours: number; machineryHours: number; total: number }>;
                    topWorks: Array<{ work: string; reports: number; workHours: number; materialCost: number }>;
                    dayDistribution: Array<{ day: string; count: number }>;
                  };
                  
                  // Generar el PDF con los datos
                  await generateSummaryReportPDF(
                    {
                      statistics: data.statistics,
                      anomalies: pdfAnomalies,
                      aiAnalysis: data.aiAnalysis,
                      chartData: pdfChartData,
                      periodDescription: data.periodDescription,
                    },
                    {
                      companyName: organization?.name || organization?.commercial_name,
                      companyLogo: organization?.logo || undefined,
                      brandColor: organization?.brand_color || undefined,
                    }
                  );
                  
                  toast({ 
                    title: "¡Informe generado!", 
                    description: "El PDF con análisis IA se ha descargado correctamente." 
                  });
                } catch (error) {
                  console.error('Error generating summary report:', error);
                  toast({ 
                    title: "Error", 
                    description: error instanceof Error ? error.message : "No se pudo generar el informe", 
                    variant: "destructive" 
                  });
                } finally {
                  setIsGeneratingSummary(false);
                }
              }}
              disabled={filteredReports.length === 0 || isGeneratingSummary}
              className="bg-primary hover:bg-primary/90"
            >
              {isGeneratingSummary ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Brain className="h-4 w-4 mr-2" />
              )}
              {isGeneratingSummary ? 'Analizando con IA...' : 'Generar Informe Resumen IA'}
            </Button>
            
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await exportWeeklyReports(filteredReports);
                  toast({ title: "Exportado", description: "Excel semanal generado" });
                } catch (error) {
                  toast({ title: "Error", description: "No se pudo exportar", variant: "destructive" });
                }
              }}
              disabled={filteredReports.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Excel Semanal
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await exportMonthlyReports(filteredReports);
                  toast({ title: "Exportado", description: "Excel mensual generado" });
                } catch (error) {
                  toast({ title: "Error", description: "No se pudo exportar", variant: "destructive" });
                }
              }}
              disabled={filteredReports.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Excel Mensual
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await exportToExcel(filteredReports);
                  toast({ title: "Exportado", description: "Excel general generado" });
                } catch (error) {
                  toast({ title: "Error", description: "No se pudo exportar", variant: "destructive" });
                }
              }}
              disabled={filteredReports.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Excel General
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

