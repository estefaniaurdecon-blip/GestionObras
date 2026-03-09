import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { standardizeCompanies } from '@/integrations/api/client';

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
      const data = await standardizeCompanies({ action: 'analyze', threshold });

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
        const apiError =
          'error' in data && typeof data.error === 'string' ? data.error : 'Error desconocido';
        throw new Error(apiError);
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

      const data = await standardizeCompanies({ action: 'apply', updates });

      if (data.success) {
        toast.success(data.message);
        // Clear results after successful application
        setAnalysisResult(null);
      } else {
        const apiError =
          'error' in data && typeof data.error === 'string' ? data.error : 'Error desconocido';
        throw new Error(apiError);
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
