import { useEffect, useState } from 'react';
import type { ApiProjectBudgetLinePayload } from '@/integrations/api/client';
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
};

type FormState = Record<keyof ApiProjectBudgetLinePayload, string>;

const parseNumber = (value: string) => {
  const raw = value.trim().replace(/\s+/g, '');
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function ErpBudgetModal({
  open,
  onOpenChange,
  onSave,
  initialValues,
  title,
  submitLabel,
  saving = false,
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

  const hitoSum = parseNumber(form.hito1_budget) + parseNumber(form.hito2_budget);
  const approvedValue = parseNumber(form.approved_budget);
  const totalsValid = hitoSum <= approvedValue + 0.01;

  const handleSubmit = () => {
    onSave({
      concept: form.concept.trim(),
      hito1_budget: parseNumber(form.hito1_budget),
      justified_hito1: parseNumber(form.justified_hito1),
      hito2_budget: parseNumber(form.hito2_budget),
      justified_hito2: parseNumber(form.justified_hito2),
      approved_budget: parseNumber(form.approved_budget),
      percent_spent: parseNumber(form.percent_spent),
      forecasted_spent: parseNumber(form.forecasted_spent),
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
