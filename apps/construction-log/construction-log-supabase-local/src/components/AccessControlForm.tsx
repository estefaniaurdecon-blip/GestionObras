import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Users, Truck, Plus, Edit, Trash2, FileText } from 'lucide-react';
import { AccessReport, AccessEntry } from '@/types/accessControl';
import { generateAccessControlPDF } from '@/utils/accessControlPdfGenerator';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { SignaturePad } from './SignaturePad';
import { useAssignedWorks } from '@/hooks/useAssignedWorks';
import { storage } from '@/utils/storage';
import { CopyAccessControlDataDialog } from './CopyAccessControlDataDialog';

interface AccessControlFormProps {
  report?: AccessReport;
  allReports?: AccessReport[];
  onSave: (report: AccessReport) => Promise<void>;
  onBack: () => void;
  companyLogo?: string;
}

export const AccessControlForm = ({ report, allReports = [], onSave, onBack, companyLogo }: AccessControlFormProps) => {
  const { t } = useTranslation();
  const { organization } = useOrganization();
  const { works } = useAssignedWorks();
  const [formData, setFormData] = useState<Omit<AccessReport, 'id' | 'createdAt' | 'updatedAt'>>({
    date: new Date().toISOString().split('T')[0],
    siteName: '',
    workId: undefined,
    responsible: '',
    responsibleEntryTime: '',
    responsibleExitTime: '',
    observations: '',
    personalEntries: [],
    machineryEntries: [],
  });

  // Estado inicial para detectar cambios sin guardar
  const [initialFormData, setInitialFormData] = useState(formData);
  const [hasBeenSaved, setHasBeenSaved] = useState(false);

  // Detectar si hay cambios sin guardar
  const hasUnsavedChanges = !hasBeenSaved && (
    formData.siteName !== initialFormData.siteName ||
    formData.workId !== initialFormData.workId ||
    formData.responsible !== initialFormData.responsible ||
    formData.observations !== initialFormData.observations ||
    JSON.stringify(formData.personalEntries) !== JSON.stringify(initialFormData.personalEntries) ||
    JSON.stringify(formData.machineryEntries) !== JSON.stringify(initialFormData.machineryEntries)
  );

  // Hook para prevenir pérdida de datos
  useUnsavedChanges({ hasUnsavedChanges });

  const [editingPersonal, setEditingPersonal] = useState<AccessEntry | null>(null);
  const [editingMachinery, setEditingMachinery] = useState<AccessEntry | null>(null);
  const { toast } = useToast();

  // Cargar borrador guardado al montar el componente
  useEffect(() => {
    const loadDraft = async () => {
      if (report) {
        // Si estamos editando un reporte existente, cargar sus datos
        const reportData = {
          date: report.date,
          siteName: report.siteName,
          workId: report.workId,
          responsible: report.responsible,
          responsibleEntryTime: report.responsibleEntryTime || '',
          responsibleExitTime: report.responsibleExitTime || '',
          observations: report.observations,
          personalEntries: report.personalEntries,
          machineryEntries: report.machineryEntries,
        };
        setFormData(reportData);
        setInitialFormData(reportData);
        
        // Intentar cargar borrador específico del reporte si existe
        try {
          const draftKey = `access_control_draft_${report.id}`;
          const savedDraft = await storage.getItem(draftKey);
          if (savedDraft) {
            const draft = JSON.parse(savedDraft);
            console.log('[AccessControl] Borrador específico recuperado:', draft);
            setFormData(draft);
            toast({
              title: "Cambios no guardados recuperados",
              description: "Se han restaurado los cambios no guardados de este control.",
            });
          }
        } catch (error) {
          console.error('[AccessControl] Error loading specific draft:', error);
        }
      } else {
        // Si es un nuevo reporte, intentar cargar el borrador guardado
        try {
          const draftKey = 'access_control_draft';
          const savedDraft = await storage.getItem(draftKey);
          if (savedDraft) {
            const draft = JSON.parse(savedDraft);
            console.log('[AccessControl] Borrador recuperado:', draft);
            setFormData(draft);
            setInitialFormData(draft);
            toast({
              title: "Borrador recuperado",
              description: "Se han restaurado los datos no guardados del último control de accesos.",
            });
          }
        } catch (error) {
          console.error('[AccessControl] Error loading draft:', error);
        }
      }
    };
    loadDraft();
  }, [report, toast]);

  // Auto-seleccionar obra si solo hay una asignada
  useEffect(() => {
    if (!report && works.length === 1 && !formData.workId) {
      const work = works[0];
      setFormData(prev => ({
        ...prev,
        workId: work.id,
        siteName: `${work.number} - ${work.name}`
      }));
      setInitialFormData(prev => ({
        ...prev,
        workId: work.id,
        siteName: `${work.number} - ${work.name}`
      }));
    }
  }, [works, report, formData.workId]);

  // Autoguardar borrador local rápido (1 segundo)
  useEffect(() => {
    if (hasUnsavedChanges) {
      const saveDraft = async () => {
        try {
          const draftKey = report ? `access_control_draft_${report.id}` : 'access_control_draft';
          await storage.setItem(draftKey, JSON.stringify(formData));
          console.log('[AccessControl] Borrador local guardado');
        } catch (error) {
          console.error('[AccessControl] Error saving local draft:', error);
        }
      };
      
      const timeoutId = setTimeout(saveDraft, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [formData, report, hasUnsavedChanges]);

  // Autoguardar en base de datos cada 30 segundos si hay datos mínimos
  useEffect(() => {
    const hasMinimumData = formData.siteName.trim() !== '' && formData.responsible.trim() !== '';
    
    if (hasMinimumData && hasUnsavedChanges) {
      const saveToDatabase = async () => {
        try {
          const accessReport: AccessReport = {
            id: report?.id || crypto.randomUUID(),
            ...formData,
            createdAt: report?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          
          console.log('[AccessControl] Autoguardando en base de datos...');
          await onSave(accessReport);
          
          // Actualizar estado inicial para marcar como guardado
          setInitialFormData(formData);
          setHasBeenSaved(true);
          
          // Limpiar borrador local tras guardar en BD
          const draftKey = report ? `access_control_draft_${report.id}` : 'access_control_draft';
          await storage.removeItem(draftKey);
          console.log('[AccessControl] Autoguardado completado y borrador limpiado');
        } catch (error) {
          console.error('[AccessControl] Error en autoguardado:', error);
        }
      };
      
      // Autoguardar cada 30 segundos
      const intervalId = setInterval(saveToDatabase, 30000);
      return () => clearInterval(intervalId);
    }
  }, [formData, report, hasUnsavedChanges, onSave]);

  const handleSave = async () => {
    if (!formData.siteName.trim() || !formData.responsible.trim()) {
      toast({
        title: "Campos requeridos",
        description: "Por favor, completa el nombre de la obra y el responsable.",
        variant: "destructive",
      });
      return;
    }

    const accessReport: AccessReport = {
      id: report?.id || crypto.randomUUID(),
      ...formData,
      createdAt: report?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      // Guardar en base de datos
      await onSave(accessReport);
      
      // Marcar como guardado para resetear tracking de cambios
      setHasBeenSaved(true);
      setInitialFormData(formData);

      // Limpiar borrador después de guardar exitosamente
      const draftKey = report ? `access_control_draft_${report.id}` : 'access_control_draft';
      await storage.removeItem(draftKey);
      console.log('[AccessControl] Guardado manual completado y borrador limpiado');
      
      toast({
        title: "Guardado exitoso",
        description: "El control de acceso se ha guardado correctamente en la base de datos.",
      });
    } catch (error) {
      console.error('[AccessControl] Error al guardar:', error);
      toast({
        title: "Error al guardar",
        description: "No se pudo guardar el control de acceso. Se mantendrá el borrador local.",
        variant: "destructive",
      });
    }
  };

  const handleGeneratePDF = async () => {
    if (!formData.siteName.trim()) {
      toast({
        title: "Datos incompletos",
        description: "Necesitas al menos el nombre de la obra para generar el PDF.",
        variant: "destructive",
      });
      return;
    }

    const accessReport: AccessReport = {
      id: report?.id || crypto.randomUUID(),
      ...formData,
      createdAt: report?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const brandColor = organization?.brand_color || undefined;
      await generateAccessControlPDF(accessReport, companyLogo, brandColor);
      toast({
        title: "PDF generado",
        description: "El control de accesos se ha guardado correctamente.",
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error al generar PDF",
        description: "No se pudo generar el PDF del control de accesos.",
        variant: "destructive",
      });
    }
  };

  const addPersonalEntry = () => {
    const newEntry: AccessEntry = {
      id: crypto.randomUUID(),
      type: 'personal',
      name: '',
      identifier: '',
      company: '',
      entryTime: '08:00',
      exitTime: '18:00',
      activity: '',
    };
    setEditingPersonal(newEntry);
  };

  const addMachineryEntry = () => {
    const newEntry: AccessEntry = {
      id: crypto.randomUUID(),
      type: 'machinery',
      name: '',
      identifier: '',
      company: '',
      entryTime: '08:00',
      exitTime: '18:00',
      activity: '',
    };
    setEditingMachinery(newEntry);
  };

  const savePersonalEntry = (entry: AccessEntry) => {
    // Validar DNI único
    const isDniDuplicate = formData.personalEntries.some(
      e => e.id !== entry.id && e.identifier.trim() === entry.identifier.trim() && entry.identifier.trim() !== ''
    );
    
    if (isDniDuplicate) {
      toast({
        title: "DNI duplicado",
        description: "Ya existe una entrada con este DNI. Cada DNI debe ser único.",
        variant: "destructive",
      });
      return;
    }

    setFormData(prev => ({
      ...prev,
      personalEntries: editingPersonal?.id && prev.personalEntries.find(e => e.id === editingPersonal.id)
        ? prev.personalEntries.map(e => e.id === entry.id ? entry : e)
        : [...prev.personalEntries, entry]
    }));
    setEditingPersonal(null);
  };

  const saveMachineryEntry = (entry: AccessEntry) => {
    setFormData(prev => ({
      ...prev,
      machineryEntries: editingMachinery?.id && prev.machineryEntries.find(e => e.id === editingMachinery.id)
        ? prev.machineryEntries.map(e => e.id === entry.id ? entry : e)
        : [...prev.machineryEntries, entry]
    }));
    setEditingMachinery(null);
  };

  const deletePersonalEntry = (id: string) => {
    setFormData(prev => ({
      ...prev,
      personalEntries: prev.personalEntries.filter(e => e.id !== id)
    }));
  };

  const deleteMachineryEntry = (id: string) => {
    setFormData(prev => ({
      ...prev,
      machineryEntries: prev.machineryEntries.filter(e => e.id !== id)
    }));
  };

  // Handler para copiar datos de otro control de accesos
  const handleCopyData = (personalEntries: AccessEntry[], machineryEntries: AccessEntry[]) => {
    setFormData(prev => {
      // Filtrar duplicados de personal (por DNI)
      const newPersonalEntries = prev.personalEntries.filter(existing => {
        const isDuplicate = personalEntries.some(newEntry => {
          if (newEntry.identifier && newEntry.identifier.trim() !== '') {
            return existing.identifier?.toLowerCase().trim() === newEntry.identifier.toLowerCase().trim();
          }
          return existing.name.toLowerCase() === newEntry.name.toLowerCase() && 
                 existing.company.toLowerCase() === newEntry.company.toLowerCase();
        });
        return !isDuplicate;
      });

      // Filtrar duplicados de maquinaria (matrícula; si falta, nombre+operador)
      const newMachineryEntries = prev.machineryEntries.filter(existing => {
        const normText = (v?: string) => (v ?? '').toLowerCase().trim();
        const normPlate = (v?: string) => (v ?? '').toLowerCase().replace(/[\s-]/g, '').trim();

        const isDuplicate = machineryEntries.some(newEntry => {
          const newPlate = normPlate(newEntry.identifier);
          const existingPlate = normPlate(existing.identifier);

          // Si ambos tienen matrícula, es el criterio principal
          if (newPlate && existingPlate) {
            return existingPlate === newPlate;
          }

          // Si falta matrícula en alguno, usar nombre + operador
          return normText(existing.name) === normText(newEntry.name) &&
            normText(existing.operator) === normText(newEntry.operator);
        });

        return !isDuplicate;
      });

      return {
        ...prev,
        personalEntries: [...newPersonalEntries, ...personalEntries],
        machineryEntries: [...newMachineryEntries, ...machineryEntries],
      };
    });
    
    toast({
      title: "Datos copiados",
      description: `Se han copiado ${personalEntries.length} registros de personal y ${machineryEntries.length} de maquinaria.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-center">
          {report ? t('common.edit') + ' ' + t('accessControl.title') : t('accessControl.newReport')}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground text-center">
          {t('accessControl.title')}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto flex-wrap justify-center">
          <Button variant="outline" onClick={onBack} size="sm" className="w-full sm:w-auto">
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span>{t('common.back')}</span>
          </Button>
          <CopyAccessControlDataDialog
            reports={allReports}
            currentReportId={report?.id}
            currentPersonalEntries={formData.personalEntries}
            currentMachineryEntries={formData.machineryEntries}
            onCopy={handleCopyData}
          />
          <Button variant="outline" onClick={handleGeneratePDF} size="sm" className="w-full sm:w-auto">
            <FileText className="h-4 w-4 mr-2" />
            <span>{t('workReports.downloadPDF')}</span>
          </Button>
          <Button onClick={handleSave} className="btn-gradient w-full sm:w-auto" size="sm">
            <Save className="h-4 w-4 mr-2" />
            <span>{t('common.save')}</span>
          </Button>
        </div>
      </div>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-lg sm:text-xl">{t('app.description')}</CardTitle>
          <CardDescription className="text-center">{t('app.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">{t('common.date')}</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workId">Obra Asignada *</Label>
              <Select
                value={formData.workId || ''}
                onValueChange={(value) => {
                  const selectedWork = works.find(w => w.id === value);
                  setFormData(prev => ({ 
                    ...prev, 
                    workId: value,
                    siteName: selectedWork ? `${selectedWork.number} - ${selectedWork.name}` : prev.siteName
                  }));
                }}
              >
                <SelectTrigger id="workId">
                  <SelectValue placeholder="Selecciona una obra" />
                </SelectTrigger>
                <SelectContent>
                  {works.map((work) => (
                    <SelectItem key={work.id} value={work.id}>
                      {work.number} - {work.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="siteName">{t('accessControl.siteName')} *</Label>
              <Input
                id="siteName"
                value={formData.siteName}
                onChange={(e) => setFormData(prev => ({ ...prev, siteName: e.target.value }))}
                placeholder={t('accessControl.siteName')}
                disabled={!!formData.workId}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="responsible">{t('accessControl.responsible')} *</Label>
              <Input
                id="responsible"
                value={formData.responsible}
                onChange={(e) => setFormData(prev => ({ ...prev, responsible: e.target.value }))}
                placeholder={t('accessControl.responsible')}
              />
            </div>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="responsibleEntryTime">Hora Entrada Encargado</Label>
              <Input
                id="responsibleEntryTime"
                type="time"
                value={formData.responsibleEntryTime || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, responsibleEntryTime: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="responsibleExitTime">Hora Salida Encargado</Label>
              <Input
                id="responsibleExitTime"
                type="time"
                value={formData.responsibleExitTime || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, responsibleExitTime: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col items-center gap-3">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Users className="h-5 w-5" />
              Personal
            </CardTitle>
            <CardDescription className="text-center">Registro de acceso del personal</CardDescription>
            <Button onClick={addPersonalEntry} size="sm" className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Añadir Personal
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {formData.personalEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay registros de personal. Haz clic en "Añadir Personal" para empezar.
            </div>
          ) : (
            <div className="space-y-2">
              {formData.personalEntries.map((entry) => {
                const isValid = entry.identifier.trim() !== '';
                const isDuplicate = formData.personalEntries.filter(e => e.identifier.trim() === entry.identifier.trim() && entry.identifier.trim() !== '').length > 1;
                
                return (
                  <div key={entry.id} className={`p-3 border rounded-lg ${!isValid || isDuplicate ? 'border-destructive bg-destructive/5' : ''}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="font-medium text-sm truncate">{entry.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.identifier || <span className="text-destructive">DNI no proporcionado</span>}
                          {isDuplicate && <span className="text-destructive ml-2">(DNI duplicado)</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{entry.company}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.entryTime}{entry.exitTime ? ` - ${entry.exitTime}` : ''}
                        </div>
                        {entry.activity && (
                          <div className="text-xs text-muted-foreground">{entry.activity}</div>
                        )}
                        {(!isValid || isDuplicate) && (
                          <div className="text-xs text-destructive font-medium">
                            ⚠️ No se contabilizará hasta completar datos correctamente
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 sm:flex-col">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingPersonal(entry)}
                          className="flex-1 sm:flex-none"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deletePersonalEntry(entry.id)}
                          className="flex-1 sm:flex-none"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Machinery Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col items-center gap-3">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Truck className="h-5 w-5" />
              Maquinaria
            </CardTitle>
            <CardDescription className="text-center">Registro de acceso de maquinaria</CardDescription>
            <Button onClick={addMachineryEntry} size="sm" className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Añadir Máquina
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {formData.machineryEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay registros de maquinaria. Haz clic en "Añadir Máquina" para empezar.
            </div>
          ) : (
            <div className="space-y-2">
              {formData.machineryEntries.map((entry) => {
                const isValid = entry.identifier.trim() !== '';
                
                return (
                  <div key={entry.id} className={`p-3 border rounded-lg ${!isValid ? 'border-destructive bg-destructive/5' : ''}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="font-medium text-sm truncate">{entry.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.identifier || <span className="text-destructive">Matrícula no proporcionada</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{entry.company}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.entryTime}{entry.exitTime ? ` - ${entry.exitTime}` : ''}
                        </div>
                        {entry.operator && (
                          <div className="text-xs text-muted-foreground">Operador: {entry.operator}</div>
                        )}
                        {entry.activity && (
                          <div className="text-xs text-muted-foreground">{entry.activity}</div>
                        )}
                        {!isValid && (
                          <div className="text-xs text-destructive font-medium">
                            ⚠️ No se contabilizará hasta completar la matrícula
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 sm:flex-col">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingMachinery(entry)}
                          className="flex-1 sm:flex-none"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteMachineryEntry(entry.id)}
                          className="flex-1 sm:flex-none"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Observations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-lg sm:text-xl">Observaciones</CardTitle>
          <CardDescription className="text-center">Notas adicionales sobre el control de accesos</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.observations}
            onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
            placeholder="Observaciones, incidencias o notas adicionales..."
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Entry Modals would go here - simplified for this implementation */}
      {editingPersonal && (
        <PersonalEntryForm
          entry={editingPersonal}
          onSave={savePersonalEntry}
          onCancel={() => setEditingPersonal(null)}
        />
      )}

      {editingMachinery && (
        <MachineryEntryForm
          entry={editingMachinery}
          onSave={saveMachineryEntry}
          onCancel={() => setEditingMachinery(null)}
        />
      )}
    </div>
  );
};

// Personal Entry Form Component
const PersonalEntryForm = ({ entry, onSave, onCancel }: {
  entry: AccessEntry;
  onSave: (entry: AccessEntry) => void;
  onCancel: () => void;
}) => {
  const { toast } = useToast();
  const [formEntry, setFormEntry] = useState(entry);

  const handleSave = () => {
    if (!formEntry.name.trim() || !formEntry.company.trim()) {
      toast({
        title: "Campos requeridos",
        description: "Nombre y empresa son obligatorios.",
        variant: "destructive",
      });
      return;
    }
    
    if (!formEntry.identifier.trim()) {
      toast({
        title: "DNI requerido",
        description: "El DNI es obligatorio para registrar al personal.",
        variant: "destructive",
      });
      return;
    }
    
    onSave(formEntry);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <Card className="bg-background p-4 rounded-lg max-w-md w-full my-auto">
        <h3 className="text-base font-semibold mb-3">Registro de Personal</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre *</Label>
            <Input
              className="h-8 text-sm"
              value={formEntry.name}
              onChange={(e) => setFormEntry(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Nombre completo"
            />
          </div>
          <div>
            <Label className="text-xs">DNI *</Label>
            <Input
              className="h-8 text-sm"
              value={formEntry.identifier}
              onChange={(e) => setFormEntry(prev => ({ ...prev, identifier: e.target.value }))}
              placeholder="DNI"
            />
          </div>
          <div>
            <Label className="text-xs">Empresa *</Label>
            <Input
              className="h-8 text-sm"
              value={formEntry.company}
              onChange={(e) => setFormEntry(prev => ({ ...prev, company: e.target.value }))}
              placeholder="Nombre de la empresa"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Hora Entrada</Label>
              <Input
                className="h-8 text-sm"
                type="time"
                value={formEntry.entryTime}
                onChange={(e) => setFormEntry(prev => ({ ...prev, entryTime: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Hora Salida (Est. 18:00)</Label>
              <Input
                className="h-8 text-sm"
                type="time"
                value={formEntry.exitTime || '18:00'}
                onChange={(e) => setFormEntry(prev => ({ ...prev, exitTime: e.target.value || undefined }))}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Actividad/Puesto</Label>
            <Input
              className="h-8 text-sm"
              value={formEntry.activity}
              onChange={(e) => setFormEntry(prev => ({ ...prev, activity: e.target.value }))}
              placeholder="Actividad o puesto de trabajo"
            />
          </div>
          
          {/* Firma Digital */}
          <div>
            <SignaturePad
              value={formEntry.signature}
              onChange={(signature) => setFormEntry(prev => ({ ...prev, signature }))}
              label="Firma"
            />
          </div>
          
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1 h-8 text-sm">Guardar</Button>
            <Button variant="outline" onClick={onCancel} className="flex-1 h-8 text-sm">Cancelar</Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

// Machinery Entry Form Component
const MachineryEntryForm = ({ entry, onSave, onCancel }: {
  entry: AccessEntry;
  onSave: (entry: AccessEntry) => void;
  onCancel: () => void;
}) => {
  const { toast } = useToast();
  const [formEntry, setFormEntry] = useState(entry);

  const handleSave = () => {
    if (!formEntry.name.trim() || !formEntry.company.trim()) {
      toast({
        title: "Campos requeridos",
        description: "Tipo de máquina y empresa son obligatorios.",
        variant: "destructive",
      });
      return;
    }
    
    if (!formEntry.identifier.trim()) {
      toast({
        title: "Matrícula requerida",
        description: "La matrícula o número de máquina es obligatorio.",
        variant: "destructive",
      });
      return;
    }
    
    onSave(formEntry);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <Card className="bg-background p-4 rounded-lg max-w-sm w-full my-auto">
        <h3 className="text-base font-semibold mb-3">Registro de Maquinaria</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Tipo de Máquina *</Label>
            <Input
              className="h-8 text-sm"
              value={formEntry.name}
              onChange={(e) => setFormEntry(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Excavadora, grúa, camión..."
            />
          </div>
          <div>
            <Label className="text-xs">Matrícula *</Label>
            <Input
              className="h-8 text-sm"
              value={formEntry.identifier}
              onChange={(e) => setFormEntry(prev => ({ ...prev, identifier: e.target.value }))}
              placeholder="Matrícula o identificación"
            />
          </div>
          <div>
            <Label className="text-xs">Empresa *</Label>
            <Input
              className="h-8 text-sm"
              value={formEntry.company}
              onChange={(e) => setFormEntry(prev => ({ ...prev, company: e.target.value }))}
              placeholder="Nombre de la empresa"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Hora Entrada</Label>
              <Input
                className="h-8 text-sm"
                type="time"
                value={formEntry.entryTime}
                onChange={(e) => setFormEntry(prev => ({ ...prev, entryTime: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Hora Salida (Est. 18:00)</Label>
              <Input
                className="h-8 text-sm"
                type="time"
                value={formEntry.exitTime || '18:00'}
                onChange={(e) => setFormEntry(prev => ({ ...prev, exitTime: e.target.value || undefined }))}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Operador</Label>
            <Input
              className="h-8 text-sm"
              value={formEntry.operator || ''}
              onChange={(e) => setFormEntry(prev => ({ ...prev, operator: e.target.value }))}
              placeholder="Nombre del operador"
            />
          </div>
          <div>
            <Label className="text-xs">Actividad</Label>
            <Input
              className="h-8 text-sm"
              value={formEntry.activity}
              onChange={(e) => setFormEntry(prev => ({ ...prev, activity: e.target.value }))}
              placeholder="Actividad realizada"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1 h-8 text-sm">Guardar</Button>
            <Button variant="outline" onClick={onCancel} className="flex-1 h-8 text-sm">Cancelar</Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
