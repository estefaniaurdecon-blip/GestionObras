import { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkRepasos, WorkRepaso, CreateRepasoData, UpdateRepasoData, RepasoSubcontractGroup, RepasoWorker, RepasoMachinery } from '@/hooks/useWorkRepasos';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRepasoImages } from '@/hooks/useRepasoImages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  FileSpreadsheet, 
  FileText, 
  Loader2, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Pencil,
  Trash2,
  Image as ImageIcon,
  X,
  Camera,
  Building2,
  Users,
  Truck
} from 'lucide-react';
import { toast } from 'sonner';
import { exportRepasosToExcel, exportRepasosToPdf } from '@/utils/repasosExportUtils';

interface WorkRepasosSectionProps {
  workId: string;
  workName: string;
  workNumber: string;
}

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: AlertCircle },
  in_progress: { label: 'En Proceso', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Clock },
  completed: { label: 'Completado', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle2 },
};

export const WorkRepasosSection: React.FC<WorkRepasosSectionProps> = ({
  workId,
  workName,
  workNumber,
}) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { isAdmin, isSiteManager, isMaster } = useUserPermissions();
  const { repasos, loading, stats, createRepaso, updateRepaso, deleteRepaso } = useWorkRepasos(workId);
  const { uploading, uploadBothImages, isDataUrl, isStorageUrl } = useRepasoImages();
  
  const canManage = isAdmin || isSiteManager || isMaster;
  
  // Refs for file inputs
  const beforeImageInputRef = useRef<HTMLInputElement>(null);
  const afterImageInputRef = useRef<HTMLInputElement>(null);

  // Función para calcular horas totales de un repaso desde sus subcontract_groups
  const calculateTotalHours = (repaso: WorkRepaso): number => {
    if (!repaso.subcontract_groups || repaso.subcontract_groups.length === 0) return 0;
    return repaso.subcontract_groups.reduce((total, group) => {
      const workerHours = group.workers?.reduce((sum, w) => sum + (w.hours || 0), 0) || 0;
      const machineryHours = group.machinery?.reduce((sum, m) => sum + (m.hours || 0), 0) || 0;
      return total + workerHours + machineryHours;
    }, 0);
  };
  
  const displayStats = useMemo(() => {
    const totalHours = repasos.reduce((sum, r) => sum + calculateTotalHours(r), 0);
    return {
      total: repasos.length,
      pending: repasos.filter(r => r.status === 'pending').length,
      inProgress: repasos.filter(r => r.status === 'in_progress').length,
      completed: repasos.filter(r => r.status === 'completed').length,
      totalHours,
    };
  }, [repasos]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingRepaso, setEditingRepaso] = useState<WorkRepaso | null>(null);
  const [repasoToDelete, setRepasoToDelete] = useState<WorkRepaso | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; type: 'before' | 'after' } | null>(null);

  const [formData, setFormData] = useState<{
    description: string;
    assigned_company: string;
    estimated_hours: string;
    actual_hours: string;
    status: 'pending' | 'in_progress' | 'completed';
    before_image: string;
    after_image: string;
    subcontract_groups: RepasoSubcontractGroup[];
  }>({
    description: '',
    assigned_company: '',
    estimated_hours: '',
    actual_hours: '',
    status: 'pending',
    before_image: '',
    after_image: '',
    subcontract_groups: [],
  });

  const handleOpenDialog = (repaso?: WorkRepaso) => {
    if (repaso) {
      setEditingRepaso(repaso);
      setFormData({
        description: repaso.description,
        assigned_company: repaso.assigned_company || '',
        estimated_hours: repaso.estimated_hours?.toString() || '',
        actual_hours: repaso.actual_hours?.toString() || '',
        status: repaso.status,
        before_image: repaso.before_image || '',
        after_image: repaso.after_image || '',
        subcontract_groups: repaso.subcontract_groups || [],
      });
    } else {
      setEditingRepaso(null);
      setFormData({
        description: '',
        assigned_company: '',
        estimated_hours: '',
        actual_hours: '',
        status: 'pending',
        before_image: '',
        after_image: '',
        subcontract_groups: [],
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingRepaso(null);
  };

  // Handlers for subcontract groups
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
        i === groupIndex ? { ...g, company } : g
      ),
    }));
  };

  const handleAddWorker = (groupIndex: number) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) => 
        i === groupIndex ? { ...g, workers: [...g.workers, { name: '', hours: 0 }] } : g
      ),
    }));
  };

  const handleUpdateWorker = (groupIndex: number, workerIndex: number, field: keyof RepasoWorker, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) => 
        i === groupIndex 
          ? { 
              ...g, 
              workers: g.workers.map((w, wi) => 
                wi === workerIndex ? { ...w, [field]: value } : w
              ) 
            } 
          : g
      ),
    }));
  };

  const handleRemoveWorker = (groupIndex: number, workerIndex: number) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) => 
        i === groupIndex ? { ...g, workers: g.workers.filter((_, wi) => wi !== workerIndex) } : g
      ),
    }));
  };

  const handleAddMachinery = (groupIndex: number) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) => 
        i === groupIndex ? { ...g, machinery: [...g.machinery, { type: '', hours: 0 }] } : g
      ),
    }));
  };

  const handleUpdateMachinery = (groupIndex: number, machineryIndex: number, field: keyof RepasoMachinery, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) => 
        i === groupIndex 
          ? { 
              ...g, 
              machinery: g.machinery.map((m, mi) => 
                mi === machineryIndex ? { ...m, [field]: value } : m
              ) 
            } 
          : g
      ),
    }));
  };

  const handleRemoveMachinery = (groupIndex: number, machineryIndex: number) => {
    setFormData(prev => ({
      ...prev,
      subcontract_groups: prev.subcontract_groups.map((g, i) => 
        i === groupIndex ? { ...g, machinery: g.machinery.filter((_, mi) => mi !== machineryIndex) } : g
      ),
    }));
  };

  const handleSubmit = async () => {
    if (!formData.description.trim()) {
      toast.error('La descripción es obligatoria');
      return;
    }

    setIsSaving(true);

    try {
      // Generate a temporary ID for new repasos (will be replaced by actual ID)
      const tempId = editingRepaso?.id || `temp-${Date.now()}`;

      // Upload images to storage if they are data URLs or blob URLs
      let beforeImageUrl = formData.before_image;
      let afterImageUrl = formData.after_image;

      // Check if images need uploading (blob URLs from file input or data URLs)
      const needsBeforeUpload = beforeImageUrl && (beforeImageUrl.startsWith('blob:') || beforeImageUrl.startsWith('data:'));
      const needsAfterUpload = afterImageUrl && (afterImageUrl.startsWith('blob:') || afterImageUrl.startsWith('data:'));

      if (needsBeforeUpload || needsAfterUpload) {
        // Convert blob URLs to base64 for upload
        const processImage = async (url: string): Promise<string> => {
          if (url.startsWith('blob:')) {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
          return url;
        };

        const uploadedImages = await uploadBothImages(
          needsBeforeUpload ? await processImage(beforeImageUrl) : undefined,
          needsAfterUpload ? await processImage(afterImageUrl) : undefined,
          tempId
        );

        if (uploadedImages.before_image) beforeImageUrl = uploadedImages.before_image;
        if (uploadedImages.after_image) afterImageUrl = uploadedImages.after_image;
      }

      const data: CreateRepasoData | UpdateRepasoData = {
        description: formData.description.trim(),
        assigned_company: formData.assigned_company.trim() || undefined,
        estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : 0,
        actual_hours: formData.actual_hours ? parseFloat(formData.actual_hours) : 0,
        status: formData.status,
        before_image: beforeImageUrl || undefined,
        after_image: afterImageUrl || undefined,
        subcontract_groups: formData.subcontract_groups.filter(g => g.company.trim()),
      };

      let success;
      if (editingRepaso) {
        success = await updateRepaso(editingRepaso.id, data);
      } else {
        success = await createRepaso(data as CreateRepasoData);
      }

      if (success) {
        handleCloseDialog();
        toast.success(editingRepaso ? 'Repaso actualizado' : 'Repaso creado');
      }
    } catch (error: any) {
      console.error('Error saving repaso:', error);
      toast.error('Error al guardar el repaso');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!repasoToDelete) return;
    
    const success = await deleteRepaso(repasoToDelete.id);
    if (success) {
      setIsDeleteDialogOpen(false);
      setRepasoToDelete(null);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportRepasosToExcel(repasos, { workName, workNumber });
      toast.success('Excel exportado correctamente');
    } catch (error) {
      toast.error('Error al exportar Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      await exportRepasosToPdf(repasos, { workName, workNumber });
      toast.success('PDF exportado correctamente');
    } catch (error) {
      toast.error('Error al exportar PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImageUpload = (type: 'before' | 'after') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('La imagen no puede superar 10MB');
      return;
    }

    // Create blob URL for preview (will be uploaded on submit)
    const url = URL.createObjectURL(file);
    setFormData(prev => ({
      ...prev,
      [type === 'before' ? 'before_image' : 'after_image']: url,
    }));

    // Reset input for re-selection
    e.target.value = '';
  };

  const handleRemoveImage = (type: 'before' | 'after') => {
    setFormData(prev => ({
      ...prev,
      [type === 'before' ? 'before_image' : 'after_image']: '',
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabecera de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{displayStats.pending}</p>
                <p className="text-xs text-muted-foreground">Pendientes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{displayStats.inProgress}</p>
                <p className="text-xs text-muted-foreground">En Proceso</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{displayStats.completed}</p>
                <p className="text-xs text-muted-foreground">Completados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{displayStats.totalHours}h</p>
                <p className="text-xs text-muted-foreground">Horas Totales</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de acciones */}
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <div className="flex gap-2">
          {canManage && (
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Añadir Repaso
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleExportExcel}
            disabled={isExporting || repasos.length === 0}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            Excel
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExportPdf}
            disabled={isExporting || repasos.length === 0}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            PDF
          </Button>
        </div>
      </div>

      {/* Lista de repasos */}
      {isMobile ? (
        <div className="space-y-4">
          {repasos.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay repasos registrados
              </CardContent>
            </Card>
          ) : (
            repasos.map((repaso) => {
              const StatusIcon = STATUS_CONFIG[repaso.status].icon;
              return (
                <Card key={repaso.id} className="overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-lg">{repaso.code}</p>
                        <Badge className={STATUS_CONFIG[repaso.status].color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {STATUS_CONFIG[repaso.status].label}
                        </Badge>
                      </div>
                      {canManage && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(repaso)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setRepasoToDelete(repaso);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm">{repaso.description}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {repaso.subcontract_groups && repaso.subcontract_groups.length > 0 && (
                        <span>📍 {repaso.subcontract_groups.map(g => g.company).filter(Boolean).join(', ') || '-'}</span>
                      )}
                      <span>⏱️ {calculateTotalHours(repaso)}h</span>
                    </div>
                    {(repaso.before_image || repaso.after_image) && (
                      <div className="flex gap-2">
                        {repaso.before_image && (
                          <img 
                            src={repaso.before_image} 
                            alt="Antes" 
                            className="h-16 w-16 object-cover rounded cursor-pointer border-2 border-red-200"
                            onClick={() => setImagePreview({ url: repaso.before_image!, type: 'before' })}
                          />
                        )}
                        {repaso.after_image && (
                          <img 
                            src={repaso.after_image} 
                            alt="Después" 
                            className="h-16 w-16 object-cover rounded cursor-pointer border-2 border-green-200"
                            onClick={() => setImagePreview({ url: repaso.after_image!, type: 'after' })}
                          />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Código</TableHead>
                <TableHead className="w-[120px]">Estado</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead className="w-[100px]">Horas</TableHead>
                <TableHead className="w-[100px]">Fotos</TableHead>
                {canManage && <TableHead className="w-[100px] text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {repasos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-8">
                    No hay repasos registrados
                  </TableCell>
                </TableRow>
              ) : (
                repasos.map((repaso) => {
                  const StatusIcon = STATUS_CONFIG[repaso.status].icon;
                  const companies = repaso.subcontract_groups?.map(g => g.company).filter(Boolean).join(', ') || '-';
                  return (
                    <TableRow key={repaso.id}>
                      <TableCell className="font-medium">{repaso.code}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_CONFIG[repaso.status].color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {STATUS_CONFIG[repaso.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">{repaso.description}</TableCell>
                      <TableCell>{companies}</TableCell>
                      <TableCell>{calculateTotalHours(repaso)}h</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {repaso.before_image ? (
                            <img 
                              src={repaso.before_image} 
                              alt="Antes" 
                              className="h-8 w-8 object-cover rounded cursor-pointer border border-red-300"
                              onClick={() => setImagePreview({ url: repaso.before_image!, type: 'before' })}
                            />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          {repaso.after_image ? (
                            <img 
                              src={repaso.after_image} 
                              alt="Después" 
                              className="h-8 w-8 object-cover rounded cursor-pointer border border-green-300"
                              onClick={() => setImagePreview({ url: repaso.after_image!, type: 'after' })}
                            />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(repaso)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setRepasoToDelete(repaso);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Dialog para crear/editar repaso */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRepaso ? 'Editar Repaso' : 'Añadir Repaso'}
            </DialogTitle>
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
                    <img 
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

            {/* SECCIÓN DE SUBCONTRATAS - Personal y Maquinaria */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Personal y Maquinaria de Subcontratas
                </Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={handleAddSubcontractGroup}
                >
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
                          <span className="font-medium">
                            {group.company || `Empresa ${groupIndex + 1}`}
                          </span>
                          <Badge variant="secondary" className="ml-2">
                            {group.workers.length} trab. | {group.machinery.length} maq.
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4 pb-4">
                        {/* Nombre de empresa */}
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
                              <Users className="h-3 w-3" />
                              Trabajadores
                            </Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAddWorker(groupIndex)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Añadir
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
                                    onChange={(e) => handleUpdateWorker(groupIndex, workerIndex, 'name', e.target.value)}
                                    className="flex-1"
                                  />
                                  <Input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    placeholder="Horas"
                                    value={worker.hours || ''}
                                    onChange={(e) => handleUpdateWorker(groupIndex, workerIndex, 'hours', parseFloat(e.target.value) || 0)}
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
                              <Truck className="h-3 w-3" />
                              Maquinaria
                            </Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAddMachinery(groupIndex)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Añadir
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
                                    onChange={(e) => handleUpdateMachinery(groupIndex, machineIndex, 'type', e.target.value)}
                                    className="flex-1"
                                  />
                                  <Input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    placeholder="Horas"
                                    value={machine.hours || ''}
                                    onChange={(e) => handleUpdateMachinery(groupIndex, machineIndex, 'hours', parseFloat(e.target.value) || 0)}
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

            {/* Imagen DESPUÉS (solo visible si está en proceso o completado, o en edición) */}
            {(formData.status !== 'pending' || editingRepaso) && (
              <div className="space-y-2">
                <Label>Foto DESPUÉS</Label>
                <div className="flex items-center gap-4">
                  {formData.after_image ? (
                    <div className="relative">
                      <img 
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
            <Button variant="outline" onClick={handleCloseDialog} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                editingRepaso ? 'Guardar Cambios' : 'Crear Repaso'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar repaso?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el repaso{' '}
              <strong>{repasoToDelete?.code}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview de imagen */}
      <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {imagePreview?.type === 'before' ? 'Foto ANTES' : 'Foto DESPUÉS'}
            </DialogTitle>
          </DialogHeader>
          {imagePreview && (
            <img 
              src={imagePreview.url} 
              alt={imagePreview.type === 'before' ? 'Antes' : 'Después'}
              className="w-full h-auto rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
