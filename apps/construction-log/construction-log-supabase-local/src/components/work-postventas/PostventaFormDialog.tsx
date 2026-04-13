import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Plus,
  Loader2,
  Trash2,
  X,
  Camera,
  Building2,
  Users,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import type { WorkPostventa, PostventaSubcontractGroup, PostventaWorker, PostventaMachinery } from '@/hooks/useWorkPostventas';

export interface PostventaFormData {
  description: string;
  assigned_company: string;
  estimated_hours: string;
  actual_hours: string;
  status: 'pending' | 'in_progress' | 'completed';
  before_image: string;
  after_image: string;
  subcontract_groups: PostventaSubcontractGroup[];
}

export const EMPTY_POSTVENTA_FORM: PostventaFormData = {
  description: '',
  assigned_company: '',
  estimated_hours: '',
  actual_hours: '',
  status: 'pending',
  before_image: '',
  after_image: '',
  subcontract_groups: [],
};

interface PostventaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPostventa: WorkPostventa | null;
  formData: PostventaFormData;
  setFormData: Dispatch<SetStateAction<PostventaFormData>>;
  isSaving: boolean;
  uploading: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function PostventaFormDialog({
  open,
  onOpenChange,
  editingPostventa,
  formData,
  setFormData,
  isSaving,
  uploading,
  onSubmit,
  onCancel,
}: PostventaFormDialogProps) {
  const beforeImageInputRef = useRef<HTMLInputElement>(null);
  const afterImageInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; type: 'before' | 'after' } | null>(null);

  // --- Image handlers ---

  const handleImageUpload = (type: 'before' | 'after') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('La imagen no puede superar 10MB');
      return;
    }

    const url = URL.createObjectURL(file);
    setFormData(prev => ({
      ...prev,
      [type === 'before' ? 'before_image' : 'after_image']: url,
    }));
    e.target.value = '';
  };

  const handleRemoveImage = (type: 'before' | 'after') => {
    setFormData(prev => ({
      ...prev,
      [type === 'before' ? 'before_image' : 'after_image']: '',
    }));
  };

  // --- Subcontract group handlers ---

  const handleAddSubcontractGroup = () => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: [...prev.subcontract_groups, { company: '', workers: [], machinery: [] }],
    }));
  };

  const handleRemoveSubcontractGroup = (groupIndex: number) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.filter((_, i) => i !== groupIndex),
    }));
  };

  const handleUpdateGroupCompany = (groupIndex: number, company: string) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) =>
        i === groupIndex ? { ...g, company } : g,
      ),
    }));
  };

  const handleAddWorker = (groupIndex: number) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) =>
        i === groupIndex ? { ...g, workers: [...g.workers, { name: '', hours: 0 }] } : g,
      ),
    }));
  };

  const handleUpdateWorker = (
    groupIndex: number,
    workerIndex: number,
    field: keyof PostventaWorker,
    value: string | number,
  ) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) =>
        i === groupIndex
          ? {
              ...g,
              workers: g.workers.map((w, wi) =>
                wi === workerIndex ? { ...w, [field]: value } : w,
              ),
            }
          : g,
      ),
    }));
  };

  const handleRemoveWorker = (groupIndex: number, workerIndex: number) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) =>
        i === groupIndex ? { ...g, workers: g.workers.filter((_, wi) => wi !== workerIndex) } : g,
      ),
    }));
  };

  const handleAddMachinery = (groupIndex: number) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) =>
        i === groupIndex ? { ...g, machinery: [...g.machinery, { type: '', hours: 0 }] } : g,
      ),
    }));
  };

  const handleUpdateMachinery = (
    groupIndex: number,
    machineryIndex: number,
    field: keyof PostventaMachinery,
    value: string | number,
  ) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) =>
        i === groupIndex
          ? {
              ...g,
              machinery: g.machinery.map((m, mi) =>
                mi === machineryIndex ? { ...m, [field]: value } : m,
              ),
            }
          : g,
      ),
    }));
  };

  const handleRemoveMachinery = (groupIndex: number, machineryIndex: number) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) =>
        i === groupIndex ? { ...g, machinery: g.machinery.filter((_, mi) => mi !== machineryIndex) } : g,
      ),
    }));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent fullScreen className="overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPostventa ? 'Editar Post-Venta' : 'Nueva Post-Venta'}
            </DialogTitle>
            <DialogDescription>
              {editingPostventa
                ? `Editando ${editingPostventa.code}`
                : 'Registra una nueva tarea de post-venta'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Descripción */}
            <div className="space-y-2">
              <Label htmlFor="description">Descripción *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe la tarea de post-venta..."
                rows={3}
              />
            </div>

            {/* Estado */}
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={formData.status}
                onValueChange={(value: 'pending' | 'in_progress' | 'completed') =>
                  setFormData(prev => ({ ...prev, status: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="in_progress">En Proceso</SelectItem>
                  <SelectItem value="completed">Completado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Imágenes */}
            <div className="grid grid-cols-2 gap-4">
              {(['before', 'after'] as const).map((type) => {
                const imageUrl = type === 'before' ? formData.before_image : formData.after_image;
                const ref = type === 'before' ? beforeImageInputRef : afterImageInputRef;
                return (
                  <div key={type} className="space-y-2">
                    <Label>{type === 'before' ? 'Foto Antes' : 'Foto Después'}</Label>
                    <input
                      ref={ref}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleImageUpload(type)}
                    />
                    {imageUrl ? (
                      <div className="relative">
                        <img
                          src={imageUrl}
                          alt={type === 'before' ? 'Antes' : 'Después'}
                          className="w-full h-32 object-cover rounded-md cursor-pointer"
                          onClick={() => setImagePreview({ url: imageUrl, type })}
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6"
                          onClick={() => handleRemoveImage(type)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full h-32"
                        onClick={() => ref.current?.click()}
                      >
                        <Camera className="h-6 w-6 mr-2" />
                        Añadir foto
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Subcontratas */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Subcontratas</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddSubcontractGroup}>
                  <Building2 className="h-4 w-4 mr-1" />
                  Añadir Empresa
                </Button>
              </div>

              {formData.subcontract_groups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay subcontratas asignadas. Añade una empresa para registrar personal y maquinaria.
                </p>
              ) : (
                <Accordion type="multiple" className="space-y-2">
                  {formData.subcontract_groups.map((group, groupIndex) => (
                    <AccordionItem
                      key={groupIndex}
                      value={`group-${groupIndex}`}
                      className="border rounded-lg"
                    >
                      <AccordionTrigger className="px-4 hover:no-underline">
                        <div className="flex items-center gap-2 flex-1">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span>{group.company || `Empresa ${groupIndex + 1}`}</span>
                          <Badge variant="outline" className="ml-2">
                            {group.workers.length} trabajadores, {group.machinery.length} máquinas
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="space-y-4">
                          <div className="flex gap-2">
                            <Input
                              placeholder="Nombre de la empresa"
                              value={group.company}
                              onChange={(e) => handleUpdateGroupCompany(groupIndex, e.target.value)}
                              className="flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleRemoveSubcontractGroup(groupIndex)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Trabajadores */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <Label className="text-sm flex items-center gap-1">
                                <Users className="h-4 w-4" /> Trabajadores
                              </Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAddWorker(groupIndex)}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Añadir
                              </Button>
                            </div>
                            {group.workers.map((worker, workerIndex) => (
                              <div key={workerIndex} className="flex gap-2 items-center">
                                <Input
                                  placeholder="Nombre"
                                  value={worker.name}
                                  onChange={(e) =>
                                    handleUpdateWorker(groupIndex, workerIndex, 'name', e.target.value)
                                  }
                                  className="flex-1"
                                />
                                <Input
                                  type="number"
                                  placeholder="Horas"
                                  value={worker.hours || ''}
                                  onChange={(e) =>
                                    handleUpdateWorker(
                                      groupIndex,
                                      workerIndex,
                                      'hours',
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  className="w-20"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => handleRemoveWorker(groupIndex, workerIndex)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>

                          {/* Maquinaria */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <Label className="text-sm flex items-center gap-1">
                                <Truck className="h-4 w-4" /> Maquinaria
                              </Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAddMachinery(groupIndex)}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Añadir
                              </Button>
                            </div>
                            {group.machinery.map((machine, machineIndex) => (
                              <div key={machineIndex} className="flex gap-2 items-center">
                                <Input
                                  placeholder="Tipo de maquinaria"
                                  value={machine.type}
                                  onChange={(e) =>
                                    handleUpdateMachinery(groupIndex, machineIndex, 'type', e.target.value)
                                  }
                                  className="flex-1"
                                />
                                <Input
                                  type="number"
                                  placeholder="Horas"
                                  value={machine.hours || ''}
                                  onChange={(e) =>
                                    handleUpdateMachinery(
                                      groupIndex,
                                      machineIndex,
                                      'hours',
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  className="w-20"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => handleRemoveMachinery(groupIndex, machineIndex)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button onClick={onSubmit} disabled={isSaving || uploading}>
              {(isSaving || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingPostventa ? 'Guardar cambios' : 'Crear post-venta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image preview dialog */}
      <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {imagePreview?.type === 'before' ? 'Foto Antes' : 'Foto Después'}
            </DialogTitle>
          </DialogHeader>
          {imagePreview && (
            <img
              src={imagePreview.url}
              alt={imagePreview.type === 'before' ? 'Antes' : 'Después'}
              className="w-full h-auto max-h-[70vh] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

    </>
  );
}
