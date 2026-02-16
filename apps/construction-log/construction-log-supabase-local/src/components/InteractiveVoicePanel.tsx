import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mic, MicOff, X, Check, ChevronRight, ChevronLeft, Plus, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { enhancedToast } from './ui/enhanced-toast';
import { useVoiceHighlight } from '@/contexts/VoiceHighlightContext';

type SectionType = 'work_groups' | 'machinery_groups' | 'subcontract_groups' | 'observations';
type VoiceFieldType = 'company' | 'name' | 'activity' | 'hours' | 'concept' | 'quantity' | 'unit';

interface FieldConfig {
  field: VoiceFieldType;
  label: string;
  voiceCommands: string[];
}

const workGroupsFields: FieldConfig[] = [
  { field: 'company', label: 'Empresa', voiceCommands: ['empresa', 'compañía'] },
  { field: 'name', label: 'Nombre', voiceCommands: ['nombre', 'trabajador'] },
  { field: 'activity', label: 'Actividad', voiceCommands: ['actividad', 'tarea'] },
  { field: 'hours', label: 'Horas', voiceCommands: ['horas', 'hora'] },
];

const machineryGroupsFields: FieldConfig[] = [
  { field: 'company', label: 'Empresa', voiceCommands: ['empresa', 'compañía'] },
  { field: 'name', label: 'Tipo', voiceCommands: ['tipo', 'máquina', 'nombre'] },
  { field: 'activity', label: 'Actividad', voiceCommands: ['actividad', 'tarea'] },
  { field: 'hours', label: 'Horas', voiceCommands: ['horas', 'hora'] },
];

const subcontractGroupsFields: FieldConfig[] = [
  { field: 'company', label: 'Empresa', voiceCommands: ['empresa', 'subcontrata'] },
  { field: 'concept', label: 'Concepto', voiceCommands: ['concepto', 'descripción'] },
  { field: 'quantity', label: 'Cantidad', voiceCommands: ['cantidad', 'número'] },
  { field: 'unit', label: 'Unidad', voiceCommands: ['unidad', 'medida'] },
];

// Tipos para Web Speech API (extendiendo desde useInteractiveVoice)
interface SpeechRecognitionEventLocal extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInterfaceLocal extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLocal) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface InteractiveVoicePanelProps {
  sectionType: SectionType;
  onClose: () => void;
  onFieldUpdate: (groupIndex: number, rowIndex: number, field: string, value: string) => void;
  onAddGroup: () => number; // Retorna el índice del nuevo grupo
  onAddRow: (groupIndex: number) => void;
  groupsCount: number;
  getRowsCount: (groupIndex: number) => number;
  getFieldValue: (groupIndex: number, rowIndex: number, field: string) => string;
}

export const InteractiveVoicePanel = ({
  sectionType,
  onClose,
  onFieldUpdate,
  onAddGroup,
  onAddRow,
  groupsCount,
  getRowsCount,
  getFieldValue,
}: InteractiveVoicePanelProps) => {
  const { setHighlight, clearHighlight } = useVoiceHighlight();
  
  const [mode, setMode] = useState<'initial' | 'editing'>('initial');
  const [isListening, setIsListening] = useState(false);
  const [activeField, setActiveField] = useState<VoiceFieldType | null>(null);
  const [currentText, setCurrentText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [currentGroupIndex, setCurrentGroupIndex] = useState(groupsCount > 0 ? groupsCount - 1 : -1);
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  
  const recognitionRef = useRef<SpeechRecognitionInterfaceLocal | null>(null);
  const isListeningRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sincronizar highlight con el estado actual
  useEffect(() => {
    if (mode === 'editing' && activeField && currentGroupIndex >= 0) {
      setHighlight(sectionType, currentGroupIndex, currentRowIndex, activeField);
    } else {
      clearHighlight();
    }
  }, [mode, activeField, currentGroupIndex, currentRowIndex, sectionType, setHighlight, clearHighlight]);

  // Limpiar highlight al desmontar
  useEffect(() => {
    return () => {
      clearHighlight();
    };
  }, [clearHighlight]);

  // Obtener campos según sección
  const fieldsConfig = sectionType === 'work_groups' 
    ? workGroupsFields 
    : sectionType === 'machinery_groups'
      ? machineryGroupsFields
      : subcontractGroupsFields;

  // Detectar comando de campo en el texto
  const detectFieldCommand = useCallback((text: string): { field: VoiceFieldType; value: string } | null => {
    const lowerText = text.toLowerCase().trim();
    
    for (const fieldConfig of fieldsConfig) {
      for (const command of fieldConfig.voiceCommands) {
        // Patrón: "empresa [valor]" o solo "empresa"
        if (lowerText.startsWith(command + ' ') || lowerText === command) {
          const value = lowerText.startsWith(command + ' ') 
            ? text.slice(command.length + 1).trim()
            : '';
          return { field: fieldConfig.field, value };
        }
      }
    }
    return null;
  }, [fieldsConfig]);

  // Detectar comandos de acción
  const detectActionCommand = useCallback((text: string): string | null => {
    const lowerText = text.toLowerCase().trim();
    
    const commands: Record<string, string[]> = {
      newGroup: ['nuevo grupo', 'añadir grupo', 'nueva empresa'],
      newRow: ['nueva fila', 'añadir fila', 'nuevo trabajador', 'añadir trabajador'],
      nextRow: ['siguiente fila', 'siguiente'],
      prevRow: ['anterior fila', 'anterior'],
      accept: ['aceptar', 'confirmar', 'listo', 'vale', 'ok'],
    };
    
    for (const [action, commandList] of Object.entries(commands)) {
      for (const cmd of commandList) {
        if (lowerText.startsWith(cmd)) {
          return action;
        }
      }
    }
    return null;
  }, []);

  // Guardar el valor actual del campo
  const saveCurrentField = useCallback(() => {
    if (activeField && currentText.trim() && currentGroupIndex >= 0) {
      console.log('[VoicePanel] Saving field:', { groupIndex: currentGroupIndex, rowIndex: currentRowIndex, field: activeField, value: currentText.trim() });
      onFieldUpdate(currentGroupIndex, currentRowIndex, activeField, currentText.trim());
    }
  }, [activeField, currentText, currentGroupIndex, currentRowIndex, onFieldUpdate]);

  // Procesar texto reconocido
  const processText = useCallback((text: string, isFinal: boolean) => {
    if (!text.trim()) return;
    
    console.log('[VoicePanel] Processing text:', { text, isFinal, mode, activeField, currentGroupIndex, currentRowIndex });
    
    // En modo inicial, detectar comando de inicio
    if (mode === 'initial') {
      const actionCmd = detectActionCommand(text);
      if (actionCmd === 'newGroup' && isFinal) {
        console.log('[VoicePanel] Creating new group...');
        const newIndex = onAddGroup();
        console.log('[VoicePanel] New group created at index:', newIndex);
        setCurrentGroupIndex(newIndex);
        setCurrentRowIndex(0);
        setMode('editing');
        setActiveField('company');
        setCurrentText('');
        enhancedToast({
          title: '✅ Nuevo grupo creado',
          description: 'Diga "Empresa" seguido del nombre',
          type: 'success',
        });
        return;
      }
      if (isFinal && text.toLowerCase().includes('editar')) {
        if (currentGroupIndex >= 0 && groupsCount > 0) {
          setMode('editing');
          setActiveField('company');
          setCurrentText(getFieldValue(currentGroupIndex, currentRowIndex, 'company'));
          enhancedToast({
            title: '✏️ Modo edición',
            description: 'Seleccione un campo para editar',
            type: 'info',
          });
        } else {
          enhancedToast({
            title: '⚠️ Sin datos',
            description: 'Primero cree un grupo con "Nuevo grupo"',
            type: 'warning',
          });
        }
        return;
      }
      return;
    }
    
    // En modo edición
    if (mode === 'editing') {
      // Detectar comandos de acción
      const actionCmd = detectActionCommand(text);
      if (actionCmd && isFinal) {
        saveCurrentField();
        
        if (actionCmd === 'newGroup') {
          console.log('[VoicePanel] Adding new group in edit mode...');
          const newIndex = onAddGroup();
          console.log('[VoicePanel] New group index:', newIndex);
          setCurrentGroupIndex(newIndex);
          setCurrentRowIndex(0);
          setActiveField('company');
          setCurrentText('');
          return;
        }
        if (actionCmd === 'newRow') {
          console.log('[VoicePanel] Adding new row to group:', currentGroupIndex);
          onAddRow(currentGroupIndex);
          // Usar el conteo actual + 1 porque aún no se ha actualizado
          const currentRows = getRowsCount(currentGroupIndex);
          console.log('[VoicePanel] Current rows count:', currentRows, 'setting new row index:', currentRows);
          setCurrentRowIndex(currentRows); // Será el índice de la nueva fila
          setActiveField('name');
          setCurrentText('');
          return;
        }
        if (actionCmd === 'nextRow') {
          const rowsCount = getRowsCount(currentGroupIndex);
          if (currentRowIndex < rowsCount - 1) {
            setCurrentRowIndex(prev => prev + 1);
            setActiveField('name');
            setCurrentText(getFieldValue(currentGroupIndex, currentRowIndex + 1, 'name'));
          }
          return;
        }
        if (actionCmd === 'prevRow') {
          if (currentRowIndex > 0) {
            setCurrentRowIndex(prev => prev - 1);
            setActiveField('name');
            setCurrentText(getFieldValue(currentGroupIndex, currentRowIndex - 1, 'name'));
          }
          return;
        }
        if (actionCmd === 'accept') {
          onClose();
          return;
        }
      }
      
      // Detectar comando de campo
      const fieldCmd = detectFieldCommand(text);
      if (fieldCmd && isFinal) {
        // Guardar campo anterior
        saveCurrentField();
        
        // Cambiar a nuevo campo
        setActiveField(fieldCmd.field);
        setCurrentText(fieldCmd.value);
        setInterimText('');
        
        // Si hay valor, guardarlo inmediatamente
        if (fieldCmd.value && currentGroupIndex >= 0) {
          console.log('[VoicePanel] Saving field with value from command:', { field: fieldCmd.field, value: fieldCmd.value });
          if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
          }
          autoSaveTimeoutRef.current = setTimeout(() => {
            onFieldUpdate(currentGroupIndex, currentRowIndex, fieldCmd.field, fieldCmd.value);
          }, 500); // Reducido a 500ms para respuesta más rápida
        }
        return;
      }
      
      // Es texto normal para el campo activo
      if (activeField && currentGroupIndex >= 0) {
        if (isFinal) {
          // Combinar con texto existente o reemplazar
          const newText = currentText ? `${currentText} ${text.trim()}` : text.trim();
          setCurrentText(newText);
          setInterimText('');
          
          console.log('[VoicePanel] Setting text for field:', { field: activeField, text: newText });
          
          // Auto-guardar después de pausa
          if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
          }
          autoSaveTimeoutRef.current = setTimeout(() => {
            console.log('[VoicePanel] Auto-saving field:', { groupIndex: currentGroupIndex, rowIndex: currentRowIndex, field: activeField, value: newText });
            onFieldUpdate(currentGroupIndex, currentRowIndex, activeField, newText);
          }, 1000); // Reducido a 1s
        } else {
          setInterimText(text.trim());
        }
      }
    }
  }, [mode, activeField, currentText, currentGroupIndex, currentRowIndex, groupsCount, detectFieldCommand, detectActionCommand, saveCurrentField, onFieldUpdate, onAddGroup, onAddRow, getRowsCount, getFieldValue, onClose]);

  // Iniciar reconocimiento de voz
  const startListening = useCallback(() => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognitionClass) {
      enhancedToast({
        title: 'No soportado',
        description: 'El reconocimiento de voz no está disponible en este navegador',
        type: 'error',
      });
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'es-ES';

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) processText(final, true);
      if (interim) processText(interim, false);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('Recognition error:', event.error);
      }
    };

    recognition.onend = () => {
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch (e) {
          console.log('Recognition restart error:', e);
        }
      }
    };

    recognitionRef.current = recognition;
    isListeningRef.current = true;
    
    try {
      recognition.start();
      setIsListening(true);
    } catch (e) {
      console.log('Recognition start error:', e);
    }
  }, [processText]);

  // Detener reconocimiento
  const stopListening = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    saveCurrentField();
    
    if (recognitionRef.current) {
      isListeningRef.current = false;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, [saveCurrentField]);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Seleccionar campo manualmente
  const handleFieldClick = (field: VoiceFieldType) => {
    saveCurrentField();
    setActiveField(field);
    setCurrentText(getFieldValue(currentGroupIndex, currentRowIndex, field));
    setInterimText('');
    setMode('editing');
    
    // Focus en el input
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Manejar cambio manual en input
  const handleInputChange = (value: string) => {
    setCurrentText(value);
    
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      if (activeField && currentGroupIndex >= 0) {
        onFieldUpdate(currentGroupIndex, currentRowIndex, activeField, value);
      }
    }, 500);
  };

  // Confirmar valor y pasar al siguiente campo
  const handleConfirmAndNext = () => {
    if (activeField && currentText.trim()) {
      onFieldUpdate(currentGroupIndex, currentRowIndex, activeField, currentText.trim());
    }
    
    // Encontrar siguiente campo
    const currentIndex = fieldsConfig.findIndex(f => f.field === activeField);
    if (currentIndex < fieldsConfig.length - 1) {
      const nextField = fieldsConfig[currentIndex + 1];
      setActiveField(nextField.field);
      setCurrentText(getFieldValue(currentGroupIndex, currentRowIndex, nextField.field));
    } else {
      // Ir a siguiente fila
      const rowsCount = getRowsCount(currentGroupIndex);
      if (currentRowIndex < rowsCount - 1) {
        setCurrentRowIndex(prev => prev + 1);
        setActiveField(fieldsConfig[1]?.field || fieldsConfig[0].field); // Saltar empresa en filas siguientes
        setCurrentText('');
      }
    }
    setInterimText('');
  };

  // Acciones rápidas
  const handleNewGroup = () => {
    saveCurrentField();
    const newIndex = onAddGroup();
    setCurrentGroupIndex(newIndex);
    setCurrentRowIndex(0);
    setActiveField('company');
    setCurrentText('');
    setMode('editing');
  };

  const handleNewRow = () => {
    saveCurrentField();
    onAddRow(currentGroupIndex);
    const newRowIndex = getRowsCount(currentGroupIndex);
    setCurrentRowIndex(newRowIndex);
    setActiveField('name');
    setCurrentText('');
  };

  const handleEdit = () => {
    setMode('editing');
    setActiveField('company');
    setCurrentText(getFieldValue(currentGroupIndex, currentRowIndex, 'company'));
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Auto-iniciar escucha
  useEffect(() => {
    startListening();
  }, []);

  const sectionLabels: Record<SectionType, string> = {
    work_groups: '👷 Mano de Obra',
    machinery_groups: '🚜 Maquinaria Propia',
    subcontract_groups: '🏢 Subcontratas',
    observations: '📝 Observaciones',
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold">{sectionLabels[sectionType]}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isListening ? 'destructive' : 'default'}
            size="sm"
            onClick={toggleListening}
            className="gap-2"
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {isListening ? 'Detener' : 'Escuchar'}
          </Button>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 overflow-auto p-4">
        {/* Indicador de estado */}
        <div className="mb-6 text-center">
          {isListening && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 text-destructive">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-sm font-medium">Escuchando...</span>
            </div>
          )}
          {mode === 'initial' && (
            <p className="text-muted-foreground mt-2">
              Diga <strong>"Nuevo grupo"</strong> para crear una empresa o <strong>"Editar"</strong> para modificar datos
            </p>
          )}
        </div>

        {/* Botones de acción inicial */}
        {mode === 'initial' && (
          <div className="flex gap-4 justify-center mb-6">
            <Button onClick={handleNewGroup} size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              Nuevo Grupo
            </Button>
            {groupsCount > 0 && (
              <Button onClick={handleEdit} variant="outline" size="lg" className="gap-2">
                <Edit3 className="h-5 w-5" />
                Editar
              </Button>
            )}
          </div>
        )}

        {/* Panel de edición */}
        {mode === 'editing' && currentGroupIndex >= 0 && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Info de posición */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Grupo {currentGroupIndex + 1} de {groupsCount}</span>
              <span>Fila {currentRowIndex + 1} de {getRowsCount(currentGroupIndex)}</span>
            </div>

            {/* Campos */}
            <div className="grid gap-4">
              {fieldsConfig.map((fieldConfig) => (
                <div
                  key={fieldConfig.field}
                  className={cn(
                    'p-4 rounded-lg border-2 transition-all cursor-pointer',
                    activeField === fieldConfig.field
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/50'
                  )}
                  onClick={() => handleFieldClick(fieldConfig.field)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-foreground">
                      {fieldConfig.label}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      Di: "{fieldConfig.voiceCommands[0]}"
                    </span>
                  </div>
                  
                  {activeField === fieldConfig.field ? (
                    <div className="flex gap-2">
                      <Input
                        ref={inputRef}
                        value={currentText + (interimText ? ` ${interimText}` : '')}
                        onChange={(e) => handleInputChange(e.target.value)}
                        placeholder={`Valor para ${fieldConfig.label.toLowerCase()}...`}
                        className="flex-1"
                        autoFocus
                      />
                      <Button size="icon" onClick={handleConfirmAndNext}>
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-foreground min-h-[40px] flex items-center">
                      {getFieldValue(currentGroupIndex, currentRowIndex, fieldConfig.field) || (
                        <span className="text-muted-foreground italic">Sin valor</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Navegación */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (currentRowIndex > 0) {
                      saveCurrentField();
                      setCurrentRowIndex(prev => prev - 1);
                      setActiveField('name');
                      setCurrentText(getFieldValue(currentGroupIndex, currentRowIndex - 1, 'name'));
                    }
                  }}
                  disabled={currentRowIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    saveCurrentField();
                    const rowsCount = getRowsCount(currentGroupIndex);
                    if (currentRowIndex < rowsCount - 1) {
                      setCurrentRowIndex(prev => prev + 1);
                      setActiveField('name');
                      setCurrentText(getFieldValue(currentGroupIndex, currentRowIndex + 1, 'name'));
                    }
                  }}
                  disabled={currentRowIndex >= getRowsCount(currentGroupIndex) - 1}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleNewRow}>
                  <Plus className="h-4 w-4 mr-1" />
                  Nueva Fila
                </Button>
                <Button variant="outline" size="sm" onClick={handleNewGroup}>
                  <Plus className="h-4 w-4 mr-1" />
                  Nuevo Grupo
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer con texto en tiempo real */}
      {isListening && (
        <div className="p-4 border-t border-border bg-muted/30">
          <div className="max-w-2xl mx-auto">
            <div className="text-sm text-muted-foreground mb-1">Transcripción:</div>
            <div className="min-h-[40px] p-3 rounded-lg bg-background border border-border">
              {currentText || interimText || (
                <span className="text-muted-foreground italic">Esperando...</span>
              )}
              {interimText && <span className="text-muted-foreground"> {interimText}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
