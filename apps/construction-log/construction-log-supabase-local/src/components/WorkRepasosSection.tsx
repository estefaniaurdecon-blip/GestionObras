import { useState, useMemo } from 'react';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { useWorkRepasos, type WorkRepaso, type CreateRepasoData, type UpdateRepasoData } from '@/hooks/useWorkRepasos';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRepasoImages } from '@/hooks/useRepasoImages';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { exportRepasosToExcel, exportRepasosToPdf } from '@/utils/repasosExportUtils';
import { RepasoFormDialog, EMPTY_REPASO_FORM, type RepasoFormData } from './work-repasos/RepasoFormDialog';
import { RepasoDeleteDialog } from './work-repasos/RepasoDeleteDialog';

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

function calculateTotalHours(repaso: WorkRepaso): number {
  if (!repaso.subcontract_groups?.length) return 0;
  return repaso.subcontract_groups.reduce((total, group) => {
    const workerHours = group.workers?.reduce((sum, w) => sum + (w.hours || 0), 0) ?? 0;
    const machineryHours = group.machinery?.reduce((sum, m) => sum + (m.hours || 0), 0) ?? 0;
    return total + workerHours + machineryHours;
  }, 0);
}

export const WorkRepasosSection: React.FC<WorkRepasosSectionProps> = ({
  workId,
  workName,
  workNumber,
}) => {
  const isMobile = useIsMobile();
  const { isAdmin, isSiteManager, isMaster } = useUserPermissions();
  const { repasos, loading, createRepaso, updateRepaso, deleteRepaso } = useWorkRepasos(workId);
  const { uploading, uploadBothImages } = useRepasoImages();

  const canManage = isAdmin || isSiteManager || isMaster;

  // Form dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRepaso, setEditingRepaso] = useState<WorkRepaso | null>(null);
  const [formData, setFormData] = useState<RepasoFormData>(EMPTY_REPASO_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [repasoToDelete, setRepasoToDelete] = useState<WorkRepaso | null>(null);

  // Image preview (shared between list and form)
  const [imagePreview, setImagePreview] = useState<{ url: string; type: 'before' | 'after' } | null>(null);

  const [isExporting, setIsExporting] = useState(false);

  const displayStats = useMemo(() => {
    const totalHours = repasos.reduce((sum, r) => sum + calculateTotalHours(r), 0);
    return {
      pending: repasos.filter(r => r.status === 'pending').length,
      inProgress: repasos.filter(r => r.status === 'in_progress').length,
      completed: repasos.filter(r => r.status === 'completed').length,
      totalHours,
    };
  }, [repasos]);

  // ---- Form handlers ----

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
      setFormData(EMPTY_REPASO_FORM);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingRepaso(null);
  };

  const handleSubmit = async () => {
    if (!formData.description.trim()) {
      toast.error('La descripción es obligatoria');
      return;
    }

    setIsSaving(true);
    try {
      const tempId = editingRepaso?.id || `temp-${Date.now()}`;

      let beforeImageUrl = formData.before_image;
      let afterImageUrl = formData.after_image;

      const needsBeforeUpload = beforeImageUrl && (beforeImageUrl.startsWith('blob:') || beforeImageUrl.startsWith('data:'));
      const needsAfterUpload = afterImageUrl && (afterImageUrl.startsWith('blob:') || afterImageUrl.startsWith('data:'));

      if (needsBeforeUpload || needsAfterUpload) {
        const blobToDataUrl = async (url: string): Promise<string> => {
          if (!url.startsWith('blob:')) return url;
          const blob = await fetch(url).then(r => r.blob());
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        };

        const uploaded = await uploadBothImages(
          needsBeforeUpload ? await blobToDataUrl(beforeImageUrl) : undefined,
          needsAfterUpload ? await blobToDataUrl(afterImageUrl) : undefined,
          tempId,
        );

        if (uploaded.before_image) beforeImageUrl = uploaded.before_image;
        if (uploaded.after_image) afterImageUrl = uploaded.after_image;
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

      const success = editingRepaso
        ? await updateRepaso(editingRepaso.id, data)
        : await createRepaso(data as CreateRepasoData);

      if (success) {
        handleCloseDialog();
        toast.success(editingRepaso ? 'Repaso actualizado' : 'Repaso creado');
      }
    } catch {
      toast.error('Error al guardar el repaso');
    } finally {
      setIsSaving(false);
    }
  };

  // ---- Delete handlers ----

  const handleDelete = async () => {
    if (!repasoToDelete) return;
    const success = await deleteRepaso(repasoToDelete.id);
    if (success) {
      setIsDeleteDialogOpen(false);
      setRepasoToDelete(null);
    }
  };

  // ---- Export handlers ----

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportRepasosToExcel(repasos, { workName, workNumber });
      toast.success('Excel exportado correctamente');
    } catch {
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
    } catch {
      toast.error('Error al exportar PDF');
    } finally {
      setIsExporting(false);
    }
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
                Añadir repaso
              </Button>
            )}
            <div className="text-center">
              <CardTitle className="text-2xl">Repasos de Obra</CardTitle>
              <p className="text-sm text-muted-foreground">Gestión de incidencias y correcciones en obra</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Métricas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: AlertCircle, iconClass: 'text-amber-500', value: displayStats.pending, label: 'Pendientes' },
              { icon: Clock, iconClass: 'text-blue-500', value: displayStats.inProgress, label: 'En Proceso' },
              { icon: CheckCircle2, iconClass: 'text-green-500', value: displayStats.completed, label: 'Completados' },
              { icon: Clock, iconClass: 'text-primary', value: `${displayStats.totalHours}h`, label: 'Horas Totales' },
            ].map(({ icon: Icon, iconClass, value, label }) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${iconClass}`} />
                    <div>
                      <p className="text-2xl font-bold">{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Barra de acciones */}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={handleExportExcel} disabled={isExporting || repasos.length === 0}>
              {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
              Excel
            </Button>
            <Button variant="outline" onClick={handleExportPdf} disabled={isExporting || repasos.length === 0}>
              {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              PDF
            </Button>
          </div>

          {/* Lista */}
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
                              <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(repaso)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setRepasoToDelete(repaso); setIsDeleteDialogOpen(true); }}
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
                              <AuthenticatedImage
                                src={repaso.before_image}
                                alt="Antes"
                                className="h-16 w-16 object-cover rounded cursor-pointer border-2 border-red-200"
                                onClick={() => setImagePreview({ url: repaso.before_image!, type: 'before' })}
                              />
                            )}
                            {repaso.after_image && (
                              <AuthenticatedImage
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
                                <AuthenticatedImage
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
                                <AuthenticatedImage
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
                                <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(repaso)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => { setRepasoToDelete(repaso); setIsDeleteDialogOpen(true); }}
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
        </CardContent>
      </Card>

      <RepasoFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editingRepaso={editingRepaso}
        formData={formData}
        setFormData={setFormData}
        isSaving={isSaving}
        uploading={uploading}
        onSubmit={handleSubmit}
        onCancel={handleCloseDialog}
      />

      <RepasoDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        repaso={repasoToDelete}
        onConfirm={handleDelete}
      />

      {/* Previsualización de imagen */}
      <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {imagePreview?.type === 'before' ? 'Foto ANTES' : 'Foto DESPUÉS'}
            </DialogTitle>
          </DialogHeader>
          {imagePreview && (
            <AuthenticatedImage
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
