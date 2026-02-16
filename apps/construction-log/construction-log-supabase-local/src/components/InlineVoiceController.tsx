import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, X, Plus, ChevronUp, ChevronDown, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { enhancedToast } from './ui/enhanced-toast';
import { useVoiceHighlight } from '@/contexts/VoiceHighlightContext';

type SectionType = 'work_groups' | 'machinery_groups' | 'subcontract_groups' | 'observations';
type VoiceFieldType = 'company' | 'name' | 'activity' | 'hours' | 'concept' | 'quantity' | 'unit' | 'type';

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
  { field: 'type', label: 'Tipo', voiceCommands: ['tipo', 'máquina', 'nombre'] },
  { field: 'activity', label: 'Actividad', voiceCommands: ['actividad', 'tarea'] },
  { field: 'hours', label: 'Horas', voiceCommands: ['horas', 'hora'] },
];

const subcontractGroupsFields: FieldConfig[] = [
  { field: 'company', label: 'Empresa', voiceCommands: ['empresa', 'subcontrata'] },
  { field: 'concept', label: 'Concepto', voiceCommands: ['concepto', 'descripción'] },
  { field: 'quantity', label: 'Cantidad', voiceCommands: ['cantidad', 'número'] },
  { field: 'unit', label: 'Unidad', voiceCommands: ['unidad', 'medida'] },
];

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

interface InlineVoiceControllerProps {
  sectionType: SectionType;
  onClose: () => void;
  onFieldUpdate: (groupIndex: number, rowIndex: number, field: string, value: string) => void;
  onAddGroup: () => number;
  onAddRow: (groupIndex: number) => void;
  groupsCount: number;
  getRowsCount: (groupIndex: number) => number;
  getFieldValue: (groupIndex: number, rowIndex: number, field: string) => string;
}

export const InlineVoiceController = ({
  sectionType,
  onClose,
  onFieldUpdate,
  onAddGroup,
  onAddRow,
  groupsCount,
  getRowsCount,
  getFieldValue,
}: InlineVoiceControllerProps) => {
  const { setHighlight, clearHighlight } = useVoiceHighlight();
  
  const [isListening, setIsListening] = useState(false);
  const [activeField, setActiveField] = useState<VoiceFieldType | null>(null);
  const [currentText, setCurrentText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [currentGroupIndex, setCurrentGroupIndex] = useState(groupsCount > 0 ? groupsCount - 1 : -1);
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognitionInterfaceLocal | null>(null);
  const isListeningRef = useRef(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Obtener campos según sección
  const fieldsConfig = sectionType === 'work_groups' 
    ? workGroupsFields 
    : sectionType === 'machinery_groups'
      ? machineryGroupsFields
      : subcontractGroupsFields;

  const sectionLabels: Record<SectionType, string> = {
    work_groups: '👷 Mano de Obra',
    machinery_groups: '🚜 Maquinaria',
    subcontract_groups: '🏢 Subcontratas',
    observations: '📝 Observaciones',
  };

  // Sincronizar highlight con el estado actual
  useEffect(() => {
    if (activeField && currentGroupIndex >= 0) {
      setHighlight(sectionType, currentGroupIndex, currentRowIndex, activeField);
    } else if (currentGroupIndex >= 0) {
      // Highlight del grupo sin campo específico
      setHighlight(sectionType, currentGroupIndex, currentRowIndex, null);
    } else {
      clearHighlight();
    }
  }, [activeField, currentGroupIndex, currentRowIndex, sectionType, setHighlight, clearHighlight]);

  // Limpiar highlight al desmontar
  useEffect(() => {
    return () => {
      clearHighlight();
    };
  }, [clearHighlight]);

  // Detectar comando de campo en el texto
  const detectFieldCommand = useCallback((text: string): { field: VoiceFieldType; value: string } | null => {
    const lowerText = text.toLowerCase().trim();
    
    for (const fieldConfig of fieldsConfig) {
      for (const command of fieldConfig.voiceCommands) {
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
      newGroup: ['nuevo grupo', 'añadir grupo', 'nueva empresa', 'crear grupo'],
      newRow: ['nueva fila', 'añadir fila', 'nuevo trabajador', 'añadir trabajador', 'nueva persona'],
      nextRow: ['siguiente fila', 'siguiente', 'próxima fila'],
      prevRow: ['anterior fila', 'anterior', 'fila anterior'],
      nextField: ['siguiente campo', 'próximo campo'],
      accept: ['aceptar', 'confirmar', 'listo', 'vale', 'ok', 'terminar'],
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

  // Guardar el valor actual del campo directamente en el formulario
  const saveCurrentField = useCallback((value?: string) => {
    const textToSave = value ?? currentText;
    if (activeField && textToSave.trim() && currentGroupIndex >= 0) {
      console.log('[InlineVoice] Saving to form:', { groupIndex: currentGroupIndex, rowIndex: currentRowIndex, field: activeField, value: textToSave.trim() });
      onFieldUpdate(currentGroupIndex, currentRowIndex, activeField, textToSave.trim());
    }
  }, [activeField, currentText, currentGroupIndex, currentRowIndex, onFieldUpdate]);

  // Avanzar al siguiente campo
  const goToNextField = useCallback(() => {
    const currentIndex = fieldsConfig.findIndex(f => f.field === activeField);
    if (currentIndex < fieldsConfig.length - 1) {
      const nextField = fieldsConfig[currentIndex + 1];
      setActiveField(nextField.field);
      setCurrentText(getFieldValue(currentGroupIndex, currentRowIndex, nextField.field));
    } else {
      // Si es el último campo, ir a siguiente fila
      const rowsCount = getRowsCount(currentGroupIndex);
      if (currentRowIndex < rowsCount - 1) {
        setCurrentRowIndex(prev => prev + 1);
        setActiveField(fieldsConfig[1]?.field || fieldsConfig[0].field);
        setCurrentText('');
      }
    }
  }, [activeField, fieldsConfig, currentGroupIndex, currentRowIndex, getFieldValue, getRowsCount]);

  // Procesar texto reconocido
  const processText = useCallback((text: string, isFinal: boolean) => {
    if (!text.trim()) return;
    
    console.log('[InlineVoice] Processing:', { text, isFinal, activeField, currentGroupIndex, currentRowIndex });
    
    // Detectar comandos de acción
    const actionCmd = detectActionCommand(text);
    if (actionCmd && isFinal) {
      saveCurrentField();
      
      if (actionCmd === 'newGroup') {
        const newIndex = onAddGroup();
        setCurrentGroupIndex(newIndex);
        setCurrentRowIndex(0);
        setActiveField('company');
        setCurrentText('');
        enhancedToast({
          title: '✅ Nuevo grupo',
          description: 'Grupo creado. Dicte el nombre de la empresa.',
          type: 'success',
        });
        return;
      }
      if (actionCmd === 'newRow') {
        onAddRow(currentGroupIndex);
        const newRowIndex = getRowsCount(currentGroupIndex);
        setCurrentRowIndex(newRowIndex);
        setActiveField('name');
        setCurrentText('');
        enhancedToast({
          title: '✅ Nueva fila',
          description: 'Fila añadida. Dicte el nombre.',
          type: 'success',
        });
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
      if (actionCmd === 'nextField') {
        saveCurrentField();
        goToNextField();
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
      saveCurrentField();
      setActiveField(fieldCmd.field);
      setCurrentText(fieldCmd.value);
      setInterimText('');
      
      // Si hay valor, guardarlo
      if (fieldCmd.value && currentGroupIndex >= 0) {
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
        autoSaveTimeoutRef.current = setTimeout(() => {
          onFieldUpdate(currentGroupIndex, currentRowIndex, fieldCmd.field, fieldCmd.value);
        }, 300);
      }
      return;
    }
    
    // Es texto normal para el campo activo
    if (activeField && currentGroupIndex >= 0) {
      if (isFinal) {
        const newText = text.trim();
        setCurrentText(newText);
        setInterimText('');
        
        // Auto-guardar después de pausa corta
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
        autoSaveTimeoutRef.current = setTimeout(() => {
          onFieldUpdate(currentGroupIndex, currentRowIndex, activeField, newText);
        }, 500);
      } else {
        setInterimText(text.trim());
      }
    }
  }, [activeField, currentText, currentGroupIndex, currentRowIndex, detectFieldCommand, detectActionCommand, saveCurrentField, onFieldUpdate, onAddGroup, onAddRow, getRowsCount, getFieldValue, onClose, goToNextField]);

  // Iniciar reconocimiento de voz
  const startListening = useCallback(() => {
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognitionClass) {
      enhancedToast({
        title: 'No soportado',
        description: 'El reconocimiento de voz no está disponible',
        type: 'error',
      });
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'es-ES';

    recognition.onresult = (event: SpeechRecognitionEventLocal) => {
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

    recognition.onerror = (event: { error: string }) => {
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
      
      // Si no hay grupo, crear uno automáticamente
      if (currentGroupIndex < 0 || groupsCount === 0) {
        const newIndex = onAddGroup();
        setCurrentGroupIndex(newIndex);
        setCurrentRowIndex(0);
        setActiveField('company');
        enhancedToast({
          title: '🎤 Dictado activo',
          description: 'Dicte el nombre de la empresa',
          type: 'success',
        });
      } else {
        setActiveField('company');
        enhancedToast({
          title: '🎤 Dictado activo',
          description: 'Campo activo: Empresa. Dicte para editar.',
          type: 'success',
        });
      }
    } catch (e) {
      console.log('Recognition start error:', e);
    }
  }, [processText, currentGroupIndex, groupsCount, onAddGroup]);

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

  const handleClose = () => {
    stopListening();
    clearHighlight();
    onClose();
  };

  const activeFieldLabel = activeField 
    ? fieldsConfig.find(f => f.field === activeField)?.label 
    : 'Ninguno';

  if (isMinimized) {
    return (
      <div className="fixed bottom-24 right-4 z-50">
        <Button
          onClick={() => setIsMinimized(false)}
          variant={isListening ? 'destructive' : 'secondary'}
          size="sm"
          className="gap-2 shadow-lg"
        >
          {isListening && <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
          <Volume2 className="h-4 w-4" />
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 z-50 w-72 bg-background border border-border rounded-lg shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-border bg-muted/30 rounded-t-lg">
        <span className="text-sm font-medium">{sectionLabels[sectionType]}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsMinimized(true)}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Estado */}
      <div className="p-3 space-y-2">
        {/* Indicador de escucha */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isListening ? (
              <>
                <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                <span className="text-xs text-destructive font-medium">Escuchando...</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                <span className="text-xs text-muted-foreground">Pausado</span>
              </>
            )}
          </div>
          <Button
            variant={isListening ? 'destructive' : 'default'}
            size="sm"
            onClick={toggleListening}
            className="h-8 gap-1"
          >
            {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
            {isListening ? 'Pausar' : 'Hablar'}
          </Button>
        </div>

        {/* Info de posición */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
          <span>Grupo {currentGroupIndex + 1}</span>
          <span className="mx-2">•</span>
          <span>Fila {currentRowIndex + 1}</span>
          <span className="mx-2">•</span>
          <span className="font-medium text-foreground">{activeFieldLabel}</span>
        </div>

        {/* Transcripción en tiempo real */}
        {(currentText || interimText) && (
          <div className="text-sm bg-primary/10 rounded px-2 py-1.5 border border-primary/20">
            <span className="text-foreground">{currentText}</span>
            {interimText && <span className="text-muted-foreground"> {interimText}</span>}
          </div>
        )}

        {/* Acciones rápidas */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={() => {
              saveCurrentField();
              const newIndex = onAddGroup();
              setCurrentGroupIndex(newIndex);
              setCurrentRowIndex(0);
              setActiveField('company');
              setCurrentText('');
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Grupo
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={() => {
              saveCurrentField();
              onAddRow(currentGroupIndex);
              const newRowIndex = getRowsCount(currentGroupIndex);
              setCurrentRowIndex(newRowIndex);
              setActiveField('name');
              setCurrentText('');
            }}
            disabled={currentGroupIndex < 0}
          >
            <Plus className="h-3 w-3 mr-1" />
            Fila
          </Button>
        </div>

        {/* Navegación por campos */}
        <div className="grid grid-cols-4 gap-1 pt-1">
          {fieldsConfig.map((fieldConfig) => (
            <Button
              key={fieldConfig.field}
              variant={activeField === fieldConfig.field ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-7 text-xs px-1',
                activeField === fieldConfig.field && 'ring-2 ring-primary/50'
              )}
              onClick={() => {
                saveCurrentField();
                setActiveField(fieldConfig.field);
                setCurrentText(getFieldValue(currentGroupIndex, currentRowIndex, fieldConfig.field));
              }}
            >
              {fieldConfig.label.slice(0, 4)}
            </Button>
          ))}
        </div>
      </div>

      {/* Ayuda */}
      <div className="px-3 pb-2 text-[10px] text-muted-foreground">
        💡 Diga "nuevo grupo", "nueva fila" o el nombre del campo
      </div>
    </div>
  );
};
