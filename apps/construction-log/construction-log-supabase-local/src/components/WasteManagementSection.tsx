import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, Plus, Truck, Package, AlertTriangle, Leaf, Edit2 } from 'lucide-react';
import { useWasteEntries, WasteEntryWithRelations } from '@/hooks/useWasteEntries';
import { 
  WasteOperationMode, 
  WasteActionType, 
  ContainerSizeDB,
  WASTE_OPERATION_MODES,
  WASTE_ACTION_TYPES,
  CONTAINER_SIZES_DB,
  getOperationModeLabel,
  getActionTypeLabel,
  getContainerSizeDBLabel,
  formatLerCode
} from '@/types/wasteDatabase';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { cn } from '@/lib/utils';

interface WasteManagementSectionProps {
  workReportId: string | null;
  workId?: string;
  readOnly?: boolean;
}

export const WasteManagementSection = ({ 
  workReportId, 
  workId,
  readOnly = false 
}: WasteManagementSectionProps) => {
  const { 
    entries, 
    wasteTypes, 
    managers, 
    loading, 
    createEntry, 
    updateEntry, 
    deleteEntry 
  } = useWasteEntries(workReportId, workId);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WasteEntryWithRelations | null>(null);
  
  // Form state
  const [operationMode, setOperationMode] = useState<WasteOperationMode>('container_management');
  const [actionType, setActionType] = useState<WasteActionType>('delivery');
  const [wasteTypeId, setWasteTypeId] = useState<string>('');
  const [managerName, setManagerName] = useState('');
  const [containerId, setContainerId] = useState('');
  const [containerSize, setContainerSize] = useState<ContainerSizeDB | ''>('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [volumeM3, setVolumeM3] = useState<number | ''>('');
  const [weightTn, setWeightTn] = useState<number | ''>('');
  const [destinationPlant, setDestinationPlant] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setOperationMode('container_management');
    setActionType('delivery');
    setWasteTypeId('');
    setManagerName('');
    setContainerId('');
    setContainerSize('');
    setVehiclePlate('');
    setVehicleType('');
    setOperatorName('');
    setVolumeM3('');
    setWeightTn('');
    setDestinationPlant('');
    setTicketNumber('');
    setNotes('');
    setEditingEntry(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const handleOpenEdit = (entry: WasteEntryWithRelations) => {
    setEditingEntry(entry);
    setOperationMode(entry.operation_mode);
    setActionType(entry.action_type);
    setWasteTypeId(entry.waste_type_id || '');
    setManagerName((entry as any).manager_name || entry.manager?.company_name || '');
    setContainerId(entry.container_id || '');
    setContainerSize((entry.container_size as ContainerSizeDB) || '');
    setVehiclePlate(entry.vehicle_plate || '');
    setVehicleType(entry.vehicle_type || '');
    setOperatorName(entry.operator_name || '');
    setVolumeM3(entry.volume_m3 ?? '');
    setWeightTn(entry.weight_tn ?? '');
    setDestinationPlant(entry.destination_plant || '');
    setTicketNumber(entry.ticket_number || '');
    setNotes(entry.notes || '');
    setShowAddDialog(true);
  };

  const handleSubmit = async (keepOpen: boolean = false) => {
    const data = {
      operation_mode: operationMode,
      action_type: actionType,
      waste_type_id: wasteTypeId || null,
      manager_name: managerName || null,
      container_id: containerId || null,
      container_size: (containerSize as ContainerSizeDB) || null,
      vehicle_plate: vehiclePlate || null,
      vehicle_type: vehicleType || null,
      operator_name: operatorName || null,
      volume_m3: volumeM3 !== '' ? Number(volumeM3) : null,
      weight_tn: weightTn !== '' ? Number(weightTn) : null,
      destination_plant: destinationPlant || null,
      ticket_number: ticketNumber || null,
      notes: notes || null
    };

    let success = false;
    if (editingEntry) {
      const result = await updateEntry(editingEntry.id, data);
      success = !!result;
    } else {
      const result = await createEntry(data);
      success = !!result;
    }

    if (success) {
      if (keepOpen) {
        // Limpiar solo los campos específicos, mantener modo y tipo de residuo
        setContainerId('');
        setVehiclePlate('');
        setVolumeM3('');
        setWeightTn('');
        setTicketNumber('');
        setNotes('');
        setEditingEntry(null);
      } else {
        setShowAddDialog(false);
        resetForm();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar esta entrada?')) {
      await deleteEntry(id);
    }
  };

  // Available action types based on operation mode
  const getAvailableActions = (mode: WasteOperationMode): WasteActionType[] => {
    if (mode === 'container_management') {
      return ['delivery', 'withdrawal', 'exchange'];
    }
    return ['load'];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (!workReportId) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Leaf className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>Guarda el parte para poder gestionar residuos</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con botón de añadir */}
      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={handleOpenAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Añadir Movimiento
          </Button>
        </div>
      )}

      {/* Lista de entradas */}
      {entries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
          <Leaf className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">Sin movimientos de residuos</p>
          <p className="text-sm">Añade entregas, retiradas o cargas de residuos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card key={entry.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    {/* Header con badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={entry.operation_mode === 'container_management' ? 'default' : 'secondary'}>
                        {entry.operation_mode === 'container_management' ? (
                          <Package className="h-3 w-3 mr-1" />
                        ) : (
                          <Truck className="h-3 w-3 mr-1" />
                        )}
                        {getOperationModeLabel(entry.operation_mode)}
                      </Badge>
                      <Badge variant="outline">
                        {getActionTypeLabel(entry.action_type)}
                      </Badge>
                      {entry.waste_type?.is_hazardous && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Peligroso
                        </Badge>
                      )}
                    </div>

                    {/* Detalles */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {entry.waste_type && (
                        <div>
                          <span className="text-muted-foreground">Residuo:</span>{' '}
                          <span className="font-medium">{entry.waste_type.name}</span>
                          {entry.waste_type.ler_code && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({formatLerCode(entry.waste_type.ler_code)})
                            </span>
                          )}
                        </div>
                      )}
                      {((entry as any).manager_name || entry.manager?.company_name) && (
                        <div>
                          <span className="text-muted-foreground">Gestor:</span>{' '}
                          <span className="font-medium">{(entry as any).manager_name || entry.manager?.company_name}</span>
                        </div>
                      )}
                      {entry.container_id && (
                        <div>
                          <span className="text-muted-foreground">Contenedor:</span>{' '}
                          <span className="font-medium">{entry.container_id}</span>
                          {entry.container_size && (
                            <span className="text-muted-foreground ml-1">
                              ({getContainerSizeDBLabel(entry.container_size)})
                            </span>
                          )}
                        </div>
                      )}
                      {entry.vehicle_plate && (
                        <div>
                          <span className="text-muted-foreground">Vehículo:</span>{' '}
                          <span className="font-medium">{entry.vehicle_plate}</span>
                        </div>
                      )}
                      {entry.volume_m3 && (
                        <div>
                          <span className="text-muted-foreground">Volumen:</span>{' '}
                          <span className="font-medium">{entry.volume_m3} m³</span>
                        </div>
                      )}
                      {entry.destination_plant && (
                        <div>
                          <span className="text-muted-foreground">Destino:</span>{' '}
                          <span className="font-medium">{entry.destination_plant}</span>
                        </div>
                      )}
                    </div>

                    {entry.notes && (
                      <p className="text-sm text-muted-foreground italic">
                        "{entry.notes}"
                      </p>
                    )}
                  </div>

                  {/* Acciones */}
                  {!readOnly && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(entry)}
                        className="h-8 w-8"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(entry.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog para añadir/editar */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Leaf className="h-5 w-5 text-success" />
              {editingEntry ? 'Editar Movimiento' : 'Nuevo Movimiento de Residuos'}
            </DialogTitle>
            <DialogDescription>
              Registra entregas, retiradas o cargas de residuos
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-1">
            {/* Modo de operación */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={operationMode === 'container_management' ? 'default' : 'outline'}
                className="h-auto py-3 flex-col gap-1"
                onClick={() => {
                  setOperationMode('container_management');
                  setActionType('delivery');
                }}
              >
                <Package className="h-5 w-5" />
                <span className="text-xs">Contenedores</span>
              </Button>
              <Button
                type="button"
                variant={operationMode === 'direct_transport' ? 'default' : 'outline'}
                className="h-auto py-3 flex-col gap-1"
                onClick={() => {
                  setOperationMode('direct_transport');
                  setActionType('load');
                }}
              >
                <Truck className="h-5 w-5" />
                <span className="text-xs">Transporte</span>
              </Button>
            </div>

            {/* Tipo de acción */}
            <div>
              <Label>Tipo de Acción *</Label>
              <Select value={actionType} onValueChange={(v) => setActionType(v as WasteActionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableActions(operationMode).map((action) => (
                    <SelectItem key={action} value={action}>
                      {getActionTypeLabel(action)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de residuo */}
            <div>
              <Label>Tipo de Residuo</Label>
              <Select value={wasteTypeId} onValueChange={setWasteTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar residuo..." />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {wasteTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <span className="flex items-center gap-2">
                        {type.is_hazardous && <AlertTriangle className="h-3 w-3 text-destructive" />}
                        {type.name}
                        {type.ler_code && (
                          <span className="text-xs text-muted-foreground">
                            ({formatLerCode(type.ler_code)})
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Gestor/Transportista - Input libre */}
            <div>
              <Label>Gestor / Transportista</Label>
              <Input
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="Nombre de la empresa gestora..."
                maxLength={150}
              />
            </div>

            {/* Campos específicos de contenedor */}
            {operationMode === 'container_management' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>ID Contenedor</Label>
                    <Input
                      value={containerId}
                      onChange={(e) => setContainerId(e.target.value)}
                      placeholder="Ej: C-405"
                    />
                  </div>
                  <div>
                    <Label>Tamaño</Label>
                    <Select value={containerSize} onValueChange={(v) => setContainerSize(v as ContainerSizeDB)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tamaño..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(CONTAINER_SIZES_DB) as ContainerSizeDB[]).map((size) => (
                          <SelectItem key={size} value={size}>
                            {CONTAINER_SIZES_DB[size]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {/* Campos específicos de transporte */}
            {operationMode === 'direct_transport' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Matrícula Vehículo</Label>
                    <Input
                      value={vehiclePlate}
                      onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                      placeholder="1234-ABC"
                    />
                  </div>
                  <div>
                    <Label>Tipo Vehículo</Label>
                    <Input
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      placeholder="Camión bañera"
                    />
                  </div>
                </div>
                <div>
                  <Label>Operador</Label>
                  <Input
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    placeholder="Nombre del conductor"
                  />
                </div>
              </>
            )}

            {/* Volumetría */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Volumen (m³)</Label>
                <Input
                  type="number"
                  value={volumeM3}
                  onChange={(e) => setVolumeM3(e.target.value ? Number(e.target.value) : '')}
                  placeholder="0"
                  min="0"
                  step="0.1"
                />
              </div>
              <div>
                <Label>Peso (Tn)</Label>
                <Input
                  type="number"
                  value={weightTn}
                  onChange={(e) => setWeightTn(e.target.value ? Number(e.target.value) : '')}
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            {/* Destino y ticket */}
            <div>
              <Label>Planta de Destino</Label>
              <Input
                value={destinationPlant}
                onChange={(e) => setDestinationPlant(e.target.value)}
                placeholder="Nombre de la planta o vertedero"
              />
            </div>

            <div>
              <Label>Nº Ticket/Albarán</Label>
              <Input
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                placeholder="Número de referencia"
              />
            </div>

            {/* Notas */}
            <div>
              <Label>Notas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones adicionales..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            {!editingEntry && (
              <Button variant="secondary" onClick={() => handleSubmit(true)}>
                Guardar y añadir otro
              </Button>
            )}
            <Button onClick={() => handleSubmit(false)}>
              {editingEntry ? 'Guardar Cambios' : 'Añadir y cerrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
