import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlbaranAttachmentsRow } from '@/components/work-report/shared/AlbaranAttachmentsRow';
import type { MaterialGroup, MaterialRow, ServiceLine } from '@/components/work-report/types';
import { normalizeDocType } from '@/plugins/albaranScanner';
import { Camera, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react';

type MaterialUnitOption = {
  value: string;
  label: string;
};

type MaterialsSectionProps = {
  sectionTriggerClass: string;
  addMaterialGroup: () => void;
  readOnly: boolean;
  isAlbaranProcessing: boolean;
  albaranScanError: string | null;
  materialGroups: MaterialGroup[];
  activeMaterialGroupId: string | null;
  scanInFlightTargetGroupId: string | null;
  openMaterialGroups: Record<string, boolean>;
  setMaterialGroupOpen: (groupId: string, isOpen: boolean) => void;
  setActiveMaterialGroupId: (groupId: string) => void;
  handleScanMaterialsForGroup: (groupId: string) => Promise<void> | void;
  removeMaterialGroup: (groupId: string) => void;
  openAlbaranViewer: (imageUris: string[], title: string, initialIndex?: number) => void;
  updateMaterialGroup: (groupId: string, patch: Partial<MaterialGroup>) => void;
  updateMaterialRow: (groupId: string, rowId: string, patch: Partial<MaterialRow>) => void;
  updateServiceLine: (groupId: string, lineId: string, patch: Partial<ServiceLine>) => void;
  editableNumericValue: (value: number) => string | number;
  parseNumeric: (value: string) => number;
  materialUnitOptions: MaterialUnitOption[];
  openCostDifferenceDialogForRow: (groupId: string, row: MaterialRow) => void;
  removeMaterialRow: (groupId: string, rowId: string) => void;
  addMaterialRow: (groupId: string) => void;
  addServiceLine: (groupId: string) => void;
  removeServiceLine: (groupId: string, lineId: string) => void;
};

export const MaterialsSection = ({
  sectionTriggerClass,
  addMaterialGroup,
  readOnly,
  isAlbaranProcessing,
  albaranScanError,
  materialGroups,
  activeMaterialGroupId,
  scanInFlightTargetGroupId,
  openMaterialGroups,
  setMaterialGroupOpen,
  setActiveMaterialGroupId,
  handleScanMaterialsForGroup,
  removeMaterialGroup,
  openAlbaranViewer,
  updateMaterialGroup,
  updateMaterialRow,
  updateServiceLine,
  editableNumericValue,
  parseNumeric,
  materialUnitOptions,
  openCostDifferenceDialogForRow,
  removeMaterialRow,
  addMaterialRow,
  addServiceLine,
  removeServiceLine,
}: MaterialsSectionProps) => {
  return (
    <AccordionItem value="materials" className="rounded-md border border-[#d9e1ea] bg-white px-4">
      <AccordionTrigger className={sectionTriggerClass}>Materiales</AccordionTrigger>
      <AccordionContent className="space-y-4 text-[15px]">
        <div className="sm:rounded-md sm:border sm:border-[#d9e1ea] sm:bg-white">
          <div className="pt-2 text-center sm:border-b sm:border-[#d9e1ea] sm:p-4">
            <p className="hidden text-xl font-semibold uppercase tracking-wide text-slate-700 sm:block">Materiales</p>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:mt-3">
              <Button variant="outline" onClick={addMaterialGroup} disabled={readOnly || isAlbaranProcessing}>
                <Plus className="mr-2 h-4 w-4" />
                Albarán
              </Button>
            </div>
            {albaranScanError ? (
              <p className="mt-2 text-sm text-red-600">{albaranScanError}</p>
            ) : null}
          </div>
          <div className="space-y-4 py-3 sm:p-3">
            {materialGroups.map((group) => {
              const isActiveMaterialGroup = activeMaterialGroupId === group.id;
              const isScanningThisGroup = isAlbaranProcessing && scanInFlightTargetGroupId === group.id;
              const serviceLines = group.serviceLines || [];
              const normalizedGroupDocType = normalizeDocType(group.docType);
              const isServiceGroup = normalizedGroupDocType === 'SERVICE_MACHINERY' || serviceLines.length > 0;

              return (
                <Collapsible
                  id={`material-group-${group.id}`}
                  key={group.id}
                  open={openMaterialGroups[group.id] ?? true}
                  onOpenChange={(isOpen) => setMaterialGroupOpen(group.id, isOpen)}
                  onFocusCapture={() => setActiveMaterialGroupId(group.id)}
                  onClick={() => setActiveMaterialGroupId(group.id)}
                  className={`rounded-md border bg-white transition-all ${
                    isActiveMaterialGroup
                      ? 'border-blue-500 bg-blue-50/30 shadow-md ring-1 ring-blue-200'
                      : 'border-slate-300 bg-slate-50/40 shadow-sm'
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 border-b px-3 py-2 ${
                      isActiveMaterialGroup ? 'border-blue-200 bg-blue-100/70' : 'border-slate-300 bg-slate-100'
                    }`}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setActiveMaterialGroupId(group.id)}
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${(openMaterialGroups[group.id] ?? true) ? '' : '-rotate-90'}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <div className="flex-1 text-sm font-medium">
                      <div>{(group.supplier || 'Sin proveedor')} - {(group.invoiceNumber || 'Sin nº albarán')}</div>
                      {isActiveMaterialGroup && !isServiceGroup ? (
                        <div className="text-xs font-semibold text-blue-700">Editando este albarán</div>
                      ) : null}
                      {isServiceGroup ? (
                        <div className="mt-0.5 inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                          Servicio
                        </div>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant={isActiveMaterialGroup ? 'default' : 'outline'}
                      className="h-8 px-2 text-xs sm:px-3 sm:text-sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleScanMaterialsForGroup(group.id);
                      }}
                      disabled={readOnly || isAlbaranProcessing}
                    >
                      {isScanningThisGroup ? (
                        <>
                          <Loader2 className="mr-1 h-4 w-4 animate-spin sm:mr-2" />
                          <span className="hidden sm:inline">Procesando...</span>
                          <span className="sm:hidden">...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="mr-1 h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Escanear IA</span>
                          <span className="sm:hidden">IA</span>
                        </>
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeMaterialGroup(group.id);
                      }}
                      disabled={materialGroups.length === 1}
                      title="Eliminar albarán"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {(group.imageUris?.length ?? 0) > 0 ? (
                    <div className="border-b border-[#d9e1ea] bg-white">
                      <AlbaranAttachmentsRow
                        imageUris={group.imageUris || []}
                        onOpenViewer={() =>
                          openAlbaranViewer(
                            group.imageUris || [],
                            `Adjuntos: ${(group.supplier || 'Sin proveedor').trim() || 'Albaran'} - ${(group.invoiceNumber || 'Sin numero').trim() || 'Sin numero'}`,
                          )
                        }
                      />
                    </div>
                  ) : null}
                  <CollapsibleContent>
                    <div className="space-y-4 p-2 sm:p-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <Label>Proveedor:</Label>
                          <Input
                            className="mt-2"
                            placeholder="Nombre del proveedor"
                            value={group.supplier}
                            onChange={(event) => updateMaterialGroup(group.id, { supplier: event.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Nº Albarán:</Label>
                          <Input
                            className="mt-2"
                            placeholder="Número de albarán"
                            value={group.invoiceNumber}
                            onChange={(event) => updateMaterialGroup(group.id, { invoiceNumber: event.target.value })}
                          />
                        </div>
                      </div>
                      <div className="sm:rounded-md sm:border sm:border-[#d9e1ea]">
                        <div className="hidden grid-cols-12 gap-2 bg-slate-100 px-3 py-2 text-sm font-semibold uppercase text-slate-700 md:grid">
                          <div className="col-span-3">Material</div>
                          <div className="col-span-2">Cantidad</div>
                          <div className="col-span-2">Unidad</div>
                          <div className="col-span-2">Precio/Ud</div>
                          <div className="col-span-2 whitespace-nowrap">Coste (€)</div>
                          <div className="col-span-1"></div>
                        </div>
                        <div className="space-y-3 sm:space-y-2 sm:p-3">
                          {group.rows.map((row) => (
                            <div
                              key={row.id}
                              className="rounded-md border border-slate-200 bg-white p-2 md:rounded-none md:border-0 md:bg-transparent md:p-0"
                            >
                              <div className="grid grid-cols-12 gap-2">
                                <div className="col-span-12 space-y-1 md:col-span-3 md:space-y-0">
                                  <p className="text-[11px] font-medium text-slate-500 md:hidden">Material</p>
                                  <Input
                                    placeholder="Nombre del material"
                                    value={row.name}
                                    onChange={(event) => updateMaterialRow(group.id, row.id, { name: event.target.value })}
                                  />
                                </div>
                                <div className="col-span-6 space-y-1 md:col-span-2 md:space-y-0">
                                  <p className="text-[11px] font-medium text-slate-500 md:hidden">Cantidad</p>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={editableNumericValue(row.quantity)}
                                    onChange={(event) =>
                                      updateMaterialRow(group.id, row.id, { quantity: parseNumeric(event.target.value) })
                                    }
                                  />
                                </div>
                                <div className="col-span-6 space-y-1 md:col-span-2 md:space-y-0">
                                  <p className="text-[11px] font-medium text-slate-500 md:hidden">Unidad</p>
                                  <Select
                                    value={row.unit || undefined}
                                    onValueChange={(value) => updateMaterialRow(group.id, row.id, { unit: value })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Unidad" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {materialUnitOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-6 space-y-1 md:col-span-2 md:space-y-0">
                                  <p className="text-[11px] font-medium text-slate-500 md:hidden">Precio/Ud</p>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={editableNumericValue(row.unitPrice)}
                                    onChange={(event) =>
                                      updateMaterialRow(group.id, row.id, { unitPrice: parseNumeric(event.target.value) })
                                    }
                                  />
                                </div>
                                <div className="col-span-6 space-y-1 md:col-span-2 md:space-y-0">
                                  <p className="text-[11px] font-medium text-slate-500 md:hidden">Coste (€)</p>
                                  <Input
                                    type="text"
                                    value={row.total.toFixed(2)}
                                    title="Coste calculado automáticamente (cantidad × precio/ud)"
                                    className={row.costWarningDelta ? 'border-amber-400 text-amber-700' : undefined}
                                    readOnly
                                  />
                                  {row.costWarningDelta ? (
                                    <button
                                      type="button"
                                      className="mt-1 text-left text-xs font-medium text-amber-700 hover:text-amber-800"
                                      onClick={() => openCostDifferenceDialogForRow(group.id, row)}
                                    >
                                      Diferencia detectada: {row.costWarningDelta.toFixed(2)} €
                                    </button>
                                  ) : null}
                                </div>
                                <div className="col-span-12 flex justify-end md:col-span-1 md:items-end md:justify-center">
                                  <Button
                                    className="h-9 w-9 md:h-10 md:w-10"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => removeMaterialRow(group.id, row.id)}
                                    disabled={group.rows.length === 1}
                                    title="Eliminar fila"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                          <Button variant="outline" className="w-full sm:w-auto" onClick={() => addMaterialRow(group.id)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Añadir Fila
                          </Button>
                        </div>
                      </div>

                      {isServiceGroup ? (
                        <div className="rounded-md border border-[#d9e1ea]">
                          <div className="border-b border-[#d9e1ea] bg-slate-100 px-3 py-2 text-sm font-semibold uppercase text-slate-700">
                            Detalle de servicio
                          </div>
                          <div className="space-y-2 p-3">
                            {serviceLines.length === 0 ? (
                              <div className="rounded-md border border-dashed border-[#d9e1ea] bg-slate-50 px-3 py-4 text-sm text-slate-600">
                                No hay filas autogeneradas. Usa "Añadir fila" para introducir el detalle de servicio manualmente.
                              </div>
                            ) : null}
                            {serviceLines.map((line) => (
                              <div key={line.id} className="rounded-md border border-[#d9e1ea] p-2">
                                <div className="grid grid-cols-12 gap-2">
                                  <div className="col-span-12 md:col-span-4">
                                    <Label className="text-xs text-slate-600">Descripción</Label>
                                    <Input
                                      className="mt-1"
                                      value={line.description}
                                      onChange={(event) => updateServiceLine(group.id, line.id, { description: event.target.value })}
                                      placeholder="Descripción del servicio"
                                    />
                                  </div>
                                  <div className="col-span-6 md:col-span-2">
                                    <Label className="text-xs text-slate-600">Horas (h)</Label>
                                    <Input
                                      className="mt-1"
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={line.hours ?? ''}
                                      onChange={(event) =>
                                        updateServiceLine(group.id, line.id, {
                                          hours: event.target.value === '' ? null : parseNumeric(event.target.value),
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="col-span-6 md:col-span-2">
                                    <Label className="text-xs text-slate-600">Viajes</Label>
                                    <Input
                                      className="mt-1"
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={line.trips ?? ''}
                                      onChange={(event) =>
                                        updateServiceLine(group.id, line.id, {
                                          trips: event.target.value === '' ? null : parseNumeric(event.target.value),
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="col-span-6 md:col-span-2">
                                    <Label className="text-xs text-slate-600">Toneladas (t)</Label>
                                    <Input
                                      className="mt-1"
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={line.tons ?? ''}
                                      onChange={(event) =>
                                        updateServiceLine(group.id, line.id, {
                                          tons: event.target.value === '' ? null : parseNumeric(event.target.value),
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="col-span-6 md:col-span-1">
                                    <Label className="text-xs text-slate-600">m3</Label>
                                    <Input
                                      className="mt-1"
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={line.m3 ?? ''}
                                      onChange={(event) =>
                                        updateServiceLine(group.id, line.id, {
                                          m3: event.target.value === '' ? null : parseNumeric(event.target.value),
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="col-span-12 md:col-span-1 md:flex md:items-end md:justify-center">
                                    <Button
                                      className="h-9 w-full md:h-10 md:w-10"
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => removeServiceLine(group.id, line.id)}
                                      disabled={serviceLines.length === 1}
                                      title="Eliminar fila de servicio"
                                    >
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            <Button variant="outline" onClick={() => addServiceLine(group.id)}>
                              <Plus className="mr-2 h-4 w-4" />
                              Añadir Fila
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export type { MaterialsSectionProps };

