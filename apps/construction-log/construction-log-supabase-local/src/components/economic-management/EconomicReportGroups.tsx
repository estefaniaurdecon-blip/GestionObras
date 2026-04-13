import { Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { WorkReport } from '@/types/workReport';
import type { EconomicItemType } from './types';

type EconomicReportGroupsProps = {
  report: WorkReport;
  onRateChange: (type: EconomicItemType, groupIndex: number, itemIndex: number, value: number) => void;
  onEditItem: (type: EconomicItemType, groupIndex: number, itemIndex: number) => void;
  onDeleteItem: (type: EconomicItemType, groupIndex: number, itemIndex: number) => void;
};

const parseInputNumber = (value: string) => parseFloat(value) || 0;

const ActionButtons = ({
  type,
  groupIndex,
  itemIndex,
  onEditItem,
  onDeleteItem,
}: {
  type: EconomicItemType;
  groupIndex: number;
  itemIndex: number;
  onEditItem: EconomicReportGroupsProps['onEditItem'];
  onDeleteItem: EconomicReportGroupsProps['onDeleteItem'];
}) => (
  <div className="flex gap-1">
    <Button size="sm" variant="ghost" onClick={() => onEditItem(type, groupIndex, itemIndex)}>
      <Edit2 className="h-3 w-3" />
    </Button>
    <Button size="sm" variant="ghost" onClick={() => onDeleteItem(type, groupIndex, itemIndex)}>
      <Trash2 className="h-3 w-3" />
    </Button>
  </div>
);

export const EconomicReportGroups = ({
  report,
  onRateChange,
  onEditItem,
  onDeleteItem,
}: EconomicReportGroupsProps) => (
  <div className="space-y-6">
    {report.workGroups.map((group, groupIndex) => (
      <div key={group.id} className="space-y-4">
        <h3 className="text-lg font-semibold">Mano de Obra - {group.company}</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Actividad</TableHead>
              <TableHead>Horas</TableHead>
              <TableHead>Precio/Hora (EUR)</TableHead>
              <TableHead>Total (EUR)</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.items.map((item, itemIndex) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.activity}</TableCell>
                <TableCell>{item.hours}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.hourlyRate || ''}
                    onChange={(event) =>
                      onRateChange('work', groupIndex, itemIndex, parseInputNumber(event.target.value))
                    }
                    className="w-24"
                  />
                </TableCell>
                <TableCell>{item.total.toFixed(2)}</TableCell>
                <TableCell>
                  <ActionButtons
                    type="work"
                    groupIndex={groupIndex}
                    itemIndex={itemIndex}
                    onEditItem={onEditItem}
                    onDeleteItem={onDeleteItem}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    ))}

    {report.machineryGroups.map((group, groupIndex) => (
      <div key={group.id} className="space-y-4">
        <h3 className="text-lg font-semibold">Maquinaria - {group.company}</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Actividad</TableHead>
              <TableHead>Horas</TableHead>
              <TableHead>Precio/Hora (EUR)</TableHead>
              <TableHead>Total (EUR)</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.items.map((item, itemIndex) => (
              <TableRow key={item.id}>
                <TableCell>{item.type}</TableCell>
                <TableCell>{item.activity}</TableCell>
                <TableCell>{item.hours}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.hourlyRate || ''}
                    onChange={(event) =>
                      onRateChange('machinery', groupIndex, itemIndex, parseInputNumber(event.target.value))
                    }
                    className="w-24"
                  />
                </TableCell>
                <TableCell>{item.total.toFixed(2)}</TableCell>
                <TableCell>
                  <ActionButtons
                    type="machinery"
                    groupIndex={groupIndex}
                    itemIndex={itemIndex}
                    onEditItem={onEditItem}
                    onDeleteItem={onDeleteItem}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    ))}

    {report.materialGroups.map((group, groupIndex) => (
      <div key={group.id} className="space-y-4">
        <h3 className="text-lg font-semibold">Materiales - {group.supplier}</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Precio/Unidad (EUR)</TableHead>
              <TableHead>Total (EUR)</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.items.map((item, itemIndex) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell>
                  {item.unitPrice === 0 ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unitPrice || ''}
                      onChange={(event) =>
                        onRateChange('material', groupIndex, itemIndex, parseInputNumber(event.target.value))
                      }
                      className="w-24"
                    />
                  ) : (
                    <span>{item.unitPrice.toFixed(2)}</span>
                  )}
                </TableCell>
                <TableCell>{item.total.toFixed(2)}</TableCell>
                <TableCell>
                  <ActionButtons
                    type="material"
                    groupIndex={groupIndex}
                    itemIndex={itemIndex}
                    onEditItem={onEditItem}
                    onDeleteItem={onDeleteItem}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    ))}

    {report.subcontractGroups.map((group, groupIndex) => (
      <div key={group.id} className="space-y-4">
        <h3 className="text-lg font-semibold">Subcontratas - {group.company}</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Partida</TableHead>
              <TableHead>Actividad</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Cantidad/Trabajadores</TableHead>
              <TableHead>Horas</TableHead>
              <TableHead>Precio/Unidad (EUR)</TableHead>
              <TableHead>Total (EUR)</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.items.map((item, itemIndex) => {
              const unitType = item.unitType || 'hora';
              const isHourBased = unitType === 'hora';
              const unitLabel = isHourBased ? 'Precio/Hora' : `Precio/${unitType}`;
              const currentRate = isHourBased ? item.hourlyRate || 0 : item.unitPrice || 0;

              return (
                <TableRow key={item.id}>
                  <TableCell>{item.contractedPart}</TableCell>
                  <TableCell>{item.activity}</TableCell>
                  <TableCell className="capitalize">{unitType === 'hora' ? 'Hora' : unitType}</TableCell>
                  <TableCell>{isHourBased ? item.workers : item.quantity || 0}</TableCell>
                  <TableCell>{isHourBased ? item.hours : '-'}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">{unitLabel}</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={currentRate || ''}
                        onChange={(event) =>
                          onRateChange('subcontract', groupIndex, itemIndex, parseInputNumber(event.target.value))
                        }
                        className="w-24"
                      />
                    </div>
                  </TableCell>
                  <TableCell>{item.total.toFixed(2)}</TableCell>
                  <TableCell>
                    <ActionButtons
                      type="subcontract"
                      groupIndex={groupIndex}
                      itemIndex={itemIndex}
                      onEditItem={onEditItem}
                      onDeleteItem={onDeleteItem}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    ))}
  </div>
);
