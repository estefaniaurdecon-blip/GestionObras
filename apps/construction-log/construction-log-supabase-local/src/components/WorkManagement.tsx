import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorks } from '@/hooks/useWorks';
import { useUsers } from '@/hooks/useUsers';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useOrganization } from '@/hooks/useOrganization';
import { useIsMobile } from '@/hooks/use-mobile';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Users, Loader2, Trash2, Package, Truck, ClipboardCheck, ShoppingBag, MapPin, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { WorkInventory } from '@/components/WorkInventory';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkRentalMachineryManagement } from '@/components/WorkRentalMachineryManagement';
import { WorkRepasosSection } from '@/components/WorkRepasosSection';
import { WorkPostventasSection } from '@/components/WorkPostventasSection';

export const WorkManagement = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
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
  const { getCurrentPosition, loading: geoLoading, error: geoError } = useGeolocation();
  const canManageWorks = isAdmin || isSiteManager;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isInventoryDialogOpen, setIsInventoryDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState('inventory');
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
    const position = await getCurrentPosition();
    if (position.latitude !== null && position.longitude !== null) {
      setWorkData(prev => ({
        ...prev,
        latitude: position.latitude!,
        longitude: position.longitude!,
        // Auto-rellenar los campos de dirección desde reverse geocoding
        street_address: position.addressDetails?.street_address || prev.street_address,
        city: position.addressDetails?.city || prev.city,
        province: position.addressDetails?.province || prev.province,
        country: position.addressDetails?.country || prev.country || 'España',
        // También actualizar la dirección general si está vacía
        address: position.address || prev.address,
      }));
      toast.success('📍 Ubicación GPS capturada y dirección auto-rellenada');
    } else if (geoError) {
      toast.error(geoError);
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
        toast.success('📍 Coordenadas encontradas y actualizadas');
        console.log('[Geocoding] Dirección encontrada:', display_name);
      } else {
        toast.error('❌ No se encontró la dirección. Revisa los datos');
      }
    } catch (error) {
      console.error('[Geocoding] Error:', error);
      toast.error('❌ Error al buscar las coordenadas. Inténtalo de nuevo');
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
            <CardTitle className="text-xl font-semibold text-slate-900 sm:text-3xl">Obras</CardTitle>
            <p className="text-[15px] text-muted-foreground">Supervisión de obra</p>
          </div>
          <div className="flex justify-center">
            <Button
              onClick={() => handleOpenDialog()}
              className="bg-[#1e3a5f] hover:bg-[#152a45] text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              Añadir obras
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isMobile ? (
            // Vista móvil con cards
            <div className="space-y-4">
              {works.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay obras registradas
                </p>
              ) : (
                works.map((work) => (
                  <Card key={work.id} className="border shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Número de Obra</p>
                        <p className="font-bold text-lg">{work.number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Nombre</p>
                        <p className="font-medium">{work.name}</p>
                      </div>
                      <div className="flex flex-col gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedWork(work);
                            setSelectedTab('inventory');
                            setIsInventoryDialogOpen(true);
                          }}
                          className="w-full justify-start"
                        >
                          <Package className="mr-2 h-4 w-4" />
                          Inventario
                        </Button>
                        {canManageWorks && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedWork(work);
                                setSelectedTab('rental');
                                setIsInventoryDialogOpen(true);
                              }}
                              className="w-full justify-start"
                            >
                              <Truck className="mr-2 h-4 w-4" />
                              Maq. Alquiler
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedWork(work);
                                setSelectedTab('repasos');
                                setIsInventoryDialogOpen(true);
                              }}
                              className="w-full justify-start"
                            >
                              <ClipboardCheck className="mr-2 h-4 w-4" />
                              Repasos
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedWork(work);
                                setSelectedTab('postventa');
                                setIsInventoryDialogOpen(true);
                              }}
                              className="w-full justify-start"
                            >
                              <ShoppingBag className="mr-2 h-4 w-4" />
                              Post-Venta
                            </Button>
                          </>
                        )}
                        {canAssignWorks && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenAssignDialog(work)}
                            className="w-full justify-start"
                          >
                            <Users className="mr-2 h-4 w-4" />
                            {t('common.assign')}
                          </Button>
                        )}
                        {canManageWorks && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDialog(work)}
                              className="flex-1"
                            >
                              {t('common.edit')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDeleteDialog(work)}
                              className="flex-1"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('common.delete')}
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : (
            // Vista desktop con tabla
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número de Obra</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {works.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No hay obras registradas
                    </TableCell>
                  </TableRow>
                ) : (
                  works.map((work) => (
                    <TableRow key={work.id}>
                      <TableCell className="font-medium">{work.number}</TableCell>
                      <TableCell>{work.name}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedWork(work);
                              setSelectedTab('inventory');
                              setIsInventoryDialogOpen(true);
                            }}
                          >
                            <Package className="mr-2 h-4 w-4" />
                            Inventario
                          </Button>
                          {canManageWorks && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedWork(work);
                                  setSelectedTab('rental');
                                  setIsInventoryDialogOpen(true);
                                }}
                              >
                                <Truck className="mr-2 h-4 w-4" />
                                Maq. Alquiler
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedWork(work);
                                  setSelectedTab('repasos');
                                  setIsInventoryDialogOpen(true);
                                }}
                              >
                                <ClipboardCheck className="mr-2 h-4 w-4" />
                                Repasos
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedWork(work);
                                  setSelectedTab('postventa');
                                  setIsInventoryDialogOpen(true);
                                }}
                              >
                                <ShoppingBag className="mr-2 h-4 w-4" />
                                Post-Venta
                              </Button>
                            </>
                          )}
                          {canAssignWorks && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenAssignDialog(work)}
                            >
                              <Users className="mr-2 h-4 w-4" />
                              {t('common.assign')}
                            </Button>
                          )}
                          {canManageWorks && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDialog(work)}
                              >
                                {t('common.edit')}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDeleteDialog(work)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('common.delete')}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog para crear/editar obra */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-none w-full h-full max-h-screen overflow-y-auto rounded-none">
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl font-semibold">
              {editingWork ? 'Editar obra' : 'Añadir obras'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Sistema de Gestión de Obras
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* === MÓDULO 1: INFORMACIÓN GENERAL === */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="workNumber" className="text-sm font-medium">Número de Obra *</Label>
                  <Input
                    id="workNumber"
                    value={workData.number}
                    onChange={(e) => setWorkData(prev => ({ ...prev, number: e.target.value }))}
                    placeholder="Ej: OB-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="executionPeriod" className="text-sm font-medium">Plazo de Ejecución</Label>
                  <Input
                    id="executionPeriod"
                    value={workData.execution_period}
                    onChange={(e) => setWorkData(prev => ({ ...prev, execution_period: e.target.value }))}
                    placeholder="Ej: 6 meses"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workName" className="text-sm font-medium">Nombre de la Obra *</Label>
                <Input
                  id="workName"
                  value={workData.name}
                  onChange={(e) => setWorkData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej: Construcción Edificio Central"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address" className="text-sm font-medium">Dirección</Label>
                <Input
                  id="address"
                  value={workData.address}
                  onChange={(e) => setWorkData(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Calle, número, ciudad"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="promoter" className="text-sm font-medium">Promotor</Label>
                  <Input
                    id="promoter"
                    value={workData.promoter}
                    onChange={(e) => setWorkData(prev => ({ ...prev, promoter: e.target.value }))}
                    placeholder="Nombre del promotor"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget" className="text-sm font-medium">Presupuesto (€)</Label>
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
                  <Label htmlFor="startDate" className="text-sm font-medium">Fecha de Inicio</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={workData.start_date}
                    onChange={(e) => setWorkData(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate" className="text-sm font-medium">Fecha de Fin</Label>
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
                <Label htmlFor="description" className="text-sm font-medium">Descripción</Label>
                <Textarea
                  id="description"
                  value={workData.description}
                  onChange={(e) => setWorkData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descripción general de la obra"
                  rows={3}
                />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Contacto</Label>
                <div className="space-y-2">
                  <Label htmlFor="contactPerson" className="text-xs text-muted-foreground">Persona de Contacto</Label>
                  <Input
                    id="contactPerson"
                    value={workData.contact_person}
                    onChange={(e) => setWorkData(prev => ({ ...prev, contact_person: e.target.value }))}
                    placeholder="Nombre completo"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contactPhone" className="text-xs text-muted-foreground">Teléfono</Label>
                    <Input
                      id="contactPhone"
                      type="tel"
                      value={workData.contact_phone}
                      onChange={(e) => setWorkData(prev => ({ ...prev, contact_phone: e.target.value }))}
                      placeholder="+34 600 000 000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactEmail" className="text-xs text-muted-foreground">Email</Label>
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
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>Ubicación</span>
              </div>
              
              <div className="bg-muted/30 rounded-lg p-4 space-y-4">
                <p className="text-xs font-medium text-muted-foreground">Dirección Postal</p>
                
                <div className="space-y-2">
                  <Label htmlFor="streetAddress" className="text-xs text-muted-foreground">Dirección (Calle y número)</Label>
                  <Input
                    id="streetAddress"
                    value={workData.street_address}
                    onChange={(e) => setWorkData(prev => ({ ...prev, street_address: e.target.value }))}
                    placeholder="Calle Mayor, 123"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-xs text-muted-foreground">Población</Label>
                    <Input
                      id="city"
                      value={workData.city}
                      onChange={(e) => setWorkData(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="Madrid"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="province" className="text-xs text-muted-foreground">Provincia / Región</Label>
                    <Input
                      id="province"
                      value={workData.province}
                      onChange={(e) => setWorkData(prev => ({ ...prev, province: e.target.value }))}
                      placeholder="Madrid"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="country" className="text-xs text-muted-foreground">País</Label>
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
                  className="w-full text-sm"
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
                className="w-full"
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
          <div className="space-y-2 pt-2">
            <Button 
              onClick={handleSubmit}
              className="w-full bg-[#1e3a5f] hover:bg-[#152a45] text-white"
            >
              {editingWork ? 'Guardar Cambios' : 'Añadir'}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleCloseDialog}
              className="w-full"
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

      {/* Dialog para ver inventario y maquinaria de alquiler */}
      <Dialog open={isInventoryDialogOpen} onOpenChange={setIsInventoryDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Gestión de Obra</DialogTitle>
            <DialogDescription>
              {selectedWork && `Obra: ${selectedWork.number} - ${selectedWork.name}`}
            </DialogDescription>
          </DialogHeader>
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="inventory">
                <Package className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Inventario</span>
                <span className="sm:hidden">Inv.</span>
              </TabsTrigger>
              <TabsTrigger value="rental">
                <Truck className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Maq. Alquiler</span>
                <span className="sm:hidden">Alq.</span>
              </TabsTrigger>
              <TabsTrigger value="repasos">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Repasos</span>
                <span className="sm:hidden">Rep.</span>
              </TabsTrigger>
              <TabsTrigger value="postventa">
                <ShoppingBag className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Post-Venta</span>
                <span className="sm:hidden">P-V</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="inventory" className="flex-1 overflow-y-auto mt-4">
              {selectedWork && organization && (
                <WorkInventory 
                  workId={selectedWork.id} 
                  workName={`${selectedWork.number} - ${selectedWork.name}`}
                  onBack={() => setIsInventoryDialogOpen(false)}
                />
              )}
            </TabsContent>
            <TabsContent value="rental" className="flex-1 overflow-y-auto mt-4">
              {selectedWork && (
                <WorkRentalMachineryManagement workId={selectedWork.id} />
              )}
            </TabsContent>
            <TabsContent value="repasos" className="flex-1 overflow-y-auto mt-4">
              {selectedWork && (
                <WorkRepasosSection 
                  workId={selectedWork.id} 
                  workName={selectedWork.name}
                  workNumber={selectedWork.number}
                />
              )}
            </TabsContent>
            <TabsContent value="postventa" className="flex-1 overflow-y-auto mt-4">
              {selectedWork && (
                <WorkPostventasSection 
                  workId={selectedWork.id} 
                  workName={selectedWork.name}
                  workNumber={selectedWork.number}
                />
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};
