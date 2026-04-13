import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import {
  listManagedUserAssignments,
  upsertSavedEconomicReport,
} from '@/integrations/api/client';
import { getActiveTenantId } from '@/offline-db/tenantScope';
import { cn } from '@/lib/utils';
import type { WorkReport } from '@/types/workReport';
import { toast } from '@/hooks/use-toast';
import { EconomicItemEditDialog } from './economic-management/EconomicItemEditDialog';
import { EconomicReportGroups } from './economic-management/EconomicReportGroups';
import type { EconomicEditValues, EditingEconomicItem, EconomicItemType } from './economic-management/types';
import {
  applyEconomicItemEdits,
  buildSavedEconomicPayload,
  calculateEconomicReportTotal,
  deleteEconomicItem,
  duplicateWorkReport,
  getReportForemanNames,
  startEditingEconomicItem,
  updateEconomicItemRate,
} from './economic-management/utils';

interface EconomicManagementProps {
  reports: WorkReport[];
  onReportUpdate: () => void;
  onSaveSuccess?: () => void;
}

export const EconomicManagement = ({ reports, onReportUpdate, onSaveSuccess }: EconomicManagementProps) => {
  const { user } = useAuth();
  const [editedReport, setEditedReport] = useState<WorkReport | null>(null);
  const [assignedWorkIds, setAssignedWorkIds] = useState<string[]>([]);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [selectedForeman, setSelectedForeman] = useState('all');
  const [foremanPopoverOpen, setForemanPopoverOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<EditingEconomicItem | null>(null);
  const [editValues, setEditValues] = useState<EconomicEditValues>({});

  // Temporary policy: all roles can operate with full visibility in economic management.
  const hasElevatedVisibility = true;

  useEffect(() => {
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

    void loadAssignedWorks();
  }, [hasElevatedVisibility, user]);

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

    return orderedEligibleReports.filter((report) => {
      const reportWorkId = String(report.workId ?? '').trim();
      if (!reportWorkId) return true;
      return assignedWorkIds.includes(reportWorkId);
    });
  }, [assignedWorkIds, assignmentsError, hasElevatedVisibility, reports]);

  const availableForemen = useMemo(
    () =>
      Array.from(new Set(scopedReports.flatMap((report) => getReportForemanNames(report)))).sort((left, right) =>
        left.localeCompare(right, 'es'),
      ),
    [scopedReports],
  );

  const availableReports = useMemo(() => {
    const filteredReports = scopedReports.filter((report) => {
      if (selectedForeman === 'all') return true;
      return getReportForemanNames(report).includes(selectedForeman);
    });

    return filteredReports.slice(0, 10);
  }, [scopedReports, selectedForeman]);

  const totalAmount = useMemo(
    () => (editedReport ? calculateEconomicReportTotal(editedReport) : 0),
    [editedReport],
  );

  const resetSelection = () => {
    setEditedReport(null);
  };

  const handleReportSelect = (reportId: string) => {
    const report = availableReports.find((candidate) => candidate.id === reportId);
    if (!report) {
      resetSelection();
      return;
    }

    setEditedReport(duplicateWorkReport(report));
  };

  const handleRateChange = (type: EconomicItemType, groupIndex: number, itemIndex: number, value: number) => {
    setEditedReport((current) => {
      if (!current) return current;
      return updateEconomicItemRate(current, type, groupIndex, itemIndex, value);
    });
  };

  const handleEditItem = (type: EconomicItemType, groupIndex: number, itemIndex: number) => {
    if (!editedReport) return;

    const nextState = startEditingEconomicItem(editedReport, type, groupIndex, itemIndex);
    setEditingItem(nextState.editingItem);
    setEditValues(nextState.editValues);
  };

  const handleSaveEdit = () => {
    if (!editingItem || !editedReport) return;

    setEditedReport(applyEconomicItemEdits(editedReport, editingItem, editValues));
    setEditingItem(null);

    toast({
      title: 'Elemento actualizado',
      description: "Los cambios se guardaran al presionar 'Guardar Precios'",
    });
  };

  const handleDeleteItem = (type: EconomicItemType, groupIndex: number, itemIndex: number) => {
    if (!editedReport) return;

    setEditedReport(deleteEconomicItem(editedReport, type, groupIndex, itemIndex));
    toast({
      title: 'Elemento eliminado',
      description: "Los cambios se guardaran al presionar 'Guardar Precios'",
    });
  };

  const handleSave = async () => {
    if (!editedReport || !user) return;

    try {
      const tenantId = await getActiveTenantId(user);
      await upsertSavedEconomicReport(buildSavedEconomicPayload(editedReport, totalAmount), tenantId);

      toast({
        title: 'Precios guardados',
        description: 'Los precios se han guardado correctamente en la lista de gestion economica.',
      });

      onReportUpdate();

      if (onSaveSuccess) {
        setTimeout(() => {
          onSaveSuccess();
        }, 500);
      }
    } catch (error) {
      console.error('Error saving prices:', error);
      const message = error instanceof Error ? error.message : 'No se pudieron guardar los precios.';
      toast({
        title: 'Error al guardar',
        description: message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return <div>Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="app-page-title">Gestion economica de partes</CardTitle>
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
                            resetSelection();
                            setForemanPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn('mr-2 h-4 w-4', selectedForeman === 'all' ? 'opacity-100' : 'opacity-0')}
                          />
                          Todos los encargados
                        </CommandItem>
                        {availableForemen.map((foremanName) => (
                          <CommandItem
                            key={foremanName}
                            value={foremanName}
                            onSelect={() => {
                              setSelectedForeman(foremanName);
                              resetSelection();
                              setForemanPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selectedForeman === foremanName ? 'opacity-100' : 'opacity-0',
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
                        <span className="truncate">
                          {report.workName} - {report.date}
                        </span>
                        {report.approved ? (
                          <Badge variant="default" className="text-xs">
                            Aprobado
                          </Badge>
                        ) : null}
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

            {editedReport ? (
              <div className="space-y-6">
                <Separator />

                <EconomicReportGroups
                  report={editedReport}
                  onRateChange={handleRateChange}
                  onEditItem={handleEditItem}
                  onDeleteItem={handleDeleteItem}
                />

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="text-xl font-bold">Total del Parte: {totalAmount.toFixed(2)} EUR</div>
                  <Button onClick={handleSave} className="app-btn-primary">
                    Guardar Precios
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <EconomicItemEditDialog
        editingItem={editingItem}
        editValues={editValues}
        onEditValuesChange={setEditValues}
        onSave={handleSaveEdit}
        onOpenChange={(open) => {
          if (!open) {
            setEditingItem(null);
          }
        }}
      />
    </div>
  );
};
