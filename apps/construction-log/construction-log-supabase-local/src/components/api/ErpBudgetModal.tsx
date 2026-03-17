import { useEffect, useState } from 'react';
import type { ApiExternalCollaboration, ApiProjectBudgetLinePayload } from '@/integrations/api/client';
import { parseEuroInput } from '@/utils/erpBudget';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ErpBudgetModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: ApiProjectBudgetLinePayload) => void;
  initialValues?: ApiProjectBudgetLinePayload;
  title: string;
  submitLabel: string;
  saving?: boolean;
  showExternalCollaborationSection?: boolean;
  externalCollaborationOptions?: ApiExternalCollaboration[];
  externalCollaborationSelection?: string;
  onExternalCollaborationSelectionChange?: (value: string) => void;
  onAddExternalCollaboration?: () => void;
};

type FormState = Record<keyof ApiProjectBudgetLinePayload, string>;

export function ErpBudgetModal({
  open,
  onOpenChange,
  onSave,
  initialValues,
  title,
  submitLabel,
  saving = false,
  showExternalCollaborationSection = false,
  externalCollaborationOptions = [],
  externalCollaborationSelection = '',
  onExternalCollaborationSelectionChange,
  onAddExternalCollaboration,
}: ErpBudgetModalProps) {
  const [form, setForm] = useState<FormState>({
    concept: '',
    hito1_budget: '',
    justified_hito1: '',
    hito2_budget: '',
    justified_hito2: '',
    approved_budget: '',
    percent_spent: '',
    forecasted_spent: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      concept: initialValues?.concept ?? '',
      hito1_budget: String(initialValues?.hito1_budget ?? ''),
      justified_hito1: String(initialValues?.justified_hito1 ?? ''),
      hito2_budget: String(initialValues?.hito2_budget ?? ''),
      justified_hito2: String(initialValues?.justified_hito2 ?? ''),
      approved_budget: String(initialValues?.approved_budget ?? ''),
      percent_spent: String(initialValues?.percent_spent ?? ''),
      forecasted_spent: String(initialValues?.forecasted_spent ?? ''),
    });
  }, [initialValues, open]);

  const updateField = (field: keyof ApiProjectBudgetLinePayload, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const hitoSum = parseEuroInput(form.hito1_budget) + parseEuroInput(form.hito2_budget);
  const approvedValue = parseEuroInput(form.approved_budget);
  const totalsValid = hitoSum <= approvedValue + 0.01;

  const handleSubmit = () => {
    onSave({
      concept: form.concept.trim(),
      hito1_budget: parseEuroInput(form.hito1_budget),
      justified_hito1: parseEuroInput(form.justified_hito1),
      hito2_budget: parseEuroInput(form.hito2_budget),
      justified_hito2: parseEuroInput(form.justified_hito2),
      approved_budget: parseEuroInput(form.approved_budget),
      percent_spent: parseEuroInput(form.percent_spent),
      forecasted_spent: parseEuroInput(form.forecasted_spent),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Introduce los importes del presupuesto ERP para esta linea.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="budget-concept">Concepto</Label>
            <Input id="budget-concept" value={form.concept} onChange={(event) => updateField('concept', event.target.value)} />
          </div>

          {showExternalCollaborationSection ? (
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Colaboraciones externas</p>
                <p className="text-sm text-muted-foreground">Selecciona un colaborador y añádelo desde este formulario.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div className="grid gap-2">
                  <Label htmlFor="budget-external-collaboration">Colaborador</Label>
                  <select
                    id="budget-external-collaboration"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={externalCollaborationSelection}
                    onChange={(event) => onExternalCollaborationSelectionChange?.(event.target.value)}
                  >
                    <option value="">Selecciona colaborador</option>
                    {externalCollaborationOptions.map((collaboration) => (
                      <option
                        key={collaboration.id}
                        value={`${collaboration.collaboration_type}::${collaboration.name}`}
                      >
                        {collaboration.collaboration_type} - {collaboration.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="app-btn-soft h-10 px-4 text-[15px]"
                  onClick={onAddExternalCollaboration}
                  disabled={!externalCollaborationSelection}
                >
                  Añadir
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="budget-h1">Hito 1</Label>
              <Input id="budget-h1" value={form.hito1_budget} onChange={(event) => updateField('hito1_budget', event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="budget-j1">Justificado H1</Label>
              <Input id="budget-j1" value={form.justified_hito1} onChange={(event) => updateField('justified_hito1', event.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="budget-h2">Hito 2</Label>
              <Input id="budget-h2" value={form.hito2_budget} onChange={(event) => updateField('hito2_budget', event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="budget-j2">Justificado H2</Label>
              <Input id="budget-j2" value={form.justified_hito2} onChange={(event) => updateField('justified_hito2', event.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="budget-approved">Total aprobado</Label>
              <Input id="budget-approved" value={form.approved_budget} onChange={(event) => updateField('approved_budget', event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="budget-percent">% Gastado</Label>
              <Input id="budget-percent" value={form.percent_spent} onChange={(event) => updateField('percent_spent', event.target.value)} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="budget-forecast">Gasto previsto</Label>
            <Input id="budget-forecast" value={form.forecasted_spent} onChange={(event) => updateField('forecasted_spent', event.target.value)} />
          </div>

          <p className={`text-sm ${totalsValid ? 'text-emerald-700' : 'text-red-600'}`}>
            {totalsValid
              ? 'La suma de Hito 1 y Hito 2 no supera el presupuesto aprobado.'
              : 'La suma de los hitos no puede superar el presupuesto aprobado.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!totalsValid || !form.concept.trim() || saving}>
            {saving ? 'Guardando...' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
