import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type RescanConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onContinue: () => void;
};

export const RescanConfirmDialog = ({
  open,
  onOpenChange,
  onCancel,
  onContinue,
}: RescanConfirmDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Re-escanear albarán</DialogTitle>
          <DialogDescription>
            Este albarán ya contiene datos. Si escaneas de nuevo, se sobrescribirán. ¿Quieres continuar?
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onContinue}>
            Continuar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export type { RescanConfirmDialogProps };

