import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type DuplicateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicateLabel?: string | null;
  onApplyToTarget: () => void;
  onOverwriteExisting: () => void;
  onCancel: () => void;
};

export const DuplicateDialog = ({
  open,
  onOpenChange,
  duplicateLabel,
  onApplyToTarget,
  onOverwriteExisting,
  onCancel,
}: DuplicateDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Albarán duplicado detectado</DialogTitle>
          <DialogDescription>
            Ya existe un albarán con este Proveedor y Nº. ¿Qué quieres hacer?
          </DialogDescription>
        </DialogHeader>

        {duplicateLabel ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Coincide con: {duplicateLabel}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onApplyToTarget}>
            Aplicar a este albarán
          </Button>
          <Button variant="outline" onClick={onOverwriteExisting}>
            Sobrescribir albarán existente
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export type { DuplicateDialogProps };

