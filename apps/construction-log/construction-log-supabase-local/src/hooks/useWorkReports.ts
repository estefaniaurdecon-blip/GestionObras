import { useState, useEffect } from 'react';
import { WorkReport } from '@/types/workReport';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';
import { storage } from '@/utils/storage';
import {
  deleteWorkReportRow,
  findWorkReportByUniqueFields,
  getOrganizationIdByUser,
  getUserProfileFullName,
  insertNotificationsRows,
  listAssignedWorkUserIds,
  listSiteManagerUserIds,
  listWorkReportDownloads,
  listWorkReportRows,
  subscribeWorkReportsRealtime,
  updateWorkReportRow,
  upsertWorkReportRow,
  uploadWorkReportImageAndGetPublicUrl,
} from '@/services/workReportsSupabaseGateway';

const STORAGE_KEY = 'work_reports_cache';
const PENDING_SYNC_KEY = 'work_reports_pending_sync';
const LAST_SYNC_KEY = 'work_reports_last_sync';

type PendingOperation = {
  type: 'create' | 'update' | 'delete';
  report?: WorkReport;
  reportId?: string;
  timestamp: number;
};

// Helpers: subir imágenes de albaranes al almacenamiento y usar URLs públicas
const isDataUrl = (s: unknown): s is string => typeof s === 'string' && s.startsWith('data:image');

async function uploadImageAndGetUrl(
  base64DataUrl: string,
  userId: string | number,
  reportId: string,
  section: string,
  index: number
): Promise<string> {
  return uploadWorkReportImageAndGetPublicUrl(base64DataUrl, userId, reportId, section, index);
}

async function ensureImagesUploaded(report: WorkReport, userId: string | number): Promise<WorkReport> {
  const cloned: WorkReport = JSON.parse(JSON.stringify(report));

  const processGroups = async (groups: any[] | undefined, section: string) => {
    if (!Array.isArray(groups)) return;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g && isDataUrl(g.documentImage)) {
        try {
          g.documentImage = await uploadImageAndGetUrl(g.documentImage, userId, cloned.id, section, i);
        } catch (e) {
          console.error(`Error subiendo imagen (${section})`, e);
        }
      }
    }
  };

  await processGroups((cloned as any).workGroups, 'work');
  await processGroups((cloned as any).machineryGroups, 'machinery');
  await processGroups((cloned as any).materialGroups, 'material');
  await processGroups((cloned as any).subcontractGroups, 'subcontract');

  return cloned;
}

export const useWorkReports = () => {
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { user } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  // CRÍTICO: Claves de almacenamiento DEBEN incluir organization_id para aislamiento total
  const STORAGE_KEY_USER = `${STORAGE_KEY}:${user?.id || 'nouser'}:${organizationId || 'noorg'}`;
  const PENDING_SYNC_KEY_USER = `${PENDING_SYNC_KEY}:${user?.id || 'nouser'}:${organizationId || 'noorg'}`;
  const LAST_SYNC_KEY_USER = `${LAST_SYNC_KEY}:${user?.id || 'nouser'}:${organizationId || 'noorg'}`;

  // Cargar organización del usuario para cumplir RLS
  useEffect(() => {
    const loadOrg = async () => {
      if (!user) { setOrganizationId(null); return; }
      try {
        const orgId = await getOrganizationIdByUser(user.id);
        setOrganizationId(orgId);
      } catch (error) {
        console.error('[WorkReports] Error loading organization:', error);
      }
    };
    loadOrg();
  }, [user?.id]);

  // Guardar en cache local
  // CRÍTICO: Solo guarda reportes que pertenecen a la organización actual
  const saveToCache = async (data: WorkReport[]) => {
    try {
      if (!organizationId) {
        console.warn('[WorkReports] No organizationId, skipping cache save');
        return;
      }
      // Filtro adicional de seguridad: solo cachear reportes de la org actual
      const filteredData = data.filter(r => 
        (r as any).organization_id === organizationId || (r as any).organizationId === organizationId
      );
      const trimmed = filteredData.slice(0, 120); // Limitar tamaño para evitar exceder cuota
      await storage.setItem(STORAGE_KEY_USER, JSON.stringify(trimmed));
    } catch (error) {
      console.error('Error saving to cache:', error);
      // Fallback de emergencia: guardar menos elementos todavía
      try {
        const filteredData = data.filter(r => 
          (r as any).organization_id === organizationId || (r as any).organizationId === organizationId
        );
        const minimal = filteredData.slice(0, 50);
        await storage.setItem(STORAGE_KEY_USER, JSON.stringify(minimal));
      } catch (e2) {
        console.error('Cache fallback failed:', e2);
      }
    }
  };

  // Cargar cache inicial
  useEffect(() => {
    const loadInitialCache = async () => {
      try {
        const cached = await storage.getItem(STORAGE_KEY_USER);
        if (cached) {
          const parsed: WorkReport[] = JSON.parse(cached);
          // FILTRO DE SEGURIDAD: Solo cargar reportes de la organización actual
          const filteredParsed = organizationId 
            ? parsed.filter(r => (r as any).organization_id === organizationId || (r as any).organizationId === organizationId)
            : parsed;
          // Desduplicar por (workId|date|workNumber|createdBy) quedándonos con el más reciente
          const byKey = new Map<string, WorkReport>();
          for (const r of filteredParsed) {
            const key = `${r.workId || '-'}|${r.date}|${r.workNumber}|${r.createdBy || ''}`;
            const prev = byKey.get(key);
            const prevTime = prev ? new Date(prev.updatedAt || prev.createdAt || prev.date || 0).getTime() : -1;
            const currTime = new Date(r.updatedAt || r.createdAt || r.date || 0).getTime();
            if (!prev || currTime >= prevTime) byKey.set(key, r);
          }
          setReports(Array.from(byKey.values()));
        }
      } catch (error) {
        console.error('Error loading initial cache:', error);
      } finally {
        setLoading(false);
      }
    };
    loadInitialCache();
  }, [organizationId]); // Añadir organizationId como dependencia

  // Detectar cambios online/offline y sincronizar automáticamente
  useEffect(() => {
    const handleOnline = async () => {
      console.log('🌐 Conexión restaurada, iniciando sincronización...');
      setIsOnline(true);
      if (user) {
        // Esperar un poco para asegurar que la conexión esté estable
        setTimeout(async () => {
          await syncPendingOperations();
        }, 1000);
      }
    };
    const handleOffline = () => {
      console.log('📡 Sin conexión - modo offline activado');
      setIsOnline(false);
    };

    // Sincronizar cada 2 minutos si hay conexión y operaciones pendientes
    const syncInterval = setInterval(async () => {
      if (isOnline && user) {
        const pending = await storage.getItem(PENDING_SYNC_KEY_USER);
        if (pending) {
          console.log('⏰ Sincronización automática programada...');
          await syncPendingOperations();
        }
      }
    }, 120000); // 2 minutos

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(syncInterval);
    };
  }, [user, isOnline]);

  // Suscripción a cambios en tiempo real de work_reports
  useEffect(() => {
    if (!user || !organizationId) return;

    console.log('Configurando realtime para work_reports...');
    
    const unsubscribe = subscribeWorkReportsRealtime(
      organizationId,
      async (payload) => {
          console.log('Cambio detectado en work_reports:', payload);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newReport = payload.new as any;
            
            // Convertir campos snake_case a camelCase
            const normalized: WorkReport = {
              id: newReport.id,
              workName: newReport.work_name,
              workNumber: newReport.work_number,
              workId: newReport.work_id || undefined,
              date: newReport.date,
              foreman: newReport.foreman,
              foremanHours: newReport.foreman_hours,
              foremanEntries: newReport.foreman_entries || [],
              siteManager: newReport.site_manager,
              workGroups: newReport.work_groups || [],
              machineryGroups: newReport.machinery_groups || [],
              materialGroups: newReport.material_groups || [],
              subcontractGroups: newReport.subcontract_groups || [],
              observations: newReport.observations,
              createdBy: newReport.created_by || undefined,
              createdAt: newReport.created_at,
              updatedAt: newReport.updated_at,
              approved: newReport.approved,
              approvedBy: newReport.approved_by || undefined,
              approvedAt: newReport.approved_at || undefined,
              lastEditedBy: newReport.last_edited_by || undefined,
              lastEditedAt: newReport.last_edited_at || undefined,
              foremanSignature: newReport.foreman_signature || undefined,
              siteManagerSignature: newReport.site_manager_signature || undefined,
              autoCloneNextDay: newReport.auto_clone_next_day,
              missingDeliveryNotes: newReport.missing_delivery_notes,
              status: newReport.status,
              completedSections: newReport.completed_sections || [],
              isArchived: newReport.is_archived || false,
              archivedAt: newReport.archived_at || undefined,
              archivedBy: newReport.archived_by || undefined,
            };

            setReports(prev => {
              // Eliminar duplicados primero
              const filtered = prev.filter(r => r.id !== normalized.id);
              // Agregar el nuevo/actualizado
              const updated = [normalized, ...filtered];
              // Guardar en cache
              saveToCache(updated);
              return updated;
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any).id;
            setReports(prev => {
              const updated = prev.filter(r => r.id !== deletedId);
              saveToCache(updated);
              return updated;
            });
          }
        },
      (status) => {
        console.log(' Estado de suscripción realtime:', status);
      },
    );

    return () => {
      console.log('Limpiando suscripción realtime...');
      unsubscribe();
    };
  }, [user, organizationId]);

  // Guardar operación pendiente para sincronizar después
  const savePendingOperation = async (operation: PendingOperation) => {
    try {
      const pendingStr = await storage.getItem(PENDING_SYNC_KEY_USER);
      const operations: PendingOperation[] = pendingStr ? JSON.parse(pendingStr) : [];
      operations.push(operation);
      await storage.setItem(PENDING_SYNC_KEY_USER, JSON.stringify(operations));
    } catch (error) {
      console.error('Error saving pending operation:', error);
    }
  };

  // Sincronizar operaciones pendientes cuando vuelva la conexión
  const syncPendingOperations = async () => {
    if (!user) return;

    try {
      const pending = await storage.getItem(PENDING_SYNC_KEY_USER);
      if (!pending) return;

      const operations: PendingOperation[] = JSON.parse(pending);
      const failedOps: PendingOperation[] = [];
      let syncedCount = 0;
      
      console.log(`🔄 Sincronizando ${operations.length} operaciones pendientes...`);
      // Asegurar organization_id para cumplir RLS
      let orgId = organizationId as string | null;
      if (!orgId) {
        orgId = await getOrganizationIdByUser(user.id);
      }
      
      for (const op of operations) {
        try {
          if (op.type === 'create' || op.type === 'update') {
            if (op.report) {
              // Subir imágenes si vienen en base64 (Android) y reemplazar por URLs
              const processed = await ensureImagesUploaded(op.report, user.id);

              const reportData: any = {
                id: processed.id,
                work_name: processed.workName,
                work_number: processed.workNumber,
                work_id: processed.workId || null,
                date: processed.date,
                foreman: processed.foreman,
                foreman_hours: processed.foremanHours,
                foreman_entries: processed.foremanEntries || [],
                foreman_signature: processed.foremanSignature || null,
                site_manager: processed.siteManager,
                site_manager_signature: processed.siteManagerSignature || null,
                work_groups: processed.workGroups,
                machinery_groups: processed.machineryGroups,
                material_groups: processed.materialGroups,
                subcontract_groups: processed.subcontractGroups,
                observations: processed.observations,
                status: processed.status || 'missing_data',
                missing_delivery_notes: processed.missingDeliveryNotes || false,
                auto_clone_next_day: processed.autoCloneNextDay || false,
                completed_sections: processed.completedSections || [],
                created_by: user.id,
                organization_id: orgId,
              };
              
              // Si es una actualización y el editor no es el creador, registrar la edición
              if (op.type === 'update' && processed.createdBy && Number(processed.createdBy) !== Number(user.id)) {
                reportData.last_edited_by = user.id;
                reportData.last_edited_at = new Date().toISOString();
              }
              
              // Intentar upsert primero
              let error: any = null;
              try {
                await upsertWorkReportRow(reportData);
              } catch (upsertError) {
                error = upsertError;
              }
              
              // Si falla por duplicado (unique constraint en work_id+date+work_number), 
              // buscar el parte existente y actualizar sus datos
              if (error?.code === '23505') {
                console.log(`Parte duplicado detectado, buscando existente para fusionar...`);
                
                // Buscar el parte existente por los campos únicos
                const existing = await findWorkReportByUniqueFields(
                  processed.workId,
                  processed.date,
                  processed.workNumber,
                );
                
                if (existing) {
                  // Actualizar el parte existente con los datos del local
                  const { id: _localId, ...dataWithoutId } = reportData;
                  await updateWorkReportRow(existing.id, {
                    ...dataWithoutId,
                    last_edited_by: user.id,
                    last_edited_at: new Date().toISOString(),
                  });
                  
                  console.log(` Parte fusionado con existente: ${existing.id}`);
                  syncedCount++;
                  
                  // Actualizar el estado local para reflejar el ID correcto
                  setReports(prev => prev.map(r => 
                    r.id === processed.id ? { ...r, id: existing.id } : r
                  ));
                  continue;
                } else {
                  throw error;
                }
              }
              
              if (error) throw error;
              syncedCount++;
              console.log(` Sincronizado: ${op.type} - ${processed.workName}`);
            }
          } else if (op.type === 'delete' && op.reportId) {
            await deleteWorkReportRow(op.reportId);
            syncedCount++;
            console.log(`Sincronizado: delete - ${op.reportId}`);
          }
        } catch (error) {
          console.error('Error syncing operation:', error);
          failedOps.push(op);
        }
      }

      // Guardar solo las operaciones que fallaron
      if (failedOps.length > 0) {
        await storage.setItem(PENDING_SYNC_KEY_USER, JSON.stringify(failedOps));
        console.log(`⚠️ ${failedOps.length} operaciones pendientes de sincronizar`);
      } else {
        await storage.removeItem(PENDING_SYNC_KEY_USER);
        console.log(`✅ Todas las operaciones sincronizadas correctamente`);
      }

      if (syncedCount > 0) {
        toast({
          title: "Sincronización completada",
          description: `Se sincronizaron ${syncedCount} cambios con el servidor`,
        });
        // Recargar desde servidor solo si hubo cambios
        await loadReportsFromServer();
      }
    } catch (error) {
      console.error('Error syncing pending operations:', error);
      toast({
        title: "Error de sincronización",
        description: "Algunos cambios no pudieron sincronizarse. Se reintentará automáticamente.",
        variant: "destructive",
      });
    }
  };

  // Cargar desde servidor (en segundo plano)
  const loadReportsFromServer = async () => {
    if (!user) return;

    setIsSyncing(true);
    
      const normalize = (rows: any[]): WorkReport[] => (rows || []).map((report: any) => ({
        id: report.id,
        workName: report.work_name,
        workNumber: report.work_number,
        workId: report.work_id || undefined,
        date: report.date,
        foreman: report.foreman || '',
        foremanHours: Number(report.foreman_hours) || 0,
        foremanEntries: report.foreman_entries || [],
        foremanSignature: report.foreman_signature || '',
        siteManager: report.site_manager || '',
        siteManagerSignature: report.site_manager_signature || '',
        workGroups: report.work_groups || [],
        machineryGroups: report.machinery_groups || [],
        materialGroups: report.material_groups || [],
        subcontractGroups: report.subcontract_groups || [],
        observations: report.observations || '',
        status: report.status || 'missing_data',
        missingDeliveryNotes: report.missing_delivery_notes || false,
        autoCloneNextDay: report.auto_clone_next_day || false,
        completedSections: report.completed_sections || [],
        createdAt: report.created_at,
        updatedAt: report.updated_at,
        createdBy: report.created_by || undefined,
        approved: report.approved || false,
        approvedBy: report.approved_by || undefined,
        approvedAt: report.approved_at || undefined,
        lastEditedBy: report.last_edited_by || undefined,
        lastEditedAt: report.last_edited_at || undefined,
        isArchived: report.is_archived || false,
        archivedAt: report.archived_at || undefined,
        archivedBy: report.archived_by || undefined,
      }));

    try {
      // Cargar con RLS: el backend devolverá solo lo que puedes ver (si eres ADMIN, todo)
      const allReports = await listWorkReportRows(200);

      const normalizedReports = normalize(allReports || []);

      // Deduplicar reportes: priorizar los que tienen datos sobre los vacíos
      const deduplicateReports = (reps: WorkReport[]): WorkReport[] => {
        const byKey = new Map<string, WorkReport>();
        
        // Función para calcular el "peso" de datos de un reporte
        const getDataWeight = (r: WorkReport): number => {
          let weight = 0;
          const countItems = (groups?: any[]) => {
            if (!Array.isArray(groups)) return 0;
            return groups.reduce((sum, g) => {
              if (!g.items || !Array.isArray(g.items)) return sum;
              return sum + g.items.filter((item: any) => 
                item.name || item.activity || item.hours > 0 || item.type
              ).length;
            }, 0);
          };
          weight += countItems(r.workGroups);
          weight += countItems(r.machineryGroups);
          weight += countItems(r.materialGroups);
          weight += countItems(r.subcontractGroups);
          if (r.observations) weight += 1;
          return weight;
        };
        
        for (const r of reps) {
          // Clave de deduplicación: workId + date + workNumber
          const key = `${r.workId || '-'}|${r.date}|${r.workNumber}`;
          const existing = byKey.get(key);
          
          if (!existing) {
            byKey.set(key, r);
          } else {
            // Comparar peso de datos: el que tenga más datos gana
            const existingWeight = getDataWeight(existing);
            const currentWeight = getDataWeight(r);
            
            if (currentWeight > existingWeight) {
              byKey.set(key, r);
              console.log(`🔄 Deduplicación: reemplazando reporte vacío con uno que tiene datos (${r.date})`);
            }
          }
        }
        
        return Array.from(byKey.values());
      };
      
      const deduplicatedReports = deduplicateReports(normalizedReports);

      // Auto-curación: si hay imágenes base64 en cualquier sección, súbelas a almacenamiento y reemplaza por URLs públicas
      const hasBase64InReport = (r: WorkReport) => {
        const check = (arr?: any[]) => Array.isArray(arr) && arr.some(g => isDataUrl(g?.documentImage));
        return (
          check(r.workGroups) ||
          check(r.machineryGroups) ||
          check(r.materialGroups) ||
          check(r.subcontractGroups)
        );
      };

      let anyFixed = false;
      const healedReports: WorkReport[] = [];
      // Asegurar organization_id para cumplir RLS en curación
      let orgId = organizationId as string | null;
      if (!orgId) {
        orgId = await getOrganizationIdByUser(user.id);
      }
      
      for (const r of deduplicatedReports) {
        if (hasBase64InReport(r) && user) {
          try {
            const processed = await ensureImagesUploaded(r, user.id);
            // Upsert curado para persistir URLs en el backend
            const reportData: any = {
              id: processed.id,
              work_name: processed.workName,
              work_number: processed.workNumber,
              work_id: processed.workId || null,
              date: processed.date,
              foreman: processed.foreman,
              foreman_hours: processed.foremanHours,
              foreman_entries: processed.foremanEntries || [],
              foreman_signature: processed.foremanSignature || null,
              site_manager: processed.siteManager,
              site_manager_signature: processed.siteManagerSignature || null,
              work_groups: processed.workGroups,
              machinery_groups: processed.machineryGroups,
              material_groups: processed.materialGroups,
              subcontract_groups: processed.subcontractGroups,
              observations: processed.observations,
              status: processed.status || 'missing_data',
              missing_delivery_notes: processed.missingDeliveryNotes || false,
              auto_clone_next_day: processed.autoCloneNextDay || false,
              created_by: processed.createdBy || user.id,
              organization_id: orgId,
            };
            let upsertError: unknown = null;
            try {
              await upsertWorkReportRow(reportData);
            } catch (error) {
              upsertError = error;
            }
            if (upsertError) {
              console.warn('No se pudo curar el parte (upsert falló):', upsertError);
              healedReports.push(r);
            } else {
              healedReports.push(processed);
              anyFixed = true;
            }
          } catch (e) {
            console.warn('No se pudo curar imágenes base64:', e);
            healedReports.push(r);
          }
        } else {
          healedReports.push(r);
        }
      }

      setReports(healedReports);
      await saveToCache(healedReports);
      await storage.setItem(LAST_SYNC_KEY_USER, Date.now().toString());

      if (anyFixed) {
        toast({
          title: 'Imágenes optimizadas',
          description: 'Se han convertido albaranes a enlaces seguros.',
        });
      }
    } catch (error: any) {
      console.error('Error loading reports from server:', error);
      // En caso de error, intentar cargar desde caché
      try {
        const cachedStr = await storage.getItem(STORAGE_KEY_USER);
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (cached.length > 0) {
            setReports(cached);
          }
        }
      } catch (cacheError) {
        console.error('Error loading from cache:', cacheError);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Carga inicial: ya tenemos cache, solo sincronizar en background
  const loadReports = async () => {
    if (!user) {
      setReports([]);
      return;
    }

    // Sincronizar con servidor solo si:
    // 1. Hay conexión
    // 2. No se ha sincronizado recientemente (últimos 30 segundos)
    const lastSyncStr = await storage.getItem(LAST_SYNC_KEY_USER);
    const shouldSync = !lastSyncStr || (Date.now() - parseInt(lastSyncStr)) > 30000;

    if (shouldSync) {
      await syncPendingOperations();
      await loadReportsFromServer();
    }
  };

  useEffect(() => {
    loadReports();
  }, [user?.id]);

  // Guardar parte (instantáneo con actualización optimista)
  const saveReport = async (report: WorkReport) => {
    if (!user) return;

    try {
      // Crear una clave de deduplicación única
      const dedupeKey = `${report.workId || '-'}|${report.date}|${report.workNumber}|${user.id}`;
      
      // Verificar si ya existe un reporte con esta combinación
      const existingByDedupe = reports.find(r => 
        `${r.workId || '-'}|${r.date}|${r.workNumber}|${r.createdBy || user.id}` === dedupeKey &&
        r.id !== report.id
      );

      if (existingByDedupe) {
        toast({
          title: "Reporte duplicado",
          description: "Ya existe un parte con esta obra, fecha y número",
          variant: "destructive",
        });
        return;
      }

      // Actualización optimista instantánea
      const optimisticReport: WorkReport = {
        ...report,
        createdBy: user.id,
        createdAt: report.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Verificar si existe por ID
      const existingIndex = reports.findIndex(r => r.id === report.id);
      const isUpdate = existingIndex >= 0;

      // Actualizar UI inmediatamente
      let newReports;
      if (isUpdate) {
        newReports = [...reports];
        newReports[existingIndex] = {
          ...optimisticReport,
          createdAt: reports[existingIndex].createdAt,
        };
      } else {
        newReports = [optimisticReport, ...reports];
      }
      setReports(newReports);
      await saveToCache(newReports);

      // Guardar operación pendiente
      await savePendingOperation({
        type: isUpdate ? 'update' : 'create',
        report: optimisticReport,
        timestamp: Date.now()
      });

      // Toast instantáneo
      toast({
        title: "Parte guardado",
        description: isOnline ? "Sincronizando con servidor..." : "Se guardará cuando vuelva la conexión",
      });

      // Sincronizar con servidor si hay conexión
      if (isOnline) {
        const processed = await ensureImagesUploaded(optimisticReport, user.id);
        // Asegurar organization_id para cumplir RLS
        let orgId = organizationId as string | null;
        if (!orgId) {
          orgId = await getOrganizationIdByUser(user.id);
        }
        const reportData: any = {
          id: processed.id,
          work_name: processed.workName,
          work_number: processed.workNumber,
          work_id: processed.workId || null,
          date: processed.date,
          foreman: processed.foreman,
          foreman_hours: processed.foremanHours,
          foreman_entries: processed.foremanEntries || [],
          foreman_signature: processed.foremanSignature || null,
          site_manager: processed.siteManager,
          site_manager_signature: processed.siteManagerSignature || null,
          work_groups: processed.workGroups,
          machinery_groups: processed.machineryGroups,
          material_groups: processed.materialGroups,
          subcontract_groups: processed.subcontractGroups,
          observations: processed.observations,
          status: processed.status || 'missing_data',
          missing_delivery_notes: processed.missingDeliveryNotes || false,
          auto_clone_next_day: processed.autoCloneNextDay || false,
          completed_sections: processed.completedSections || [],
          created_by: user.id,
          organization_id: orgId,
        };

        // Si es una actualización y el editor no es el creador, registrar la edición
        if (isUpdate && processed.createdBy && Number(processed.createdBy) !== Number(user.id)) {
          reportData.last_edited_by = user.id;
          reportData.last_edited_at = new Date().toISOString();
        }

        // Verificar status anterior para detectar si cambió a completed
        const previousReport = reports.find(r => r.id === processed.id);
        const wasCompleted = previousReport?.status === 'completed';
        const isNowCompleted = processed.status === 'completed';

        let error: any = null;
        try {
          await upsertWorkReportRow(reportData);
        } catch (upsertError) {
          error = upsertError;
        }

        // Si falla por duplicado, buscar el existente y actualizar
        if (error?.code === '23505') {
          console.log(`Parte duplicado detectado en guardado directo, fusionando...`);
          
          const existing = await findWorkReportByUniqueFields(
                  processed.workId,
                  processed.date,
                  processed.workNumber,
                );
          
          if (existing) {
            const { id: _localId, ...dataWithoutId } = reportData;
            await updateWorkReportRow(existing.id, {
                    ...dataWithoutId,
                    last_edited_by: user.id,
                    last_edited_at: new Date().toISOString(),
                  });
            
            // Actualizar el estado local con el ID correcto
            setReports(prev => prev.map(r => 
              r.id === processed.id ? { ...r, id: existing.id } : r
            ));
            
            toast({
              title: "Parte actualizado",
              description: "Se ha fusionado con el parte existente para esta fecha",
            });
            
            // Limpiar operaciones pendientes
            const pending = await storage.getItem(PENDING_SYNC_KEY_USER);
            if (pending) {
              const operations: PendingOperation[] = JSON.parse(pending);
              const filtered = operations.filter(op => 
                !(op.report?.id === optimisticReport.id && (op.type === 'create' || op.type === 'update'))
              );
              await storage.setItem(PENDING_SYNC_KEY_USER, JSON.stringify(filtered));
            }
            return; // Salir exitosamente
          } else {
            throw error;
          }
        }

        if (error) throw error;

        // Crear notificación para jefes de obra cuando un parte se completa
        if (isNowCompleted && !wasCompleted && orgId && processed.workId) {
          try {
            // Buscar jefes de obra asignados a esta obra específica
            const siteManagers = await listSiteManagerUserIds(orgId);

            if (siteManagers && siteManagers.length > 0) {
              // Filtrar solo los que están asignados a esta obra
              const assignedSiteManagerIds = await listAssignedWorkUserIds(
                processed.workId,
                siteManagers,
              );

              if (assignedSiteManagerIds.length > 0) {
                // Formatear la fecha del parte
                const formattedDate = new Date(processed.date).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                });

                // Crear notificaciones para los jefes de obra asignados a esta obra
                const notifications = assignedSiteManagerIds.map((siteManagerUserId) => ({
                  user_id: siteManagerUserId,
                  organization_id: orgId,
                  type: 'work_report_completed',
                  title: 'Parte completado',
                  message: `El parte "${processed.workName}" (${processed.workNumber}) del ${formattedDate} ha sido completado`,
                  related_id: processed.id,
                  read: false,
                }));

                await insertNotificationsRows(notifications);
              }
            }
          } catch (notifError) {
            console.warn('Error creando notificaciones:', notifError);
            // No bloquear el guardado del parte si fallan las notificaciones
          }
        }

        // Notificar a usuarios que descargaron el parte si ha sido modificado
        if (isUpdate && orgId) {
          try {
            const modificationTime = new Date().toISOString();
            
            // Buscar usuarios que descargaron este parte antes de la modificación
            const downloads = await listWorkReportDownloads(processed.id, user.id);

            if (downloads && downloads.length > 0) {
              // Determinar qué secciones fueron modificadas
              const modifiedSections: string[] = [];
              
              if (previousReport) {
                if (JSON.stringify(previousReport.workGroups) !== JSON.stringify(processed.workGroups)) {
                  modifiedSections.push('Trabajos');
                }
                if (JSON.stringify(previousReport.machineryGroups) !== JSON.stringify(processed.machineryGroups)) {
                  modifiedSections.push('Maquinaria');
                }
                if (JSON.stringify(previousReport.materialGroups) !== JSON.stringify(processed.materialGroups)) {
                  modifiedSections.push('Materiales');
                }
                if (JSON.stringify(previousReport.subcontractGroups) !== JSON.stringify(processed.subcontractGroups)) {
                  modifiedSections.push('Subcontratas');
                }
                if (previousReport.observations !== processed.observations) {
                  modifiedSections.push('Observaciones');
                }
                if (previousReport.foreman !== processed.foreman) {
                  modifiedSections.push('Encargado');
                }
                if (previousReport.siteManager !== processed.siteManager) {
                  modifiedSections.push('Jefe de obra');
                }
                if (previousReport.status !== processed.status) {
                  modifiedSections.push('Estado');
                }
              }

              // Solo notificar si hubo cambios detectables
              if (modifiedSections.length > 0 || !previousReport) {
                const formattedDate = new Date(processed.date).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                });

                const sectionsText = modifiedSections.length > 0 
                  ? `. Secciones modificadas: ${modifiedSections.join(', ')}`
                  : '';

                // Obtener nombre del editor
                const editorName = (await getUserProfileFullName(user.id)) || 'Un usuario';

                // Crear notificaciones para los usuarios que descargaron el parte
                const notifications = downloads.map((d: any) => ({
                  user_id: d.user_id,
                  organization_id: orgId,
                  type: 'work_report_modified',
                  title: 'Parte modificado después de descarga',
                  message: `${editorName} ha modificado el parte "${processed.workName}" (${processed.workNumber}) del ${formattedDate} que ya habías descargado${sectionsText}`,
                  related_id: processed.id,
                  read: false,
                  metadata: JSON.stringify({
                    modified_sections: modifiedSections,
                    modified_by: user.id,
                    modified_at: modificationTime
                  })
                }));

                await insertNotificationsRows(notifications);
              }
            }
          } catch (notifError) {
            console.warn('Error creando notificaciones de modificación:', notifError);
            // No bloquear el guardado del parte si fallan las notificaciones
          }
        }


        // Eliminar de operaciones pendientes
        const pending = await storage.getItem(PENDING_SYNC_KEY_USER);
        if (pending) {
          const operations: PendingOperation[] = JSON.parse(pending);
          const filtered = operations.filter(op => 
            !(op.report?.id === optimisticReport.id && (op.type === 'create' || op.type === 'update'))
          );
          await storage.setItem(PENDING_SYNC_KEY_USER, JSON.stringify(filtered));
        }
      }
    } catch (error: any) {
      console.error('Error saving report:', error);
      if (isOnline) {
        toast({
          title: "Error al sincronizar",
          description: "Se ha guardado localmente y se reintentará después",
          variant: "destructive",
        });
      }
    }
  };

  // Eliminar parte (instantáneo con actualización optimista)
  const deleteReport = async (reportId: string) => {
    if (!user) return;

    try {
      // Actualizar UI inmediatamente
      const newReports = reports.filter(r => r.id !== reportId);
      setReports(newReports);
      await saveToCache(newReports);

      // Guardar operación pendiente
      await savePendingOperation({
        type: 'delete',
        reportId,
        timestamp: Date.now()
      });

      toast({
        title: "Parte eliminado",
        description: isOnline ? "Sincronizando con servidor..." : "Se eliminará cuando vuelva la conexión",
      });

      // Sincronizar con servidor si hay conexión
      if (isOnline) {
        await deleteWorkReportRow(reportId);

        // Eliminar de operaciones pendientes
        const pending = await storage.getItem(PENDING_SYNC_KEY);
        if (pending) {
          const operations: PendingOperation[] = JSON.parse(pending);
          const filtered = operations.filter(op => 
            !(op.reportId === reportId && op.type === 'delete')
          );
          await storage.setItem(PENDING_SYNC_KEY, JSON.stringify(filtered));
        }
      }
    } catch (error: any) {
      console.error('Error deleting report:', error);
      if (isOnline) {
        toast({
          title: "Error al sincronizar",
          description: "Se ha eliminado localmente y se sincronizará después",
          variant: "destructive",
        });
      }
    }
  };

  // Approve report
  const approveReport = async (reportId: string) => {
    if (!user) return;

    try {
      // Actualizar UI inmediatamente (optimistic update)
      const updatedReports = reports.map(r => 
        r.id === reportId 
          ? { ...r, approved: true, approvedBy: user.id, approvedAt: new Date().toISOString() }
          : r
      );
      setReports(updatedReports);
      await saveToCache(updatedReports);

      // Actualizar en el backend
      await updateWorkReportRow(reportId, {
        approved: true,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      });
      
      toast({
        title: "Parte aprobado",
        description: "El parte de trabajo ha sido aprobado correctamente.",
      });
    } catch (error: any) {
      console.error('Error approving report:', error);
      // Revertir cambio optimista en caso de error
      await loadReportsFromServer();
      toast({
        title: "Error al aprobar",
        description: error.message || "No se pudo aprobar el parte de trabajo",
        variant: "destructive",
      });
    }
  };

  // Unapprove report
  const unapproveReport = async (reportId: string) => {
    if (!user) return;

    try {
      // Actualizar UI inmediatamente (optimistic update)
      const updatedReports = reports.map(r => 
        r.id === reportId 
          ? { ...r, approved: false, approvedBy: undefined, approvedAt: undefined }
          : r
      );
      setReports(updatedReports);
      await saveToCache(updatedReports);

      // Actualizar en el backend
      await updateWorkReportRow(reportId, {
        approved: false,
        approved_by: null,
        approved_at: null,
      });
      
      toast({
        title: "Aprobación revocada",
        description: "La aprobación del parte ha sido revocada.",
      });
    } catch (error: any) {
      console.error('Error unapproving report:', error);
      // Revertir cambio optimista en caso de error
      await loadReportsFromServer();
      toast({
        title: "Error al revocar",
        description: error.message || "No se pudo revocar la aprobación",
        variant: "destructive",
      });
    }
  };

  // Archive report (showToast=false cuando se archiva en lote)
  // Ahora acepta un array de IDs para archivado masivo eficiente
  const archiveReport = async (reportIdOrIds: string | string[], showToast: boolean = true) => {
    if (!user) return;

    const reportIds = Array.isArray(reportIdOrIds) ? reportIdOrIds : [reportIdOrIds];
    
    if (reportIds.length === 0) return;

    try {
      const now = new Date().toISOString();
      
      // Actualizar UI inmediatamente (optimistic update) - todos los IDs de una vez
      const updatedReports = reports.map(r => 
        reportIds.includes(r.id)
          ? { ...r, isArchived: true, archivedBy: user.id, archivedAt: now }
          : r
      );
      setReports(updatedReports);
      await saveToCache(updatedReports);

      // Actualizar en el backend - UNA SOLA OPERACIÓN para todos los IDs
      await Promise.all(
        reportIds.map((reportId) =>
          updateWorkReportRow(reportId, {
            is_archived: true,
            archived_by: user.id,
            archived_at: now,
          }),
        ),
      );
      
      if (showToast) {
        const count = reportIds.length;
        toast({
          title: count === 1 ? "Parte archivado" : "Partes archivados",
          description: count === 1 
            ? "El parte ha sido archivado y no aparecerá en la lista principal."
            : `Se han archivado ${count} partes correctamente.`,
        });
      }
    } catch (error: any) {
      console.error('Error archiving report(s):', error);
      // Revertir cambio optimista en caso de error
      await loadReportsFromServer();
      toast({
        title: "Error al archivar",
        description: error.message || "No se pudo archivar el/los parte(s) de trabajo",
        variant: "destructive",
      });
      throw error; // Re-lanzar para que el caller sepa que falló
    }
  };

  // Unarchive report
  const unarchiveReport = async (reportId: string) => {
    if (!user) return;

    try {
      // Actualizar UI inmediatamente (optimistic update)
      const updatedReports = reports.map(r => 
        r.id === reportId 
          ? { ...r, isArchived: false, archivedBy: undefined, archivedAt: undefined }
          : r
      );
      setReports(updatedReports);
      await saveToCache(updatedReports);

      // Actualizar en el backend
      await updateWorkReportRow(reportId, {
        is_archived: false,
        archived_by: null,
        archived_at: null,
      });
      
      toast({
        title: "Parte restaurado",
        description: "El parte ha sido restaurado y ya es visible en la lista principal.",
      });
    } catch (error: any) {
      console.error('Error unarchiving report:', error);
      // Revertir cambio optimista en caso de error
      await loadReportsFromServer();
      toast({
        title: "Error al restaurar",
        description: error.message || "No se pudo restaurar el parte de trabajo",
        variant: "destructive",
      });
    }
  };

  // Remove duplicate material groups globally across all reports
  const removeDuplicatesGlobally = async () => {
    if (!user) return { removedCount: 0, updatedReportsCount: 0 };

    try {
      let totalRemoved = 0;
      const duplicatesInfo: Array<{
        reportId: string;
        reportName: string;
        reportDate: string;
        duplicates: Array<{
          supplier: string;
          invoiceNumber: string;
          count: number;
        }>;
      }> = [];
      const updatedReports: WorkReport[] = [];

      // Process each report
      for (const report of reports) {
        const materialGroups = report.materialGroups || [];
        
        // Create map to track unique invoices
        const seen = new Map<string, any>();
        const deduplicatedGroups: any[] = [];
        let reportRemovedCount = 0;
        const reportDuplicates: Array<{
          supplier: string;
          invoiceNumber: string;
          count: number;
        }> = [];

        materialGroups.forEach(group => {
          // Create unique key based on supplier + invoice number
          const key = `${group.supplier?.trim().toLowerCase() || ''}-${group.invoiceNumber?.trim().toLowerCase() || ''}`;
          
          // Only consider as duplicate if both fields have value
          if (group.supplier && group.invoiceNumber) {
            if (!seen.has(key)) {
              seen.set(key, { group, count: 1 });
              deduplicatedGroups.push(group);
            } else {
              seen.get(key).count++;
              totalRemoved++;
              reportRemovedCount++;
            }
          } else {
            // Keep groups without supplier or invoice number
            deduplicatedGroups.push(group);
          }
        });

        // Collect duplicate info for this report
        if (reportRemovedCount > 0) {
          seen.forEach(({ group, count }) => {
            if (count > 1) {
              reportDuplicates.push({
                supplier: group.supplier,
                invoiceNumber: group.invoiceNumber,
                count
              });
            }
          });
          
          duplicatesInfo.push({
            reportId: report.id,
            reportName: report.workName,
            reportDate: report.date,
            duplicates: reportDuplicates
          });
        }

        // If duplicates were found in this report, update it
        if (deduplicatedGroups.length !== materialGroups.length) {
          const updatedReport = {
            ...report,
            materialGroups: deduplicatedGroups,
            updatedAt: new Date().toISOString(),
          };
          updatedReports.push(updatedReport);
        }
      }

      // Save all updated reports
      if (updatedReports.length > 0) {
        // Update local state
        const newReports = reports.map(r => {
          const updated = updatedReports.find(ur => ur.id === r.id);
          return updated || r;
        });
        setReports(newReports);
        await saveToCache(newReports);

        // Update in database if online
        if (isOnline) {
          // Get organization_id
          let orgId = organizationId as string | null;
          if (!orgId) {
            orgId = await getOrganizationIdByUser(user.id);
          }

          for (const report of updatedReports) {
            // Process images
            const processed = await ensureImagesUploaded(report, user.id);
            
            const reportData: any = {
              id: processed.id,
              work_name: processed.workName,
              work_number: processed.workNumber,
              work_id: processed.workId || null,
              date: processed.date,
              foreman: processed.foreman,
              foreman_hours: processed.foremanHours,
              site_manager: processed.siteManager,
              work_groups: processed.workGroups,
              machinery_groups: processed.machineryGroups,
              material_groups: processed.materialGroups,
              subcontract_groups: processed.subcontractGroups,
              observations: processed.observations,
              status: processed.status || 'missing_data',
              missing_delivery_notes: processed.missingDeliveryNotes || false,
              auto_clone_next_day: processed.autoCloneNextDay || false,
              created_by: report.createdBy || user.id,
              organization_id: orgId,
            };
            
            try {
              await updateWorkReportRow(report.id, reportData);
            } catch (error) {
              console.error('Error updating report during deduplication:', error);
            }
          }
        }
      }

      return { 
        removedCount: totalRemoved, 
        updatedReportsCount: updatedReports.length,
        duplicatesInfo
      };
    } catch (error) {
      console.error('Error removing duplicates globally:', error);
      return { removedCount: 0, updatedReportsCount: 0, duplicatesInfo: [] };
    }
  };

  return {
    reports,
    loading,
    isSyncing,
    saveReport,
    deleteReport,
    approveReport,
    unapproveReport,
    archiveReport,
    unarchiveReport,
    reloadReports: loadReports,
    removeDuplicatesGlobally,
  };
};
