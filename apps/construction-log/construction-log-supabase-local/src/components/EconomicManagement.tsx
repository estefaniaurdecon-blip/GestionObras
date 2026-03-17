import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { WorkReport, WorkItem, MachineryItem, SubcontractItem } from '@/types/workReport';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Edit2, Trash2, Save, Check, ChevronsUpDown } from 'lucide-react';
import {
  listManagedUserAssignments,
  upsertSavedEconomicReport,
} from '@/integrations/api/client';
import { getActiveTenantId } from '@/offline-db/tenantScope';
import { cn } from '@/lib/utils';

interface EconomicManagementProps {
  reports: WorkReport[];
  onReportUpdate: () => void;
  onSaveSuccess?: () => void;
}

export const EconomicManagement = ({ reports, onReportUpdate, onSaveSuccess }: EconomicManagementProps) => {
  const { user } = useAuth();
  const [selectedReport, setSelectedReport] = useState<WorkReport | null>(null);
  const [editedReport, setEditedReport] = useState<WorkReport | null>(null);
  const [assignedWorkIds, setAssignedWorkIds] = useState<string[]>([]);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [selectedForeman, setSelectedForeman] = useState<string>('all');
  const [foremanPopoverOpen, setForemanPopoverOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<{
    type: 'work' | 'machinery' | 'material' | 'subcontract' | 'rental';
    groupIndex: number;
    itemIndex: number;
    item: any;
  } | null>(null);
  const [editValues, setEditValues] = useState<any>({});

  // Temporary policy: all roles can operate with full visibility in economic management.
  const hasElevatedVisibility = true;

  useEffect(() => {
    loadAssignedWorks();
  }, [user, hasElevatedVisibility]);

  const loadAssignedWorks = async () => {
    if (!user) return;

    if (hasElevatedVisibility) {
      setAssignmentsError(null);
      setAssignedWorkIds([]);
      setLoading(false);
      return;
    }

    try {
      setAssignmentsError(null);
      const workIds = await listManagedUserAssignments(Number(user.id));
      setAssignedWorkIds(workIds.map(String));
    } catch (error) {
      console.error('Error loading assigned works:', error);
      setAssignmentsError('No se pudieron cargar tus asignaciones de obras.');
    } finally {
      setLoading(false);
    }
  };

  // Base reports scoped by assigned works and completed status.
  const scopedReports = useMemo(() => {
    const eligibleReports = reports.filter((report) => report.workNumber && !report.isArchived);
    const orderedEligibleReports = [...eligibleReports].sort((left, right) => {
      const updatedAtDiff =
        new Date(right.updatedAt ?? right.date).getTime() - new Date(left.updatedAt ?? left.date).getTime();
      if (updatedAtDiff !== 0) return updatedAtDiff;
      return right.date.localeCompare(left.date);
    });
    if (assignedWorkIds.length === 0) {
      if (assignmentsError || hasElevatedVisibility) {
        return orderedEligibleReports;
      }
      return [];
    }

    return eligibleReports
      .filter((report) => {
        const reportWorkId = String(report.workId ?? '').trim();
        if (!reportWorkId) return true;
        return assignedWorkIds.includes(reportWorkId);
      })
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [assignedWorkIds, assignmentsError, hasElevatedVisibility, reports]);

  // Foremen extracted from reports already stored offline.
  const availableForemen = useMemo(() => {
    const names = new Set<string>();

    scopedReports.forEach((report) => {
      const mainForeman = String(report.foreman ?? '').trim();
      if (mainForeman) names.add(mainForeman);

      if (Array.isArray(report.foremanEntries)) {
        report.foremanEntries.forEach((entry) => {
          const entryName = String(entry?.name ?? '').trim();
          if (entryName) names.add(entryName);
        });
      }
    });

    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
  }, [scopedReports]);

  // Filter reports by selected foreman and free-text search.
  const availableReports = useMemo(() => {
    const filteredReports = scopedReports.filter((report) => {
      const names = new Set<string>();
      const mainForeman = String(report.foreman ?? '').trim();
      if (mainForeman) names.add(mainForeman);
      if (Array.isArray(report.foremanEntries)) {
        report.foremanEntries.forEach((entry) => {
          const entryName = String(entry?.name ?? '').trim();
          if (entryName) names.add(entryName);
        });
      }

      const allNames = Array.from(names);
      if (selectedForeman !== 'all' && !allNames.includes(selectedForeman)) {
        return false;
      }

      return true;
    });
    return filteredReports.slice(0, 10);
  }, [scopedReports, selectedForeman]);

  const handleReportSelect = (reportId: string) => {
    const report = availableReports.find(r => r.id === reportId);
    if (!report) {
      setSelectedReport(null);
      setEditedReport(null);
      return;
    }
    
    // Crear copia profunda del reporte
    const reportCopy = JSON.parse(JSON.stringify(report));
    
    // Maquinaria de alquiler ahora se gestiona desde Obras
    
    setSelectedReport(report);
    setEditedReport(reportCopy);
  };

  const updateWorkItemRate = (groupIndex: number, itemIndex: number, rate: number) => {
    if (!editedReport) return;
    
    const newReport = { ...editedReport };
    const item = newReport.workGroups[groupIndex].items[itemIndex];
    const validRate = isNaN(rate) || rate === null || rate === undefined ? 0 : rate;
    item.hourlyRate = validRate;
    item.total = item.hours * validRate;
    
    setEditedReport(newReport);
  };

  const updateMachineryItemRate = (groupIndex: number, itemIndex: number, rate: number) => {
    if (!editedReport) return;
    
    const newReport = { ...editedReport };
    const item = newReport.machineryGroups[groupIndex].items[itemIndex];
    const validRate = isNaN(rate) || rate === null || rate === undefined ? 0 : rate;
    item.hourlyRate = validRate;
    item.total = item.hours * validRate;
    
    setEditedReport(newReport);
  };

  const updateSubcontractItemRate = (groupIndex: number, itemIndex: number, rate: number) => {
    if (!editedReport) return;
    
    const newReport = { ...editedReport };
    const item = newReport.subcontractGroups[groupIndex].items[itemIndex];
    
    const unitType = item.unitType || 'hora';
    if (unitType === 'hora') {
      item.hourlyRate = rate;
      item.total = item.workers * item.hours * rate;
    } else {
      item.unitPrice = rate;
      item.total = (item.quantity || 0) * rate;
    }
    
    setEditedReport(newReport);
  };

  const updateMaterialItemPrice = (groupIndex: number, itemIndex: number, price: number) => {
    if (!editedReport) return;
    
    const newReport = { ...editedReport };
    const item = newReport.materialGroups[groupIndex].items[itemIndex];
    const validPrice = isNaN(price) || price === null || price === undefined ? 0 : price;
    item.unitPrice = validPrice;
    item.total = item.quantity * validPrice;
    
    setEditedReport(newReport);
  };

  // Función helper para calcular días entre fechas
  const calculateDaysBetween = (startDate: string, endDate?: string): number => {
    if (!startDate) return 0;
    
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    
    // Calcular diferencia en milisegundos y convertir a días
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays : 1; // Mínimo 1 día
  };

  const updateRentalMachineryItemRate = (groupIndex: number, itemIndex: number, dailyRate: number) => {
    // DESHABILITADO - La maquinaria de alquiler ahora se gestiona desde Obras
    return;
  };

  const handleEditItem = (type: 'work' | 'machinery' | 'material' | 'subcontract' | 'rental', groupIndex: number, itemIndex: number) => {
    if (!editedReport) return;
    
    let item;
    switch (type) {
      case 'work':
        item = editedReport.workGroups[groupIndex].items[itemIndex];
        break;
      case 'machinery':
        item = editedReport.machineryGroups[groupIndex].items[itemIndex];
        break;
      case 'material':
        item = editedReport.materialGroups[groupIndex].items[itemIndex];
        break;
      case 'subcontract':
        item = editedReport.subcontractGroups[groupIndex].items[itemIndex];
        break;
      case 'rental':
        return; // DESHABILITADO
    }
    
    setEditingItem({ type, groupIndex, itemIndex, item });
    setEditValues({ ...item });
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editedReport) return;

    const newReport = { ...editedReport };
    const { type, groupIndex, itemIndex } = editingItem;

    switch (type) {
      case 'work':
        newReport.workGroups[groupIndex].items[itemIndex] = {
          ...newReport.workGroups[groupIndex].items[itemIndex],
          ...editValues,
          total: (editValues.hours || 0) * (editValues.hourlyRate || 0)
        };
        break;
      case 'machinery':
        newReport.machineryGroups[groupIndex].items[itemIndex] = {
          ...newReport.machineryGroups[groupIndex].items[itemIndex],
          ...editValues,
          total: (editValues.hours || 0) * (editValues.hourlyRate || 0)
        };
        break;
      case 'material':
        newReport.materialGroups[groupIndex].items[itemIndex] = {
          ...newReport.materialGroups[groupIndex].items[itemIndex],
          ...editValues,
          total: (editValues.quantity || 0) * (editValues.unitPrice || 0)
        };
        break;
      case 'subcontract': {
        const unitType = editValues.unitType || 'hora';
        const total = unitType === 'hora'
          ? (editValues.workers || 0) * (editValues.hours || 0) * (editValues.hourlyRate || 0)
          : (editValues.quantity || 0) * (editValues.unitPrice || 0);
        newReport.subcontractGroups[groupIndex].items[itemIndex] = {
          ...newReport.subcontractGroups[groupIndex].items[itemIndex],
          ...editValues,
          total
        };
        break;
      }
      case 'rental':
        return; // DESHABILITADO
    }

    setEditedReport(newReport);
    setEditingItem(null);
    
    toast({
      title: "Elemento actualizado",
      description: "Los cambios se guardarán al presionar 'Guardar Precios'",
    });
  };

  const handleDeleteItem = async (type: 'work' | 'machinery' | 'material' | 'subcontract' | 'rental', groupIndex: number, itemIndex: number) => {
    if (!editedReport) return;

    const newReport = { ...editedReport };

    switch (type) {
      case 'work':
        newReport.workGroups[groupIndex].items.splice(itemIndex, 1);
        break;
      case 'machinery':
        newReport.machineryGroups[groupIndex].items.splice(itemIndex, 1);
        break;
      case 'material':
        newReport.materialGroups[groupIndex].items.splice(itemIndex, 1);
        break;
      case 'subcontract':
        newReport.subcontractGroups[groupIndex].items.splice(itemIndex, 1);
        break;
      case 'rental':
        return; // DESHABILITADO
    }

    setEditedReport(newReport);
    
    toast({
      title: "Elemento eliminado",
      description: "Los cambios se guardarán al presionar 'Guardar Precios'",
    });
  };

  const handleSave = async () => {
    if (!editedReport || !user) return;

    try {
      // Calculate total amount
      const totalAmount = calculateTotal();
      const tenantId = await getActiveTenantId(user);

      // Upsert saved economic report via API (handles check + insert/update)
      await upsertSavedEconomicReport({
        work_report_id: String(editedReport.id ?? '').trim(),
        work_name: String(editedReport.workName ?? '').trim(),
        work_number: String(editedReport.workNumber ?? '').trim(),
        date: String(editedReport.date ?? '').trim(),
        foreman: String(editedReport.foreman ?? '').trim(),
        site_manager: String(editedReport.siteManager ?? '').trim(),
        work_groups: editedReport.workGroups as any,
        machinery_groups: editedReport.machineryGroups as any,
        material_groups: editedReport.materialGroups as any,
        subcontract_groups: editedReport.subcontractGroups as any,
        total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
      }, tenantId);

      toast({
        title: "Precios guardados",
        description: "Los precios se han guardado correctamente en la lista de gestión económica.",
      });

      onReportUpdate();
      setSelectedReport(editedReport);

      // Navigate to saved economic reports tab
      if (onSaveSuccess) {
        setTimeout(() => {
          onSaveSuccess();
        }, 500);
      }
    } catch (error: any) {
      console.error('Error saving prices:', error);
      toast({
        title: "Error al guardar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const calculateTotal = () => {
    if (!editedReport) return 0;
    
    let total = 0;
    
    // Suma de mano de obra (work groups) - solo si hay precio
    editedReport.workGroups.forEach(group => {
      group.items.forEach(item => {
        const hourlyRate = Number(item.hourlyRate) || 0;
        const hours = Number(item.hours) || 0;
        if (hourlyRate > 0) {
          total += hours * hourlyRate;
        }
      });
    });
    
    // Suma de maquinaria (machinery groups) - solo si hay precio
    editedReport.machineryGroups.forEach(group => {
      group.items.forEach(item => {
        const hourlyRate = Number(item.hourlyRate) || 0;
        const hours = Number(item.hours) || 0;
        if (hourlyRate > 0) {
          total += hours * hourlyRate;
        }
      });
    });
    
    // Suma de materiales (material groups) - solo si hay precio
    editedReport.materialGroups.forEach(group => {
      group.items.forEach(item => {
        const unitPrice = Number(item.unitPrice) || 0;
        const quantity = Number(item.quantity) || 0;
        if (unitPrice > 0) {
          total += quantity * unitPrice;
        }
      });
    });
    
    // Suma de subcontratas (subcontract groups)
    editedReport.subcontractGroups.forEach(group => {
      group.items.forEach(item => {
        const unitType = item.unitType || 'hora';
        
        if (unitType === 'hora') {
          const hourlyRate = Number(item.hourlyRate) || 0;
          const workers = Number(item.workers) || 0;
          const hours = Number(item.hours) || 0;
          if (hourlyRate > 0) {
            total += workers * hours * hourlyRate;
          }
        } else {
          const unitPrice = Number(item.unitPrice) || 0;
          const quantity = Number(item.quantity) || 0;
          if (unitPrice > 0) {
            total += quantity * unitPrice;
          }
        }
      });
    });
    
    // Maquinaria de alquiler - DESHABILITADO (ahora se gestiona desde Obras)
    
    return total;
  };

  if (loading) {
    return <div>Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="app-page-title">Gestión económica de partes</CardTitle>
          <CardDescription className="app-page-subtitle">
            Asigna precios a las horas de trabajo, maquinaria y subcontratas de los partes creados por tus encargados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label className="app-field-label">Encargado</Label>
              <Popover open={foremanPopoverOpen} onOpenChange={setForemanPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={foremanPopoverOpen}
                    className="app-btn-soft w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {selectedForeman === 'all' ? 'Todos los encargados' : selectedForeman}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar encargado..." />
                    <CommandList>
                      <CommandEmpty>No se encontraron encargados.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="Todos los encargados"
                          onSelect={() => {
                            setSelectedForeman('all');
                            setSelectedReport(null);
                            setEditedReport(null);
                            setForemanPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedForeman === 'all' ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          Todos los encargados
                        </CommandItem>
                        {availableForemen.map((foremanName) => (
                          <CommandItem
                            key={foremanName}
                            value={foremanName}
                            onSelect={() => {
                              setSelectedForeman(foremanName);
                              setSelectedReport(null);
                              setEditedReport(null);
                              setForemanPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selectedForeman === foremanName ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            {foremanName}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="app-field-label">Seleccionar parte</Label>
              <Select onValueChange={handleReportSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un parte de trabajo" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {availableReports.map((report) => (
                    <SelectItem key={report.id} value={report.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{report.workName} - {report.date}</span>
                        {report.approved && <Badge variant="default" className="text-xs">Aprobado</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!loading && assignmentsError ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {assignmentsError} Mostrando partes disponibles como fallback.
              </div>
            ) : null}

            {!loading && !assignmentsError && !hasElevatedVisibility && assignedWorkIds.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                No tienes obras asignadas. Sin asignaciones no se pueden listar partes en gestion de precios.
              </div>
            ) : null}

            {!loading && !assignmentsError && !hasElevatedVisibility && assignedWorkIds.length > 0 && availableReports.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                No hay partes disponibles de tus obras asignadas para valorar.
              </div>
            ) : null}

            {editedReport && (
              <div className="space-y-6">
                <Separator />
                
                {/* Work Groups */}
                {editedReport.workGroups.length > 0 && editedReport.workGroups.map((group, groupIndex) => (
                  <div key={group.id} className="space-y-4">
                    <h3 className="text-lg font-semibold">Mano de Obra - {group.company}</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Actividad</TableHead>
                          <TableHead>Horas</TableHead>
                          <TableHead>Precio/Hora (€)</TableHead>
                          <TableHead>Total (€)</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.items.map((item, itemIndex) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>{item.activity}</TableCell>
                            <TableCell>{item.hours}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.hourlyRate || ''}
                                onChange={(e) => updateWorkItemRate(groupIndex, itemIndex, parseFloat(e.target.value) || 0)}
                                className="w-24"
                              />
                            </TableCell>
                            <TableCell>{item.total.toFixed(2)}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditItem('work', groupIndex, itemIndex)}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteItem('work', groupIndex, itemIndex)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}

                {/* Machinery Groups */}
                {editedReport.machineryGroups.length > 0 && editedReport.machineryGroups.map((group, groupIndex) => (
                  <div key={group.id} className="space-y-4">
                    <h3 className="text-lg font-semibold">Maquinaria - {group.company}</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Actividad</TableHead>
                          <TableHead>Horas</TableHead>
                          <TableHead>Precio/Hora (€)</TableHead>
                          <TableHead>Total (€)</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.items.map((item, itemIndex) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.type}</TableCell>
                            <TableCell>{item.activity}</TableCell>
                            <TableCell>{item.hours}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.hourlyRate || ''}
                                onChange={(e) => updateMachineryItemRate(groupIndex, itemIndex, parseFloat(e.target.value) || 0)}
                                className="w-24"
                              />
                            </TableCell>
                            <TableCell>{item.total.toFixed(2)}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditItem('machinery', groupIndex, itemIndex)}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteItem('machinery', groupIndex, itemIndex)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}

                {/* Material Groups */}
                {editedReport.materialGroups.length > 0 && editedReport.materialGroups.map((group, groupIndex) => (
                  <div key={group.id} className="space-y-4">
                    <h3 className="text-lg font-semibold">Materiales - {group.supplier}</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead>Cantidad</TableHead>
                          <TableHead>Unidad</TableHead>
                          <TableHead>Precio/Unidad (€)</TableHead>
                          <TableHead>Total (€)</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.items.map((item, itemIndex) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell>
                              {item.unitPrice === 0 ? (
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.unitPrice || ''}
                                  onChange={(e) => updateMaterialItemPrice(groupIndex, itemIndex, parseFloat(e.target.value) || 0)}
                                  className="w-24"
                                />
                              ) : (
                                <span>{item.unitPrice.toFixed(2)}</span>
                              )}
                            </TableCell>
                            <TableCell>{item.total.toFixed(2)}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditItem('material', groupIndex, itemIndex)}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteItem('material', groupIndex, itemIndex)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}

                {/* Subcontract Groups */}
                {editedReport.subcontractGroups.length > 0 && editedReport.subcontractGroups.map((group, groupIndex) => (
                  <div key={group.id} className="space-y-4">
                    <h3 className="text-lg font-semibold">Subcontratas - {group.company}</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Partida</TableHead>
                          <TableHead>Actividad</TableHead>
                          <TableHead>Unidad</TableHead>
                          <TableHead>Cantidad/Trabajadores</TableHead>
                          <TableHead>Horas</TableHead>
                          <TableHead>Precio/Unidad (€)</TableHead>
                          <TableHead>Total (€)</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.items.map((item, itemIndex) => {
                          const unitType = item.unitType || 'hora';
                          const isHourBased = unitType === 'hora';
                          const unitLabel = isHourBased ? 'Precio/Hora' : `Precio/${unitType}`;
                          const currentRate = isHourBased ? (item.hourlyRate || 0) : (item.unitPrice || 0);
                          
                          return (
                            <TableRow key={item.id}>
                              <TableCell>{item.contractedPart}</TableCell>
                              <TableCell>{item.activity}</TableCell>
                              <TableCell className="capitalize">{unitType === 'hora' ? 'Hora' : unitType}</TableCell>
                              <TableCell>
                                {isHourBased ? item.workers : (item.quantity || 0)}
                              </TableCell>
                              <TableCell>{isHourBased ? item.hours : '-'}</TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-muted-foreground">{unitLabel}</span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={currentRate || ''}
                                    onChange={(e) => updateSubcontractItemRate(groupIndex, itemIndex, parseFloat(e.target.value) || 0)}
                                    className="w-24"
                                  />
                                </div>
                              </TableCell>
                              <TableCell>{item.total.toFixed(2)}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleEditItem('subcontract', groupIndex, itemIndex)}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteItem('subcontract', groupIndex, itemIndex)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ))}

                {/* Maquinaria de Alquiler - DESHABILITADO (ahora se gestiona desde la pestaña Obras) */}


                <Separator />

                <div className="flex justify-between items-center">
                  <div className="text-xl font-bold">
                    Total del Parte: {calculateTotal().toFixed(2)} €
                  </div>
                  <Button onClick={handleSave} className="app-btn-primary">
                    Guardar Precios
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog para editar elementos */}
      {editingItem && (
        <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Elemento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {editingItem.type === 'work' && (
                <>
                  <div>
                    <Label>Nombre</Label>
                    <Input
                      value={editValues.name || ''}
                      onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Actividad</Label>
                    <Input
                      value={editValues.activity || ''}
                      onChange={(e) => setEditValues({ ...editValues, activity: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Horas</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.hours || ''}
                      onChange={(e) => setEditValues({ ...editValues, hours: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>Precio/Hora (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.hourlyRate || ''}
                      onChange={(e) => setEditValues({ ...editValues, hourlyRate: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </>
              )}

              {editingItem.type === 'machinery' && (
                <>
                  <div>
                    <Label>Tipo</Label>
                    <Input
                      value={editValues.type || ''}
                      onChange={(e) => setEditValues({ ...editValues, type: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Actividad</Label>
                    <Input
                      value={editValues.activity || ''}
                      onChange={(e) => setEditValues({ ...editValues, activity: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Horas</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.hours || ''}
                      onChange={(e) => setEditValues({ ...editValues, hours: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>Precio/Hora (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.hourlyRate || ''}
                      onChange={(e) => setEditValues({ ...editValues, hourlyRate: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </>
              )}

              {editingItem.type === 'material' && (
                <>
                  <div>
                    <Label>Material</Label>
                    <Input
                      value={editValues.name || ''}
                      onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Cantidad</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.quantity || ''}
                      onChange={(e) => setEditValues({ ...editValues, quantity: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>Unidad</Label>
                    <Input
                      value={editValues.unit || ''}
                      onChange={(e) => setEditValues({ ...editValues, unit: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Precio/Unidad (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.unitPrice || ''}
                      onChange={(e) => setEditValues({ ...editValues, unitPrice: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </>
              )}

              {editingItem.type === 'subcontract' && (
                <>
                  <div>
                    <Label>Partida</Label>
                    <Input
                      value={editValues.contractedPart || ''}
                      onChange={(e) => setEditValues({ ...editValues, contractedPart: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Actividad</Label>
                    <Input
                      value={editValues.activity || ''}
                      onChange={(e) => setEditValues({ ...editValues, activity: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Tipo de Unidad</Label>
                    <Select
                      value={editValues.unitType || 'hora'}
                      onValueChange={(value) => setEditValues({ ...editValues, unitType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hora">Hora</SelectItem>
                        <SelectItem value="m2">m²</SelectItem>
                        <SelectItem value="m3">m³</SelectItem>
                        <SelectItem value="ml">ml</SelectItem>
                        <SelectItem value="ud">Unidad</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(editValues.unitType || 'hora') === 'hora' ? (
                    <>
                      <div>
                        <Label>Trabajadores</Label>
                        <Input
                          type="number"
                          value={editValues.workers || ''}
                          onChange={(e) => setEditValues({ ...editValues, workers: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <Label>Horas</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={editValues.hours || ''}
                          onChange={(e) => setEditValues({ ...editValues, hours: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <Label>Precio/Hora (€)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={editValues.hourlyRate || ''}
                          onChange={(e) => setEditValues({ ...editValues, hourlyRate: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label>Cantidad</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={editValues.quantity || ''}
                          onChange={(e) => setEditValues({ ...editValues, quantity: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <Label>Precio/Unidad (€)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={editValues.unitPrice || ''}
                          onChange={(e) => setEditValues({ ...editValues, unitPrice: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              {editingItem.type === 'rental' && (
                <>
                  <div>
                    <Label>Tipo de Máquina</Label>
                    <Input
                      value={editValues.type || ''}
                      onChange={(e) => setEditValues({ ...editValues, type: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Proveedor</Label>
                    <Input
                      value={editValues.provider || ''}
                      onChange={(e) => setEditValues({ ...editValues, provider: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Nº Máquina</Label>
                    <Input
                      value={editValues.machineNumber || ''}
                      onChange={(e) => setEditValues({ ...editValues, machineNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Fecha de Entrega</Label>
                    <Input
                      type="date"
                      value={editValues.deliveryDate || ''}
                      onChange={(e) => setEditValues({ ...editValues, deliveryDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Fecha de Baja</Label>
                    <Input
                      type="date"
                      value={editValues.removalDate || ''}
                      onChange={(e) => setEditValues({ ...editValues, removalDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Precio/Día (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.dailyRate || ''}
                      onChange={(e) => setEditValues({ ...editValues, dailyRate: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleSaveEdit}>
                <Save className="h-4 w-4 mr-2" />
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
