import { useState, useRef, useCallback, useEffect } from 'react';

// Tipos para Web Speech API
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInterface extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInterface;
    webkitSpeechRecognition: new () => SpeechRecognitionInterface;
  }
}

export type VoiceFieldType = 'company' | 'name' | 'activity' | 'hours' | 'concept' | 'quantity' | 'unit' | 'observations';

export interface VoiceFieldConfig {
  field: VoiceFieldType;
  label: string;
  voiceCommands: string[]; // Comandos de voz que activan este campo
}

// Configuración de campos por sección
export const workGroupsFields: VoiceFieldConfig[] = [
  { field: 'company', label: 'Empresa', voiceCommands: ['empresa', 'compañía', 'compania'] },
  { field: 'name', label: 'Nombre', voiceCommands: ['nombre', 'trabajador', 'operario'] },
  { field: 'activity', label: 'Actividad', voiceCommands: ['actividad', 'tarea', 'trabajo'] },
  { field: 'hours', label: 'Horas', voiceCommands: ['horas', 'hora', 'tiempo'] },
];

export const machineryGroupsFields: VoiceFieldConfig[] = [
  { field: 'company', label: 'Empresa', voiceCommands: ['empresa', 'compañía', 'compania'] },
  { field: 'name', label: 'Tipo Máquina', voiceCommands: ['tipo', 'máquina', 'maquina', 'nombre'] },
  { field: 'activity', label: 'Actividad', voiceCommands: ['actividad', 'tarea', 'trabajo'] },
  { field: 'hours', label: 'Horas', voiceCommands: ['horas', 'hora', 'tiempo'] },
];

export const subcontractGroupsFields: VoiceFieldConfig[] = [
  { field: 'company', label: 'Empresa', voiceCommands: ['empresa', 'compañía', 'compania', 'subcontrata'] },
  { field: 'concept', label: 'Concepto', voiceCommands: ['concepto', 'descripción', 'descripcion'] },
  { field: 'quantity', label: 'Cantidad', voiceCommands: ['cantidad', 'número', 'numero'] },
  { field: 'unit', label: 'Unidad', voiceCommands: ['unidad', 'unidades', 'medida'] },
];

// Comandos de acción
const actionCommands = {
  newGroup: ['nuevo grupo', 'añadir grupo', 'crear grupo', 'nueva empresa'],
  edit: ['editar', 'modificar', 'cambiar'],
  nextRow: ['siguiente fila', 'siguiente', 'próximo', 'proximo'],
  previousRow: ['fila anterior', 'anterior', 'atrás', 'atras'],
  newRow: ['nueva fila', 'añadir fila', 'nuevo trabajador', 'agregar fila'],
  accept: ['aceptar', 'confirmar', 'guardar', 'vale', 'ok', 'listo'],
  cancel: ['cancelar', 'borrar', 'deshacer'],
};

interface UseInteractiveVoiceOptions {
  sectionType: 'work_groups' | 'machinery_groups' | 'subcontract_groups' | 'observations';
  onFieldUpdate: (groupIndex: number, rowIndex: number, field: string, value: string) => void;
  onAction: (action: string, params?: any) => void;
  groupsCount: number;
  currentRowsCount: number;
}

export interface InteractiveVoiceState {
  isListening: boolean;
  isProcessing: boolean;
  activeField: VoiceFieldType | null;
  currentText: string;
  interimText: string;
  mode: 'idle' | 'waiting_command' | 'editing_field' | 'awaiting_confirmation';
  currentGroupIndex: number;
  currentRowIndex: number;
  error: string | null;
}

export const useInteractiveVoice = ({
  sectionType,
  onFieldUpdate,
  onAction,
  groupsCount,
  currentRowsCount,
}: UseInteractiveVoiceOptions) => {
  const [state, setState] = useState<InteractiveVoiceState>({
    isListening: false,
    isProcessing: false,
    activeField: null,
    currentText: '',
    interimText: '',
    mode: 'idle',
    currentGroupIndex: groupsCount > 0 ? groupsCount - 1 : 0,
    currentRowIndex: currentRowsCount > 0 ? currentRowsCount - 1 : 0,
    error: null,
  });

  const recognitionRef = useRef<SpeechRecognitionInterface | null>(null);
  const isListeningRef = useRef(false);
  const pendingTextRef = useRef('');
  const autoAcceptTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Obtener campos según sección
  const getFieldsConfig = useCallback(() => {
    switch (sectionType) {
      case 'work_groups':
        return workGroupsFields;
      case 'machinery_groups':
        return machineryGroupsFields;
      case 'subcontract_groups':
        return subcontractGroupsFields;
      default:
        return [];
    }
  }, [sectionType]);

  // Detectar comando de campo
  const detectFieldCommand = useCallback((text: string): VoiceFieldType | null => {
    const lowerText = text.toLowerCase().trim();
    const fields = getFieldsConfig();
    
    for (const field of fields) {
      for (const command of field.voiceCommands) {
        if (lowerText.startsWith(command) || lowerText === command) {
          return field.field;
        }
      }
    }
    return null;
  }, [getFieldsConfig]);

  // Detectar comando de acción
  const detectActionCommand = useCallback((text: string): { action: string; remaining: string } | null => {
    const lowerText = text.toLowerCase().trim();
    
    for (const [action, commands] of Object.entries(actionCommands)) {
      for (const command of commands) {
        if (lowerText.startsWith(command)) {
          const remaining = text.slice(command.length).trim();
          return { action, remaining };
        }
      }
    }
    return null;
  }, []);

  // Procesar texto reconocido
  const processRecognizedText = useCallback((text: string, isFinal: boolean) => {
    const trimmedText = text.trim();
    
    if (state.mode === 'waiting_command') {
      // Detectar comando inicial (nuevo grupo o editar)
      const actionResult = detectActionCommand(trimmedText);
      if (actionResult) {
        if (actionResult.action === 'newGroup') {
          onAction('add_group');
          setState(prev => ({
            ...prev,
            mode: 'editing_field',
            activeField: 'company',
            currentText: '',
            currentGroupIndex: groupsCount,
            currentRowIndex: 0,
          }));
        } else if (actionResult.action === 'edit') {
          setState(prev => ({
            ...prev,
            mode: 'editing_field',
            activeField: 'company',
            currentText: '',
          }));
        }
        return;
      }
    }
    
    if (state.mode === 'editing_field') {
      // Verificar si el texto contiene un comando de campo
      const fieldDetected = detectFieldCommand(trimmedText);
      
      if (fieldDetected && isFinal) {
        // Si hay texto pendiente, guardarlo primero
        if (pendingTextRef.current && state.activeField) {
          onFieldUpdate(
            state.currentGroupIndex,
            state.currentRowIndex,
            state.activeField,
            pendingTextRef.current
          );
          pendingTextRef.current = '';
        }
        
        // Cambiar al nuevo campo
        setState(prev => ({
          ...prev,
          activeField: fieldDetected,
          currentText: '',
          interimText: '',
        }));
        
        // Limpiar timeout de auto-aceptar
        if (autoAcceptTimeoutRef.current) {
          clearTimeout(autoAcceptTimeoutRef.current);
        }
        return;
      }
      
      // Detectar comandos de acción mientras se edita
      const actionResult = detectActionCommand(trimmedText);
      if (actionResult && isFinal) {
        // Guardar texto pendiente
        if (pendingTextRef.current && state.activeField) {
          onFieldUpdate(
            state.currentGroupIndex,
            state.currentRowIndex,
            state.activeField,
            pendingTextRef.current
          );
          pendingTextRef.current = '';
        }
        
        if (actionResult.action === 'newRow') {
          onAction('add_row');
          setState(prev => ({
            ...prev,
            currentRowIndex: prev.currentRowIndex + 1,
            activeField: 'name',
            currentText: '',
          }));
        } else if (actionResult.action === 'nextRow') {
          setState(prev => ({
            ...prev,
            currentRowIndex: Math.min(prev.currentRowIndex + 1, currentRowsCount - 1),
            activeField: 'name',
            currentText: '',
          }));
        } else if (actionResult.action === 'previousRow') {
          setState(prev => ({
            ...prev,
            currentRowIndex: Math.max(prev.currentRowIndex - 1, 0),
            activeField: 'name',
            currentText: '',
          }));
        } else if (actionResult.action === 'newGroup') {
          onAction('add_group');
          setState(prev => ({
            ...prev,
            currentGroupIndex: groupsCount,
            currentRowIndex: 0,
            activeField: 'company',
            currentText: '',
          }));
        } else if (actionResult.action === 'accept') {
          // Aceptar y cerrar
          onAction('accept');
          stop();
        } else if (actionResult.action === 'cancel') {
          setState(prev => ({
            ...prev,
            currentText: '',
            interimText: '',
          }));
        }
        return;
      }
      
      // Es texto normal, actualizar el campo
      if (state.activeField) {
        // Extraer el valor después del comando de campo si existe
        let valueText = trimmedText;
        const fields = getFieldsConfig();
        for (const field of fields) {
          for (const command of field.voiceCommands) {
            const lowerText = valueText.toLowerCase();
            if (lowerText.startsWith(command + ' ')) {
              valueText = valueText.slice(command.length).trim();
              break;
            }
          }
        }
        
        if (isFinal) {
          pendingTextRef.current = valueText;
          setState(prev => ({
            ...prev,
            currentText: valueText,
            interimText: '',
          }));
          
          // Auto-aceptar después de 1.5 segundos sin más input
          if (autoAcceptTimeoutRef.current) {
            clearTimeout(autoAcceptTimeoutRef.current);
          }
          autoAcceptTimeoutRef.current = setTimeout(() => {
            if (pendingTextRef.current && state.activeField) {
              onFieldUpdate(
                state.currentGroupIndex,
                state.currentRowIndex,
                state.activeField,
                pendingTextRef.current
              );
              pendingTextRef.current = '';
            }
          }, 1500);
        } else {
          setState(prev => ({
            ...prev,
            interimText: valueText,
          }));
        }
      }
    }
  }, [state, detectFieldCommand, detectActionCommand, onFieldUpdate, onAction, getFieldsConfig, groupsCount, currentRowsCount]);

  // Iniciar reconocimiento
  const start = useCallback(async () => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognitionClass) {
      setState(prev => ({ ...prev, error: 'Web Speech API no soportada' }));
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState(prev => ({ ...prev, error: 'No se pudo acceder al micrófono' }));
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

      if (final) {
        processRecognizedText(final, true);
      }
      if (interim) {
        processRecognizedText(interim, false);
      }
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
      setState(prev => ({
        ...prev,
        isListening: true,
        mode: 'waiting_command',
        error: null,
      }));
    } catch (e) {
      console.log('Recognition start error:', e);
    }
  }, [processRecognizedText]);

  // Detener reconocimiento
  const stop = useCallback(() => {
    if (autoAcceptTimeoutRef.current) {
      clearTimeout(autoAcceptTimeoutRef.current);
    }
    
    // Guardar texto pendiente
    if (pendingTextRef.current && state.activeField) {
      onFieldUpdate(
        state.currentGroupIndex,
        state.currentRowIndex,
        state.activeField,
        pendingTextRef.current
      );
      pendingTextRef.current = '';
    }
    
    if (recognitionRef.current) {
      isListeningRef.current = false;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    
    setState(prev => ({
      ...prev,
      isListening: false,
      mode: 'idle',
      activeField: null,
      currentText: '',
      interimText: '',
    }));
  }, [state, onFieldUpdate]);

  // Seleccionar campo manualmente
  const selectField = useCallback((field: VoiceFieldType) => {
    // Guardar texto pendiente del campo anterior
    if (pendingTextRef.current && state.activeField) {
      onFieldUpdate(
        state.currentGroupIndex,
        state.currentRowIndex,
        state.activeField,
        pendingTextRef.current
      );
      pendingTextRef.current = '';
    }
    
    setState(prev => ({
      ...prev,
      activeField: field,
      currentText: '',
      interimText: '',
      mode: 'editing_field',
    }));
  }, [state, onFieldUpdate]);

  // Actualizar texto manualmente
  const updateText = useCallback((text: string) => {
    pendingTextRef.current = text;
    setState(prev => ({
      ...prev,
      currentText: text,
    }));
  }, []);

  // Confirmar texto actual
  const confirmCurrentText = useCallback(() => {
    if (pendingTextRef.current && state.activeField) {
      onFieldUpdate(
        state.currentGroupIndex,
        state.currentRowIndex,
        state.activeField,
        pendingTextRef.current
      );
      pendingTextRef.current = '';
      setState(prev => ({
        ...prev,
        currentText: '',
        interimText: '',
      }));
    }
  }, [state, onFieldUpdate]);

  // Navegar a grupo/fila específico
  const navigateTo = useCallback((groupIndex: number, rowIndex: number) => {
    setState(prev => ({
      ...prev,
      currentGroupIndex: groupIndex,
      currentRowIndex: rowIndex,
    }));
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (autoAcceptTimeoutRef.current) {
        clearTimeout(autoAcceptTimeoutRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    state,
    start,
    stop,
    selectField,
    updateText,
    confirmCurrentText,
    navigateTo,
    fieldsConfig: getFieldsConfig(),
  };
};
