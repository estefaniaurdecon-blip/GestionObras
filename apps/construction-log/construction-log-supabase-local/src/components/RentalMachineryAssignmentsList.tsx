import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Trash2, Calendar, User, Building2, Briefcase } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRentalMachineryAssignments, RentalMachineryAssignment } from '@/hooks/useRentalMachineryAssignments';
import { WorkRentalMachinery } from '@/hooks/useWorkRentalMachinery';

interface RentalMachineryAssignmentsListProps {
  machinery: WorkRentalMachinery;
}

export const RentalMachineryAssignmentsList = ({
  machinery,
}: RentalMachineryAssignmentsListProps) => {
  const { assignments, loading, deleteAssignment } = useRentalMachineryAssignments({
    rentalMachineryId: machinery.id,
    workId: machinery.work_id,
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (deleteId) {
      await deleteAssignment(deleteId);
      setDeleteId(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Cargando asignaciones...</div>;
  }

  if (assignments.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No hay asignaciones de operadores para esta maquinaria
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {assignments.map((assignment) => (
          <Card key={assignment.id} className="border-l-4 border-l-primary">
            <CardContent className="pt-4">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {format(new Date(assignment.assignment_date), "d 'de' MMMM, yyyy", { locale: es })}
                      {assignment.end_date && (
                        <> - {format(new Date(assignment.end_date), "d 'de' MMMM, yyyy", { locale: es })}</>
                      )}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{assignment.operator_name}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{assignment.company_name}</span>
                  </div>
                  
                  {assignment.activity && (
                    <div className="flex items-start gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <span className="text-sm text-muted-foreground">{assignment.activity}</span>
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteId(assignment.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar asignación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la asignación del operador para esta fecha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
