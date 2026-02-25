import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type NoPriceScanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: string | null;
  invoiceNumber?: string | null;
  description?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export const NoPriceScanDialog = ({
  open,
  onOpenChange,
  supplier,
  invoiceNumber,
  description,
  onCancel,
  onConfirm,
}: NoPriceScanDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Albaran sin precios/importes</DialogTitle>
          <DialogDescription>
            Este albarán no incluye precios/importes, no se puede imputar coste en Materiales. ¿Quieres crear una línea OTROS con la descripción detectada?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-md border border-[#d9e1ea] bg-slate-50 p-3 text-sm">
          <div>
            <span className="font-medium text-slate-600">Proveedor:</span>{' '}
            {supplier || 'No detectado'}
          </div>
          <div>
            <span className="font-medium text-slate-600">Nº Albarán:</span>{' '}
            {invoiceNumber || 'No detectado'}
          </div>
          <div>
            <span className="font-medium text-slate-600">Descripción:</span>{' '}
            {description || 'OTROS'}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onConfirm}>
            Crear línea OTROS
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export type { NoPriceScanDialogProps };

