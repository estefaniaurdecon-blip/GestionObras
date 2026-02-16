import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Copy, FileText, Image, PenTool, CalendarIcon, Package, Leaf } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CloneOptions {
  includeImages: boolean;
  includeSignatures: boolean;
  includeMaterials: boolean;
  includeWaste: boolean;
  targetDate: string;
}

interface CloneOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (options: CloneOptions) => void;
  reportWorkName?: string;
  originalDate?: string;
}

export const CloneOptionsDialog = ({
  open,
  onOpenChange,
  onConfirm,
  reportWorkName,
  originalDate,
}: CloneOptionsDialogProps) => {
  const { t } = useTranslation();
  const defaultDate = originalDate ? addDays(new Date(originalDate), 1) : addDays(new Date(), 1);
  
  const [includeImages, setIncludeImages] = useState(false);
  const [includeSignatures, setIncludeSignatures] = useState(false);
  const [includeMaterials, setIncludeMaterials] = useState(true);
  const [includeWaste, setIncludeWaste] = useState(true);
  const [targetDate, setTargetDate] = useState<Date>(defaultDate);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const handleConfirm = () => {
    onConfirm({
      includeImages,
      includeSignatures,
      includeMaterials,
      includeWaste,
      targetDate: format(targetDate, 'yyyy-MM-dd'),
    });
    // Reset options for next time
    setIncludeImages(false);
    setIncludeSignatures(false);
    setIncludeMaterials(true);
    setIncludeWaste(true);
    setTargetDate(defaultDate);
  };

  const handleCancel = () => {
    onOpenChange(false);
    // Reset options
    setIncludeImages(false);
    setIncludeSignatures(false);
    setIncludeMaterials(true);
    setIncludeWaste(true);
    setTargetDate(defaultDate);
  };

  // Reset target date when dialog opens with new original date
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && originalDate) {
      setTargetDate(addDays(new Date(originalDate), 1));
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clonar Parte
          </DialogTitle>
          <DialogDescription>
            {reportWorkName && (
              <span className="font-medium text-foreground">{reportWorkName}</span>
            )}
            <br />
            Selecciona la fecha y qué datos deseas incluir en la copia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
          {/* Date selector */}
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-primary/5">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <Label className="font-medium">Fecha del parte clonado</Label>
              <p className="text-sm text-muted-foreground">
                Selecciona la fecha para el nuevo parte
              </p>
            </div>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[140px] justify-start text-left font-normal",
                    !targetDate && "text-muted-foreground"
                  )}
                >
                  {targetDate ? format(targetDate, "dd/MM/yyyy") : "Seleccionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={targetDate}
                  onSelect={(date) => {
                    if (date) {
                      setTargetDate(date);
                      setCalendarOpen(false);
                    }
                  }}
                  locale={es}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Text data - always included */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <FileText className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <Label className="font-medium">Datos de texto</Label>
              <p className="text-sm text-muted-foreground">
                Personal, maquinaria, materiales, subcontratas, observaciones
              </p>
            </div>
            <Checkbox checked disabled className="opacity-50" />
          </div>

          {/* Materials option */}
          <div 
            className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setIncludeMaterials(!includeMaterials)}
          >
            <Package className="h-5 w-5 text-amber-500" />
            <div className="flex-1">
              <Label className="font-medium cursor-pointer">Materiales</Label>
              <p className="text-sm text-muted-foreground">
                Incluir la sección de materiales del parte
              </p>
            </div>
            <Checkbox 
              checked={includeMaterials} 
              onCheckedChange={(checked) => setIncludeMaterials(checked === true)}
            />
          </div>

          {/* Waste management option */}
          <div 
            className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setIncludeWaste(!includeWaste)}
          >
            <Leaf className="h-5 w-5 text-success" />
            <div className="flex-1">
              <Label className="font-medium cursor-pointer">Gestión de Residuos</Label>
              <p className="text-sm text-muted-foreground">
                Clonar movimientos de residuos al nuevo parte
              </p>
            </div>
            <Checkbox 
              checked={includeWaste} 
              onCheckedChange={(checked) => setIncludeWaste(checked === true)}
            />
          </div>

          {/* Images option */}
          <div 
            className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setIncludeImages(!includeImages)}
          >
            <Image className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <Label className="font-medium cursor-pointer">Imágenes de albaranes</Label>
              <p className="text-sm text-muted-foreground">
                Fotos de albaranes escaneados adjuntos
              </p>
            </div>
            <Checkbox 
              checked={includeImages} 
              onCheckedChange={(checked) => setIncludeImages(checked === true)}
            />
          </div>

          {/* Signatures option */}
          <div 
            className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setIncludeSignatures(!includeSignatures)}
          >
            <PenTool className="h-5 w-5 text-emerald-500" />
            <div className="flex-1">
              <Label className="font-medium cursor-pointer">Firmas</Label>
              <p className="text-sm text-muted-foreground">
                Firma del encargado y jefe de obra
              </p>
            </div>
            <Checkbox 
              checked={includeSignatures} 
              onCheckedChange={(checked) => setIncludeSignatures(checked === true)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 flex-shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>
            <Copy className="h-4 w-4 mr-2" />
            Clonar Parte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
