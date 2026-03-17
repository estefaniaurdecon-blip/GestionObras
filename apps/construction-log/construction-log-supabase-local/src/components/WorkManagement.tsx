import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorks } from '@/hooks/useWorks';
import { useUsers } from '@/hooks/useUsers';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useOrganization } from '@/hooks/useOrganization';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Users, Loader2, Trash2, Package, Truck, ClipboardCheck, ShoppingBag, MapPin, Search, Settings, Pencil } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';

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
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    if (!initialWorkId || loading || works.length === 0) return;
    const work = works.find(w => String(w.id) === String(initialWorkId));
    if (work) handleOpenDialog(work);
  }, [initialWorkId, loading, works]);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<any>(null);
  const [selectedWork, setSelectedWork] = useState<any>(null);
  const [workToDelete, setWorkToDelete] = useState<any>(null);
  const [workData, setWorkData] = useState({
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
    latitude: '' as string | number,
    longitude: '' as string | number,
    street_address: '',
    city: '',
    province: '',
    country: 'España',
  });
  const [geocodingLoading, setGeocodingLoading] = useState(false);
  const [assignedUsers, setAssignedUsers] = useState<string[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<any[]>([]);

  const handleOpenDialog = (work?: any) => {
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
      setWorkData({
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
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingWork(null);
    setWorkData({
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
    });
  };

  const handleCaptureLocation = async () => {
    try {
      const position = await getCurrentPosition();
      if (position.latitude !== null && position.longitude !== null) {
        setWorkData(prev => ({
          ...prev,
          latitude: position.latitude,
          longitude: position.longitude,
          // Auto-rellenar los campos de dirección desde reverse geocoding
          street_address: position.addressDetails?.street_address || prev.street_address,
          city: position.addressDetails?.city || prev.city,
          province: position.addressDetails?.province || prev.province,
          country: position.addressDetails?.country || prev.country || 'España',
          // También actualizar la dirección general si está vacía
          address: position.address || prev.address,
        }));
        toast.success('Ubicación GPS capturada y dirección auto-rellenada');
        return;
      }

      toast.error(position.error || 'No se pudo capturar la ubicación GPS.');
    } catch (error) {
      console.error('[Geolocation] Error capturando ubicación:', error);
      toast.error('No se pudo capturar la ubicación GPS. Revisa permisos e inténtalo de nuevo.');
    }
  };

  const handleGeocodeAddress = async () => {
    const addressParts = [
      workData.street_address,
      workData.city,
      workData.province,
      workData.country || 'España'
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
            'Accept': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error('Error en la respuesta del servidor');
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        setWorkData(prev => ({
          ...prev,
          latitude: parseFloat(lat),
          longitude: parseFloat(lon),
        }));
        toast.success('Coordenadas encontradas y actualizadas');
        console.log('[Geocoding] Dirección encontrada:', display_name);
      } else {
        toast.error('No se encontró la dirección. Revisa los datos');
      }
    } catch (error) {
      console.error('[Geocoding] Error:', error);
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
      // Concatenar dirección postal para el campo address
      const addressParts = [
        workData.street_address,
        workData.city,
        workData.province,
        workData.country
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
    } catch (error) {
      // Error ya manejado en el hook
    }
  };

  const handleOpenAssignDialog = async (work: any) => {
    setSelectedWork(work);
    setLoadingAssignments(true);
    setIsAssignDialogOpen(true);
    
    try {
      let nextAssignableUsers: any[] = [];
      if (isAdmin) {
        const managedUsers = await loadUsers();
        nextAssignableUsers = managedUsers.filter((managedUser) => managedUser.approved);
      } else if (isSiteManager && organization) {
        nextAssignableUsers = await getAssignableForemenForSiteManager(organization.id);
      }

      setAssignableUsers(nextAssignableUsers);

      const assignmentSnapshots = await Promise.all(
        nextAssignableUsers.map(async (assignableUser) => ({
          userId: assignableUser.id,
          workIds: await getUserAssignments(assignableUser.id),
        })),
      );
      setAssignedUsers(
        assignmentSnapshots
          .filter(({ workIds }) => workIds.includes(String(work.id)))
          .map(({ userId }) => userId),
      );
    } catch (error) {
      console.error('Error loading assignments:', error);
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
    } catch (error) {
      // Error ya manejado en el hook
    }
  };

  const handleOpenDeleteDialog = (work: any) => {
    setWorkToDelete(work);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!workToDelete) return;

    try {
      await deleteWork(workToDelete.id);
      setIsDeleteDialogOpen(false);
      setWorkToDelete(null);
    } catch (error) {
      // Error ya manejado en el hook
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
                        {work.start_date ? (
                          <p className="text-sm text-muted-foreground">Fecha de inicio: {work.start_date}</p>
                        ) : null}
                        {work.address ? (
                          <p className="truncate text-sm text-muted-foreground">Dirección: {work.address}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Ajustes de obra"
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              onClick={() => {
                                navigate(`/work-management/${work.id}?tab=inventory`);
                              }}
                            >
                              <Package className="mr-2 h-4 w-4" />
                              Inventario
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!canManageWorks}
                              onClick={() => {
                                if (!canManageWorks) return;
                                navigate(`/work-management/${work.id}?tab=rental`);
                              }}
                            >
                              <Truck className="mr-2 h-4 w-4" />
                              Maq. alquiler
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!canManageWorks}
                              onClick={() => {
                                if (!canManageWorks) return;
                                navigate(`/work-management/${work.id}?tab=repasos`);
                              }}
                            >
                              <ClipboardCheck className="mr-2 h-4 w-4" />
                              Repasos
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!canManageWorks}
                              onClick={() => {
                                if (!canManageWorks) return;
                                navigate(`/work-management/${work.id}?tab=postventa`);
                              }}
                            >
                              <ShoppingBag className="mr-2 h-4 w-4" />
                              Post-venta
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!canAssignWorks}
                              onClick={() => {
                                if (!canAssignWorks) return;
                                handleOpenAssignDialog(work);
                              }}
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
                          onClick={() => {
                            if (!canManageWorks) return;
                            handleOpenDialog(work);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Eliminar obra"
                          disabled={!canManageWorks}
                          onClick={() => {
                            if (!canManageWorks) return;
                            handleOpenDeleteDialog(work);
                          }}
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

      {/* Dialog para crear/editar obra */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl px-4 sm:px-6">
          <DialogHeader className="items-center text-center">
            <DialogTitle className="app-page-title">
              {editingWork ? 'Editar obra' : 'Añadir obras'}
            </DialogTitle>
            <DialogDescription className="app-page-subtitle text-center">
              Sistema de Gestión de Obras
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* === MÓDULO 1: INFORMACIÓN GENERAL === */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="workNumber" className="app-field-label">Número de Obra *</Label>
                  <Input
                    id="workNumber"
                    value={workData.number}
                    onChange={(e) => setWorkData(prev => ({ ...prev, number: e.target.value }))}
                    placeholder="Ej: OB-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="executionPeriod" className="app-field-label">Plazo de Ejecución</Label>
                  <Input
                    id="executionPeriod"
                    value={workData.execution_period}
                    onChange={(e) => setWorkData(prev => ({ ...prev, execution_period: e.target.value }))}
                    placeholder="Ej: 6 meses"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workName" className="app-field-label">Nombre de la Obra *</Label>
                <Input
                  id="workName"
                  value={workData.name}
                  onChange={(e) => setWorkData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej: Construcción Edificio Central"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address" className="app-field-label">Dirección</Label>
                <Input
                  id="address"
                  value={workData.address}
                  onChange={(e) => setWorkData(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Calle, número, ciudad"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="promoter" className="app-field-label">Promotor</Label>
                  <Input
                    id="promoter"
                    value={workData.promoter}
                    onChange={(e) => setWorkData(prev => ({ ...prev, promoter: e.target.value }))}
                    placeholder="Nombre del promotor"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget" className="app-field-label">Presupuesto (€)</Label>
                  <Input
                    id="budget"
                    type="number"
                    value={workData.budget}
                    onChange={(e) => setWorkData(prev => ({ ...prev, budget: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate" className="app-field-label">Fecha de Inicio</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={workData.start_date}
                    onChange={(e) => setWorkData(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate" className="app-field-label">Fecha de Fin</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={workData.end_date}
                    onChange={(e) => setWorkData(prev => ({ ...prev, end_date: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* === MÓDULO 2: DESCRIPCIÓN Y CONTACTO === */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description" className="app-field-label">Descripción</Label>
                <Textarea
                  id="description"
                  value={workData.description}
                  onChange={(e) => setWorkData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descripción general de la obra"
                  rows={3}
                />
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-slate-900">Contacto</p>
                  <p className="app-section-subtitle">Datos principales para coordinar la obra.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPerson" className="app-field-label-muted">Persona de Contacto</Label>
                  <Input
                    id="contactPerson"
                    value={workData.contact_person}
                    onChange={(e) => setWorkData(prev => ({ ...prev, contact_person: e.target.value }))}
                    placeholder="Nombre completo"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contactPhone" className="app-field-label-muted">Teléfono</Label>
                    <Input
                      id="contactPhone"
                      type="tel"
                      value={workData.contact_phone}
                      onChange={(e) => setWorkData(prev => ({ ...prev, contact_phone: e.target.value }))}
                      placeholder="+34 600 000 000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactEmail" className="app-field-label-muted">Email</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      value={workData.contact_email}
                      onChange={(e) => setWorkData(prev => ({ ...prev, contact_email: e.target.value }))}
                      placeholder="contacto@ejemplo.com"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* === MÓDULO 3: UBICACIÓN === */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <MapPin className="h-4 w-4" />
                <span>Ubicación</span>
              </div>
              
              <div className="bg-muted/30 rounded-lg p-4 space-y-4">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-slate-900">Dirección postal</p>
                  <p className="app-section-subtitle">Usa estos datos para localizar la obra y autocompletar coordenadas.</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="streetAddress" className="app-field-label-muted">Dirección (Calle y número)</Label>
                  <Input
                    id="streetAddress"
                    value={workData.street_address}
                    onChange={(e) => setWorkData(prev => ({ ...prev, street_address: e.target.value }))}
                    placeholder="Calle Mayor, 123"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="app-field-label-muted">Población</Label>
                    <Input
                      id="city"
                      value={workData.city}
                      onChange={(e) => setWorkData(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="Madrid"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="province" className="app-field-label-muted">Provincia / Región</Label>
                    <Input
                      id="province"
                      value={workData.province}
                      onChange={(e) => setWorkData(prev => ({ ...prev, province: e.target.value }))}
                      placeholder="Madrid"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="country" className="app-field-label-muted">País</Label>
                  <Input
                    id="country"
                    value={workData.country}
                    onChange={(e) => setWorkData(prev => ({ ...prev, country: e.target.value }))}
                    placeholder="España"
                  />
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGeocodeAddress}
                  disabled={geocodingLoading || (!workData.street_address && !workData.city)}
                  className="app-btn-soft w-full"
                >
                  {geocodingLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Buscando coordenadas...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Buscar Coordenadas desde Dirección
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* === MÓDULO 4: COORDENADAS GPS Y BOTONES === */}
            <div className="space-y-4">
              {workData.latitude && workData.longitude ? (
                <div className="bg-muted/50 border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Ubicación definida</p>
                        <p className="text-xs text-muted-foreground">
                          {Number(workData.latitude).toFixed(6)}, {Number(workData.longitude).toFixed(6)}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setWorkData(prev => ({ ...prev, latitude: '', longitude: '' }));
                        toast.info('Ubicación eliminada. Guarda los cambios para confirmar.');
                      }}
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Eliminar ubicación"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Sin coordenadas definidas</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Usa el botón de arriba para buscar coordenadas o captura la ubicación GPS
                  </p>
                </div>
              )}
              
              <Button
                type="button"
                variant="outline"
                onClick={handleCaptureLocation}
                disabled={geoLoading}
                className="app-btn-soft mx-auto w-full sm:w-auto sm:min-w-[220px]"
              >
                {geoLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Obteniendo ubicación...
                  </>
                ) : (
                  <>
                    <MapPin className="mr-2 h-4 w-4" />
                    Capturar Ubicación GPS Actual
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {/* Botones finales */}
          <div className="flex flex-col items-center gap-2 pt-2 sm:flex-row sm:justify-center">
            <Button
              onClick={handleSubmit}
              className="app-btn-primary w-full sm:w-auto sm:min-w-[180px]"
            >
              {editingWork ? 'Guardar cambios' : 'Añadir'}
            </Button>
            <Button
              variant="outline"
              onClick={handleCloseDialog}
              className="app-btn-soft w-full sm:w-auto sm:min-w-[180px]"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para asignar usuarios */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar Usuarios a la Obra</DialogTitle>
            <DialogDescription>
              {selectedWork && `${selectedWork.number} - ${selectedWork.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingAssignments ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {assignableUsers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No hay usuarios disponibles para asignar
                  </p>
                ) : (
                  assignableUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center space-x-2 p-2 hover:bg-accent rounded-md"
                    >
                      <Checkbox
                        id={user.id}
                        checked={assignedUsers.includes(user.id)}
                        onCheckedChange={() => handleToggleUser(user.id)}
                      />
                      <label
                        htmlFor={user.id}
                        className="flex-1 cursor-pointer text-sm"
                      >
                        {user.full_name}
                      </label>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAssignDialog}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación para eliminar obra */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la obra
              {workToDelete && ` "${workToDelete.number} - ${workToDelete.name}"`} 
              y todos sus datos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setWorkToDelete(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};








