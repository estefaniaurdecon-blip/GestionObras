import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Copy, Users, Truck, Calendar, Search, ChevronRight, CheckSquare, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { AccessReport, AccessEntry } from '@/types/accessControl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface CopyAccessControlDataDialogProps {
  reports: AccessReport[];
  currentReportId?: string;
  currentPersonalEntries?: AccessEntry[];
  currentMachineryEntries?: AccessEntry[];
  onCopy: (personalEntries: AccessEntry[], machineryEntries: AccessEntry[]) => void;
}

interface EntryTimeOverride {
  entryTime: string;
  exitTime: string;
}

export const CopyAccessControlDataDialog = ({
  reports,
  currentReportId,
  currentPersonalEntries = [],
  currentMachineryEntries = [],
  onCopy
}: CopyAccessControlDataDialogProps) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [step, setStep] = useState<'select-report' | 'select-entries' | 'confirm-replace'>('select-report');
  const [selectedPersonalIds, setSelectedPersonalIds] = useState<Set<string>>(new Set());
  const [selectedMachineryIds, setSelectedMachineryIds] = useState<Set<string>>(new Set());
  const [personalTimeOverrides, setPersonalTimeOverrides] = useState<Record<string, EntryTimeOverride>>({});
  const [machineryTimeOverrides, setMachineryTimeOverrides] = useState<Record<string, EntryTimeOverride>>({});

  // Filtrar reportes (excluir el actual y aplicar búsqueda)
  const filteredReports = reports
    .filter(r => r.id !== currentReportId)
    .filter(r => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        r.siteName.toLowerCase().includes(search) ||
        r.responsible.toLowerCase().includes(search) ||
        r.date.includes(search)
      );
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const selectedReport = reports.find(r => r.id === selectedReportId);

  // Verificar si una entrada ya existe en el control actual (por DNI/identificador)
  const isPersonalDuplicate = useCallback((entry: AccessEntry): boolean => {
    // Solo es duplicado si tiene el mismo DNI (identifier)
    if (entry.identifier && entry.identifier.trim() !== '') {
      return currentPersonalEntries.some(
        e => e.identifier && e.identifier.toLowerCase().trim() === entry.identifier.toLowerCase().trim()
      );
    }
    // Si no tiene DNI, comparar por nombre + empresa
    return currentPersonalEntries.some(
      e => e.name.toLowerCase() === entry.name.toLowerCase() && 
           e.company.toLowerCase() === entry.company.toLowerCase() &&
           (!e.identifier || e.identifier.trim() === '')
    );
  }, [currentPersonalEntries]);

  // Verificar si una maquinaria ya existe (por matrícula; si falta, por nombre+operador)
  const isMachineryDuplicate = useCallback((entry: AccessEntry): boolean => {
    const normText = (v?: string) => (v ?? '').toLowerCase().trim();
    const normPlate = (v?: string) => (v ?? '').toLowerCase().replace(/[\s-]/g, '').trim();

    return currentMachineryEntries.some(e => {
      const entryPlate = normPlate(entry.identifier);
      const existingPlate = normPlate(e.identifier);

      // Si ambos tienen matrícula, es el criterio principal
      if (entryPlate && existingPlate) {
        return entryPlate === existingPlate;
      }

      // Si falta matrícula en alguno, usar nombre + operador
      return normText(e.name) === normText(entry.name) &&
        normText(e.operator) === normText(entry.operator);
    });
  }, [currentMachineryEntries]);

  // Reset al cambiar de reporte
  useEffect(() => {
    if (selectedReport) {
      // Pre-seleccionar solo los que no son duplicados
      // Excluir maquinaria de alquiler (source === 'rental')
      const nonDuplicatePersonal = selectedReport.personalEntries
        .filter(e => !isPersonalDuplicate(e))
        .map(e => e.id);
      const nonDuplicateMachinery = selectedReport.machineryEntries
        .filter(e => e.source !== 'rental' && !isMachineryDuplicate(e))
        .map(e => e.id);
      
      setSelectedPersonalIds(new Set(nonDuplicatePersonal));
      setSelectedMachineryIds(new Set(nonDuplicateMachinery));

      // Inicializar overrides con los tiempos originales
      const personalOverrides: Record<string, EntryTimeOverride> = {};
      selectedReport.personalEntries.forEach(e => {
        personalOverrides[e.id] = {
          entryTime: e.entryTime || '08:00',
          exitTime: e.exitTime || ''
        };
      });
      setPersonalTimeOverrides(personalOverrides);

      const machineryOverrides: Record<string, EntryTimeOverride> = {};
      selectedReport.machineryEntries.forEach(e => {
        machineryOverrides[e.id] = {
          entryTime: e.entryTime || '08:00',
          exitTime: e.exitTime || ''
        };
      });
      setMachineryTimeOverrides(machineryOverrides);
    }
  }, [isMachineryDuplicate, isPersonalDuplicate, selectedReport, selectedReportId]);

  // Obtener duplicados seleccionados
  const getSelectedDuplicates = () => {
    if (!selectedReport) return { personal: [], machinery: [] };
    
    const personalDuplicates = selectedReport.personalEntries
      .filter(e => selectedPersonalIds.has(e.id) && isPersonalDuplicate(e));
    
    const machineryDuplicates = selectedReport.machineryEntries
      .filter(e => selectedMachineryIds.has(e.id) && isMachineryDuplicate(e));

    
    return { personal: personalDuplicates, machinery: machineryDuplicates };
  };

  const duplicatesSelected = getSelectedDuplicates();
  const hasDuplicates = duplicatesSelected.personal.length > 0 || duplicatesSelected.machinery.length > 0;

  const handleProceedToCopy = () => {
    if (hasDuplicates) {
      setStep('confirm-replace');
    } else {
      handleCopy();
    }
  };

  const handleCopy = () => {
    if (!selectedReport) return;

    const personalEntries = selectedReport.personalEntries
      .filter(e => selectedPersonalIds.has(e.id))
      .map(e => ({
        ...e,
        id: crypto.randomUUID(),
        entryTime: personalTimeOverrides[e.id]?.entryTime || e.entryTime,
        exitTime: personalTimeOverrides[e.id]?.exitTime || e.exitTime
      }));

    const machineryEntries = selectedReport.machineryEntries
      .filter(e => selectedMachineryIds.has(e.id))
      .map(e => ({
        ...e,
        id: crypto.randomUUID(),
        entryTime: machineryTimeOverrides[e.id]?.entryTime || e.entryTime,
        exitTime: machineryTimeOverrides[e.id]?.exitTime || e.exitTime
      }));

    onCopy(personalEntries, machineryEntries);
    handleClose();
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedReportId(null);
    setSearchTerm('');
    setStep('select-report');
    setSelectedPersonalIds(new Set());
    setSelectedMachineryIds(new Set());
    setPersonalTimeOverrides({});
    setMachineryTimeOverrides({});
  };

  const handleSelectReport = () => {
    if (selectedReportId) {
      setStep('select-entries');
    }
  };

  const togglePersonal = (id: string) => {
    setSelectedPersonalIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleMachinery = (id: string) => {
    // No permitir seleccionar maquinaria de alquiler
    const entry = selectedReport?.machineryEntries.find(e => e.id === id);
    if (entry?.source === 'rental') return;
    
    setSelectedMachineryIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAllPersonal = () => {
    if (selectedReport) {
      const allIds = selectedReport.personalEntries.map(e => e.id);
      setSelectedPersonalIds(new Set(allIds));
    }
  };

  const selectAllMachinery = () => {
    if (selectedReport) {
      // Excluir maquinaria de alquiler
      const allIds = selectedReport.machineryEntries
        .filter(e => e.source !== 'rental')
        .map(e => e.id);
      setSelectedMachineryIds(new Set(allIds));
    }
  };

  const updatePersonalTime = (id: string, field: 'entryTime' | 'exitTime', value: string) => {
    setPersonalTimeOverrides(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const updateMachineryTime = (id: string, field: 'entryTime' | 'exitTime', value: string) => {
    setMachineryTimeOverrides(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "d 'de' MMMM yyyy", { locale: es });
    } catch {
      return dateStr;
    }
  };

  const totalSelected = selectedPersonalIds.size + selectedMachineryIds.size;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-10 w-full border-slate-200 bg-slate-50 px-4 text-[15px] font-medium text-slate-700 shadow-none hover:bg-slate-100 hover:text-slate-900 sm:h-11 sm:w-auto sm:text-base"
        >
          <Copy className="h-4 w-4 mr-2" />
          Copiar de otro control
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'confirm-replace' ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <Copy className="h-5 w-5" />
            )}
            {step === 'select-report' && 'Copiar datos de otro control'}
            {step === 'select-entries' && 'Seleccionar datos a copiar'}
            {step === 'confirm-replace' && 'Confirmar reemplazo'}
          </DialogTitle>
          <DialogDescription>
            {step === 'select-report' && 'Selecciona un control de accesos para copiar sus datos'}
            {step === 'select-entries' && `Selecciona los registros y ajusta las horas de "${selectedReport?.siteName}"`}
            {step === 'confirm-replace' && 'Los siguientes registros serán reemplazados por los nuevos datos'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select-report' ? (
          <div className="space-y-4">
            {/* Búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por obra, responsable o fecha..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Lista de reportes */}
            <ScrollArea className="h-[250px] border rounded-lg p-2">
              {filteredReports.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No hay otros controles de acceso disponibles
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredReports.map((report) => (
                    <div
                      key={report.id}
                      onClick={() => setSelectedReportId(report.id)}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedReportId === report.id 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">
                            {report.siteName}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {formatDate(report.date)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Responsable: {report.responsible}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Badge variant="secondary" className="text-xs">
                            <Users className="h-3 w-3 mr-1" />
                            {report.personalEntries.length}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            <Truck className="h-3 w-3 mr-1" />
                            {report.machineryEntries.length}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Footer */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={handleSelectReport}
                disabled={!selectedReportId}
                className="flex-1"
              >
                Continuar
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="personal" className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Personal ({selectedPersonalIds.size}/{selectedReport?.personalEntries.length || 0})
                </TabsTrigger>
                <TabsTrigger value="machinery" className="flex items-center gap-1">
                  <Truck className="h-4 w-4" />
                  Maquinaria ({selectedMachineryIds.size}/{selectedReport?.machineryEntries.length || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="mt-4">
                {selectedReport && selectedReport.personalEntries.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs text-muted-foreground">
                        Selecciona el personal y ajusta las horas
                      </Label>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={selectAllPersonal}
                        className="text-xs h-7"
                      >
                        <CheckSquare className="h-3 w-3 mr-1" />
                        Seleccionar disponibles
                      </Button>
                    </div>
                    <ScrollArea className="h-[280px] border rounded-lg p-2">
                      <div className="space-y-2">
                        {selectedReport.personalEntries.map((entry) => {
                          const isDuplicate = isPersonalDuplicate(entry);
                          const isSelected = selectedPersonalIds.has(entry.id);
                          return (
                            <div
                              key={entry.id}
                              className={`p-3 rounded-lg border ${
                                isSelected
                                  ? 'border-primary bg-primary/5'
                                  : 'hover:bg-muted/30'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => togglePersonal(entry.id)}
                                  className="mt-1"
                                />
                                <div className="flex-1 min-w-0 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <div className="text-sm font-medium truncate">{entry.name}</div>
                                      <div className="text-xs text-muted-foreground truncate">
                                        DNI: {entry.identifier || 'Sin DNI'}
                                      </div>
                                    </div>
                                    {isDuplicate ? (
                                      <Badge variant="secondary" className="text-xs shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                                        Reemplazará
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-xs shrink-0 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                        Nueva
                                      </Badge>
                                    )}
                                  </div>
                                  {isSelected && (
                                    <div className="flex items-center gap-2 pt-1">
                                      <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="time"
                                          value={personalTimeOverrides[entry.id]?.entryTime || ''}
                                          onChange={(e) => updatePersonalTime(entry.id, 'entryTime', e.target.value)}
                                          className="h-7 w-24 text-xs"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <span className="text-xs text-muted-foreground">-</span>
                                        <Input
                                          type="time"
                                          value={personalTimeOverrides[entry.id]?.exitTime || ''}
                                          onChange={(e) => updatePersonalTime(entry.id, 'exitTime', e.target.value)}
                                          className="h-7 w-24 text-xs"
                                          onClick={(e) => e.stopPropagation()}
                                          placeholder="Salida"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No hay personal en este control
                  </div>
                )}
              </TabsContent>

              <TabsContent value="machinery" className="mt-4">
                {selectedReport && selectedReport.machineryEntries.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs text-muted-foreground">
                        Selecciona la maquinaria y ajusta las horas
                      </Label>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={selectAllMachinery}
                        className="text-xs h-7"
                      >
                        <CheckSquare className="h-3 w-3 mr-1" />
                        Seleccionar disponibles
                      </Button>
                    </div>
                    <ScrollArea className="h-[280px] border rounded-lg p-2">
                      <div className="space-y-2">
                        {selectedReport.machineryEntries.map((entry) => {
                          const isDuplicate = isMachineryDuplicate(entry);
                          const isSelected = selectedMachineryIds.has(entry.id);
                          const isRental = entry.source === 'rental';
                          return (
                            <div
                              key={entry.id}
                              className={`p-3 rounded-lg border ${
                                isRental
                                  ? 'opacity-50 bg-muted/20 cursor-not-allowed'
                                  : isSelected
                                    ? 'border-primary bg-primary/5'
                                    : 'hover:bg-muted/30'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleMachinery(entry.id)}
                                  className="mt-1"
                                  disabled={isRental}
                                />
                                <div className="flex-1 min-w-0 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <div className="text-sm font-medium truncate">{entry.name}</div>
                                      <div className="text-xs text-muted-foreground truncate">
                                        Operador: {entry.operator || 'Sin operador'} • Matrícula: {entry.identifier || 'Sin matrícula'}
                                      </div>
                                    </div>
                                    {isRental ? (
                                      <Badge variant="secondary" className="text-xs shrink-0 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                        Alquiler
                                      </Badge>
                                    ) : isDuplicate ? (
                                      <Badge variant="secondary" className="text-xs shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                                        Reemplazará
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-xs shrink-0 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                        Nueva
                                      </Badge>
                                    )}
                                  </div>
                                  {isSelected && (
                                    <div className="flex items-center gap-2 pt-1">
                                      <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="time"
                                          value={machineryTimeOverrides[entry.id]?.entryTime || ''}
                                          onChange={(e) => updateMachineryTime(entry.id, 'entryTime', e.target.value)}
                                          className="h-7 w-24 text-xs"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <span className="text-xs text-muted-foreground">-</span>
                                        <Input
                                          type="time"
                                          value={machineryTimeOverrides[entry.id]?.exitTime || ''}
                                          onChange={(e) => updateMachineryTime(entry.id, 'exitTime', e.target.value)}
                                          className="h-7 w-24 text-xs"
                                          onClick={(e) => e.stopPropagation()}
                                          placeholder="Salida"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No hay maquinaria en este control
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Footer */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('select-report')} className="flex-1">
                Volver
              </Button>
              <Button
                onClick={handleProceedToCopy}
                disabled={totalSelected === 0}
                className="flex-1"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar ({totalSelected})
              </Button>
            </div>
          </div>
        )}

        {step === 'confirm-replace' && (
          <div className="space-y-4">
            <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-200">
                Se reemplazarán {duplicatesSelected.personal.length + duplicatesSelected.machinery.length} registros existentes
              </AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                Los datos actuales de estos registros serán sustituidos por los nuevos.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              {duplicatesSelected.personal.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Personal a reemplazar ({duplicatesSelected.personal.length})
                  </Label>
                  <div className="border rounded-lg p-2 space-y-1 bg-muted/30">
                    {duplicatesSelected.personal.map(entry => (
                      <div key={entry.id} className="text-sm py-1 px-2 rounded bg-background">
                        <span className="font-medium">{entry.name}</span>
                        <span className="text-muted-foreground ml-2">DNI: {entry.identifier || 'Sin DNI'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {duplicatesSelected.machinery.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Maquinaria a reemplazar ({duplicatesSelected.machinery.length})
                  </Label>
                  <div className="border rounded-lg p-2 space-y-1 bg-muted/30">
                    {duplicatesSelected.machinery.map(entry => (
                      <div key={entry.id} className="text-sm py-1 px-2 rounded bg-background">
                        <span className="font-medium">{entry.name}</span>
                        <span className="text-muted-foreground ml-2">Matrícula: {entry.identifier || 'Sin matrícula'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('select-entries')} className="flex-1">
                Volver
              </Button>
              <Button
                onClick={handleCopy}
                variant="destructive"
                className="flex-1 bg-amber-600 hover:bg-amber-700"
              >
                <Copy className="h-4 w-4 mr-2" />
                Confirmar y reemplazar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
