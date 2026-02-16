import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface UseUnsavedChangesOptions {
  hasUnsavedChanges: boolean;
  onBeforeUnload?: () => void;
}

/**
 * Hook para detectar cambios sin guardar y prevenir pérdida de datos
 */
export const useUnsavedChanges = ({ 
  hasUnsavedChanges, 
  onBeforeUnload 
}: UseUnsavedChangesOptions) => {
  const { t } = useTranslation();
  const hasUnsavedRef = useRef(hasUnsavedChanges);

  // Actualizar la referencia cuando cambie el estado
  useEffect(() => {
    hasUnsavedRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (hasUnsavedRef.current) {
      // Llamar callback personalizado si existe
      onBeforeUnload?.();

      // Estándar para navegadores modernos
      e.preventDefault();
      e.returnValue = ''; // Chrome requiere esto
      
      // Para navegadores antiguos
      return '';
    }
  }, [onBeforeUnload]);

  useEffect(() => {
    // Agregar listener para beforeunload
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [handleBeforeUnload]);

  return {
    hasUnsavedChanges: hasUnsavedRef.current,
  };
};
