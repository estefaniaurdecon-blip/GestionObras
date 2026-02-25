import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

type WasteRow = {
  id: string;
  name: string;
  detail: string;
  value: number;
  unit?: string;
};

type WasteSectionProps = {
  sectionTriggerClass: string;
  wasteRows: WasteRow[];
  setWasteRows: React.Dispatch<React.SetStateAction<WasteRow[]>>;
  parseNumeric: (value: string) => number;
  editableNumericValue: (value: number) => string | number;
};

export const WasteSection = ({
  sectionTriggerClass,
  wasteRows,
  setWasteRows,
  parseNumeric,
  editableNumericValue,
}: WasteSectionProps) => {
  const wasteTypeOptions = [
    { value: 'inertes', label: 'Inertes' },
    { value: 'madera', label: 'Madera' },
    { value: 'plastico', label: 'Plástico' },
    { value: 'metal', label: 'Metal' },
  ];
  const wasteUnitOptions = [
    { value: 'kg', label: 'Kg' },
    { value: 'm3', label: 'M3' },
    { value: 'contenedor', label: 'Contenedor' },
  ];

  const updateWasteRow = (rowId: string, patch: Partial<WasteRow>) => {
    setWasteRows((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  };

  return (
    <AccordionItem value="waste" className="rounded-md border border-[#d9e1ea] bg-white px-4">
      <AccordionTrigger className={sectionTriggerClass}>Gestión de residuos</AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3 pt-2">
          {wasteRows.map((row) => (
            <div key={row.id} className="grid grid-cols-1 gap-2 md:grid-cols-5">
              <Input
                placeholder="Residuo"
                value={row.name}
                onChange={(event) => updateWasteRow(row.id, { name: event.target.value })}
              />
              <Select value={row.detail || undefined} onValueChange={(value) => updateWasteRow(row.id, { detail: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  {wasteTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={editableNumericValue(row.value)}
                onChange={(event) => updateWasteRow(row.id, { value: parseNumeric(event.target.value) })}
                placeholder="Cantidad"
              />
              <Select value={row.unit || ''} onValueChange={(value) => updateWasteRow(row.id, { unit: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Unidad" />
                </SelectTrigger>
                <SelectContent>
                  {wasteUnitOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => setWasteRows(wasteRows.filter((item) => item.id !== row.id))}
                disabled={wasteRows.length === 1}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              setWasteRows((rows) => [
                ...rows,
                { id: crypto.randomUUID(), name: '', detail: '', value: 0, unit: wasteUnitOptions[0].value },
              ])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Añadir fila en residuos
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export type { WasteSectionProps };
