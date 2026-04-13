import { useState, useMemo } from 'react';
import { useWorkPostventas, type WorkPostventa, type CreatePostventaData, type UpdatePostventaData } from '@/hooks/useWorkPostventas';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePostventaImages } from '@/hooks/usePostventaImages';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { exportPostventasToExcel, exportPostventasToPdf } from '@/utils/postventasExportUtils';
import { PostventaFormDialog, EMPTY_POSTVENTA_FORM, type PostventaFormData } from './work-postventas/PostventaFormDialog';
import { PostventaDeleteDialog } from './work-postventas/PostventaDeleteDialog';

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

function calculateTotalHours(postventa: WorkPostventa): number {
  if (!postventa.subcontract_groups?.length) return 0;
  return postventa.subcontract_groups.reduce((total, group) => {
    const workerHours = group.workers?.reduce((sum, w) => sum + (w.hours || 0), 0) ?? 0;
    const machineryHours = group.machinery?.reduce((sum, m) => sum + (m.hours || 0), 0) ?? 0;
    return total + workerHours + machineryHours;
  }, 0);
}

export const WorkPostventasSection: React.FC<WorkPostventasSectionProps> = ({
  workId,
  workName,
  workNumber,
}) => {
  const isMobile = useIsMobile();
  const { isAdmin, isSiteManager, isMaster } = useUserPermissions();
  const { postventas, loading, createPostventa, updatePostventa, deletePostventa } = useWorkPostventas(workId);
  const { uploading, uploadBothImages } = usePostventaImages();

  const canManage = isAdmin || isSiteManager || isMaster;

  // Form dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPostventa, setEditingPostventa] = useState<WorkPostventa | null>(null);
  const [formData, setFormData] = useState<PostventaFormData>(EMPTY_POSTVENTA_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [postventaToDelete, setPostventaToDelete] = useState<WorkPostventa | null>(null);

  const [isExporting, setIsExporting] = useState(false);

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

  // ---- Form handlers ----

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
      setFormData(EMPTY_POSTVENTA_FORM);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPostventa(null);
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

      const success = editingPostventa
        ? await updatePostventa(editingPostventa.id, data)
        : await createPostventa(data as CreatePostventaData);

      if (success) {
        handleCloseDialog();
        toast.success(editingPostventa ? 'Post-venta actualizada' : 'Post-venta creada');
      }
    } catch {
      toast.error('Error al guardar la post-venta');
    } finally {
      setIsSaving(false);
    }
  };

  // ---- Delete handlers ----

  const handleDelete = async () => {
    if (!postventaToDelete) return;
    const success = await deletePostventa(postventaToDelete.id);
    if (success) {
      setIsDeleteDialogOpen(false);
      setPostventaToDelete(null);
    }
  };

  // ---- Export handlers ----

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportPostventasToExcel(postventas, { workName, workNumber });
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
      await exportPostventasToPdf(postventas, { workName, workNumber });
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
          {/* Métricas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: AlertCircle, iconClass: 'text-purple-500', value: displayStats.pending, label: 'Pendientes' },
              { icon: Clock, iconClass: 'text-indigo-500', value: displayStats.inProgress, label: 'En Proceso' },
              { icon: CheckCircle2, iconClass: 'text-emerald-500', value: displayStats.completed, label: 'Completados' },
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
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={isExporting || postventas.length === 0}
            >
              {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
              Excel
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={isExporting || postventas.length === 0}
            >
              {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              PDF
            </Button>
          </div>

          {/* Lista */}
          {postventas.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No hay post-ventas registradas para esta obra.</p>
                {canManage && (
                  <Button variant="outline" className="mt-4" onClick={() => handleOpenDialog()}>
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
                const companies = pv.subcontract_groups?.map(g => g.company).filter(Boolean).join(', ') || pv.assigned_company || '-';
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(pv)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => { setPostventaToDelete(pv); setIsDeleteDialogOpen(true); }}
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
                    const companies = pv.subcontract_groups?.map(g => g.company).filter(Boolean).join(', ') || pv.assigned_company || '-';
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
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(pv)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => { setPostventaToDelete(pv); setIsDeleteDialogOpen(true); }}
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

      <PostventaFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editingPostventa={editingPostventa}
        formData={formData}
        setFormData={setFormData}
        isSaving={isSaving}
        uploading={uploading}
        onSubmit={handleSubmit}
        onCancel={handleCloseDialog}
      />

      <PostventaDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        postventa={postventaToDelete}
        onCancel={() => setPostventaToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
};
