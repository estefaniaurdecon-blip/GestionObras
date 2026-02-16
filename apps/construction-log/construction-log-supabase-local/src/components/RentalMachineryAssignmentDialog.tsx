import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar, User, Building2, Briefcase } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WorkRentalMachinery } from '@/hooks/useWorkRentalMachinery';
import { useRentalMachineryAssignments } from '@/hooks/useRentalMachineryAssignments';

interface RentalMachineryAssignmentDialogProps {
  machinery: WorkRentalMachinery;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const RentalMachineryAssignmentDialog = ({
  machinery,
  open,
  onOpenChange,
}: RentalMachineryAssignmentDialogProps) => {
  const { addAssignment } = useRentalMachineryAssignments({ 
    rentalMachineryId: machinery.id,
    workId: machinery.work_id 
  });

  const [formData, setFormData] = useState({
    assignment_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: '',
    operator_name: '',
    company_name: '',
    activity: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.operator_name || !formData.company_name || !formData.assignment_date) {
      return;
    }

    try {
      await addAssignment({
        rental_machinery_id: machinery.id,
        work_id: machinery.work_id,
        organization_id: machinery.organization_id,
        assignment_date: formData.assignment_date,
        end_date: formData.end_date || null,
        operator_name: formData.operator_name,
        company_name: formData.company_name,
        activity: formData.activity || null,
      });

      setFormData({
        assignment_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: '',
        operator_name: '',
        company_name: '',
        activity: '',
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating assignment:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Asignar Operador</DialogTitle>
          <DialogDescription>
            {machinery.type} - {machinery.machine_number}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">
                <Calendar className="h-4 w-4 inline mr-2" />
                Fecha de Inicio
              </Label>
              <Input
                id="date"
                type="date"
                value={formData.assignment_date}
                min={machinery.delivery_date}
                max={machinery.removal_date || undefined}
                onChange={(e) => setFormData({ ...formData, assignment_date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">
                <Calendar className="h-4 w-4 inline mr-2" />
                Fecha de Fin (opcional)
              </Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                min={formData.assignment_date}
                max={machinery.removal_date || undefined}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="operator">
              <User className="h-4 w-4 inline mr-2" />
              Nombre del Operador
            </Label>
            <Input
              id="operator"
              value={formData.operator_name}
              onChange={(e) => setFormData({ ...formData, operator_name: e.target.value })}
              placeholder="Juan Pérez"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">
              <Building2 className="h-4 w-4 inline mr-2" />
              Empresa del Operador
            </Label>
            <Input
              id="company"
              value={formData.company_name}
              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              placeholder="Empresa Construcciones"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="activity">
              <Briefcase className="h-4 w-4 inline mr-2" />
              Actividad/Tarea (opcional)
            </Label>
            <Textarea
              id="activity"
              value={formData.activity}
              onChange={(e) => setFormData({ ...formData, activity: e.target.value })}
              placeholder="Descripción de la tarea..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              Guardar Asignación
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
