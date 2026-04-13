import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SubcontractItem } from '@/types/workReport';
import type { EconomicEditValues, EditingEconomicItem } from './types';

type EconomicItemEditDialogProps = {
  editingItem: EditingEconomicItem | null;
  editValues: EconomicEditValues;
  onEditValuesChange: (values: EconomicEditValues) => void;
  onSave: () => void;
  onOpenChange: (open: boolean) => void;
};

export const EconomicItemEditDialog = ({
  editingItem,
  editValues,
  onEditValuesChange,
  onSave,
  onOpenChange,
}: EconomicItemEditDialogProps) => {
  const updateText = (field: keyof EconomicEditValues, value: string) => {
    onEditValuesChange({ ...editValues, [field]: value });
  };

  const updateNumber = (field: keyof EconomicEditValues, value: string, parser: (raw: string) => number) => {
    onEditValuesChange({ ...editValues, [field]: parser(value) });
  };

  return (
    <Dialog open={Boolean(editingItem)} onOpenChange={onOpenChange}>
      <DialogContent fullScreen className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Elemento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {editingItem?.type === 'work' ? (
            <>
              <div>
                <Label>Nombre</Label>
                <Input value={editValues.name || ''} onChange={(event) => updateText('name', event.target.value)} />
              </div>
              <div>
                <Label>Actividad</Label>
                <Input
                  value={editValues.activity || ''}
                  onChange={(event) => updateText('activity', event.target.value)}
                />
              </div>
              <div>
                <Label>Horas</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editValues.hours || ''}
                  onChange={(event) => updateNumber('hours', event.target.value, (value) => parseFloat(value) || 0)}
                />
              </div>
              <div>
                <Label>Precio/Hora (EUR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editValues.hourlyRate || ''}
                  onChange={(event) =>
                    updateNumber('hourlyRate', event.target.value, (value) => parseFloat(value) || 0)
                  }
                />
              </div>
            </>
          ) : null}

          {editingItem?.type === 'machinery' ? (
            <>
              <div>
                <Label>Tipo</Label>
                <Input value={editValues.type || ''} onChange={(event) => updateText('type', event.target.value)} />
              </div>
              <div>
                <Label>Actividad</Label>
                <Input
                  value={editValues.activity || ''}
                  onChange={(event) => updateText('activity', event.target.value)}
                />
              </div>
              <div>
                <Label>Horas</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editValues.hours || ''}
                  onChange={(event) => updateNumber('hours', event.target.value, (value) => parseFloat(value) || 0)}
                />
              </div>
              <div>
                <Label>Precio/Hora (EUR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editValues.hourlyRate || ''}
                  onChange={(event) =>
                    updateNumber('hourlyRate', event.target.value, (value) => parseFloat(value) || 0)
                  }
                />
              </div>
            </>
          ) : null}

          {editingItem?.type === 'material' ? (
            <>
              <div>
                <Label>Material</Label>
                <Input value={editValues.name || ''} onChange={(event) => updateText('name', event.target.value)} />
              </div>
              <div>
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editValues.quantity || ''}
                  onChange={(event) =>
                    updateNumber('quantity', event.target.value, (value) => parseFloat(value) || 0)
                  }
                />
              </div>
              <div>
                <Label>Unidad</Label>
                <Input value={editValues.unit || ''} onChange={(event) => updateText('unit', event.target.value)} />
              </div>
              <div>
                <Label>Precio/Unidad (EUR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editValues.unitPrice || ''}
                  onChange={(event) =>
                    updateNumber('unitPrice', event.target.value, (value) => parseFloat(value) || 0)
                  }
                />
              </div>
            </>
          ) : null}

          {editingItem?.type === 'subcontract' ? (
            <>
              <div>
                <Label>Partida</Label>
                <Input
                  value={editValues.contractedPart || ''}
                  onChange={(event) => updateText('contractedPart', event.target.value)}
                />
              </div>
              <div>
                <Label>Actividad</Label>
                <Input
                  value={editValues.activity || ''}
                  onChange={(event) => updateText('activity', event.target.value)}
                />
              </div>
              <div>
                <Label>Tipo de Unidad</Label>
                <Select
                  value={editValues.unitType || 'hora'}
                  onValueChange={(value) =>
                    onEditValuesChange({
                      ...editValues,
                      unitType: value as NonNullable<SubcontractItem['unitType']>,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hora">Hora</SelectItem>
                    <SelectItem value="m2">m2</SelectItem>
                    <SelectItem value="m3">m3</SelectItem>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="unidad">Unidad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(editValues.unitType || 'hora') === 'hora' ? (
                <>
                  <div>
                    <Label>Trabajadores</Label>
                    <Input
                      type="number"
                      value={editValues.workers || ''}
                      onChange={(event) =>
                        updateNumber('workers', event.target.value, (value) => parseInt(value, 10) || 0)
                      }
                    />
                  </div>
                  <div>
                    <Label>Horas</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.hours || ''}
                      onChange={(event) =>
                        updateNumber('hours', event.target.value, (value) => parseFloat(value) || 0)
                      }
                    />
                  </div>
                  <div>
                    <Label>Precio/Hora (EUR)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.hourlyRate || ''}
                      onChange={(event) =>
                        updateNumber('hourlyRate', event.target.value, (value) => parseFloat(value) || 0)
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>Cantidad</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.quantity || ''}
                      onChange={(event) =>
                        updateNumber('quantity', event.target.value, (value) => parseFloat(value) || 0)
                      }
                    />
                  </div>
                  <div>
                    <Label>Precio/Unidad (EUR)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.unitPrice || ''}
                      onChange={(event) =>
                        updateNumber('unitPrice', event.target.value, (value) => parseFloat(value) || 0)
                      }
                    />
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={onSave}>
            <Save className="mr-2 h-4 w-4" />
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
