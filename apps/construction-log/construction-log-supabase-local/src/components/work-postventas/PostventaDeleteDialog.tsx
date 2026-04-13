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
import type { WorkPostventa } from '@/hooks/useWorkPostventas';

interface PostventaDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postventa: WorkPostventa | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function PostventaDeleteDialog({
  open,
  onOpenChange,
  postventa,
  onCancel,
  onConfirm,
}: PostventaDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar post-venta?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. Se eliminará permanentemente la post-venta
            {postventa && ` "${postventa.code}"`}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Eliminar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
