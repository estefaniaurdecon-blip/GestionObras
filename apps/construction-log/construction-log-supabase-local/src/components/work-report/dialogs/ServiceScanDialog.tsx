import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ServiceScanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: string | null;
  invoiceNumber?: string | null;
  serviceDescription?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export const ServiceScanDialog = ({
  open,
  onOpenChange,
  supplier,
  invoiceNumber,
  serviceDescription,
  onCancel,
  onConfirm,
}: ServiceScanDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Documento de servicio detectado</DialogTitle>
          <DialogDescription>
            No se detectó una tabla de materiales clara. Se abrirá revisión sin generar líneas automáticas.
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
            {serviceDescription || 'SERVICIO'}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onConfirm}>
            Revisar escaneo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export type { ServiceScanDialogProps };

