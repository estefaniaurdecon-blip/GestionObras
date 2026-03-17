import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Work } from '@/types/work';
import { startupPerfEnd, startupPerfStart } from '@/utils/startupPerf';
import { workReportsRepo } from '@/offline-db/repositories/workReportsRepo';
import {
  TENANT_REQUIRED_MESSAGE,
  getActiveTenantId,
  isTenantResolutionError,
  prepareOfflineTenantScope,
} from '@/offline-db/tenantScope';
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  ApiProject,
  ProjectCreate,
  ProjectUpdate,
} from '@/integrations/api/client';

export type { Work };

function mapApiProjectToWork(project: ApiProject): Work {
  return {
    id: String(project.id),
    number: project.code || String(project.id),
    name: project.name,
    address: project.address,
    promoter: undefined,
    budget: project.budget,
    execution_period: undefined,
    start_date: project.start_date,
    end_date: project.end_date,
    description: project.description,
    contact_person: undefined,
    contact_phone: undefined,
    contact_email: undefined,
    created_at: project.created_at || new Date().toISOString(),
    created_by: String(project.tenant_id || ''),
    organization_id: String(project.tenant_id || ''),
    updated_at: project.updated_at,
    latitude: project.latitude ?? undefined,
    longitude: project.longitude ?? undefined,
    street_address: project.address,
    city: project.city,
    province: project.province,
    country: project.country,
  };
}

function mapWorkToProjectCreate(work: Partial<Work>): ProjectCreate {
  return {
    name: work.name || '',
    code: work.number,
    description: work.description,
    address: work.address || work.street_address,
    city: work.city,
    province: work.province,
    country: work.country,
    start_date: work.start_date,
    end_date: work.end_date,
    budget: work.budget,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getErrorStatus(error: unknown): number | null {
  const record = asRecord(error);
  if (!record) return null;
  return typeof record.status === 'number' ? record.status : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const record = asRecord(error);
  if (record && typeof record.message === 'string') {
    return record.message;
  }
  return 'Error desconocido';
}

async function loadWorksFromOfflineReports(tenantId: string): Promise<Work[]> {
  await workReportsRepo.init();
  const reports = await workReportsRepo.list({ tenantId, limit: 500 });

  const byKey = new Map<string, Work>();

  reports.forEach((report) => {
    const payload = asRecord(report.payload);
    const workNumber = typeof payload?.workNumber === 'string' ? payload.workNumber.trim() : '';
    const workName = typeof payload?.workName === 'string' ? payload.workName.trim() : (report.title || '').trim();

    if (!workNumber && !workName) return;

    const key = `${workNumber.toLowerCase()}::${workName.toLowerCase()}`;
    if (byKey.has(key)) return;

    const payloadWorkId = typeof payload?.workId === 'string' && payload.workId.length > 0 ? payload.workId : null;
    const id = payloadWorkId || report.projectId || `offline-${workNumber || workName}`;

    byKey.set(key, {
      id,
      number: workNumber || id,
      name: workName || `Obra ${workNumber || id}`,
      address: undefined,
      promoter: undefined,
      budget: undefined,
      execution_period: undefined,
      start_date: undefined,
      end_date: undefined,
      description: undefined,
      contact_person: undefined,
      contact_phone: undefined,
      contact_email: undefined,
      created_at: new Date(report.createdAt).toISOString(),
      created_by: tenantId,
      organization_id: tenantId,
      updated_at: new Date(report.updatedAt).toISOString(),
      latitude: undefined,
      longitude: undefined,
      street_address: undefined,
      city: undefined,
      province: undefined,
      country: undefined,
    });
  });

  return Array.from(byKey.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export const useWorks = () => {
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const hasShownFallbackToastRef = useRef(false);

  const loadWorks = useCallback(async () => {
    if (!user) return;

    startupPerfStart('hook:useWorks.loadWorks');
    setLoading(true);
    try {
      const activeTenantId = await getActiveTenantId(user);
      startupPerfStart('hook:useWorks.listProjects');
      const projects = await listProjects(activeTenantId);
      startupPerfEnd('hook:useWorks.listProjects', `count=${projects.length}`);
      const mappedWorks = projects.map(mapApiProjectToWork);
      setWorks(mappedWorks);
      hasShownFallbackToastRef.current = false;
    } catch (error: unknown) {
      const status = getErrorStatus(error);
      if (status && status >= 500) {
        try {
          startupPerfStart('hook:useWorks.offlineFallback');
          const activeTenantId = await getActiveTenantId(user);
          if (!activeTenantId) {
            setWorks([]);
            if (!hasShownFallbackToastRef.current) {
              toast.error(TENANT_REQUIRED_MESSAGE);
              hasShownFallbackToastRef.current = true;
            }
            startupPerfEnd('hook:useWorks.offlineFallback', 'missing-tenant');
            return;
          }

          const preparedTenantId = await prepareOfflineTenantScope(user, { tenantId: activeTenantId });
          const offlineWorks = await loadWorksFromOfflineReports(preparedTenantId);
          setWorks(offlineWorks);
          if (!hasShownFallbackToastRef.current) {
            toast.warning('API de obras no disponible. Mostrando obras detectadas en partes guardados offline.');
            hasShownFallbackToastRef.current = true;
          }
          console.warn('[useWorks] /api/v1/erp/projects devolvió 500. Fallback offline aplicado.');
          startupPerfEnd('hook:useWorks.offlineFallback', `count=${offlineWorks.length}`);
        } catch (fallbackError) {
          if (isTenantResolutionError(fallbackError)) {
            setWorks([]);
            if (!hasShownFallbackToastRef.current) {
              toast.error(TENANT_REQUIRED_MESSAGE);
              hasShownFallbackToastRef.current = true;
            }
            startupPerfEnd('hook:useWorks.offlineFallback', 'tenant-resolution-error');
            return;
          }

          console.error('Error loading works from offline fallback:', fallbackError);
          toast.error('Error al cargar las obras (API y fallback offline fallaron).');
          startupPerfEnd('hook:useWorks.offlineFallback', 'error');
        }
      } else {
        console.error('Error loading works:', error);
        toast.error(`Error al cargar las obras: ${getErrorMessage(error)}`);
      }
    } finally {
      setLoading(false);
      startupPerfEnd('hook:useWorks.loadWorks');
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setWorks([]);
      setLoading(false);
      return;
    }
    void loadWorks();
  }, [user, loadWorks]);

  const createWork = async (workData: Partial<Work>) => {
    if (!user) {
      console.error('No user found');
      toast.error('No hay usuario autenticado');
      return;
    }

    try {
      const activeTenantId = await getActiveTenantId(user);
      const projectData = mapWorkToProjectCreate(workData);

      if (!projectData.name) {
        throw new Error('El nombre de la obra es obligatorio');
      }

      const newProject = await createProject(projectData, activeTenantId);

      if (!newProject) {
        throw new Error('No se pudo crear la obra');
      }

      toast.success('Obra creada correctamente');
      await loadWorks();
      return mapApiProjectToWork(newProject);
    } catch (error: unknown) {
      console.error('[createWork] Error creating work:', {
        message: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      toast.error(`Error al crear la obra: ${getErrorMessage(error)}`);
      throw error;
    }
  };

  const updateWork = async (id: string, workData: Partial<Work>) => {
    try {
      const activeTenantId = await getActiveTenantId(user);
      const projectId = parseInt(id, 10);
      if (isNaN(projectId)) {
        throw new Error('ID de obra inválido');
      }

      const updateData: ProjectUpdate = {
        name: workData.name,
        code: workData.number,
        description: workData.description,
        address: workData.address || workData.street_address,
        city: workData.city,
        province: workData.province,
        country: workData.country,
        start_date: workData.start_date,
        end_date: workData.end_date,
        budget: workData.budget,
        latitude: workData.latitude !== undefined ? workData.latitude : undefined,
        longitude: workData.longitude !== undefined ? workData.longitude : undefined,
      };

      await updateProject(projectId, updateData, activeTenantId);

      toast.success('Obra actualizada correctamente');
      await loadWorks();
    } catch (error: unknown) {
      console.error('Error updating work:', error);
      toast.error(`Error al actualizar la obra: ${getErrorMessage(error)}`);
      throw error;
    }
  };

  const getWorkAssignments = async (_workId: string) => {
    console.warn('[getWorkAssignments] Not implemented in backend API yet');
    return [];
  };

  const assignUserToWork = async (_userId: string, _workId: string) => {
    console.warn('[assignUserToWork] Not implemented in backend API yet');
    toast.info('Asignación de usuarios pendiente de migración');
  };

  const removeUserFromWork = async (_userId: string, _workId: string) => {
    console.warn('[removeUserFromWork] Not implemented in backend API yet');
    toast.info('Asignación de usuarios pendiente de migración');
  };

  const deleteWork = async (id: string) => {
    try {
      const activeTenantId = await getActiveTenantId(user);
      const projectId = parseInt(id, 10);
      if (isNaN(projectId)) {
        throw new Error('ID de obra inválido');
      }

      await deleteProject(projectId, activeTenantId);

      toast.success('Obra eliminada correctamente');
      await loadWorks();
    } catch (error: unknown) {
      console.error('Error deleting work:', error);
      toast.error(`Error al eliminar la obra: ${getErrorMessage(error)}`);
      throw error;
    }
  };

  return {
    works,
    loading,
    loadWorks,
    createWork,
    updateWork,
    deleteWork,
    getWorkAssignments,
    assignUserToWork,
    removeUserFromWork,
  };
};

