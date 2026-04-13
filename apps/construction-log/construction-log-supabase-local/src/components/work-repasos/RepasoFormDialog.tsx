import { useRef, type Dispatch, type SetStateAction } from 'react';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  AlertCircle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { WorkRepaso, RepasoSubcontractGroup, RepasoWorker, RepasoMachinery } from '@/hooks/useWorkRepasos';

export interface RepasoFormData {
  description: string;
  assigned_company: string;
  estimated_hours: string;
  actual_hours: string;
  status: 'pending' | 'in_progress' | 'completed';
  before_image: string;
  after_image: string;
  subcontract_groups: RepasoSubcontractGroup[];
}

export const EMPTY_REPASO_FORM: RepasoFormData = {
  description: '',
  assigned_company: '',
  estimated_hours: '',
  actual_hours: '',
  status: 'pending',
  before_image: '',
  after_image: '',
  subcontract_groups: [],
};

interface RepasoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRepaso: WorkRepaso | null;
  formData: RepasoFormData;
  setFormData: Dispatch<SetStateAction<RepasoFormData>>;
  isSaving: boolean;
  uploading: { before: boolean; after: boolean };
  onSubmit: () => void;
  onCancel: () => void;
}

export function RepasoFormDialog({
  open,
  onOpenChange,
  editingRepaso,
  formData,
  setFormData,
  isSaving,
  uploading,
  onSubmit,
  onCancel,
}: RepasoFormDialogProps) {
  const beforeImageInputRef = useRef<HTMLInputElement>(null);
  const afterImageInputRef = useRef<HTMLInputElement>(null);

  // ---- Image handlers ----

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

  // ---- Subcontract group handlers ----

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
    field: keyof RepasoWorker,
    value: string | number,
  ) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) =>
        i === groupIndex
          ? { ...g, workers: g.workers.map((w, wi) => (wi === workerIndex ? { ...w, [field]: value } : w)) }
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
    field: keyof RepasoMachinery,
    value: string | number,
  ) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) =>
        i === groupIndex
          ? { ...g, machinery: g.machinery.map((m, mi) => (mi === machineryIndex ? { ...m, [field]: value } : m)) }
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

  const showAfterImage = formData.status !== 'pending' || editingRepaso !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingRepaso ? 'Editar Repaso' : 'Añadir Repaso'}</DialogTitle>
          <DialogDescription>
            {editingRepaso
              ? 'Modifica los datos del repaso'
              : 'Registra un nuevo repaso o desperfecto a corregir'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Imagen ANTES */}
          <div className="space-y-2">
            <Label>Foto ANTES</Label>
            <div className="flex items-center gap-4">
              {formData.before_image ? (
                <div className="relative">
                  <AuthenticatedImage
                    src={formData.before_image}
                    alt="Antes"
                    className="h-20 w-20 object-cover rounded border-2 border-destructive/30"
                  />
                  {uploading.before ? (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={() => handleRemoveImage('before')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ) : (
                <label className="h-20 w-20 rounded border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors">
                  <Camera className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Antes</span>
                  <input
                    ref={beforeImageInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleImageUpload('before')}
                  />
                </label>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              La imagen se guardará automáticamente al crear el repaso
            </p>
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="description">Instrucciones de corrección *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe el desperfecto y las instrucciones para corregirlo..."
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
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="pending">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Pendiente
                  </div>
                </SelectItem>
                <SelectItem value="in_progress">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    En Proceso
                  </div>
                </SelectItem>
                <SelectItem value="completed">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Completado
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Subcontratas */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Personal y Maquinaria de Subcontratas
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddSubcontractGroup}>
                <Plus className="h-4 w-4 mr-1" />
                Añadir Empresa
              </Button>
            </div>

            {formData.subcontract_groups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg border-dashed">
                No hay empresas añadidas. Haz clic en "Añadir Empresa" para registrar personal y maquinaria.
              </p>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {formData.subcontract_groups.map((group, groupIndex) => (
                  <AccordionItem
                    key={groupIndex}
                    value={`group-${groupIndex}`}
                    className="border rounded-lg px-3"
                  >
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-2 flex-1">
                        <Building2 className="h-4 w-4 text-primary" />
                        <span className="font-medium">{group.company || `Empresa ${groupIndex + 1}`}</span>
                        <Badge variant="secondary" className="ml-2">
                          {group.workers.length} trab. | {group.machinery.length} maq.
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-4">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Nombre de la empresa"
                          value={group.company}
                          onChange={(e) => handleUpdateGroupCompany(groupIndex, e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveSubcontractGroup(groupIndex)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>

                      {/* Trabajadores */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm flex items-center gap-1">
                            <Users className="h-3 w-3" /> Trabajadores
                          </Label>
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleAddWorker(groupIndex)}>
                            <Plus className="h-3 w-3 mr-1" /> Añadir
                          </Button>
                        </div>
                        {group.workers.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin trabajadores</p>
                        ) : (
                          <div className="space-y-2">
                            {group.workers.map((worker, workerIndex) => (
                              <div key={workerIndex} className="flex gap-2 items-center">
                                <Input
                                  placeholder="Nombre del trabajador"
                                  value={worker.name}
                                  onChange={(e) =>
                                    handleUpdateWorker(groupIndex, workerIndex, 'name', e.target.value)
                                  }
                                  className="flex-1"
                                />
                                <Input
                                  type="number"
                                  step="0.5"
                                  min="0"
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
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleRemoveWorker(groupIndex, workerIndex)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Maquinaria */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm flex items-center gap-1">
                            <Truck className="h-3 w-3" /> Maquinaria
                          </Label>
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleAddMachinery(groupIndex)}>
                            <Plus className="h-3 w-3 mr-1" /> Añadir
                          </Button>
                        </div>
                        {group.machinery.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin maquinaria</p>
                        ) : (
                          <div className="space-y-2">
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
                                  step="0.5"
                                  min="0"
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
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleRemoveMachinery(groupIndex, machineIndex)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>

          {/* Imagen DESPUÉS (solo si no es pending o en edición) */}
          {showAfterImage && (
            <div className="space-y-2">
              <Label>Foto DESPUÉS</Label>
              <div className="flex items-center gap-4">
                {formData.after_image ? (
                  <div className="relative">
                    <AuthenticatedImage
                      src={formData.after_image}
                      alt="Después"
                      className="h-20 w-20 object-cover rounded border-2 border-green-500/30"
                    />
                    {uploading.after ? (
                      <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    ) : (
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={() => handleRemoveImage('after')}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <label className="h-20 w-20 rounded border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors">
                    <Camera className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Después</span>
                    <input
                      ref={afterImageInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleImageUpload('after')}
                    />
                  </label>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Añade la foto cuando el repaso esté completado
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : editingRepaso ? (
              'Guardar Cambios'
            ) : (
              'Crear Repaso'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
