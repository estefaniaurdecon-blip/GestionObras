import { AlertCircle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface CalendarTasksProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CalendarTasks = ({ open, onOpenChange }: CalendarTasksProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Calendario de Tareas</DialogTitle>
        </DialogHeader>
        <Alert className="border-amber-300 bg-amber-50 text-amber-950">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="space-y-3">
            <p>
              Este modulo dependia de tablas legacy en Supabase y se ha
              desactivado para evitar errores de runtime durante la migracion.
            </p>
            <p>
              Fase siguiente: reimplementarlo sobre el backend actual y un
              repositorio dedicado.
            </p>
          </AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
