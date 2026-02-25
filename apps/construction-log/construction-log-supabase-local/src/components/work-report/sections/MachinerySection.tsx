import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Camera, Mic, Plus, Trash2, Upload } from 'lucide-react';

type SubcontractedMachineryRow = {
  id: string;
  machineType: string;
  activity: string;
  hours: number;
};

type SubcontractedMachineryGroup = {
  id: string;
  companyName: string;
  isOwnCompany: boolean;
  rows: SubcontractedMachineryRow[];
};

type MachinerySectionProps = {
  sectionTriggerClass: string;
  subcontractedMachineryGroups: SubcontractedMachineryGroup[];
  addSubcontractedMachineryGroup: () => void;
  updateSubcontractedMachineryGroup: (groupId: string, patch: Partial<SubcontractedMachineryGroup>) => void;
  handleSubcontractedMachineryUpload: (groupId: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  removeSubcontractedMachineryGroup: (groupId: string) => void;
  updateSubcontractedMachineryRow: (groupId: string, rowId: string, patch: Partial<SubcontractedMachineryRow>) => void;
  removeSubcontractedMachineryRow: (groupId: string, rowId: string) => void;
  addSubcontractedMachineryRow: (groupId: string) => void;
  editableNumericValue: (value: number) => string | number;
  parseNumeric: (value: string) => number;
};

export const MachinerySection = ({
  sectionTriggerClass,
  subcontractedMachineryGroups,
  addSubcontractedMachineryGroup,
  updateSubcontractedMachineryGroup,
  handleSubcontractedMachineryUpload,
  removeSubcontractedMachineryGroup,
  updateSubcontractedMachineryRow,
  removeSubcontractedMachineryRow,
  addSubcontractedMachineryRow,
  editableNumericValue,
  parseNumeric,
}: MachinerySectionProps) => {
  return (
    <AccordionItem value="machinery" className="rounded-md border border-[#d9e1ea] bg-white px-4">
      <AccordionTrigger className={sectionTriggerClass}>Maquinaria subcontratas</AccordionTrigger>
      <AccordionContent className="space-y-4 text-[15px]">
        <div className="rounded-md border border-[#d9e1ea] bg-white">
          <div className="border-b border-[#d9e1ea] p-4 text-center">
            <p className="text-xl font-semibold uppercase tracking-wide text-slate-700">Maquinaria</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  toast({
                    title: 'Dictado en preparación',
                    description: 'El dictado de maquinaria se conectará en la siguiente fase.',
                  })
                }
              >
                <Mic className="mr-2 h-4 w-4" />
                Dictar Maquinaria
              </Button>
              <Button variant="outline" onClick={addSubcontractedMachineryGroup}>
                <Plus className="mr-2 h-4 w-4" />
                Añadir Grupo
              </Button>
            </div>
          </div>
          <div className="space-y-4 p-3">
            {subcontractedMachineryGroups.map((group) => {
              const groupHours = group.rows.reduce((sum, row) => sum + row.hours, 0);
              return (
                <div key={group.id} className="rounded-md border border-[#d9e1ea] bg-white">
                  <div className="space-y-3 p-3">
                    <div className="flex items-center gap-4 flex-wrap px-1">
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-sm font-medium">Empresa:</p>
                        <label className="mt-2 inline-flex items-center gap-2 text-sm">
                          <Checkbox
                            className="h-3 w-3 shrink-0"
                            checked={group.isOwnCompany}
                            onCheckedChange={(checked) => {
                              const isOwnCompany = Boolean(checked);
                              const ownCompanyName = 'Empresa propia';
                              updateSubcontractedMachineryGroup(group.id, {
                                isOwnCompany,
                                companyName: isOwnCompany
                                  ? group.companyName || ownCompanyName
                                  : group.companyName === ownCompanyName
                                    ? ''
                                    : group.companyName,
                              });
                            }}
                          />
                          Empresa propia
                        </label>
                        <Input
                          className="mt-2"
                          value={group.companyName}
                          placeholder="Nombre de la empresa"
                          onChange={(event) =>
                            updateSubcontractedMachineryGroup(group.id, { companyName: event.target.value })
                          }
                          disabled={group.isOwnCompany}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id={`machinery-upload-${group.id}`}
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(event) => handleSubcontractedMachineryUpload(group.id, event)}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => document.getElementById(`machinery-upload-${group.id}`)?.click()}
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
                              description: 'La captura de maquinaria se conectará en la siguiente fase.',
                            })
                          }
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-blue-700">Total Horas: {groupHours.toFixed(2)}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600"
                          onClick={() => removeSubcontractedMachineryGroup(group.id)}
                          disabled={subcontractedMachineryGroups.length === 1}
                          title="Eliminar grupo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#d9e1ea]">
                    <div className="hidden grid-cols-12 gap-2 bg-slate-100 px-3 py-2 text-sm font-semibold uppercase text-slate-700 md:grid">
                      <div className="col-span-4">Tipo máquina</div>
                      <div className="col-span-5">Actividad</div>
                      <div className="col-span-2">H/Cant.</div>
                      <div className="col-span-1"></div>
                    </div>
                    <div className="space-y-2 p-3">
                      {group.rows.map((row) => (
                        <div key={row.id} className="rounded-md border border-[#d9e1ea] p-2 md:rounded-none md:border-0 md:p-0">
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-12 space-y-1 md:col-span-4 md:space-y-0">
                              <p className="text-sm font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                Tipo máquina
                              </p>
                              <Input
                                placeholder="Tipo de máquina"
                                value={row.machineType}
                                onChange={(event) =>
                                  updateSubcontractedMachineryRow(group.id, row.id, { machineType: event.target.value })
                                }
                              />
                            </div>
                            <div className="col-span-12 space-y-1 md:col-span-5 md:space-y-0">
                              <p className="text-sm font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                Actividad
                              </p>
                              <Input
                                placeholder="Actividad realizada"
                                value={row.activity}
                                onChange={(event) =>
                                  updateSubcontractedMachineryRow(group.id, row.id, { activity: event.target.value })
                                }
                              />
                            </div>
                            <div className="col-span-10 space-y-1 md:col-span-2 md:space-y-0">
                              <p className="text-sm font-medium uppercase tracking-wide text-slate-500 md:hidden">
                                H/Cant.
                              </p>
                              <Input
                                type="number"
                                min={0}
                                step={0.5}
                                value={editableNumericValue(row.hours)}
                                onChange={(event) =>
                                  updateSubcontractedMachineryRow(group.id, row.id, { hours: parseNumeric(event.target.value) })
                                }
                              />
                            </div>
                            <div className="col-span-2 flex items-end md:col-span-1 md:justify-center">
                              <Button
                                className="h-9 w-full md:h-10 md:w-10"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeSubcontractedMachineryRow(group.id, row.id)}
                                disabled={group.rows.length === 1}
                                title="Eliminar fila"
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" onClick={() => addSubcontractedMachineryRow(group.id)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Añadir Fila
                      </Button>
                    </div>
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

export type { MachinerySectionProps };

