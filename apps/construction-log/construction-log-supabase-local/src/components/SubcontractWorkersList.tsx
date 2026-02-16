import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SubcontractWorker } from '@/types/workReport';
import { Plus, Trash2, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface SubcontractWorkersListProps {
  workers: SubcontractWorker[];
  onChange: (workers: SubcontractWorker[]) => void;
  itemHours?: number;
}

export const SubcontractWorkersList = ({ workers, onChange, itemHours }: SubcontractWorkersListProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const addWorker = () => {
    const newWorker: SubcontractWorker = {
      id: crypto.randomUUID(),
      name: '',
      dni: '',
      category: '',
      hours: itemHours || 0,
    };
    onChange([...workers, newWorker]);
    setIsOpen(true);
  };

  const updateWorker = (id: string, updates: Partial<SubcontractWorker>) => {
    onChange(workers.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const removeWorker = (id: string) => {
    onChange(workers.filter(w => w.id !== id));
  };

  const workerCount = workers.length;

  return (
    <div className="mt-2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <Users className="h-3 w-3 mr-1" />
              {workerCount > 0 ? `${workerCount} trabajador${workerCount !== 1 ? 'es' : ''}` : 'Trabajadores'}
              {isOpen ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
          </CollapsibleTrigger>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={addWorker}
            className="h-7 px-2 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Añadir
          </Button>
        </div>
        
        <CollapsibleContent>
          {workers.length > 0 && (
            <div className="mt-2 border border-border rounded-md overflow-hidden bg-muted/30">
              {/* Header */}
              <div className="hidden sm:grid grid-cols-12 gap-2 p-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                <div className="col-span-4">Nombre y Apellidos</div>
                <div className="col-span-3">DNI</div>
                <div className="col-span-3">Categoría</div>
                <div className="col-span-1">Horas</div>
                <div className="col-span-1"></div>
              </div>
              
              {/* Workers */}
              <div className="divide-y divide-border">
                {workers.map((worker) => (
                  <div key={worker.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2 items-center">
                    <div className="sm:col-span-4">
                      <label className="text-xs text-muted-foreground sm:hidden mb-1 block">Nombre:</label>
                      <Input
                        value={worker.name}
                        onChange={(e) => updateWorker(worker.id, { name: e.target.value })}
                        placeholder="Nombre y Apellidos"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="text-xs text-muted-foreground sm:hidden mb-1 block">DNI:</label>
                      <Input
                        value={worker.dni}
                        onChange={(e) => updateWorker(worker.id, { dni: e.target.value })}
                        placeholder="12345678A"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="text-xs text-muted-foreground sm:hidden mb-1 block">Categoría:</label>
                      <Input
                        value={worker.category}
                        onChange={(e) => updateWorker(worker.id, { category: e.target.value })}
                        placeholder="Oficial, Peón..."
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="text-xs text-muted-foreground sm:hidden mb-1 block">Horas:</label>
                      <Input
                        type="number"
                        step="0.5"
                        value={worker.hours || ''}
                        onChange={(e) => updateWorker(worker.id, { hours: e.target.value === '' ? 0 : Number(e.target.value) })}
                        placeholder="0"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeWorker(worker.id)}
                        className="h-7 w-7 p-0 text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Resumen */}
              {workers.length > 0 && (
                <div className="p-2 bg-muted/50 border-t text-xs text-muted-foreground">
                  Total: {workers.length} trabajador{workers.length !== 1 ? 'es' : ''} - 
                  {workers.reduce((sum, w) => sum + (w.hours || 0), 0)} horas
                </div>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
