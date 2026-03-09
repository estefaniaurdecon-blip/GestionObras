import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SignaturePad } from '@/components/SignaturePad';

export type AccessPersonalForm = {
  name: string;
  dni: string;
  company: string;
  entryTime: string;
  exitTime: string;
  activity: string;
  signature: string;
};

export type AccessPersonalDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: AccessPersonalForm;
  setForm: Dispatch<SetStateAction<AccessPersonalForm>>;
  onSave: () => void;
  onCancel: () => void;
};

export const AccessPersonalDialog = ({
  open,
  onOpenChange,
  form,
  setForm,
  onSave,
  onCancel,
}: AccessPersonalDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registro de Personal</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="access-personal-name">
              Nombre *
            </label>
            <Input
              id="access-personal-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Nombre completo"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="access-personal-dni">
              DNI *
            </label>
            <Input
              id="access-personal-dni"
              value={form.dni}
              onChange={(event) =>
                setForm((current) => ({ ...current, dni: event.target.value }))
              }
              placeholder="DNI"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="access-personal-company">
              Empresa *
            </label>
            <Input
              id="access-personal-company"
              value={form.company}
              onChange={(event) =>
                setForm((current) => ({ ...current, company: event.target.value }))
              }
              placeholder="Nombre de la empresa"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="access-personal-entry-time">
                Hora Entrada
              </label>
              <Input
                id="access-personal-entry-time"
                type="time"
                value={form.entryTime}
                onChange={(event) =>
                  setForm((current) => ({ ...current, entryTime: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="access-personal-exit-time">
                Hora Salida (Est. 18:00)
              </label>
              <Input
                id="access-personal-exit-time"
                type="time"
                value={form.exitTime}
                onChange={(event) =>
                  setForm((current) => ({ ...current, exitTime: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="access-personal-activity">
              Actividad/Puesto
            </label>
            <Input
              id="access-personal-activity"
              value={form.activity}
              onChange={(event) =>
                setForm((current) => ({ ...current, activity: event.target.value }))
              }
              placeholder="Actividad o puesto de trabajo"
            />
          </div>

          <div className="rounded-md border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700">Firma</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForm((current) => ({ ...current, signature: '' }))}
                >
                  Limpiar
                </Button>
                <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700" onClick={onSave}>
                  Guardar
                </Button>
              </div>
            </div>
            <SignaturePad
              value={form.signature}
              onChange={(signature) =>
                setForm((current) => ({ ...current, signature }))
              }
              label="Firma"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              className="w-full bg-blue-600 text-white hover:bg-blue-700"
              onClick={onSave}
            >
              Guardar
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
