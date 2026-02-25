import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

type WorkReportHeaderCardProps = {
  panelTitle: string;
  onBack: () => void;
  reportIdentifier?: string | null;
  readOnly: boolean;
  isClonedReport: boolean;
  cloneSourceLabel: string;
  workNumber: string;
  onWorkNumberChange: (value: string) => void;
  workDatePickerOpen: boolean;
  onWorkDatePickerOpenChange: (open: boolean) => void;
  selectedWorkDate: Date | undefined;
  onWorkDateSelect: (selectedDate: Date) => void;
  workName: string;
  onWorkNameChange: (value: string) => void;
};

export const WorkReportHeaderCard = ({
  panelTitle,
  onBack,
  reportIdentifier,
  readOnly,
  isClonedReport,
  cloneSourceLabel,
  workNumber,
  onWorkNumberChange,
  workDatePickerOpen,
  onWorkDatePickerOpenChange,
  selectedWorkDate,
  onWorkDateSelect,
  workName,
  onWorkNameChange,
}: WorkReportHeaderCardProps) => {
  return (
    <div className="rounded-xl border bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
          <Button variant="outline" disabled>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Anterior
          </Button>
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">0 / 0</div>
          <Button variant="outline" disabled>
            Siguiente
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
        <h2 className="text-lg font-semibold">{panelTitle}</h2>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        {reportIdentifier ? <span className="rounded-md border px-2 py-1">ID: {reportIdentifier}</span> : null}
        {readOnly ? <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1">Parte cerrado: solo visualización</span> : null}
      </div>

      {isClonedReport ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          <div className="text-sm font-medium">Parte clonado - Revisión necesaria</div>
          <div className="text-sm text-amber-800">
            Este parte se ha clonado. Revisa y actualiza los datos antes de guardar.
            {cloneSourceLabel ? ` Origen: ${cloneSourceLabel}.` : ''}
          </div>
        </div>
      ) : null}

      <Card className="mt-3">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 border-b md:grid-cols-2">
            <div className="border-b p-4 md:border-b-0 md:border-r">
              <Label htmlFor="work-number">Nº Obra</Label>
              <Input id="work-number" className="mt-2" value={workNumber} onChange={(event) => onWorkNumberChange(event.target.value)} />
            </div>
            <div className="p-4">
              <Label htmlFor="work-date">Día</Label>
              <Popover open={workDatePickerOpen} onOpenChange={onWorkDatePickerOpenChange}>
                <PopoverTrigger asChild>
                  <Button
                    id="work-date"
                    type="button"
                    variant="outline"
                    className={`mt-2 w-full justify-between text-left font-normal ${
                      selectedWorkDate ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {selectedWorkDate
                      ? format(selectedWorkDate, 'dd/MM/yyyy', { locale: es })
                      : 'Seleccionar fecha'}
                    <CalendarDays className="ml-2 h-4 w-4 shrink-0 opacity-70" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedWorkDate}
                    onSelect={(selectedDate) => {
                      if (!selectedDate) return;
                      onWorkDateSelect(selectedDate);
                    }}
                    locale={es}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="p-4">
            <Label htmlFor="work-name">Nombre de la obra</Label>
            <Input
              id="work-name"
              className="mt-2"
              value={workName}
              placeholder="Nombre de la obra"
              onChange={(event) => onWorkNameChange(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export type { WorkReportHeaderCardProps };
