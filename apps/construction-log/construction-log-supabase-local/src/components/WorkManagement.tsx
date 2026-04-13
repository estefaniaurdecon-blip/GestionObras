import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorks } from '@/hooks/useWorks';
import { useUsers } from '@/hooks/useUsers';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useOrganization } from '@/hooks/useOrganization';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Users, Loader2, Trash2, Package, Truck, ClipboardCheck, ShoppingBag, Pencil, Settings } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import type { Work } from '@/types/work';
import { WorkFormDialog, type WorkFormData } from './work-management/WorkFormDialog';
import { WorkAssignDialog } from './work-management/WorkAssignDialog';
import { WorkDeleteDialog } from './work-management/WorkDeleteDialog';

const EMPTY_FORM: WorkFormData = {
  number: '',
  name: '',
  address: '',
  promoter: '',
  budget: '',
  execution_period: '',
  start_date: '',
  end_date: '',
  description: '',
  contact_person: '',
  contact_phone: '',
  contact_email: '',
  latitude: '',
  longitude: '',
  street_address: '',
  city: '',
  province: '',
  country: 'España',
};

export const WorkManagement = ({ initialWorkId }: { initialWorkId?: string }) => {
  const isAndroidPlatform = Capacitor.getPlatform() === 'android';
  const lightActionButtonClass = isAndroidPlatform
    ? 'h-11 w-[158px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[16px] font-semibold text-cyan-700 shadow-none hover:bg-cyan-50 hover:text-cyan-800'
    : 'h-10 w-[148px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[15px] font-semibold text-cyan-700 shadow-none hover:bg-cyan-50 hover:text-cyan-800';

  const navigate = useNavigate();
  const { t } = useTranslation();
  const { works, loading, createWork, updateWork, deleteWork } = useWorks();
  const {
    loadUsers,
    getUserAssignments,
    assignUserToWork: assignManagedUserToWork,
    removeUserFromWork: removeManagedUserFromWork,
    getAssignableForemenForSiteManager,
  } = useUsers({ autoLoad: false });
  const { isAdmin, isSiteManager, canAssignWorks } = useUserPermissions();
  const { organization } = useOrganization();
  const { getCurrentPosition, loading: geoLoading } = useGeolocation();
  const canManageWorks = isAdmin || isSiteManager;

  // Form dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<Work | null>(null);
  const [workData, setWorkData] = useState<WorkFormData>(EMPTY_FORM);
  const [geocodingLoading, setGeocodingLoading] = useState(false);

  // Assign dialog
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  const [assignedUsers, setAssignedUsers] = useState<string[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<{ id: string; full_name: string }[]>([]);

  // Delete dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [workToDelete, setWorkToDelete] = useState<Work | null>(null);

  useEffect(() => {
    if (!initialWorkId || loading || works.length === 0) return;
    const work = works.find(w => String(w.id) === String(initialWorkId));
    if (work) handleOpenDialog(work);
  }, [initialWorkId, loading, works]);

  // ---- Form handlers ----

  const handleOpenDialog = (work?: Work) => {
    if (work) {
      setEditingWork(work);
      setWorkData({
        number: work.number || '',
        name: work.name || '',
        address: work.address || '',
        promoter: work.promoter || '',
        budget: work.budget?.toString() || '',
        execution_period: work.execution_period || '',
        start_date: work.start_date || '',
        end_date: work.end_date || '',
        description: work.description || '',
        contact_person: work.contact_person || '',
        contact_phone: work.contact_phone || '',
        contact_email: work.contact_email || '',
        latitude: work.latitude ?? '',
        longitude: work.longitude ?? '',
        street_address: work.street_address || '',
        city: work.city || '',
        province: work.province || '',
        country: work.country || 'España',
      });
    } else {
      setEditingWork(null);
      setWorkData(EMPTY_FORM);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingWork(null);
    setWorkData(EMPTY_FORM);
  };

  const handleCaptureLocation = async () => {
    try {
      const position = await getCurrentPosition();
      if (position.latitude !== null && position.longitude !== null) {
        setWorkData(prev => ({
          ...prev,
          latitude: position.latitude,
          longitude: position.longitude,
          street_address: position.addressDetails?.street_address || prev.street_address,
          city: position.addressDetails?.city || prev.city,
          province: position.addressDetails?.province || prev.province,
          country: position.addressDetails?.country || prev.country || 'España',
          address: position.address || prev.address,
        }));
        toast.success('Ubicación GPS capturada y dirección auto-rellenada');
        return;
      }
      toast.error(position.error || 'No se pudo capturar la ubicación GPS.');
    } catch {
      toast.error('No se pudo capturar la ubicación GPS. Revisa permisos e inténtalo de nuevo.');
    }
  };

  const handleGeocodeAddress = async () => {
    const addressParts = [
      workData.street_address,
      workData.city,
      workData.province,
      workData.country || 'España',
    ].filter(Boolean);

    if (addressParts.length < 2) {
      toast.error('Por favor, introduce al menos una dirección y población');
      return;
    }

    const fullAddress = addressParts.join(', ');
    setGeocodingLoading(true);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`,
        {
          headers: {
            'User-Agent': 'PartesDeTrabajoApp/1.0',
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) throw new Error('Error en la respuesta del servidor');

      const data: { lat: string; lon: string; display_name: string }[] = await response.json();
      if (data.length > 0) {
        setWorkData(prev => ({
          ...prev,
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
        }));
        toast.success('Coordenadas encontradas y actualizadas');
      } else {
        toast.error('No se encontró la dirección. Revisa los datos');
      }
    } catch {
      toast.error('Error al buscar las coordenadas. Inténtalo de nuevo');
    } finally {
      setGeocodingLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!workData.number.trim() || !workData.name.trim()) {
      toast.error(t('common.error'));
      return;
    }

    try {
      const addressParts = [
        workData.street_address,
        workData.city,
        workData.province,
        workData.country,
      ].filter(Boolean);
      const concatenatedAddress = addressParts.length > 0 ? addressParts.join(', ') : workData.address;

      const dataToSave = {
        ...workData,
        address: concatenatedAddress || null,
        budget: workData.budget ? parseFloat(workData.budget as string) : undefined,
        start_date: workData.start_date || null,
        end_date: workData.end_date || null,
        latitude: workData.latitude !== '' ? Number(workData.latitude) : null,
        longitude: workData.longitude !== '' ? Number(workData.longitude) : null,
      };

      if (editingWork) {
        await updateWork(editingWork.id, dataToSave);
      } else {
        await createWork(dataToSave);
      }
      handleCloseDialog();
    } catch {
      // Error already handled in hook
    }
  };

  // ---- Assign handlers ----

  const handleOpenAssignDialog = async (work: Work) => {
    setSelectedWork(work);
    setLoadingAssignments(true);
    setIsAssignDialogOpen(true);

    try {
      let nextAssignableUsers: { id: string; full_name: string; approved?: boolean }[] = [];
      if (isAdmin) {
        const managedUsers = await loadUsers();
        nextAssignableUsers = managedUsers.filter((u) => u.approved);
      } else if (isSiteManager && organization) {
        nextAssignableUsers = await getAssignableForemenForSiteManager(organization.id);
      }

      setAssignableUsers(nextAssignableUsers);

      const snapshots = await Promise.all(
        nextAssignableUsers.map(async (u) => ({
          userId: u.id,
          workIds: await getUserAssignments(u.id),
        })),
      );
      setAssignedUsers(
        snapshots
          .filter(({ workIds }) => workIds.includes(String(work.id)))
          .map(({ userId }) => userId),
      );
    } catch {
      // Silently handled; UI shows empty state
    } finally {
      setLoadingAssignments(false);
    }
  };

  const handleCloseAssignDialog = () => {
    setIsAssignDialogOpen(false);
    setSelectedWork(null);
    setAssignedUsers([]);
  };

  const handleToggleUser = async (userId: string) => {
    if (!selectedWork) return;
    try {
      if (assignedUsers.includes(userId)) {
        await removeManagedUserFromWork(userId, selectedWork.id);
        setAssignedUsers(prev => prev.filter(id => id !== userId));
      } else {
        await assignManagedUserToWork(userId, selectedWork.id);
        setAssignedUsers(prev => [...prev, userId]);
      }
    } catch {
      // Error already handled in hook
    }
  };

  // ---- Delete handlers ----

  const handleOpenDeleteDialog = (work: Work) => {
    setWorkToDelete(work);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!workToDelete) return;
    try {
      await deleteWork(workToDelete.id);
      setIsDeleteDialogOpen(false);
      setWorkToDelete(null);
    } catch {
      // Error already handled in hook
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
      <Card>
        <CardHeader className="space-y-3">
          <div className="text-center">
            <CardTitle className="app-page-title">Obras</CardTitle>
            <p className="app-page-subtitle">Supervisión de obra</p>
          </div>
          <div className="flex justify-center">
            <Button
              onClick={() => handleOpenDialog()}
              variant="outline"
              className={lightActionButtonClass}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuevo registro
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {works.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No hay obras registradas</p>
            ) : (
              works.map((work) => (
                <Card key={work.id} className="border border-slate-200 bg-white shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-lg font-semibold text-slate-900">{work.name || 'Sin nombre'}</p>
                        <p className="text-sm text-muted-foreground">Identificador: {work.number || 'Sin número'}</p>
                        {work.start_date && (
                          <p className="text-sm text-muted-foreground">Fecha de inicio: {work.start_date}</p>
                        )}
                        {work.address && (
                          <p className="truncate text-sm text-muted-foreground">Dirección: {work.address}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" title="Ajustes de obra">
                              <Settings className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => navigate(`/work-management/${work.id}?tab=inventory`)}>
                              <Package className="mr-2 h-4 w-4" />
                              Inventario
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!canManageWorks}
                              onClick={() => canManageWorks && navigate(`/work-management/${work.id}?tab=rental`)}
                            >
                              <Truck className="mr-2 h-4 w-4" />
                              Maq. alquiler
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!canManageWorks}
                              onClick={() => canManageWorks && navigate(`/work-management/${work.id}?tab=repasos`)}
                            >
                              <ClipboardCheck className="mr-2 h-4 w-4" />
                              Repasos
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!canManageWorks}
                              onClick={() => canManageWorks && navigate(`/work-management/${work.id}?tab=postventa`)}
                            >
                              <ShoppingBag className="mr-2 h-4 w-4" />
                              Post-venta
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!canAssignWorks}
                              onClick={() => canAssignWorks && handleOpenAssignDialog(work)}
                            >
                              <Users className="mr-2 h-4 w-4" />
                              Asignar encargado
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar obra"
                          disabled={!canManageWorks}
                          onClick={() => canManageWorks && handleOpenDialog(work)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Eliminar obra"
                          disabled={!canManageWorks}
                          onClick={() => canManageWorks && handleOpenDeleteDialog(work)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <WorkFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        isEditing={editingWork !== null}
        workData={workData}
        onChange={(patch) => setWorkData(prev => ({ ...prev, ...patch }))}
        onSubmit={handleSubmit}
        onCancel={handleCloseDialog}
        onGeocodeAddress={handleGeocodeAddress}
        onCaptureLocation={handleCaptureLocation}
        geocodingLoading={geocodingLoading}
        geoLoading={geoLoading}
      />

      <WorkAssignDialog
        open={isAssignDialogOpen}
        onOpenChange={setIsAssignDialogOpen}
        work={selectedWork}
        assignableUsers={assignableUsers}
        assignedUserIds={assignedUsers}
        loading={loadingAssignments}
        onToggleUser={handleToggleUser}
        onClose={handleCloseAssignDialog}
      />

      <WorkDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        work={workToDelete}
        onCancel={() => setWorkToDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
