import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Camera, Mic, Plus, Trash2, Upload } from 'lucide-react';

type WorkforceRow = {
  id: string;
  workerName: string;
  activity: string;
  hours: number;
};

type WorkforceGroup = {
  id: string;
  companyName: string;
  isOwnCompany: boolean;
  rows: WorkforceRow[];
};

type WorkforceSectionProps = {
  sectionTriggerClass: string;
  workforceSectionCompleted: boolean;
  setWorkforceSectionCompleted: (value: boolean) => void;
  totalWorkforceHours: number;
  workforceGroups: WorkforceGroup[];
  removeWorkforceGroup: (groupId: string) => void;
  updateWorkforceGroup: (groupId: string, patch: Partial<WorkforceGroup>) => void;
  updateWorkforceRow: (groupId: string, rowId: string, patch: Partial<WorkforceRow>) => void;
  removeWorkforceRow: (groupId: string, rowId: string) => void;
  addWorkforceRow: (groupId: string) => void;
  addWorkforceGroup: () => void;
  editableNumericValue: (value: number) => string | number;
  parseNumeric: (value: string) => number;
};

export const WorkforceSection = ({
  sectionTriggerClass,
  workforceSectionCompleted,
  setWorkforceSectionCompleted,
  totalWorkforceHours,
  workforceGroups,
  removeWorkforceGroup,
  updateWorkforceGroup,
  updateWorkforceRow,
  removeWorkforceRow,
  addWorkforceRow,
  addWorkforceGroup,
  editableNumericValue,
  parseNumeric,
}: WorkforceSectionProps) => {
  return (
    <AccordionItem value="workforce" className="rounded-md border border-[#d9e1ea] bg-white px-4">
      <AccordionTrigger className={sectionTriggerClass}>Mano de obra</AccordionTrigger>
      <AccordionContent className="space-y-4 text-[15px]">
        <label className="inline-flex items-center gap-2 rounded-md border border-[#d9e1ea] bg-slate-50 px-3 py-2 text-sm">
          <Checkbox
            className="h-3 w-3 shrink-0"
            checked={workforceSectionCompleted}
            onCheckedChange={(checked) => setWorkforceSectionCompleted(Boolean(checked))}
          />
          Sección completada
        </label>

        <div className="rounded-md border border-[#d9e1ea] bg-white">
          <div className="border-b border-[#d9e1ea] p-4 text-center">
            <p className="text-xl font-semibold uppercase tracking-wide text-slate-700">Mano de obra</p>
            <p className="mt-1 text-sm text-slate-500">Horas totales calculadas: {totalWorkforceHours.toFixed(2)}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  toast({
                    title: 'Dictado en preparacion',
                    description: 'El dictado de mano de obra se conectara en la siguiente fase.',
                  })
                }
              >
                <Mic className="mr-2 h-4 w-4" />
                Dictar mano de obra
              </Button>
            </div>
          </div>

          <div className="space-y-4 p-3">
            {workforceGroups.map((group, groupIndex) => {
              const groupHours = group.rows.reduce((sum, row) => sum + row.hours, 0);
              return (
                <div key={group.id} className="rounded-md border border-[#d9e1ea] bg-white">
                  <div className="space-y-3 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">Empresa:</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() =>
                            toast({
                              title: 'Subida de documento en preparacion',
                              description: 'Se conectara en la siguiente fase.',
                            })
                          }
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() =>
                            toast({
                              title: 'Carga de empresa en preparacion',
                              description: 'Este acceso rapido se conectara a ficheros en la siguiente fase.',
                            })
                          }
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-blue-700">Horas: {groupHours.toFixed(2)}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600"
                          onClick={() => removeWorkforceGroup(group.id)}
                          disabled={workforceGroups.length === 1}
                          title="Eliminar grupo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <label className="inline-flex items-center gap-2 text-sm">
                      <Checkbox
                        className="h-3 w-3 shrink-0"
                        checked={group.isOwnCompany}
                        onCheckedChange={(checked) => updateWorkforceGroup(group.id, { isOwnCompany: Boolean(checked) })}
                      />
                      Empresa propia
                    </label>

                    <Input
                      value={group.companyName}
                      placeholder="Nombre de la empresa"
                      onChange={(event) => updateWorkforceGroup(group.id, { companyName: event.target.value })}
                    />
                  </div>

                  <div className="border-t border-[#d9e1ea]">
                    <div className="hidden grid-cols-12 gap-2 bg-slate-100 px-3 py-2 text-sm font-semibold uppercase text-slate-700 md:grid">
                      <div className="col-span-5">Nombre</div>
                      <div className="col-span-4">Actividad</div>
                      <div className="col-span-2">Horas</div>
                      <div className="col-span-1"></div>
                    </div>
                    <div className="space-y-2 p-3">
                      {group.rows.map((row) => (
                        <div key={row.id} className="rounded-md border border-[#d9e1ea] p-2 md:rounded-none md:border-0 md:p-0">
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-12 space-y-1 md:col-span-5 md:space-y-0">
                              <p className="text-sm font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                Nombre
                              </p>
                              <Input
                                placeholder="Nombre del trabajador"
                                value={row.workerName}
                                onChange={(event) => updateWorkforceRow(group.id, row.id, { workerName: event.target.value })}
                              />
                            </div>
                            <div className="col-span-12 space-y-1 md:col-span-4 md:space-y-0">
                              <p className="text-sm font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                Actividad
                              </p>
                              <Input
                                placeholder="Actividad realizada"
                                value={row.activity}
                                onChange={(event) => updateWorkforceRow(group.id, row.id, { activity: event.target.value })}
                              />
                            </div>
                            <div className="col-span-9 space-y-1 md:col-span-2 md:space-y-0">
                              <p className="text-sm font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                Horas
                              </p>
                              <Input
                                type="number"
                                min={0}
                                step={0.5}
                                placeholder="0"
                                value={editableNumericValue(row.hours)}
                                onChange={(event) => updateWorkforceRow(group.id, row.id, { hours: parseNumeric(event.target.value) })}
                              />
                            </div>
                            <div className="col-span-3 flex items-end md:col-span-1 md:justify-center">
                              <Button
                                className="h-9 w-full md:h-10 md:w-10"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeWorkforceRow(group.id, row.id)}
                                disabled={group.rows.length === 1}
                                title="Eliminar fila"
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" onClick={() => addWorkforceRow(group.id)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Añadir fila
                      </Button>
                    </div>
                  </div>

                  <div className="border-t border-[#d9e1ea] bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    Grupo {groupIndex + 1}
                  </div>
                </div>
              );
            })}
            <div className="pt-1">
              <Button variant="outline" onClick={addWorkforceGroup}>
                <Plus className="mr-2 h-4 w-4" />
                Añadir grupo
              </Button>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export type { WorkforceSectionProps };

