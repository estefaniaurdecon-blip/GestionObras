import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Camera, Mic, Plus, Trash2, Upload, Users } from 'lucide-react';

type SubcontractUnit = 'hora' | 'm2' | 'ml' | 'ud' | 'kg' | 'm3';

type SubcontractAssignedWorker = {
  id: string;
  name: string;
  hours: number;
};

type SubcontractRow = {
  id: string;
  partida: string;
  activity: string;
  unit: SubcontractUnit;
  cantPerWorker: number;
  hours: number;
  workersAssigned: SubcontractAssignedWorker[];
};

type SubcontractGroup = {
  id: string;
  companyName: string;
  numWorkersManual: number;
  rows: SubcontractRow[];
};

type SubcontractRowTotals = {
  horasHombre: number;
  produccion: number;
  unit: SubcontractUnit;
  numTrabEfectivo: number;
  hasAssignedWorkers: boolean;
};

type SubcontractGroupTotals = {
  rowTotalsById: Record<string, SubcontractRowTotals>;
  totalsByUnit: Record<string, number>;
  displayTotal: number;
  displayUnitLabel: string;
  numWorkersEffective: number;
  uniqueWorkersWithHours: number;
  hasMixedUnits: boolean;
};

type UnitOption = {
  value: SubcontractUnit;
  label: string;
};

type SubcontractsSectionProps = {
  sectionTriggerClass: string;
  subcontractGroups: SubcontractGroup[];
  subcontractTotalsByGroupId: Record<string, SubcontractGroupTotals>;
  computeGroupTotals: (group: SubcontractGroup) => SubcontractGroupTotals;
  unitLabel: (unit: string) => string;
  addSubcontractGroup: () => void;
  updateSubcontractGroup: (groupId: string, patch: Partial<SubcontractGroup>) => void;
  handleSubcontractUpload: (groupId: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  removeSubcontractGroup: (groupId: string) => void;
  openSubcontractWorkers: Record<string, boolean>;
  setSubcontractWorkersOpen: (rowId: string, isOpen: boolean) => void;
  computeRowTotals: (row: SubcontractRow, context: { numWorkersEffective: number }) => SubcontractRowTotals;
  updateSubcontractRow: (groupId: string, rowId: string, patch: Partial<SubcontractRow>) => void;
  normalizeSubcontractUnit: (unit: string) => SubcontractUnit;
  subcontractUnitOptions: UnitOption[];
  nonNegativeInt: (value: number) => number;
  nonNegative: (value: number) => number;
  parseNumeric: (value: string) => number;
  editableNumericValue: (value: number) => string | number;
  removeSubcontractRow: (groupId: string, rowId: string) => void;
  addSubcontractWorker: (groupId: string, rowId: string) => void;
  updateSubcontractWorker: (
    groupId: string,
    rowId: string,
    workerId: string,
    patch: Partial<SubcontractAssignedWorker>,
  ) => void;
  removeSubcontractWorker: (groupId: string, rowId: string, workerId: string) => void;
  addSubcontractRow: (groupId: string) => void;
};

export const SubcontractsSection = ({
  sectionTriggerClass,
  subcontractGroups,
  subcontractTotalsByGroupId,
  computeGroupTotals,
  unitLabel,
  addSubcontractGroup,
  updateSubcontractGroup,
  handleSubcontractUpload,
  removeSubcontractGroup,
  openSubcontractWorkers,
  setSubcontractWorkersOpen,
  computeRowTotals,
  updateSubcontractRow,
  normalizeSubcontractUnit,
  subcontractUnitOptions,
  nonNegativeInt,
  nonNegative,
  parseNumeric,
  editableNumericValue,
  removeSubcontractRow,
  addSubcontractWorker,
  updateSubcontractWorker,
  removeSubcontractWorker,
  addSubcontractRow,
}: SubcontractsSectionProps) => {
  return (
    <AccordionItem value="subcontracts" className="rounded-md border border-[#d9e1ea] bg-white px-4">
      <AccordionTrigger className={sectionTriggerClass}>Subcontratas</AccordionTrigger>
      <AccordionContent className="space-y-4 text-[15px]">
        <div className="rounded-md border border-[#d9e1ea] bg-white">
          <div className="border-b border-[#d9e1ea] p-4 text-center">
            <p className="text-xl font-semibold uppercase tracking-wide text-slate-700">Subcontratas</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  toast({
                    title: 'Dictado en preparación',
                    description: 'El dictado de subcontratas se conectará en la siguiente fase.',
                  })
                }
              >
                <Mic className="mr-2 h-4 w-4" />
                Dictar Subcontratas
              </Button>
              <Button variant="outline" onClick={addSubcontractGroup}>
                <Plus className="mr-2 h-4 w-4" />
                Añadir Grupo
              </Button>
            </div>
          </div>

          <div className="space-y-4 p-3">
            {subcontractGroups.map((group, groupIndex) => {
              const groupTotals = subcontractTotalsByGroupId[group.id] ?? computeGroupTotals(group);
              const autoWorkersEnabled = groupTotals.uniqueWorkersWithHours > 0;
              const effectiveNumWorkers = autoWorkersEnabled ? groupTotals.numWorkersEffective : group.numWorkersManual;
              const unitBreakdown = Object.entries(groupTotals.totalsByUnit)
                .filter(([, value]) => value > 0)
                .map(([unit, value]) => `${unitLabel(unit)}: ${value.toFixed(2)}`)
                .join(' | ');

              return (
                <div key={group.id} className="rounded-md border border-[#d9e1ea] bg-white">
                  <div className="space-y-3 p-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[240px] flex-1">
                        <Label>Empresa:</Label>
                        <Input
                          className="mt-2"
                          value={group.companyName}
                          placeholder="Nombre de la empresa"
                          onChange={(event) => updateSubcontractGroup(group.id, { companyName: event.target.value })}
                        />
                      </div>

                      <div className="w-28">
                        <Label>Nº Trab:</Label>
                        <Input
                          className="mt-2"
                          type="number"
                          min={0}
                          value={autoWorkersEnabled ? effectiveNumWorkers : editableNumericValue(effectiveNumWorkers)}
                          disabled={autoWorkersEnabled}
                          onChange={(event) =>
                            updateSubcontractGroup(group.id, {
                              numWorkersManual: nonNegativeInt(parseNumeric(event.target.value)),
                            })
                          }
                        />
                      </div>

                      <div className="flex w-full items-center gap-2 md:w-auto">
                        <input
                          id={`subcontract-upload-${group.id}`}
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(event) => handleSubcontractUpload(group.id, event)}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => document.getElementById(`subcontract-upload-${group.id}`)?.click()}
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() =>
                            toast({
                              title: 'Cámara en preparación',
                              description: 'La captura de documentos se conectará en la siguiente fase.',
                            })
                          }
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-blue-700">
                          Total Grupo: {groupTotals.displayTotal.toFixed(2)} {groupTotals.displayUnitLabel}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600"
                          onClick={() => removeSubcontractGroup(group.id)}
                          disabled={subcontractGroups.length === 1}
                          title="Eliminar grupo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {autoWorkersEnabled ? (
                      <p className="text-sm text-slate-500">
                        Nº Trab en modo automático: se calcula por trabajadores únicos con horas &gt; 0 dentro del grupo.
                      </p>
                    ) : null}

                    {groupTotals.hasMixedUnits ? (
                      <p className="text-sm text-slate-500">
                        Producción por unidad: {unitBreakdown || '0'}
                      </p>
                    ) : null}
                  </div>

                  <div className="border-t border-[#d9e1ea]">
                    <div className="hidden grid-cols-12 gap-2 bg-slate-100 px-3 py-2 text-sm font-semibold uppercase text-slate-700 md:grid">
                      <div className="col-span-4">Partida</div>
                      <div className="col-span-3">Actividad</div>
                      <div className="col-span-1 whitespace-nowrap">Unidad</div>
                      <div className="col-span-1 whitespace-nowrap text-[11px]">Cant./Trab.</div>
                      <div className="col-span-1">Trab.</div>
                      <div className="col-span-1">Horas</div>
                      <div className="col-span-1"></div>
                    </div>

                    <div className="space-y-3 p-3">
                      {group.rows.map((row) => {
                        const rowTotals =
                          groupTotals.rowTotalsById[row.id] ??
                          computeRowTotals(row, { numWorkersEffective: groupTotals.numWorkersEffective });
                        const rowWorkersOpen = openSubcontractWorkers[row.id] ?? false;

                        return (
                          <div key={row.id} className="rounded-md border border-[#d9e1ea] p-2">
                            <div className="grid grid-cols-12 gap-2">
                              <div className="col-span-12 space-y-1 md:col-span-4 md:space-y-0">
                                <p className="text-sm font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                  Partida
                                </p>
                                <Input
                                  placeholder="Partida"
                                  value={row.partida}
                                  onChange={(event) =>
                                    updateSubcontractRow(group.id, row.id, { partida: event.target.value })
                                  }
                                />
                              </div>
                              <div className="col-span-12 space-y-1 md:col-span-3 md:space-y-0">
                                <p className="text-sm font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                  Actividad
                                </p>
                                <Input
                                  placeholder="Actividad"
                                  value={row.activity}
                                  onChange={(event) =>
                                    updateSubcontractRow(group.id, row.id, { activity: event.target.value })
                                  }
                                />
                              </div>
                              <div className="col-span-6 space-y-1 md:col-span-1 md:space-y-0">
                                <p className="text-sm font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                  Unidad
                                </p>
                                <Select
                                  value={row.unit}
                                  onValueChange={(value) =>
                                    updateSubcontractRow(group.id, row.id, { unit: normalizeSubcontractUnit(value) })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Unidad" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {subcontractUnitOptions.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="col-span-6 space-y-1 md:col-span-1 md:space-y-0">
                                <p className="text-sm font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                  Cant./Trab.
                                </p>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={editableNumericValue(row.cantPerWorker)}
                                  onChange={(event) =>
                                    updateSubcontractRow(group.id, row.id, {
                                      cantPerWorker: nonNegative(parseNumeric(event.target.value)),
                                    })
                                  }
                                />
                              </div>
                              <div className="col-span-4 space-y-1 md:col-span-1 md:space-y-0">
                                <p className="text-sm font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                  Trab.
                                </p>
                                <Input
                                  type="number"
                                  readOnly
                                  value={rowTotals.numTrabEfectivo}
                                  title="Número de trabajadores efectivo para el cálculo"
                                />
                              </div>
                              <div className="col-span-6 space-y-1 md:col-span-1 md:space-y-0">
                                <p className="text-sm font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                  Horas
                                </p>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  value={
                                    rowTotals.hasAssignedWorkers
                                      ? rowTotals.horasHombre.toFixed(2)
                                      : editableNumericValue(row.hours)
                                  }
                                  disabled={rowTotals.hasAssignedWorkers}
                                  title={
                                    rowTotals.hasAssignedWorkers
                                      ? 'Horas calculadas automáticamente por suma de trabajadores asignados'
                                      : 'Horas manuales de la fila'
                                  }
                                  onChange={(event) =>
                                    updateSubcontractRow(group.id, row.id, {
                                      hours: nonNegative(parseNumeric(event.target.value)),
                                    })
                                  }
                                />
                              </div>
                              <div className="col-span-2 flex items-end md:col-span-1 md:justify-center">
                                <Button
                                  className="h-9 w-full md:h-10 md:w-10"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => removeSubcontractRow(group.id, row.id)}
                                  disabled={group.rows.length === 1}
                                  title="Eliminar fila"
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSubcontractWorkersOpen(row.id, !rowWorkersOpen)}
                              >
                                <Users className="mr-2 h-4 w-4" />
                                Trabajadores
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => addSubcontractWorker(group.id, row.id)}>
                                <Plus className="mr-2 h-4 w-4" />
                                Añadir
                              </Button>
                              <span className="text-sm text-slate-500">
                                HH: {rowTotals.horasHombre.toFixed(2)} | Prod: {rowTotals.produccion.toFixed(2)} {unitLabel(rowTotals.unit)}
                                {rowTotals.hasAssignedWorkers ? ' | Horas auto' : ''}
                              </span>
                            </div>

                            <Collapsible open={rowWorkersOpen} onOpenChange={(isOpen) => setSubcontractWorkersOpen(row.id, isOpen)}>
                              <CollapsibleContent className="pt-2">
                                {row.workersAssigned.length === 0 ? (
                                  <div className="rounded-md border border-dashed p-3 text-sm text-slate-500">
                                    Sin trabajadores asignados en esta fila.
                                  </div>
                                ) : (
                                  <div className="space-y-2 rounded-md border border-[#d9e1ea] p-2">
                                    {row.workersAssigned.map((worker) => (
                                      <div key={worker.id} className="grid grid-cols-12 gap-2">
                                        <Input
                                          className="col-span-12 md:col-span-7"
                                          placeholder="Nombre del trabajador"
                                          value={worker.name}
                                          onChange={(event) =>
                                            updateSubcontractWorker(group.id, row.id, worker.id, { name: event.target.value })
                                          }
                                        />
                                        <Input
                                          className="col-span-8 md:col-span-4"
                                          type="number"
                                          min={0}
                                          step={0.5}
                                          value={editableNumericValue(worker.hours)}
                                          onChange={(event) =>
                                            updateSubcontractWorker(group.id, row.id, worker.id, {
                                              hours: nonNegative(parseNumeric(event.target.value)),
                                            })
                                          }
                                        />
                                        <Button
                                          className="col-span-4 md:col-span-1"
                                          size="icon"
                                          variant="ghost"
                                          onClick={() => removeSubcontractWorker(group.id, row.id, worker.id)}
                                          title="Eliminar trabajador"
                                        >
                                          <Trash2 className="h-4 w-4 text-red-600" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        );
                      })}

                      <Button variant="outline" onClick={() => addSubcontractRow(group.id)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Añadir Fila
                      </Button>
                    </div>
                  </div>

                  <div className="border-t border-[#d9e1ea] bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    Grupo {groupIndex + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export type { SubcontractsSectionProps };

