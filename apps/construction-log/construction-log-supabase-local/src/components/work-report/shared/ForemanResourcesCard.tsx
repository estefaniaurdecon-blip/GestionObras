import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import type { ForemanResource } from '@/components/work-report/types';

export type MainForemanSuggestion = {
  key: string;
  label: string;
  email?: string | null;
  userId?: number | null;
};

type ForemanResourcesCardProps = {
  sectionTriggerClass: string;
  readOnly: boolean;
  totalForemanSectionHours: number;
  foremanResources: ForemanResource[];
  onAddResource: () => void;
  onUpdateResource: (id: string, patch: Partial<ForemanResource>) => void;
  onRemoveResource: (id: string) => void;
  mainForeman: string;
  onMainForemanChange: (value: string) => void;
  onMainForemanSuggestionSelect: (suggestion: MainForemanSuggestion) => void;
  mainForemanHours: number;
  onMainForemanHoursChange: (value: number) => void;
  siteManager: string;
  onSiteManagerChange: (value: string) => void;
  onSiteManagerSuggestionSelect: (suggestion: MainForemanSuggestion) => void;
  mainForemanSuggestions: MainForemanSuggestion[];
  mainForemanSuggestionsLoading: boolean;
  linkedMainForemanEmail?: string | null;
  siteManagerSuggestions: MainForemanSuggestion[];
  siteManagerSuggestionsLoading: boolean;
  linkedSiteManagerEmail?: string | null;
  editableNumericValue: (value: number) => string | number;
  parseNumeric: (value: string) => number;
  nonNegative: (value: number) => number;
};

export const ForemanResourcesCard = ({
  sectionTriggerClass,
  readOnly,
  totalForemanSectionHours,
  foremanResources,
  onAddResource,
  onUpdateResource,
  onRemoveResource,
  mainForeman,
  onMainForemanChange,
  onMainForemanSuggestionSelect,
  mainForemanHours,
  onMainForemanHoursChange,
  siteManager,
  onSiteManagerChange,
  onSiteManagerSuggestionSelect,
  mainForemanSuggestions,
  mainForemanSuggestionsLoading,
  linkedMainForemanEmail,
  siteManagerSuggestions,
  siteManagerSuggestionsLoading,
  linkedSiteManagerEmail,
  editableNumericValue,
  parseNumeric,
  nonNegative,
}: ForemanResourcesCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mainForemanDropdownOpen, setMainForemanDropdownOpen] = useState(false);
  const [siteManagerDropdownOpen, setSiteManagerDropdownOpen] = useState(false);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="rounded-md border border-[#d9e1ea] bg-white px-4">
        <CollapsibleTrigger
          className={`flex w-full flex-1 items-center justify-between py-4 text-left transition-all hover:underline [&[data-state=open]>svg]:rotate-180 ${sectionTriggerClass}`}
        >
          Encargados, capataces y recursos preventivos
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 pb-4 pt-2 text-[15px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-slate-600">
                <span className="mr-2">Total horas:</span>
                <span className="font-semibold text-blue-700">{totalForemanSectionHours.toFixed(1)}h</span>
              </div>
              <Button variant="outline" disabled={readOnly} onClick={onAddResource}>
                <Plus className="mr-2 h-4 w-4" />
                Añadir
              </Button>
            </div>
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
                <Label htmlFor="main-foreman" className="text-sm font-medium text-slate-600">
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

                  {!readOnly && mainForemanDropdownOpen ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
                      {mainForemanSuggestionsLoading ? (
                        <div className="px-3 py-2 text-sm text-slate-500">Buscando usuarios...</div>
                      ) : mainForemanSuggestions.length > 0 ? (
                        mainForemanSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.key}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              onMainForemanSuggestionSelect(suggestion);
                              setMainForemanDropdownOpen(false);
                            }}
                          >
                            <div className="font-medium text-slate-700">{suggestion.label}</div>
                            {suggestion.email ? (
                              <div className="text-xs text-slate-500">{suggestion.email}</div>
                            ) : null}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-slate-500">Sin coincidencias.</div>
                      )}
                    </div>
                  ) : null}
                </div>
                {linkedMainForemanEmail ? (
                  <p className="mt-2 text-xs text-emerald-700">Usuario vinculado: {linkedMainForemanEmail}</p>
                ) : null}
              </div>
              <div className="p-3">
                <Label htmlFor="main-foreman-hours" className="text-sm font-medium text-slate-600">
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
                <Label htmlFor="site-manager" className="text-sm font-medium text-slate-600">
                  Jefe de obra:
                </Label>
                <div className="relative mt-2">
                  <Input
                    id="site-manager"
                    disabled={readOnly}
                    value={siteManager}
                    onFocus={() => {
                      if (!readOnly) setSiteManagerDropdownOpen(true);
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setSiteManagerDropdownOpen(false), 120);
                    }}
                    onChange={(event) => {
                      onSiteManagerChange(event.target.value);
                      if (!readOnly) setSiteManagerDropdownOpen(true);
                    }}
                  />
                  <button
                    type="button"
                    disabled={readOnly}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setSiteManagerDropdownOpen((prev) => !prev)}
                    aria-label="Mostrar sugerencias de jefes de obra"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${siteManagerDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {!readOnly && siteManagerDropdownOpen ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
                      {siteManagerSuggestionsLoading ? (
                        <div className="px-3 py-2 text-sm text-slate-500">Buscando usuarios...</div>
                      ) : siteManagerSuggestions.length > 0 ? (
                        siteManagerSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.key}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              onSiteManagerSuggestionSelect(suggestion);
                              setSiteManagerDropdownOpen(false);
                            }}
                          >
                            <div className="font-medium text-slate-700">{suggestion.label}</div>
                            {suggestion.email ? (
                              <div className="text-xs text-slate-500">{suggestion.email}</div>
                            ) : null}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-slate-500">Sin coincidencias.</div>
                      )}
                    </div>
                  ) : null}
                </div>
                {linkedSiteManagerEmail ? (
                  <p className="mt-2 text-xs text-emerald-700">Usuario vinculado: {linkedSiteManagerEmail}</p>
                ) : null}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export type { ForemanResourcesCardProps };
