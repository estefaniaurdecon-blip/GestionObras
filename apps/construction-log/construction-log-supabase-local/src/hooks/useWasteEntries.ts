import { toast } from '@/hooks/use-toast';
import type {
  ContainerSizeDB,
  WasteActionType,
  WasteEntryDB,
  WasteEntryInsert,
  WasteManagerDB,
  WasteOperationMode,
  WasteTypeDB,
} from '@/types/wasteDatabase';

export interface WasteEntryWithRelations extends WasteEntryDB {
  waste_type?: WasteTypeDB | null;
  manager?: WasteManagerDB | null;
}

const notifyUnavailable = () => {
  toast({
    title: 'Funcion no disponible',
    description:
      'La gestion legacy de residuos esta desactivada hasta completar la migracion.',
    variant: 'destructive',
  });
};

export const useWasteEntries = (_workReportId: string | null, _workId?: string) => {
  const createEntry = async (
    _entry: Omit<
      WasteEntryInsert,
      'work_report_id' | 'organization_id' | 'created_by'
    >,
  ) => {
    notifyUnavailable();
    return null;
  };

  const updateEntry = async (_id: string, _updates: Partial<WasteEntryDB>) => {
    notifyUnavailable();
    return null;
  };

  const deleteEntry = async (_id: string) => {
    notifyUnavailable();
    return false;
  };

  const refreshEntries = async () => {
    return [];
  };

  return {
    entries: [] as WasteEntryWithRelations[],
    wasteTypes: [] as WasteTypeDB[],
    managers: [] as WasteManagerDB[],
    loading: false,
    createEntry,
    updateEntry,
    deleteEntry,
    refreshEntries,
  };
};

export type UseWasteEntriesOperationMode = WasteOperationMode;
export type UseWasteEntriesActionType = WasteActionType;
export type UseWasteEntriesContainerSize = ContainerSizeDB;
