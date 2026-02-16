import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Edit2, Save, X, Calendar, UserPlus, Camera, Upload, FileImage } from 'lucide-react';
import { useWorkRentalMachinery, WorkRentalMachinery } from '@/hooks/useWorkRentalMachinery';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CameraScanner } from '@/components/CameraScanner';
import { toast } from 'sonner';
import { compressBase64Image } from '@/utils/imageCompression';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RentalMachineryAssignmentDialog } from './RentalMachineryAssignmentDialog';
import { RentalMachineryAssignmentsList } from './RentalMachineryAssignmentsList';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

interface WorkRentalMachineryManagementProps {
  workId: string;
}

export const WorkRentalMachineryManagement = ({ workId }: WorkRentalMachineryManagementProps) => {
  const { t } = useTranslation();
  const { machinery, loading, addMachinery, updateMachinery, deleteMachinery, calculateDays } = useWorkRentalMachinery(workId);
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [selectedMachinery, setSelectedMachinery] = useState<WorkRentalMachinery | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  
  const [formData, setFormData] = useState({
    type: '',
    provider: '',
    machine_number: '',
    delivery_date: format(new Date(), 'yyyy-MM-dd'),
    removal_date: '',
    daily_rate: 0,
    notes: '',
    image: null as string | null,
  });

  const resetForm = () => {
    setFormData({
      type: '',
      provider: '',
      machine_number: '',
      delivery_date: format(new Date(), 'yyyy-MM-dd'),
      removal_date: '',
      daily_rate: 0,
      notes: '',
      image: null,
    });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona un archivo de imagen');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result as string;
        const compressed = await compressBase64Image(base64, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.8,
          targetSizeKB: 500
        });
        setFormData({ ...formData, image: compressed });
      } catch (error) {
        console.error('Error compressing image:', error);
        toast.error('Error al procesar la imagen');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = async (base64Image: string) => {
    try {
      const compressed = await compressBase64Image(base64Image, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
        targetSizeKB: 500
      });
      setFormData({ ...formData, image: compressed });
      setShowCamera(false);
    } catch (error) {
      console.error('Error processing camera image:', error);
      toast.error('Error al procesar la imagen');
    }
  };

  const removeImage = () => {
    setFormData({ ...formData, image: null });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.type || !formData.provider || !formData.machine_number || !formData.delivery_date) {
      return;
    }

    try {
      if (editingId) {
        await updateMachinery(editingId, {
          ...formData,
          work_id: workId,
          removal_date: formData.removal_date || null,
        });
      } else {
        await addMachinery({
          ...formData,
          work_id: workId,
          removal_date: formData.removal_date || null,
        });
      }
      resetForm();
    } catch (error) {
      console.error('Error saving machinery:', error);
    }
  };

  const handleEdit = (machine: WorkRentalMachinery) => {
    setFormData({
      type: machine.type,
      provider: machine.provider,
      machine_number: machine.machine_number,
      delivery_date: machine.delivery_date,
      removal_date: machine.removal_date || '',
      daily_rate: machine.daily_rate,
      notes: machine.notes || '',
      image: machine.image || null,
    });
    setEditingId(machine.id);
    setIsAdding(true);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteMachinery(deleteId);
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Maquinaria de Alquiler</h3>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Añadir Maquinaria
          </Button>
        )}
      </div>

      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Editar' : 'Nueva'} Maquinaria</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Maquinaria *</Label>
                  <Input
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    placeholder="Ej: Excavadora, Grúa..."
                    required
                  />
                </div>
                <div>
                  <Label>Proveedor *</Label>
                  <Input
                    value={formData.provider}
                    onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                    placeholder="Nombre del proveedor"
                    required
                  />
                </div>
                <div>
                  <Label>Número de Máquina *</Label>
                  <Input
                    value={formData.machine_number}
                    onChange={(e) => setFormData({ ...formData, machine_number: e.target.value })}
                    placeholder="Matrícula o número"
                    required
                  />
                </div>
                <div>
                  <Label>Tarifa Diaria (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.daily_rate}
                    onChange={(e) => setFormData({ ...formData, daily_rate: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Fecha de Entrega *</Label>
                  <Input
                    type="date"
                    value={formData.delivery_date}
                    onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Fecha de Baja</Label>
                  <Input
                    type="date"
                    value={formData.removal_date}
                    onChange={(e) => setFormData({ ...formData, removal_date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Observaciones adicionales..."
                  rows={3}
                />
              </div>
              
              {/* Image Upload Section */}
              <div className="space-y-2">
                <Label>Imagen de la Maquinaria</Label>
                {formData.image ? (
                  <div className="relative">
                    <img 
                      src={formData.image} 
                      alt="Imagen de maquinaria" 
                      className="w-full max-h-64 object-contain rounded-lg border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={removeImage}
                      className="absolute top-2 right-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCamera(true)}
                      className="flex-1"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Tomar Foto
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('machinery-image-upload')?.click()}
                      className="flex-1"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Subir Archivo
                    </Button>
                    <input
                      id="machinery-image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button type="submit">
                  <Save className="h-4 w-4 mr-2" />
                  {editingId ? 'Guardar' : 'Añadir'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground">Cargando...</p>
      ) : machinery.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              No hay maquinaria de alquiler registrada
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {machinery.map((machine) => {
            const days = calculateDays(machine.delivery_date, machine.removal_date);
            const total = days * machine.daily_rate;
            
            return (
              <Card key={machine.id}>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-lg">{machine.type}</h4>
                      <p className="text-sm text-muted-foreground">
                        {machine.provider} • {machine.machine_number}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelectedMachinery(machine);
                          setAssignmentDialogOpen(true);
                        }}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Asignar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(machine)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteId(machine.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Entrega</p>
                      <p className="font-medium flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(machine.delivery_date), 'dd/MM/yyyy', { locale: es })}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Baja</p>
                      <p className="font-medium flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {machine.removal_date 
                          ? format(new Date(machine.removal_date), 'dd/MM/yyyy', { locale: es })
                          : 'En uso'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Días</p>
                      <p className="font-medium text-lg">{days}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total</p>
                      <p className="font-medium text-lg">{total.toFixed(2)} €</p>
                    </div>
                  </div>
                  
                  {machine.image && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                        <FileImage className="h-4 w-4" />
                        Imagen de la Maquinaria
                      </p>
                      <img 
                        src={machine.image} 
                        alt={`${machine.type} - ${machine.machine_number}`}
                        className="w-full max-h-64 object-contain rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(machine.image!, '_blank')}
                      />
                    </div>
                  )}
                  
                  {machine.notes && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">Notas</p>
                      <p className="text-sm">{machine.notes}</p>
                    </div>
                  )}

                  {/* Historial de asignaciones */}
                  <Collapsible className="mt-4">
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline w-full justify-start py-2">
                      <ChevronDown className="h-4 w-4" />
                      Ver historial de asignaciones de operadores
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3">
                      <RentalMachineryAssignmentsList machinery={machine} />
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar maquinaria?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La maquinaria será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedMachinery && (
        <RentalMachineryAssignmentDialog
          machinery={selectedMachinery}
          open={assignmentDialogOpen}
          onOpenChange={setAssignmentDialogOpen}
        />
      )}
      
      {showCamera && (
        <CameraScanner
          isOpen={showCamera}
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
          title="Capturar Imagen de Maquinaria"
        />
      )}
    </div>
  );
};
