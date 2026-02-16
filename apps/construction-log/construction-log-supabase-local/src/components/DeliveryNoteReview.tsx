import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, FileCheck, FileX, AlertTriangle, Bot, User, Package, Wrench, Truck, CheckCircle2, XCircle, Edit2 } from 'lucide-react';
import { useDeliveryNotes, ProcessedItem, DeliveryNote } from '@/hooks/useDeliveryNotes';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface DeliveryNoteReviewProps {
  workId: string;
  workName?: string;
}

export const DeliveryNoteReview = ({ workId, workName }: DeliveryNoteReviewProps) => {
  const { t } = useTranslation();
  const { pendingNotes, isLoading, isProcessing, validateNote, rejectNote } = useDeliveryNotes(workId);
  const [selectedNote, setSelectedNote] = useState<DeliveryNote | null>(null);
  const [editedItems, setEditedItems] = useState<ProcessedItem[]>([]);

  const handleSelectNote = (note: DeliveryNote) => {
    setSelectedNote(note);
    setEditedItems([...note.processed_items]);
  };

  const handleItemChange = (index: number, field: keyof ProcessedItem, value: any) => {
    setEditedItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
        user_corrected: true,
      };
      return updated;
    });
  };

  const handleToggleImmediateConsumption = (index: number) => {
    setEditedItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        is_immediate_consumption: !updated[index].is_immediate_consumption,
        user_corrected: true,
      };
      return updated;
    });
  };

  const handleValidate = () => {
    if (!selectedNote) return;
    
    // Check if any immediate consumption item doesn't have work assigned
    const hasUnassignedImmediate = editedItems.some(
      item => item.is_immediate_consumption && !workId
    );

    if (hasUnassignedImmediate) {
      return; // Alert is shown in UI
    }

    validateNote({
      noteId: selectedNote.id,
      items: editedItems,
      workId,
    });
    setSelectedNote(null);
    setEditedItems([]);
  };

  const handleReject = () => {
    if (!selectedNote) return;
    rejectNote(selectedNote.id);
    setSelectedNote(null);
    setEditedItems([]);
  };

  const getItemTypeIcon = (type: string) => {
    switch (type) {
      case 'material': return <Package className="h-4 w-4" />;
      case 'tool': return <Wrench className="h-4 w-4" />;
      case 'machinery': return <Truck className="h-4 w-4" />;
      default: return <Package className="h-4 w-4" />;
    }
  };

  const getConfidenceBadge = (confidence?: number) => {
    if (!confidence) return null;
    const pct = Math.round(confidence * 100);
    const variant = pct >= 90 ? 'default' : pct >= 70 ? 'secondary' : 'destructive';
    return (
      <Badge variant={variant} className="text-xs">
        {pct}% confianza
      </Badge>
    );
  };

  const hasImmediateWithoutWork = editedItems.some(
    item => item.is_immediate_consumption && !workId
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Notes List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-primary" />
            Bandeja de Entrada de Albaranes
          </CardTitle>
          <CardDescription>
            Revisa y valida los albaranes procesados por la IA antes de añadirlos al inventario
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pendingNotes || pendingNotes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay albaranes pendientes de validación</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingNotes.map((note) => (
                <div
                  key={note.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedNote?.id === note.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-primary/50 hover:bg-muted/30'
                  }`}
                  onClick={() => handleSelectNote(note)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                        <Bot className="h-3 w-3 mr-1" />
                        IA Detectado
                      </Badge>
                      <div>
                        <p className="font-medium">{note.supplier}</p>
                        <p className="text-sm text-muted-foreground">
                          Albarán: {note.delivery_note_number || 'Sin número'} · {' '}
                          {format(new Date(note.delivery_date), "d 'de' MMMM, yyyy", { locale: es })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getConfidenceBadge(note.ai_confidence)}
                      <Badge variant="secondary">
                        {note.processed_items.length} items
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail View for Selected Note */}
      {selectedNote && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Edit2 className="h-5 w-5" />
                  Revisar Albarán: {selectedNote.supplier}
                </CardTitle>
                <CardDescription>
                  Verifica y corrige los datos detectados por la IA antes de confirmar
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleReject}
                  disabled={isProcessing}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Rechazar
                </Button>
                <Button
                  onClick={handleValidate}
                  disabled={isProcessing || hasImmediateWithoutWork}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Validar e Ingresar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasImmediateWithoutWork && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Los materiales de "Consumo Inmediato" deben estar asignados a una obra específica.
                  Por favor, asegúrate de que esta validación se realiza desde el contexto de una obra.
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10">Tipo</TableHead>
                    <TableHead>Nombre del Item</TableHead>
                    <TableHead className="w-24">Cantidad</TableHead>
                    <TableHead className="w-20">Unidad</TableHead>
                    <TableHead className="w-28">Precio Unit.</TableHead>
                    <TableHead className="w-28">Total</TableHead>
                    <TableHead className="w-40">Consumo Inmediato</TableHead>
                    <TableHead className="w-20">Origen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editedItems.map((item, index) => (
                    <TableRow 
                      key={item.id}
                      className={item.user_corrected ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}
                    >
                      <TableCell>
                        <Select
                          value={item.item_type}
                          onValueChange={(value) => handleItemChange(index, 'item_type', value)}
                        >
                          <SelectTrigger className="w-full h-8 px-2">
                            <SelectValue>
                              {getItemTypeIcon(item.item_type)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="material">
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                Material
                              </div>
                            </SelectItem>
                            <SelectItem value="tool">
                              <div className="flex items-center gap-2">
                                <Wrench className="h-4 w-4" />
                                Herramienta
                              </div>
                            </SelectItem>
                            <SelectItem value="machinery">
                              <div className="flex items-center gap-2">
                                <Truck className="h-4 w-4" />
                                Maquinaria
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.name}
                          onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.unit}
                          onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price || ''}
                          onChange={(e) => handleItemChange(index, 'unit_price', Number(e.target.value))}
                          className="h-8"
                          placeholder="0.00"
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {((item.quantity || 0) * (item.unit_price || 0)).toFixed(2)} €
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`immediate-${index}`}
                            checked={item.is_immediate_consumption}
                            onCheckedChange={() => handleToggleImmediateConsumption(index)}
                          />
                          <Label 
                            htmlFor={`immediate-${index}`}
                            className={`text-xs ${item.is_immediate_consumption ? 'text-orange-600 font-medium' : 'text-muted-foreground'}`}
                          >
                            {item.is_immediate_consumption ? 'Sí' : 'No'}
                          </Label>
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.user_corrected ? (
                          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">
                            <User className="h-3 w-3 mr-1" />
                            Manual
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
                            <Bot className="h-3 w-3 mr-1" />
                            IA
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">{editedItems.length}</span> items en este albarán
                {editedItems.filter(i => i.is_immediate_consumption).length > 0 && (
                  <span className="ml-4 text-orange-600">
                    <AlertTriangle className="h-4 w-4 inline mr-1" />
                    {editedItems.filter(i => i.is_immediate_consumption).length} de consumo inmediato
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total del albarán</p>
                <p className="text-lg font-bold">
                  {editedItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0).toFixed(2)} €
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
