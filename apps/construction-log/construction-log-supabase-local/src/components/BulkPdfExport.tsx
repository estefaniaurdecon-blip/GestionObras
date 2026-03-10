import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarIcon, Calendar as CalendarDaysIcon, Clock, Package, Image as ImageIcon, Download, FileArchive } from 'lucide-react';
import { WorkReport } from '@/types/workReport';
import { generateWorkReportPDF } from '@/utils/pdfGenerator';
import { useToast } from '@/hooks/use-toast';
import JSZip from 'jszip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';

interface BulkPdfExportProps {
  reports: WorkReport[];
  companyLogo?: string;
  brandColor?: string;
}

export function BulkPdfExport({ reports, companyLogo, brandColor }: BulkPdfExportProps) {
  const [exportPeriod, setExportPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [includeImages, setIncludeImages] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const getFilteredReportsByDate = () => {
    return reports.filter(report => {
      const reportDate = new Date(report.date);
      
      switch (exportPeriod) {
        case 'day':
          return isSameDay(reportDate, selectedDate);
        case 'week': {
          const weekStart = startOfWeek(selectedDate, { locale: es, weekStartsOn: 1 });
          const weekEnd = endOfWeek(selectedDate, { locale: es, weekStartsOn: 1 });
          return isWithinInterval(reportDate, { start: weekStart, end: weekEnd });
        }
        case 'month': {
          const monthStart = startOfMonth(selectedDate);
          const monthEnd = endOfMonth(selectedDate);
          return isWithinInterval(reportDate, { start: monthStart, end: monthEnd });
        }
        default:
          return false;
      }
    });
  };

  const handleBulkExport = async () => {
    const filteredReports = getFilteredReportsByDate();
    
    if (filteredReports.length === 0) {
      toast({
        title: "Sin partes",
        description: "No hay partes disponibles para el periodo seleccionado",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    let exportedCount = 0;
    let errorCount = 0;

    try {
      const zip = new JSZip();
      
      // Generar todos los PDFs y agregarlos al ZIP
      for (const report of filteredReports) {
        try {
          const pdfBlob = await generateWorkReportPDF(report, includeImages, companyLogo, brandColor, true) as Blob;
          
          const fileName = `Parte_${report.workName || 'Obra'}_${format(new Date(report.date), 'dd-MM-yyyy', { locale: es })}_${report.foreman || 'Encargado'}.pdf`;
          zip.file(fileName, pdfBlob);
          exportedCount++;
        } catch (error) {
          console.error(`Error exportando parte ${report.id}:`, error);
          errorCount++;
        }
      }

      // Generar el nombre del archivo ZIP
      const periodLabel = exportPeriod === 'day' 
        ? format(selectedDate, 'dd-MM-yyyy', { locale: es })
        : exportPeriod === 'week'
        ? `Semana_${format(startOfWeek(selectedDate, { locale: es, weekStartsOn: 1 }), 'dd-MM', { locale: es })}_a_${format(endOfWeek(selectedDate, { locale: es, weekStartsOn: 1 }), 'dd-MM-yyyy', { locale: es })}`
        : format(selectedDate, 'MMMM-yyyy', { locale: es });
      
      const foremanName = filteredReports[0]?.foreman || 'Encargado';
      const workNumber = filteredReports[0]?.workNumber || 'Obra';
      const zipFileName = `Partes_${periodLabel}_${foremanName}_${workNumber}.zip`;

      // Generar y descargar el ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Exportación completada",
        description: `${exportedCount} partes exportados correctamente en ZIP${errorCount > 0 ? `. ${errorCount} partes con errores` : ''}`,
      });
    } catch (error) {
      console.error('Error en exportación masiva:', error);
      toast({
        title: "Error en la exportación",
        description: "Ocurrió un error durante la exportación masiva",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getDateLabel = () => {
    switch (exportPeriod) {
      case 'day':
        return format(selectedDate, "d 'de' MMMM yyyy", { locale: es });
      case 'week': {
        const weekStart = startOfWeek(selectedDate, { locale: es, weekStartsOn: 1 });
        const weekEnd = endOfWeek(selectedDate, { locale: es, weekStartsOn: 1 });
        return `${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM yyyy", { locale: es })}`;
      }
      case 'month':
        return format(selectedDate, "MMMM yyyy", { locale: es });
      default:
        return '';
    }
  };

  const filteredCount = getFilteredReportsByDate().length;
  
  const getPeriodIcon = () => {
    switch (exportPeriod) {
      case 'day':
        return <Clock className="h-5 w-5" />;
      case 'week':
        return <CalendarDaysIcon className="h-5 w-5" />;
      case 'month':
        return <Package className="h-5 w-5" />;
    }
  };

  return (
    <Card className="overflow-hidden border-2 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-primary/10 via-primary/5 to-background pb-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl flex items-center gap-2">
              <FileArchive className="h-6 w-6 text-primary" />
              Exportación Masiva
            </CardTitle>
            <CardDescription className="text-base">
              Genera un archivo ZIP con múltiples partes de trabajo
            </CardDescription>
          </div>
          {filteredCount > 0 && (
            <Badge variant="secondary" className="text-lg px-4 py-2 font-bold">
              {filteredCount} parte{filteredCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {/* Selector de Periodo */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-2">
            {getPeriodIcon()}
            Periodo de Exportación
          </Label>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={exportPeriod === 'day' ? 'default' : 'outline'}
              onClick={() => setExportPeriod('day')}
              className="h-auto py-4 flex flex-col items-center gap-2"
            >
              <Clock className="h-5 w-5" />
              <span>Día</span>
            </Button>
            <Button
              variant={exportPeriod === 'week' ? 'default' : 'outline'}
              onClick={() => setExportPeriod('week')}
              className="h-auto py-4 flex flex-col items-center gap-2"
            >
              <CalendarDaysIcon className="h-5 w-5" />
              <span>Semana</span>
            </Button>
            <Button
              variant={exportPeriod === 'month' ? 'default' : 'outline'}
              onClick={() => setExportPeriod('month')}
              className="h-auto py-4 flex flex-col items-center gap-2"
            >
              <Package className="h-5 w-5" />
              <span>Mes</span>
            </Button>
          </div>
        </div>

        {/* Selector de Fecha */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            Fecha Seleccionada
          </Label>
            <Input
              id="bulk-date"
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => {
                const v = e.target.value;
                if (v) setSelectedDate(new Date(v));
              }}
              className="work-form-input mt-1"
            />
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="secondary" onClick={() => { setExportPeriod('day'); setSelectedDate(new Date()); }}>
              Hoy
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setExportPeriod('week'); setSelectedDate(new Date()); }}>
              Esta semana
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setExportPeriod('month'); setSelectedDate(new Date()); }}>
              Este mes
            </Button>
          </div>
        </div>

        {/* Opciones adicionales */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-3 border">
          <Label className="text-sm font-semibold">Opciones de Exportación</Label>
          <div className="flex items-center space-x-3 p-3 bg-background rounded-md border">
            <Checkbox 
              id="includeImages" 
              checked={includeImages}
              onCheckedChange={(checked) => setIncludeImages(checked as boolean)}
              className="h-5 w-5"
            />
            <Label 
              htmlFor="includeImages" 
              className="cursor-pointer flex items-center gap-2 flex-1 text-base"
            >
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              Incluir imágenes de albaranes en PDFs
            </Label>
          </div>
        </div>

        {/* Botón de exportación */}
        <div className="pt-4">
          {filteredCount === 0 ? (
            <div className="text-center p-6 bg-muted/50 rounded-lg border-2 border-dashed">
              <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground font-medium">
                No hay partes disponibles para el periodo seleccionado
              </p>
            </div>
          ) : (
            <Button 
              onClick={handleBulkExport}
              disabled={isExporting}
              className="w-full h-14 text-lg font-semibold gap-3 shadow-lg hover:shadow-xl transition-all"
              size="lg"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Generando archivo ZIP...
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" />
                  Exportar {filteredCount} parte{filteredCount !== 1 ? 's' : ''} en ZIP
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
