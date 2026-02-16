import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CompanyOccurrence {
  name: string;
  sources: string[];
  count: number;
  normalizedName: string;
}

export interface SimilarGroup {
  canonicalName: string;
  variations: CompanyOccurrence[];
  totalCount: number;
  selectedCanonical?: string; // User's choice for canonical name
}

export interface AnalysisResult {
  totalCompanies: number;
  duplicateGroups: number;
  groups: SimilarGroup[];
}

export const useCompanyStandardization = () => {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  const analyzeCompanies = useCallback(async (threshold: number = 0.7) => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('standardize-companies', {
        body: { action: 'analyze', threshold }
      });

      if (error) throw error;

      if (data.success) {
        // Add selectedCanonical to each group (defaults to the most used name)
        const groupsWithSelection = data.groups.map((group: SimilarGroup) => ({
          ...group,
          selectedCanonical: group.canonicalName
        }));

        setAnalysisResult({
          ...data,
          groups: groupsWithSelection
        });

        if (data.duplicateGroups === 0) {
          toast.success('No se encontraron duplicados');
        } else {
          toast.info(`Se encontraron ${data.duplicateGroups} grupos de empresas similares`);
        }
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (error: unknown) {
      console.error('Error analyzing companies:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      toast.error(`Error al analizar empresas: ${errorMessage}`);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const updateCanonicalName = useCallback((groupIndex: number, newCanonicalName: string) => {
    setAnalysisResult(prev => {
      if (!prev) return null;

      const updatedGroups = [...prev.groups];
      updatedGroups[groupIndex] = {
        ...updatedGroups[groupIndex],
        selectedCanonical: newCanonicalName
      };

      return {
        ...prev,
        groups: updatedGroups
      };
    });
  }, []);

  const applyStandardization = useCallback(async (groupsToApply?: SimilarGroup[]) => {
    const groups = groupsToApply || analysisResult?.groups || [];
    
    if (groups.length === 0) {
      toast.error('No hay grupos para estandarizar');
      return;
    }

    setApplying(true);
    try {
      // Build updates array
      const updates: { oldName: string; newName: string }[] = [];

      for (const group of groups) {
        const canonicalName = group.selectedCanonical || group.canonicalName;
        
        for (const variation of group.variations) {
          if (variation.name !== canonicalName) {
            updates.push({
              oldName: variation.name,
              newName: canonicalName
            });
          }
        }
      }

      if (updates.length === 0) {
        toast.info('No hay cambios que aplicar');
        return;
      }

      const { data, error } = await supabase.functions.invoke('standardize-companies', {
        body: { action: 'apply', updates }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        // Clear results after successful application
        setAnalysisResult(null);
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (error: unknown) {
      console.error('Error applying standardization:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      toast.error(`Error al aplicar estandarización: ${errorMessage}`);
    } finally {
      setApplying(false);
    }
  }, [analysisResult]);

  const applySingleGroup = useCallback(async (group: SimilarGroup) => {
    return applyStandardization([group]);
  }, [applyStandardization]);

  const clearResults = useCallback(() => {
    setAnalysisResult(null);
  }, []);

  return {
    loading: analyzing || applying,
    analyzing,
    applying,
    analysisResult,
    analyzeCompanies,
    updateCanonicalName,
    applyStandardization,
    applySingleGroup,
    clearResults
  };
};
