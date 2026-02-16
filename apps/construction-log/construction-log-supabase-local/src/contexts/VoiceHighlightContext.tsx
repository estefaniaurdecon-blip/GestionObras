import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

type SectionType = 'work_groups' | 'machinery_groups' | 'subcontract_groups' | 'observations';

interface VoiceHighlightState {
  isActive: boolean;
  sectionType: SectionType | null;
  groupIndex: number;
  rowIndex: number;
  activeField: string | null;
}

interface VoiceHighlightContextType {
  state: VoiceHighlightState;
  setHighlight: (section: SectionType | null, groupIndex: number, rowIndex: number, field: string | null) => void;
  clearHighlight: () => void;
  isFieldHighlighted: (section: SectionType, groupIndex: number, rowIndex: number, field: string) => boolean;
  isGroupHighlighted: (section: SectionType, groupIndex: number) => boolean;
  isRowHighlighted: (section: SectionType, groupIndex: number, rowIndex: number) => boolean;
}

const VoiceHighlightContext = createContext<VoiceHighlightContextType | undefined>(undefined);

// Función para generar el ID del elemento a hacer scroll
const generateFieldId = (section: SectionType, groupIndex: number, rowIndex: number, field: string | null): string => {
  if (field) {
    return `voice-field-${section}-${groupIndex}-${rowIndex}-${field}`;
  }
  return `voice-group-${section}-${groupIndex}`;
};

export const VoiceHighlightProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<VoiceHighlightState>({
    isActive: false,
    sectionType: null,
    groupIndex: -1,
    rowIndex: -1,
    activeField: null,
  });

  // Auto-scroll al campo activo cuando cambia el highlight
  useEffect(() => {
    if (state.isActive && state.sectionType !== null && state.groupIndex >= 0) {
      const fieldId = generateFieldId(state.sectionType, state.groupIndex, state.rowIndex, state.activeField);
      
      // Pequeño delay para asegurar que el DOM se ha actualizado
      requestAnimationFrame(() => {
        const element = document.getElementById(fieldId);
        if (element) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }
      });
    }
  }, [state.isActive, state.sectionType, state.groupIndex, state.rowIndex, state.activeField]);

  const setHighlight = useCallback((
    section: SectionType | null,
    groupIndex: number,
    rowIndex: number,
    field: string | null
  ) => {
    setState({
      isActive: section !== null,
      sectionType: section,
      groupIndex,
      rowIndex,
      activeField: field,
    });
  }, []);

  const clearHighlight = useCallback(() => {
    setState({
      isActive: false,
      sectionType: null,
      groupIndex: -1,
      rowIndex: -1,
      activeField: null,
    });
  }, []);

  const isFieldHighlighted = useCallback((
    section: SectionType,
    groupIndex: number,
    rowIndex: number,
    field: string
  ) => {
    return (
      state.isActive &&
      state.sectionType === section &&
      state.groupIndex === groupIndex &&
      state.rowIndex === rowIndex &&
      state.activeField === field
    );
  }, [state]);

  const isGroupHighlighted = useCallback((section: SectionType, groupIndex: number) => {
    return (
      state.isActive &&
      state.sectionType === section &&
      state.groupIndex === groupIndex
    );
  }, [state]);

  const isRowHighlighted = useCallback((
    section: SectionType,
    groupIndex: number,
    rowIndex: number
  ) => {
    return (
      state.isActive &&
      state.sectionType === section &&
      state.groupIndex === groupIndex &&
      state.rowIndex === rowIndex
    );
  }, [state]);

  return (
    <VoiceHighlightContext.Provider value={{
      state,
      setHighlight,
      clearHighlight,
      isFieldHighlighted,
      isGroupHighlighted,
      isRowHighlighted,
    }}>
      {children}
    </VoiceHighlightContext.Provider>
  );
};

export const useVoiceHighlight = () => {
  const context = useContext(VoiceHighlightContext);
  if (!context) {
    throw new Error('useVoiceHighlight must be used within a VoiceHighlightProvider');
  }
  return context;
};
