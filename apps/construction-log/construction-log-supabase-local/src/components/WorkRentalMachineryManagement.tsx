import { useState } from 'react';
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
          targetSizeKB: 500,
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
        targetSizeKB: 500,
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
      <Card className="w-full bg-white">
        <CardHeader className="space-y-4">
          <div className="relative min-h-10">
            {!isAdding && (
              <Button
                onClick={() => setIsAdding(true)}
                size="sm"
                className="absolute left-0 top-1/2 -translate-y-1/2"
              >
                <Plus className="mr-2 h-4 w-4" />
                Añadir maquinaria
              </Button>
            )}
            <div className="text-center">
              <CardTitle className="text-2xl">Maquinaria de Alquiler</CardTitle>
              <p className="text-sm text-muted-foreground">Gestión y seguimiento de maquinaria por obra</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isAdding && (
            <div className="rounded-lg border bg-muted/10 p-4">
              <h4 className="mb-4 text-lg font-semibold">{editingId ? 'Editar' : 'Nueva'} maquinaria</h4>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label>Tipo de maquinaria *</Label>
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
                    <Label>Número de máquina *</Label>
                    <Input
                      value={formData.machine_number}
                      onChange={(e) => setFormData({ ...formData, machine_number: e.target.value })}
                      placeholder="Matrícula o número"
                      required
                    />
                  </div>
                  <div>
                    <Label>Tarifa diaria (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.daily_rate}
                      onChange={(e) => setFormData({ ...formData, daily_rate: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>Fecha de entrega *</Label>
                    <Input
                      type="date"
                      value={formData.delivery_date}
                      onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Fecha de baja</Label>
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

                <div className="space-y-2">
                  <Label>Imagen de la maquinaria</Label>
                  {formData.image ? (
                    <div className="relative">
                      <img
                        src={formData.image}
                        alt="Imagen de maquinaria"
                        className="max-h-64 w-full rounded-lg border object-contain"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={removeImage}
                        className="absolute right-2 top-2"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowCamera(true)}
                        className="flex-1"
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        Tomar foto
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('machinery-image-upload')?.click()}
                        className="flex-1"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Subir archivo
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
                    <Save className="mr-2 h-4 w-4" />
                    {editingId ? 'Guardar' : 'Añadir'}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    <X className="mr-2 h-4 w-4" />
                    Cancelar
                  </Button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <p className="text-center text-muted-foreground">Cargando...</p>
          ) : machinery.length === 0 ? (
            <div className="rounded-lg border py-8">
              <p className="text-center text-muted-foreground">No hay maquinaria de alquiler registrada</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {machinery.map((machine) => {
                const days = calculateDays(machine.delivery_date, machine.removal_date);
                const total = days * machine.daily_rate;

                return (
                  <div key={machine.id} className="rounded-lg border bg-background p-4">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold">{machine.type}</h4>
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
                          <UserPlus className="mr-1 h-4 w-4" />
                          Asignar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(machine)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeleteId(machine.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                      <div>
                        <p className="text-muted-foreground">Entrega</p>
                        <p className="flex items-center gap-1 font-medium">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(machine.delivery_date), 'dd/MM/yyyy', { locale: es })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Baja</p>
                        <p className="flex items-center gap-1 font-medium">
                          <Calendar className="h-3 w-3" />
                          {machine.removal_date
                            ? format(new Date(machine.removal_date), 'dd/MM/yyyy', { locale: es })
                            : 'En uso'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Días</p>
                        <p className="text-lg font-medium">{days}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total</p>
                        <p className="text-lg font-medium">{total.toFixed(2)} €</p>
                      </div>
                    </div>

                    {machine.image && (
                      <div className="mt-4 border-t pt-4">
                        <p className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
                          <FileImage className="h-4 w-4" />
                          Imagen de la maquinaria
                        </p>
                        <img
                          src={machine.image}
                          alt={`${machine.type} - ${machine.machine_number}`}
                          className="max-h-64 w-full cursor-pointer rounded-lg border object-contain transition-opacity hover:opacity-90"
                          onClick={() => window.open(machine.image!, '_blank')}
                        />
                      </div>
                    )}

                    {machine.notes && (
                      <div className="mt-4 border-t pt-4">
                        <p className="text-sm text-muted-foreground">Notas</p>
                        <p className="text-sm">{machine.notes}</p>
                      </div>
                    )}

                    <Collapsible className="mt-4">
                      <CollapsibleTrigger className="flex w-full justify-start gap-2 py-2 text-sm font-medium hover:underline">
                        <ChevronDown className="h-4 w-4" />
                        Ver historial de asignaciones de operadores
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3">
                        <RentalMachineryAssignmentsList machinery={machine} />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
