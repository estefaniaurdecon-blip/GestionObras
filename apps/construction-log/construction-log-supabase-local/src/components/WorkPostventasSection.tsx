import { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkPostventas, WorkPostventa, CreatePostventaData, UpdatePostventaData, PostventaSubcontractGroup, PostventaWorker, PostventaMachinery } from '@/hooks/useWorkPostventas';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePostventaImages } from '@/hooks/usePostventaImages';
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
import { exportPostventasToExcel, exportPostventasToPdf } from '@/utils/postventasExportUtils';

interface WorkPostventasSectionProps {
  workId: string;
  workName: string;
  workNumber: string;
}

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: AlertCircle },
  in_progress: { label: 'En Proceso', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: Clock },
  completed: { label: 'Completado', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
};

export const WorkPostventasSection: React.FC<WorkPostventasSectionProps> = ({
  workId,
  workName,
  workNumber,
}) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { isAdmin, isSiteManager, isMaster } = useUserPermissions();
  const { postventas, loading, stats, createPostventa, updatePostventa, deletePostventa } = useWorkPostventas(workId);
  const { uploading, uploadBothImages, isDataUrl, isStorageUrl } = usePostventaImages();
  
  const canManage = isAdmin || isSiteManager || isMaster;
  
  // Refs for file inputs
  const beforeImageInputRef = useRef<HTMLInputElement>(null);
  const afterImageInputRef = useRef<HTMLInputElement>(null);

  // Función para calcular horas totales de una post-venta desde sus subcontract_groups
  const calculateTotalHours = (postventa: WorkPostventa): number => {
    if (!postventa.subcontract_groups || postventa.subcontract_groups.length === 0) return 0;
    return postventa.subcontract_groups.reduce((total, group) => {
      const workerHours = group.workers?.reduce((sum, w) => sum + (w.hours || 0), 0) || 0;
      const machineryHours = group.machinery?.reduce((sum, m) => sum + (m.hours || 0), 0) || 0;
      return total + workerHours + machineryHours;
    }, 0);
  };
  
  const displayStats = useMemo(() => {
    const totalHours = postventas.reduce((sum, p) => sum + calculateTotalHours(p), 0);
    return {
      total: postventas.length,
      pending: postventas.filter(p => p.status === 'pending').length,
      inProgress: postventas.filter(p => p.status === 'in_progress').length,
      completed: postventas.filter(p => p.status === 'completed').length,
      totalHours,
    };
  }, [postventas]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingPostventa, setEditingPostventa] = useState<WorkPostventa | null>(null);
  const [postventaToDelete, setPostventaToDelete] = useState<WorkPostventa | null>(null);
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
    subcontract_groups: PostventaSubcontractGroup[];
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

  const handleOpenDialog = (postventa?: WorkPostventa) => {
    if (postventa) {
      setEditingPostventa(postventa);
      setFormData({
        description: postventa.description,
        assigned_company: postventa.assigned_company || '',
        estimated_hours: postventa.estimated_hours?.toString() || '',
        actual_hours: postventa.actual_hours?.toString() || '',
        status: postventa.status,
        before_image: postventa.before_image || '',
        after_image: postventa.after_image || '',
        subcontract_groups: postventa.subcontract_groups || [],
      });
    } else {
      setEditingPostventa(null);
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
    setEditingPostventa(null);
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

  const handleUpdateWorker = (groupIndex: number, workerIndex: number, field: keyof PostventaWorker, value: string | number) => {
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

  const handleUpdateMachinery = (groupIndex: number, machineryIndex: number, field: keyof PostventaMachinery, value: string | number) => {
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
      const tempId = editingPostventa?.id || `temp-${Date.now()}`;

      let beforeImageUrl = formData.before_image;
      let afterImageUrl = formData.after_image;

      const needsBeforeUpload = beforeImageUrl && (beforeImageUrl.startsWith('blob:') || beforeImageUrl.startsWith('data:'));
      const needsAfterUpload = afterImageUrl && (afterImageUrl.startsWith('blob:') || afterImageUrl.startsWith('data:'));

      if (needsBeforeUpload || needsAfterUpload) {
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

      const data: CreatePostventaData | UpdatePostventaData = {
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
      if (editingPostventa) {
        success = await updatePostventa(editingPostventa.id, data);
      } else {
        success = await createPostventa(data as CreatePostventaData);
      }

      if (success) {
        handleCloseDialog();
        toast.success(editingPostventa ? 'Post-venta actualizada' : 'Post-venta creada');
      }
    } catch (error: any) {
      console.error('Error saving postventa:', error);
      toast.error('Error al guardar la post-venta');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!postventaToDelete) return;
    
    const success = await deletePostventa(postventaToDelete.id);
    if (success) {
      setIsDeleteDialogOpen(false);
      setPostventaToDelete(null);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportPostventasToExcel(postventas, { workName, workNumber });
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
      await exportPostventasToPdf(postventas, { workName, workNumber });
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="w-full bg-white">
        <CardHeader className="space-y-4">
          <div className="relative min-h-10">
            {canManage && (
              <Button
                onClick={() => handleOpenDialog()}
                className="absolute left-0 top-1/2 -translate-y-1/2"
              >
                <Plus className="mr-2 h-4 w-4" />
                Añadir post-venta
              </Button>
            )}
            <div className="text-center">
              <CardTitle className="text-2xl">Post-venta de Obra</CardTitle>
              <p className="text-sm text-muted-foreground">Gestión de trabajos de cierre y garantía</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
      {/* Cabecera de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-purple-500" />
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
              <Clock className="h-5 w-5 text-indigo-500" />
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
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
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
        <div className="flex gap-2" />
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleExportExcel}
            disabled={isExporting || postventas.length === 0}
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
            disabled={isExporting || postventas.length === 0}
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

      {/* Lista de post-ventas */}
      {postventas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>No hay post-ventas registradas para esta obra.</p>
            {canManage && (
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => handleOpenDialog()}
              >
                <Plus className="mr-2 h-4 w-4" />
                Crear primera post-venta
              </Button>
            )}
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-3">
          {postventas.map((pv) => {
            const StatusIcon = STATUS_CONFIG[pv.status].icon;
            const companies = pv.subcontract_groups?.map(g => g.company).filter(c => c).join(', ') || pv.assigned_company || '-';
            return (
              <Card key={pv.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{pv.code}</span>
                      <Badge className={STATUS_CONFIG[pv.status].color}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {STATUS_CONFIG[pv.status].label}
                      </Badge>
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenDialog(pv)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            setPostventaToDelete(pv);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm mb-2">{pv.description}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>📍 {companies}</span>
                    <span>⏱ {calculateTotalHours(pv)}h</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Código</TableHead>
                <TableHead className="w-28">Estado</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Empresas</TableHead>
                <TableHead className="w-24 text-center">Horas</TableHead>
                {canManage && <TableHead className="w-24 text-center">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {postventas.map((pv) => {
                const StatusIcon = STATUS_CONFIG[pv.status].icon;
                const companies = pv.subcontract_groups?.map(g => g.company).filter(c => c).join(', ') || pv.assigned_company || '-';
                return (
                  <TableRow key={pv.id}>
                    <TableCell className="font-medium">{pv.code}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_CONFIG[pv.status].color}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {STATUS_CONFIG[pv.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate">{pv.description}</TableCell>
                    <TableCell>{companies}</TableCell>
                    <TableCell className="text-center">{calculateTotalHours(pv)}h</TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleOpenDialog(pv)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              setPostventaToDelete(pv);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

        </CardContent>
      </Card>

      {/* Dialog para crear/editar post-venta */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPostventa ? 'Editar Post-Venta' : 'Nueva Post-Venta'}
            </DialogTitle>
            <DialogDescription>
              {editingPostventa ? `Editando ${editingPostventa.code}` : 'Registra una nueva tarea de post-venta'}
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
              <div className="space-y-2">
                <Label>Foto Antes</Label>
                <input
                  ref={beforeImageInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleImageUpload('before')}
                />
                {formData.before_image ? (
                  <div className="relative">
                    <img
                      src={formData.before_image}
                      alt="Antes"
                      className="w-full h-32 object-cover rounded-md cursor-pointer"
                      onClick={() => setImagePreview({ url: formData.before_image, type: 'before' })}
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => handleRemoveImage('before')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-32"
                    onClick={() => beforeImageInputRef.current?.click()}
                  >
                    <Camera className="h-6 w-6 mr-2" />
                    Añadir foto
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Label>Foto Después</Label>
                <input
                  ref={afterImageInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleImageUpload('after')}
                />
                {formData.after_image ? (
                  <div className="relative">
                    <img
                      src={formData.after_image}
                      alt="Después"
                      className="w-full h-32 object-cover rounded-md cursor-pointer"
                      onClick={() => setImagePreview({ url: formData.after_image, type: 'after' })}
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => handleRemoveImage('after')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-32"
                    onClick={() => afterImageInputRef.current?.click()}
                  >
                    <Camera className="h-6 w-6 mr-2" />
                    Añadir foto
                  </Button>
                )}
              </div>
            </div>

            {/* Subcontratas */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Subcontratas</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSubcontractGroup}
                >
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
                    <AccordionItem key={groupIndex} value={`group-${groupIndex}`} className="border rounded-lg">
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
                          {/* Nombre empresa */}
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
                                  onChange={(e) => handleUpdateWorker(groupIndex, workerIndex, 'name', e.target.value)}
                                  className="flex-1"
                                />
                                <Input
                                  type="number"
                                  placeholder="Horas"
                                  value={worker.hours || ''}
                                  onChange={(e) => handleUpdateWorker(groupIndex, workerIndex, 'hours', parseFloat(e.target.value) || 0)}
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
                                  onChange={(e) => handleUpdateMachinery(groupIndex, machineIndex, 'type', e.target.value)}
                                  className="flex-1"
                                />
                                <Input
                                  type="number"
                                  placeholder="Horas"
                                  value={machine.hours || ''}
                                  onChange={(e) => handleUpdateMachinery(groupIndex, machineIndex, 'hours', parseFloat(e.target.value) || 0)}
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
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving || uploading}>
              {(isSaving || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingPostventa ? 'Guardar cambios' : 'Crear post-venta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación para eliminar */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar post-venta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la post-venta
              {postventaToDelete && ` "${postventaToDelete.code}"`}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPostventaToDelete(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para previsualizar imagen */}
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
    </div>
  );
};


