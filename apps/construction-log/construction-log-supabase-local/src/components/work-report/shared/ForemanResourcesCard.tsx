import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, Plus, Trash2, Users } from 'lucide-react';
import type { ForemanResource } from '@/components/work-report/types';

type ForemanResourcesCardProps = {
  readOnly: boolean;
  totalForemanSectionHours: number;
  foremanResources: ForemanResource[];
  onAddResource: () => void;
  onUpdateResource: (id: string, patch: Partial<ForemanResource>) => void;
  onRemoveResource: (id: string) => void;
  mainForeman: string;
  onMainForemanChange: (value: string) => void;
  mainForemanHours: number;
  onMainForemanHoursChange: (value: number) => void;
  siteManager: string;
  onSiteManagerChange: (value: string) => void;
  foremanNameSuggestions: string[];
  editableNumericValue: (value: number) => string | number;
  parseNumeric: (value: string) => number;
  nonNegative: (value: number) => number;
};

export const ForemanResourcesCard = ({
  readOnly,
  totalForemanSectionHours,
  foremanResources,
  onAddResource,
  onUpdateResource,
  onRemoveResource,
  mainForeman,
  onMainForemanChange,
  mainForemanHours,
  onMainForemanHoursChange,
  siteManager,
  onSiteManagerChange,
  foremanNameSuggestions,
  editableNumericValue,
  parseNumeric,
  nonNegative,
}: ForemanResourcesCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mainForemanDropdownOpen, setMainForemanDropdownOpen] = useState(false);

  const filteredMainForemanSuggestions = useMemo(() => {
    const uniqueSuggestions = Array.from(
      new Set(foremanNameSuggestions.map((value) => value.trim()).filter(Boolean)),
    );
    const query = mainForeman.trim().toLowerCase();
    if (!query) return uniqueSuggestions;
    return uniqueSuggestions.filter((name) => name.toLowerCase().includes(query));
  }, [foremanNameSuggestions, mainForeman]);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
              <Users className="h-4 w-4 text-slate-500" />
              Encargados, capataces y recursos preventivos
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="text-sm text-slate-600">
                <span className="mr-2">Total horas:</span>
                <span className="font-semibold text-blue-700">{totalForemanSectionHours.toFixed(1)}h</span>
              </div>
              <Button variant="outline" disabled={readOnly} onClick={onAddResource}>
                <Plus className="mr-2 h-4 w-4" />
                Anadir
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-slate-600 hover:text-slate-900"
                onClick={() => setIsExpanded((previous) => !previous)}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Minimizar bloque de encargados' : 'Expandir bloque de encargados'}
              >
                {isExpanded ? 'Minimizar' : 'Expandir'}
                <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4 text-[15px]">
            <div className="space-y-3 rounded-md border border-[#d9e1ea] p-2">
              {foremanResources.map((entry) => (
                <div key={entry.id} className="rounded-md border border-[#d9e1ea] p-2">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                    <div className="md:col-span-3">
                      <Label className="mb-1 block text-sm font-medium text-slate-600">Rol</Label>
                      <Select
                        value={entry.role}
                        disabled={readOnly}
                        onValueChange={(value) => onUpdateResource(entry.id, { role: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="encargado">Encargado</SelectItem>
                          <SelectItem value="capataz">Capataz</SelectItem>
                          <SelectItem value="preventivo">Recurso preventivo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-6">
                      <Label className="mb-1 block text-sm font-medium text-slate-600">Nombre</Label>
                      <Input
                        placeholder="Nombre del encargado"
                        disabled={readOnly}
                        value={entry.name}
                        onChange={(event) => onUpdateResource(entry.id, { name: event.target.value })}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Label className="mb-1 block text-sm font-medium text-slate-600">Horas</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        disabled={readOnly}
                        value={editableNumericValue(entry.hours)}
                        onChange={(event) =>
                          onUpdateResource(entry.id, { hours: nonNegative(parseNumeric(event.target.value)) })
                        }
                      />
                    </div>

                    <div className="md:col-span-1 flex items-end justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={readOnly}
                        onClick={() => onRemoveResource(entry.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 divide-y divide-[#d9e1ea] rounded-md border border-[#d9e1ea] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-3">
                <Label htmlFor="main-foreman" className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Encargado principal:
                </Label>
                <div className="relative mt-2">
                  <Input
                    id="main-foreman"
                    disabled={readOnly}
                    value={mainForeman}
                    onFocus={() => {
                      if (!readOnly) setMainForemanDropdownOpen(true);
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setMainForemanDropdownOpen(false), 120);
                    }}
                    onChange={(event) => {
                      onMainForemanChange(event.target.value);
                      if (!readOnly) setMainForemanDropdownOpen(true);
                    }}
                  />
                  <button
                    type="button"
                    disabled={readOnly}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setMainForemanDropdownOpen((prev) => !prev)}
                    aria-label="Mostrar sugerencias de encargados"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${mainForemanDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {!readOnly && mainForemanDropdownOpen && filteredMainForemanSuggestions.length > 0 ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
                      {filteredMainForemanSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            onMainForemanChange(suggestion);
                            setMainForemanDropdownOpen(false);
                          }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="p-3">
                <Label
                  htmlFor="main-foreman-hours"
                  className="text-sm font-semibold uppercase tracking-wide text-slate-600"
                >
                  Horas encargado principal:
                </Label>
                <Input
                  id="main-foreman-hours"
                  className="mt-2"
                  type="number"
                  min={0}
                  step={0.5}
                  disabled={readOnly}
                  value={editableNumericValue(mainForemanHours)}
                  onChange={(event) => onMainForemanHoursChange(nonNegative(parseNumeric(event.target.value)))}
                />
              </div>
              <div className="p-3">
                <Label htmlFor="site-manager" className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Jefe de obra:
                </Label>
                <Input
                  id="site-manager"
                  className="mt-2"
                  disabled={readOnly}
                  value={siteManager}
                  onChange={(event) => onSiteManagerChange(event.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export type { ForemanResourcesCardProps };
