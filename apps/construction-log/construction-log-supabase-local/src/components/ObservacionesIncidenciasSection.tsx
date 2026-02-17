import { useId, type ChangeEvent } from 'react';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type NoteCategory = 'urgent' | 'materials' | 'safety' | 'info' | null;

export interface ObservacionesIncidenciasValue {
  isCompleted: boolean;
  category: NoteCategory;
  text: string;
}

interface ObservacionesIncidenciasSectionProps {
  value: ObservacionesIncidenciasValue | null | undefined;
  onChange: (next: ObservacionesIncidenciasValue) => void;
  onDictate?: () => void;
  dictationActive?: boolean;
  dictationInterimText?: string;
  dictationError?: string | null;
  disabled?: boolean;
  showHeader?: boolean;
  className?: string;
}

const EMPTY_VALUE: ObservacionesIncidenciasValue = {
  isCompleted: false,
  category: null,
  text: '',
};

export function normalizeNoteCategory(value: unknown): NoteCategory {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'urgent' || normalized === 'urgente') return 'urgent';
  if (normalized === 'materials' || normalized === 'materiales') return 'materials';
  if (normalized === 'safety' || normalized === 'seguridad') return 'safety';
  if (normalized === 'info' || normalized === 'informativo' || normalized === 'informative') return 'info';
  return null;
}

export function normalizeObservacionesIncidenciasValue(
  value: ObservacionesIncidenciasSectionProps['value'],
): ObservacionesIncidenciasValue {
  if (!value) return EMPTY_VALUE;
  return {
    isCompleted: Boolean(value.isCompleted),
    category: normalizeNoteCategory(value.category),
    text: typeof value.text === 'string' ? value.text : '',
  };
}

const CATEGORY_OPTIONS: Array<{ value: Exclude<NoteCategory, null>; label: string }> = [
  { value: 'urgent', label: 'Urgente' },
  { value: 'materials', label: 'Materiales' },
  { value: 'safety', label: 'Seguridad' },
  { value: 'info', label: 'Informativo' },
];

const SELECTED_CATEGORY_CLASSES: Record<Exclude<NoteCategory, null>, string> = {
  urgent: 'border-red-200 bg-red-50 text-red-700',
  materials: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  safety: 'border-blue-200 bg-blue-50 text-blue-700',
  info: 'border-amber-200 bg-amber-50 text-amber-700',
};

export const ObservacionesIncidenciasSection = ({
  value,
  onChange,
  onDictate,
  dictationActive = false,
  dictationInterimText = '',
  dictationError = null,
  disabled = false,
  showHeader = true,
  className,
}: ObservacionesIncidenciasSectionProps) => {
  const textareaId = useId();
  const safeValue = normalizeObservacionesIncidenciasValue(value);

  const handleToggleCompleted = () => {
    onChange({
      ...safeValue,
      isCompleted: !safeValue.isCompleted,
    });
  };

  const handleSelectCategory = (category: Exclude<NoteCategory, null>) => {
    onChange({
      ...safeValue,
      category: safeValue.category === category ? null : category,
    });
  };

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange({
      ...safeValue,
      text: event.target.value ?? '',
    });
  };

  return (
    <section className={cn('space-y-4', className)}>
      {showHeader ? <h3 className="text-sm font-semibold uppercase text-slate-800">OBSERVACIONES E INCIDENCIAS</h3> : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-md border border-[#d9e1ea] bg-slate-50 px-3 py-2 text-sm">
          <Checkbox
            className="h-3 w-3 shrink-0"
            checked={safeValue.isCompleted}
            onCheckedChange={handleToggleCompleted}
            disabled={disabled}
          />
          <span>Sección completada</span>
        </label>
      </div>

      <div className="space-y-2">
        <Label>Categoría de la nota:</Label>
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
          {CATEGORY_OPTIONS.map((option) => {
            const isSelected = safeValue.category === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => handleSelectCategory(option.value)}
                className={cn(
                  'inline-flex h-7 shrink-0 items-center rounded-md border px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  isSelected
                    ? SELECTED_CATEGORY_CLASSES[option.value]
                    : 'border-[#d9e1ea] bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex w-full flex-wrap items-center justify-start gap-2">
          <Label htmlFor={textareaId}>Observaciones</Label>
          <Button
            type="button"
            size="sm"
            variant={dictationActive ? 'default' : 'outline'}
            className={cn(
              'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
              dictationActive ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700' : '',
            )}
            onClick={() => onDictate?.()}
            disabled={disabled}
          >
            <Mic className={cn('mr-2 h-4 w-4 text-blue-600', dictationActive ? 'text-white' : '')} />
            {dictationActive ? 'Escuchando...' : 'Dictar Observaciones'}
          </Button>
        </div>
        {(dictationActive || dictationInterimText || dictationError) && (
          <div className="space-y-1 text-xs">
            {dictationActive ? <p className="text-emerald-700">Escuchando…</p> : null}
            {dictationInterimText ? <p className="text-slate-600">Texto: {dictationInterimText}</p> : null}
            {dictationError ? <p className="text-red-600">{dictationError}</p> : null}
          </div>
        )}
        <Textarea
          id={textareaId}
          rows={4}
          aria-label="Observaciones e incidencias"
          value={safeValue.text}
          onChange={handleTextChange}
          placeholder="Anotaciones sobre el día de trabajo, incidencias, etc."
          disabled={disabled}
        />
      </div>
    </section>
  );
};
