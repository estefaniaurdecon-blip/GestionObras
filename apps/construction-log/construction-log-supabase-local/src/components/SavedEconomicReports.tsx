import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { toast } from '@/hooks/use-toast';
import { FileDown, FileSpreadsheet, FileText, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateEconomicReportPDF } from '@/utils/economicReportPdfGenerator';
import { supabase } from '@/integrations/api/legacySupabaseRemoved';

interface SavedEconomicReport {
  id: string;
  work_report_id: string;
  work_name: string;
  work_number: string;
  date: string;
  foreman: string;
  site_manager: string;
  work_groups: any[];
  machinery_groups: any[];
  material_groups: any[];
  subcontract_groups: any[];
  rental_machinery_groups: any[];
  total_amount: number;
  created_at: string;
}

type GroupingType = 'day' | 'week' | 'month';

export const SavedEconomicReports = () => {
  const { user } = useAuth();
  const { companySettings } = useCompanySettings();
  const [reports, setReports] = useState<SavedEconomicReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [grouping, setGrouping] = useState<GroupingType>('day');

  useEffect(() => {
    loadReports();
  }, [user]);

  const loadReports = async () => {
    if (!user) {
      setReports([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('saved_economic_reports')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      setReports((data || []) as SavedEconomicReport[]);
    } catch (error) {
      console.error('Error loading saved reports:', error);
      // Evitar mostrar error si ya hay datos visibles
      if (reports.length === 0) {
        toast({
          title: "Error",
          description: "No se pudieron cargar los reportes guardados.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const groupReportsByPeriod = () => {
    const grouped: { [key: string]: SavedEconomicReport[] } = {};

    reports.forEach(report => {
      const date = parseISO(report.date);
      let key: string;

      switch (grouping) {
        case 'week':
          const weekStart = startOfWeek(date, { locale: es });
          const weekEnd = endOfWeek(date, { locale: es });
          key = `${format(weekStart, 'dd/MM/yyyy', { locale: es })} - ${format(weekEnd, 'dd/MM/yyyy', { locale: es })}`;
          break;
        case 'month':
          key = format(date, 'MMMM yyyy', { locale: es });
          break;
        default: // day
          key = format(date, 'dd/MM/yyyy', { locale: es });
      }

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(report);
    });

    return grouped;
  };

  const calculatePeriodTotal = (periodReports: SavedEconomicReport[]) => {
    return periodReports.reduce((sum, report) => sum + Number(report.total_amount), 0);
  };

  const exportIndividualToExcel = async (report: SavedEconomicReport) => {
    const XLSX = await import('xlsx-js-style');
    const wb = XLSX.utils.book_new();
    const fmtMoney = (n: any) => {
      if (n == null || n === '' || isNaN(Number(n))) return '0.00';
      return Number(n).toFixed(2);
    };

    // Flatten the data structure
    const workItems = (report.work_groups || []).flatMap((group: any) =>
      (group.items || []).map((item: any) => ({
        company: group.company || group.employer || '-',
        name: item.name || item.worker || item.employee || item.personName || '-',
        category: item.category || item.role || '-',
        hours: Number(item.hours) || 0,
        pricePerHour: Number(item.pricePerHour ?? item.price_per_hour ?? 0),
        total: Number(item.total ?? 0),
      }))
    );

    const machineryItems = (report.machinery_groups || []).flatMap((group: any) =>
      (group.items || []).map((item: any) => ({
        company: group.company || '-',
        type: item.type || item.name || '-',
        activity: item.activity || '-',
        hours: Number(item.hours) || 0,
        pricePerHour: Number(item.pricePerHour ?? item.price_per_hour ?? 0),
        total: Number(item.total ?? 0),
      }))
    );

    const rentalMachineryItems = (report.rental_machinery_groups || []).flatMap((group: any) =>
      (group.items || []).map((item: any) => {
        const fuelTotal = Array.isArray(item.fuelRefills)
          ? item.fuelRefills.reduce((s: number, r: any) => s + Number(r.total || 0), 0)
          : Number(item.fuelRefillsTotal || 0);
        return {
          company: group.company || '-',
          type: item.type || item.name || '-',
          activity: item.activity || '-',
          hours: Number(item.hours) || 0,
          pricePerHour: Number(item.pricePerHour ?? item.price_per_hour ?? 0),
          fuelTotal,
          total: Number(item.total ?? 0),
        };
      })
    );

    const materialItems = (report.material_groups || []).flatMap((group: any) =>
      (group.items || []).map((item: any) => ({
        supplier: group.supplier || item.supplier || '-',
        description: item.description || item.name || item.material || '-',
        quantity: Number(item.quantity) || 0,
        unit: item.unit || '-',
        pricePerUnit: Number(item.pricePerUnit ?? item.price_per_unit ?? 0),
        total: Number(item.total ?? 0),
      }))
    );

    const subcontractItems = (report.subcontract_groups || []).map((item: any) => ({
      company: item.company || '-',
      description: item.description || '-',
      amount: Number(item.amount ?? 0),
    }));

    // Calculate totals
    const workTotal = workItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const machineryTotal = machineryItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const rentalMachineryTotal = rentalMachineryItems.reduce((sum, item) => sum + Number(item.total || 0) + Number(item.fuelTotal || 0), 0);
    const materialTotal = materialItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const subcontractTotal = subcontractItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    // RESUMEN SHEET
    const summaryData: any[][] = [
      ['PARTE ECONÓMICO DE TRABAJO'],
      [],
      ['Obra:', report.work_name],
      ['Número de Obra:', report.work_number],
      ['Fecha:', format(parseISO(report.date), 'dd/MM/yyyy', { locale: es })],
      ['Encargado:', report.foreman || '-'],
      ['Jefe de Obra:', report.site_manager || '-'],
      [],
      [],
      ['RESUMEN DE COSTES'],
      [],
      ['Categoría', 'Total (€)'],
      ['Mano de Obra', fmtMoney(workTotal)],
      ['Maquinaria de Subcontratas', fmtMoney(machineryTotal)],
      ['Maquinaria Alquilada', fmtMoney(rentalMachineryTotal)],
      ['Materiales', fmtMoney(materialTotal)],
      ['Subcontratas', fmtMoney(subcontractTotal)],
      [],
      ['TOTAL GENERAL', fmtMoney(report.total_amount)],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

    // MANO DE OBRA SHEET
    if (workItems.length > 0) {
      const workData: any[][] = [
        ['MANO DE OBRA'],
        [],
        ['Empresa', 'Nombre', 'Categoría', 'Horas', 'Precio/h (€)', 'Total (€)'],
      ];
      workItems.forEach(item => {
        workData.push([
          item.company,
          item.name,
          item.category,
          item.hours,
          fmtMoney(item.pricePerHour),
          fmtMoney(item.total),
        ]);
      });
      workData.push([]);
      workData.push(['', '', '', '', 'TOTAL:', fmtMoney(workTotal)]);
      const wsWork = XLSX.utils.aoa_to_sheet(workData);
      XLSX.utils.book_append_sheet(wb, wsWork, 'Mano de Obra');
    }

    // MAQUINARIA DE SUBCONTRATAS SHEET
    if (machineryItems.length > 0) {
      const machineryData: any[][] = [
        ['MAQUINARIA DE SUBCONTRATAS'],
        [],
        ['Empresa', 'Tipo', 'Actividad', 'Horas', 'Precio/h (€)', 'Total (€)'],
      ];
      machineryItems.forEach(item => {
        machineryData.push([
          item.company,
          item.type,
          item.activity,
          item.hours,
          fmtMoney(item.pricePerHour),
          fmtMoney(item.total),
        ]);
      });
      machineryData.push([]);
      machineryData.push(['', '', '', '', 'TOTAL:', fmtMoney(machineryTotal)]);
      const wsMachinery = XLSX.utils.aoa_to_sheet(machineryData);
      XLSX.utils.book_append_sheet(wb, wsMachinery, 'Maq. Subcontratas');
    }

    // MAQUINARIA ALQUILADA SHEET
    if (rentalMachineryItems.length > 0) {
      const rentalData: any[][] = [
        ['MAQUINARIA ALQUILADA'],
        [],
        ['Empresa', 'Tipo', 'Actividad', 'Horas', 'Precio/h (€)', 'Repostajes (€)', 'Total (€)'],
      ];
      rentalMachineryItems.forEach(item => {
        rentalData.push([
          item.company,
          item.type,
          item.activity,
          item.hours,
          fmtMoney(item.pricePerHour),
          fmtMoney(item.fuelTotal),
          fmtMoney(item.total),
        ]);
      });
      rentalData.push([]);
      rentalData.push(['', '', '', '', '', 'TOTAL:', fmtMoney(rentalMachineryTotal)]);
      const wsRental = XLSX.utils.aoa_to_sheet(rentalData);
      XLSX.utils.book_append_sheet(wb, wsRental, 'Maq. Alquilada');
    }

    // MATERIALES SHEET
    if (materialItems.length > 0) {
      const materialData: any[][] = [
        ['MATERIALES'],
        [],
        ['Proveedor', 'Descripción', 'Cantidad', 'Unidad', 'Precio/u (€)', 'Total (€)'],
      ];
      materialItems.forEach(item => {
        materialData.push([
          item.supplier,
          item.description,
          item.quantity,
          item.unit,
          fmtMoney(item.pricePerUnit),
          fmtMoney(item.total),
        ]);
      });
      materialData.push([]);
      materialData.push(['', '', '', '', 'TOTAL:', fmtMoney(materialTotal)]);
      const wsMaterial = XLSX.utils.aoa_to_sheet(materialData);
      XLSX.utils.book_append_sheet(wb, wsMaterial, 'Materiales');
    }

    // SUBCONTRATAS SHEET
    if (subcontractItems.length > 0) {
      const subcontractData: any[][] = [
        ['SUBCONTRATAS'],
        [],
        ['Empresa', 'Descripción', 'Importe (€)'],
      ];
      subcontractItems.forEach(item => {
        subcontractData.push([
          item.company,
          item.description,
          fmtMoney(item.amount),
        ]);
      });
      subcontractData.push([]);
      subcontractData.push(['', 'TOTAL:', fmtMoney(subcontractTotal)]);
      const wsSubcontract = XLSX.utils.aoa_to_sheet(subcontractData);
      XLSX.utils.book_append_sheet(wb, wsSubcontract, 'Subcontratas');
    }

    const fileName = `Parte_Económico_${report.work_number}_${format(parseISO(report.date), 'dd-MM-yyyy')}.xlsx`;
    
    // Detectar si es Capacitor (Android/iOS)
    if ((window as any).Capacitor?.isNativePlatform()) {
      // Para Android/iOS, usar Capacitor Filesystem
      import('@/utils/nativeFile').then(async ({ blobToBase64, saveBase64File }) => {
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        await saveBase64File(fileName, wbout);
        
        toast({
          title: "Exportación exitosa",
          description: "El archivo Excel se ha guardado correctamente.",
        });
      });
    } else {
      // Para web/Electron, descarga estándar
      XLSX.writeFile(wb, fileName);
      
      toast({
        title: "Exportación exitosa",
        description: "El archivo Excel se ha descargado con pestañas separadas por categoría.",
      });
    }
  };

  const exportIndividualReportPDF = (report: SavedEconomicReport) => {
    generateEconomicReportPDF(report, companySettings.logo);
    
    toast({
      title: "Exportación exitosa",
      description: "El parte económico se ha descargado correctamente.",
    });
  };

  const handleDelete = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from('saved_economic_reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;

      toast({
        title: "Parte eliminado",
        description: "El parte económico se ha eliminado correctamente.",
      });

      loadReports();
    } catch (error: any) {
      console.error('Error deleting report:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el parte.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div>Cargando...</div>;
  }

  const groupedReports = groupReportsByPeriod();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Partes Guardados - Gestión Económica</CardTitle>
          <CardDescription>
            Visualiza y exporta los partes con precios guardados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center mb-6">
            <label className="text-sm font-medium mr-2">Agrupar por:</label>
            <Select value={grouping} onValueChange={(value) => setGrouping(value as GroupingType)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Día</SelectItem>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="month">Mes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-6">
            {Object.entries(groupedReports).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No hay partes guardados
              </p>
            ) : (
              Object.entries(groupedReports).map(([period, periodReports]) => (
                <div key={period} className="space-y-3">
                  <div className="flex items-center justify-between bg-muted p-3 rounded-lg">
                    <h3 className="font-semibold">{period}</h3>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        {periodReports.length} parte{periodReports.length !== 1 ? 's' : ''}
                      </span>
                      <span className="font-semibold">
                        Total: {calculatePeriodTotal(periodReports).toFixed(2)} €
                      </span>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Obra</TableHead>
                        <TableHead>Nº Obra</TableHead>
                        <TableHead>Encargado</TableHead>
                        <TableHead>Jefe de Obra</TableHead>
                        <TableHead className="text-right">Total (€)</TableHead>
                        <TableHead className="text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {periodReports.map((report) => (
                        <TableRow key={report.id}>
                          <TableCell>
                            {format(parseISO(report.date), 'dd/MM/yyyy', { locale: es })}
                          </TableCell>
                          <TableCell>{report.work_name}</TableCell>
                          <TableCell>{report.work_number}</TableCell>
                          <TableCell>{report.foreman || '-'}</TableCell>
                          <TableCell>{report.site_manager || '-'}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {Number(report.total_amount).toFixed(2)} €
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex gap-2 justify-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => exportIndividualToExcel(report)}
                                title="Exportar a Excel"
                              >
                                <FileSpreadsheet className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => exportIndividualReportPDF(report)}
                                title="Exportar a PDF"
                              >
                                <FileDown className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => exportIndividualReportPDF(report)}
                                title="Ver PDF detallado"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Eliminar parte"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar parte económico?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción no se puede deshacer. Se eliminará permanentemente el parte económico guardado.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(report.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Eliminar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
