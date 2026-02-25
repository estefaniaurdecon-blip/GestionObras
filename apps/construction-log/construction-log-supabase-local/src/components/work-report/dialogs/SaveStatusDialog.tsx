import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, FileBadge2, FileWarning } from 'lucide-react';

type SaveStatusOption = 'completed' | 'missing_data' | 'missing_delivery_notes';

type SaveStatusDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: SaveStatusOption[];
  onToggle: (option: SaveStatusOption) => void;
  onConfirm: () => void;
  saving: boolean;
  readOnly: boolean;
};

export const SaveStatusDialog = ({
  open,
  onOpenChange,
  selection,
  onToggle,
  onConfirm,
  saving,
  readOnly,
}: SaveStatusDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Estado del Parte de Trabajo</DialogTitle>
          <DialogDescription>
            Selecciona uno o más estados según corresponda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Puedes seleccionar ambos estados de validación. <span className="font-medium">Completado</span> deselecciona el resto.
          </div>

          <button
            type="button"
            className={`w-full rounded-md border p-4 text-left transition-colors ${
              selection.includes('completed')
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
            onClick={() => onToggle('completed')}
          >
            <div className="flex items-start gap-3">
              <CheckCircle2
                className={`mt-0.5 h-5 w-5 ${
                  selection.includes('completed') ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <div>
                <div className={`text-lg font-semibold ${selection.includes('completed') ? 'text-emerald-700' : 'text-slate-700'}`}>
                  Completado
                </div>
                <div className="text-sm text-muted-foreground">El parte está completo y listo.</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            className={`w-full rounded-md border p-4 text-left transition-colors ${
              selection.includes('missing_data')
                ? 'border-amber-300 bg-amber-50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
            onClick={() => onToggle('missing_data')}
          >
            <div className="flex items-start gap-3">
              <FileWarning
                className={`mt-0.5 h-5 w-5 ${
                  selection.includes('missing_data') ? 'text-amber-600' : 'text-slate-400'
                }`}
              />
              <div>
                <div className={`text-lg font-semibold ${selection.includes('missing_data') ? 'text-amber-700' : 'text-slate-700'}`}>
                  Faltan Datos
                </div>
                <div className="text-sm text-muted-foreground">Faltan datos por completar.</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            className={`w-full rounded-md border p-4 text-left transition-colors ${
              selection.includes('missing_delivery_notes')
                ? 'border-rose-300 bg-rose-50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
            onClick={() => onToggle('missing_delivery_notes')}
          >
            <div className="flex items-start gap-3">
              <FileBadge2
                className={`mt-0.5 h-5 w-5 ${
                  selection.includes('missing_delivery_notes') ? 'text-rose-600' : 'text-slate-400'
                }`}
              />
              <div>
                <div className={`text-lg font-semibold ${selection.includes('missing_delivery_notes') ? 'text-rose-700' : 'text-slate-700'}`}>
                  Faltan Albaranes
                </div>
                <div className="text-sm text-muted-foreground">Faltan albaranes por adjuntar.</div>
              </div>
            </div>
          </button>

          <Button className="w-full" onClick={onConfirm} disabled={saving || readOnly}>
            Confirmar Estado
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export type { SaveStatusDialogProps, SaveStatusOption };

