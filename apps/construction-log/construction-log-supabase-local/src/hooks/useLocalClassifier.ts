import { useState, useEffect, useCallback, useRef } from 'react';
import { pipeline, PipelineType } from '@huggingface/transformers';

// Classification labels for work notes
export const NOTE_CATEGORIES = ['Urgente', 'Materiales', 'Seguridad', 'Informativo'] as const;
export type NoteCategory = typeof NOTE_CATEGORIES[number];

interface ClassificationResult {
  category: NoteCategory;
  confidence: number;
}

interface UseLocalClassifierReturn {
  isLoadingModel: boolean;
  isClassifying: boolean;
  modelError: string | null;
  classifyText: (text: string) => Promise<ClassificationResult | null>;
  isReady: boolean;
}

// Singleton to avoid loading the model multiple times
let classifierInstance: any = null;
let loadingPromise: Promise<any> | null = null;

/**
 * Hook para clasificación local de notas usando IA en el navegador
 * Utiliza un modelo ligero de zero-shot classification
 */
export const useLocalClassifier = (): UseLocalClassifierReturn => {
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const mountedRef = useRef(true);

  // Initialize the classifier on mount
  useEffect(() => {
    mountedRef.current = true;
    
    const initializeClassifier = async () => {
      // If already loaded, just mark as ready
      if (classifierInstance) {
        setIsReady(true);
        return;
      }

      // If loading is in progress, wait for it
      if (loadingPromise) {
        try {
          setIsLoadingModel(true);
          await loadingPromise;
          if (mountedRef.current) {
            setIsReady(true);
            setIsLoadingModel(false);
          }
        } catch (error) {
          if (mountedRef.current) {
            setModelError('Error al cargar el modelo de clasificación');
            setIsLoadingModel(false);
          }
        }
        return;
      }

      // Start loading the model
      setIsLoadingModel(true);
      setModelError(null);

      loadingPromise = (async () => {
        try {
          console.log('[LocalClassifier] Loading zero-shot classification model...');
          
          // Use a lightweight model for zero-shot classification
          // MobileBERT is fast and works well for simple classification
          classifierInstance = await pipeline(
            'zero-shot-classification' as PipelineType,
            'Xenova/mobilebert-uncased-mnli',
            {
              // Use WebGPU if available for better performance
              device: 'webgpu' in navigator ? 'webgpu' : undefined,
            }
          );
          
          console.log('[LocalClassifier] Model loaded successfully');
          return classifierInstance;
        } catch (error) {
          console.error('[LocalClassifier] Failed to load model:', error);
          classifierInstance = null;
          throw error;
        }
      })();

      try {
        await loadingPromise;
        if (mountedRef.current) {
          setIsReady(true);
        }
      } catch (error) {
        if (mountedRef.current) {
          setModelError('Error al cargar el modelo. Clasificación no disponible.');
        }
      } finally {
        if (mountedRef.current) {
          setIsLoadingModel(false);
        }
      }
    };

    initializeClassifier();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Classification function
  const classifyText = useCallback(async (text: string): Promise<ClassificationResult | null> => {
    // Skip if text is too short or model not ready
    if (!text || text.trim().length < 10) {
      return null;
    }

    if (!classifierInstance) {
      console.warn('[LocalClassifier] Model not ready for classification');
      return null;
    }

    setIsClassifying(true);

    try {
      // Define candidate labels in Spanish with context
      const candidateLabels = [
        'urgente, crítico, inmediato, peligro, emergencia',
        'materiales, suministros, entrega, albarán, pedido, stock',
        'seguridad, protección, EPIs, accidente, riesgo, prevención',
        'información, general, actualización, progreso, estado, normal'
      ];

      const result = await classifierInstance(text, candidateLabels, {
        multi_label: false,
      });

      // Map the result back to our categories
      const labelToCategory: Record<string, NoteCategory> = {
        'urgente, crítico, inmediato, peligro, emergencia': 'Urgente',
        'materiales, suministros, entrega, albarán, pedido, stock': 'Materiales',
        'seguridad, protección, EPIs, accidente, riesgo, prevención': 'Seguridad',
        'información, general, actualización, progreso, estado, normal': 'Informativo',
      };

      const topLabel = result.labels[0];
      const topScore = result.scores[0];

      console.log('[LocalClassifier] Classification result:', {
        text: text.substring(0, 50) + '...',
        category: labelToCategory[topLabel],
        confidence: topScore
      });

      return {
        category: labelToCategory[topLabel] || 'Informativo',
        confidence: topScore
      };
    } catch (error) {
      console.error('[LocalClassifier] Classification error:', error);
      return null;
    } finally {
      if (mountedRef.current) {
        setIsClassifying(false);
      }
    }
  }, []);

  return {
    isLoadingModel,
    isClassifying,
    modelError,
    classifyText,
    isReady
  };
};
