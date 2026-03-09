import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from '@/hooks/use-toast';
import type {
  WasteEntryDB, 
  WasteEntryInsert, 
  WasteTypeDB, 
  WasteManagerDB,
  WasteOperationMode,
  WasteActionType,
  ContainerSizeDB
} from '@/types/wasteDatabase';
import { supabase } from '@/integrations/api/legacySupabaseRemoved';

export interface WasteEntryWithRelations extends WasteEntryDB {
  waste_type?: WasteTypeDB | null;
  manager?: WasteManagerDB | null;
}

export const useWasteEntries = (workReportId: string | null, workId?: string) => {
  const [entries, setEntries] = useState<WasteEntryWithRelations[]>([]);
  const [wasteTypes, setWasteTypes] = useState<WasteTypeDB[]>([]);
  const [managers, setManagers] = useState<WasteManagerDB[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { organization } = useOrganization();

  // Cargar tipos de residuos y gestores
  const loadMasterData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      const [typesRes, managersRes] = await Promise.all([
        supabase
          .from('waste_types')
          .select('*')
          .or(`is_system.eq.true,organization_id.eq.${organization.id}`)
          .order('name'),
        supabase
          .from('waste_managers')
          .select('*')
          .eq('organization_id', organization.id)
          .eq('is_active', true)
          .order('company_name')
      ]);

      if (typesRes.error) throw typesRes.error;
      if (managersRes.error) throw managersRes.error;

      setWasteTypes(typesRes.data || []);
      setManagers(managersRes.data || []);
    } catch (error) {
      console.error('Error loading waste master data:', error);
    }
  }, [organization?.id]);

  // Cargar entradas de residuos del parte
  const loadEntries = useCallback(async () => {
    if (!workReportId || !organization?.id) {
      setEntries([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('work_report_waste_entries')
        .select(`
          *,
          waste_type:waste_types(*),
          manager:waste_managers(*)
        `)
        .eq('work_report_id', workReportId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Cast the data properly
      const typedData = (data || []).map(entry => ({
        ...entry,
        waste_type: entry.waste_type as WasteTypeDB | null,
        manager: entry.manager as WasteManagerDB | null
      })) as WasteEntryWithRelations[];

      setEntries(typedData);
    } catch (error) {
      console.error('Error loading waste entries:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las entradas de residuos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [workReportId, organization?.id]);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Crear nueva entrada
  const createEntry = async (entry: Omit<WasteEntryInsert, 'work_report_id' | 'organization_id' | 'created_by'>) => {
    if (!workReportId || !organization?.id || !user?.id) {
      toast({
        title: 'Error',
        description: 'Faltan datos necesarios para crear la entrada',
        variant: 'destructive'
      });
      return null;
    }

    try {
      const insertData: WasteEntryInsert = {
        ...entry,
        work_report_id: workReportId,
        organization_id: organization.id,
        work_id: workId || null,
        created_by: user.id
      };

      const { data, error } = await supabase
        .from('work_report_waste_entries')
        .insert(insertData)
        .select(`
          *,
          waste_type:waste_types(*),
          manager:waste_managers(*)
        `)
        .single();

      if (error) throw error;

      const typedData = {
        ...data,
        waste_type: data.waste_type as WasteTypeDB | null,
        manager: data.manager as WasteManagerDB | null
      } as WasteEntryWithRelations;

      setEntries(prev => [typedData, ...prev]);
      
      toast({
        title: 'Entrada creada',
        description: 'La entrada de residuos se ha registrado correctamente'
      });

      return typedData;
    } catch (error: any) {
      console.error('Error creating waste entry:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear la entrada',
        variant: 'destructive'
      });
      return null;
    }
  };

  // Actualizar entrada
  const updateEntry = async (id: string, updates: Partial<WasteEntryDB>) => {
    try {
      const { data, error } = await supabase
        .from('work_report_waste_entries')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          waste_type:waste_types(*),
          manager:waste_managers(*)
        `)
        .single();

      if (error) throw error;

      const typedData = {
        ...data,
        waste_type: data.waste_type as WasteTypeDB | null,
        manager: data.manager as WasteManagerDB | null
      } as WasteEntryWithRelations;

      setEntries(prev => prev.map(e => e.id === id ? typedData : e));

      toast({
        title: 'Entrada actualizada',
        description: 'Los cambios se han guardado correctamente'
      });

      return typedData;
    } catch (error: any) {
      console.error('Error updating waste entry:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo actualizar la entrada',
        variant: 'destructive'
      });
      return null;
    }
  };

  // Eliminar entrada
  const deleteEntry = async (id: string) => {
    try {
      const { error } = await supabase
        .from('work_report_waste_entries')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setEntries(prev => prev.filter(e => e.id !== id));

      toast({
        title: 'Entrada eliminada',
        description: 'La entrada de residuos ha sido eliminada'
      });

      return true;
    } catch (error: any) {
      console.error('Error deleting waste entry:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar la entrada',
        variant: 'destructive'
      });
      return false;
    }
  };

  return {
    entries,
    wasteTypes,
    managers,
    loading,
    createEntry,
    updateEntry,
    deleteEntry,
    refreshEntries: loadEntries
  };
};
