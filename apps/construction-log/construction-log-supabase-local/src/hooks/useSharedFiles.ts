import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ACTIVE_TENANT_CHANGED_EVENT, getActiveTenantId } from '@/offline-db/tenantScope';
import { toast } from './use-toast';
import { isNative, saveBlobFile } from '@/utils/nativeFile';
import type { SharedFileApi } from '@/integrations/api/modules/attachments';
import {
  createSharedFile,
  deleteSharedFile,
  downloadSharedFile,
  listSharedFiles,
  markSharedFileDownloaded,
} from '@/integrations/api/client';
import {
  createPendingSharedFileRecord,
  fileBase64ToBlob,
  mergeSharedFileRecords,
  readStoredSharedFiles,
  type StoredSharedFileRecord,
  writeStoredSharedFiles,
} from './messagingOfflineStore';

export type SharedFile = StoredSharedFileRecord;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return 'Error inesperado';
};

const isRetriableSharedFileError = (error: unknown): boolean => {
  if (error instanceof TypeError) return true;

  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? Number((error as { status?: number }).status)
    : null;

  if (status === 0 || status === 401) return true;

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('err_internet_disconnected') ||
    message.includes('request timeout') ||
    message.includes('sesi')
  );
};

const toStoredSharedFile = (item: SharedFileApi): SharedFile => ({
  ...item,
  from_user_id: String(item.from_user_id),
  to_user_id: String(item.to_user_id),
  work_report_id: item.work_report_id ?? undefined,
  message: item.message ?? undefined,
  downloaded: Boolean(item.downloaded),
  syncStatus: 'synced',
  lastSyncError: null,
  localBlobBase64: null,
  localContentType: null,
});

export const useSharedFiles = () => {
  const [sentFiles, setSentFiles] = useState<SharedFile[]>([]);
  const [receivedFiles, setReceivedFiles] = useState<SharedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const { user } = useAuth();
  const storedFilesRef = useRef<SharedFile[]>([]);
  const loadErrorShown = useRef(false);

  const sharedFilesScopeId = useMemo(
    () => (user && activeTenantId ? `user-${user.id}::tenant-${activeTenantId}` : null),
    [activeTenantId, user]
  );

  useEffect(() => {
    let cancelled = false;

    const resolveTenant = async () => {
      if (!user) {
        if (!cancelled) setActiveTenantId(null);
        return;
      }

      const tenantId = await getActiveTenantId(user);
      if (!cancelled) {
        setActiveTenantId(tenantId);
      }
    };

    void resolveTenant();
    const handleActiveTenantChange = () => {
      void resolveTenant();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(ACTIVE_TENANT_CHANGED_EVENT, handleActiveTenantChange as EventListener);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener(ACTIVE_TENANT_CHANGED_EVENT, handleActiveTenantChange as EventListener);
      }
    };
  }, [user]);

  const applyFiles = useCallback(
    (next: SharedFile[]) => {
      const currentUserId = user ? String(user.id) : null;
      storedFilesRef.current = next;

      if (!currentUserId) {
        setSentFiles([]);
        setReceivedFiles([]);
        return;
      }

      setSentFiles(next.filter((file) => file.from_user_id === currentUserId));
      setReceivedFiles(next.filter((file) => file.to_user_id === currentUserId));
    },
    [user]
  );

  const persistFiles = useCallback(
    async (next: SharedFile[]) => {
      if (!sharedFilesScopeId) {
        applyFiles(next);
        return next;
      }

      const stored = await writeStoredSharedFiles(sharedFilesScopeId, next);
      applyFiles(stored);
      return stored;
    },
    [applyFiles, sharedFilesScopeId]
  );

  const syncPendingFiles = useCallback(
    async (source: SharedFile[]): Promise<SharedFile[]> => {
      if (!activeTenantId) {
        return source;
      }

      let next = [...source];
      let changed = false;

      for (const item of source) {
        if (item.syncStatus !== 'pending') continue;

        if (!item.localBlobBase64) {
          next = next.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  syncStatus: 'error',
                  lastSyncError: 'No se encontró el archivo local para reenviar.',
                }
              : candidate
          );
          changed = true;
          continue;
        }

        try {
          const blob = fileBase64ToBlob(
            item.localBlobBase64,
            item.localContentType || item.file_type || 'application/octet-stream'
          );
          const file = new File([blob], item.file_name, {
            type: item.localContentType || item.file_type || 'application/octet-stream',
          });

          const created = await createSharedFile({
            file,
            to_user_id: item.to_user_id,
            message: item.message,
            work_report_id: item.work_report_id,
            tenantId: activeTenantId,
          });

          next = next
            .filter((candidate) => candidate.id !== item.id)
            .concat(toStoredSharedFile(created));
          changed = true;
        } catch (error) {
          if (isRetriableSharedFileError(error)) {
            next = next.map((candidate) =>
              candidate.id === item.id
                ? {
                    ...candidate,
                    syncStatus: 'pending',
                    lastSyncError: getErrorMessage(error),
                  }
                : candidate
            );
            continue;
          }

          next = next.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  syncStatus: 'error',
                  lastSyncError: getErrorMessage(error),
                }
              : candidate
          );
          changed = true;
        }
      }

      if (changed) {
        return persistFiles(next);
      }

      return next;
    },
    [activeTenantId, persistFiles]
  );

  const loadFiles = useCallback(async () => {
    if (!user || !sharedFilesScopeId || !activeTenantId) {
      storedFilesRef.current = [];
      setSentFiles([]);
      setReceivedFiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const cachedFiles = await readStoredSharedFiles(sharedFilesScopeId);
    if (cachedFiles.length > 0) {
      applyFiles(cachedFiles);
    }

    try {
      const localAfterSync = await syncPendingFiles(
        cachedFiles.length > 0 ? cachedFiles : storedFilesRef.current
      );

      const [sent, received] = await Promise.all([
        listSharedFiles('sent', activeTenantId),
        listSharedFiles('received', activeTenantId),
      ]);

      const merged = mergeSharedFileRecords(
        sent.concat(received).map(toStoredSharedFile),
        localAfterSync
      );

      await persistFiles(merged);
      loadErrorShown.current = false;
    } catch (error: unknown) {
      console.error('Error loading shared files:', error);

      const fallbackFiles = storedFilesRef.current.length > 0 ? storedFilesRef.current : cachedFiles;
      if (fallbackFiles.length > 0) {
        applyFiles(fallbackFiles);
      }

      if (!loadErrorShown.current && fallbackFiles.length === 0) {
        toast({
          title: 'Error',
          description: 'No se pudieron cargar los archivos.',
          variant: 'destructive',
        });
        loadErrorShown.current = true;
      }
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, applyFiles, persistFiles, sharedFilesScopeId, syncPendingFiles, user]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles, user]);

  const shareFile = async (
    file: File,
    toUserId: string,
    message?: string,
    workReportId?: string,
    toUserName?: string
  ) => {
    if (!user || !sharedFilesScopeId || !activeTenantId) return;

    const pendingFile = await createPendingSharedFileRecord({
      file,
      fromUserId: String(user.id),
      toUserId: String(toUserId),
      message,
      workReportId,
      fromUserName: user.full_name || user.email,
      toUserName,
    });

    await persistFiles(storedFilesRef.current.concat(pendingFile));

    try {
      const created = await createSharedFile({
        file,
        to_user_id: toUserId,
        message,
        work_report_id: workReportId,
        tenantId: activeTenantId,
      });

      await persistFiles(
        storedFilesRef.current
          .filter((item) => item.id !== pendingFile.id)
          .concat(toStoredSharedFile(created))
      );

      toast({
        title: 'Archivo enviado',
        description: 'El archivo se ha compartido correctamente.',
      });
    } catch (error: unknown) {
      console.error('Error sharing file:', error);

      if (isRetriableSharedFileError(error)) {
        await persistFiles(
          storedFilesRef.current.map((item) =>
            item.id === pendingFile.id
              ? { ...item, syncStatus: 'pending', lastSyncError: getErrorMessage(error) }
              : item
          )
        );

        toast({
          title: 'Archivo guardado offline',
          description: 'Se enviará automáticamente cuando vuelvas a tener sesión y conexión.',
        });
        return;
      }

      await persistFiles(
        storedFilesRef.current.map((item) =>
          item.id === pendingFile.id
            ? { ...item, syncStatus: 'error', lastSyncError: getErrorMessage(error) }
            : item
        )
      );

      toast({
        title: 'Error',
        description: 'No se pudo compartir el archivo.',
        variant: 'destructive',
      });
    }
  };

  const getFileBlob = useCallback(async (sharedFile: SharedFile): Promise<Blob> => {
    if (sharedFile.localBlobBase64) {
      return fileBase64ToBlob(
        sharedFile.localBlobBase64,
        sharedFile.localContentType || sharedFile.file_type || 'application/octet-stream'
      );
    }

    return downloadSharedFile(sharedFile.id, activeTenantId);
  }, [activeTenantId]);

  const downloadFile = async (sharedFile: SharedFile, _downDir?: string, _customFolder?: string) => {
    try {
      const blob = await getFileBlob(sharedFile);
      const currentUserId = user ? String(user.id) : null;

      if (isNative()) {
        await saveBlobFile(sharedFile.file_name, blob);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = sharedFile.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast({
          title: 'Descarga iniciada',
          description: 'El archivo se esta descargando.',
        });
      }

      if (currentUserId && currentUserId === sharedFile.to_user_id && !sharedFile.downloaded) {
        const updatedFiles = storedFilesRef.current.map((item) =>
          item.id === sharedFile.id ? { ...item, downloaded: true } : item
        );
        await persistFiles(updatedFiles);

        if (sharedFile.syncStatus === 'synced') {
          try {
            await markSharedFileDownloaded(sharedFile.id, activeTenantId);
          } catch (error) {
            console.error('Error marking shared file as downloaded:', error);
          }
        }
      }
    } catch (error: unknown) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Error',
        description: 'No se pudo descargar el archivo.',
        variant: 'destructive',
      });
    }
  };

  const deleteFileById = async (fileId: string, _filePath: string) => {
    const target = storedFilesRef.current.find((item) => item.id === fileId);
    if (!target) return;

    if (target.syncStatus !== 'synced') {
      await persistFiles(storedFilesRef.current.filter((item) => item.id !== fileId));
      toast({
        title: 'Archivo eliminado',
        description: 'El archivo local pendiente se ha eliminado correctamente.',
      });
      return;
    }

    try {
      await deleteSharedFile(fileId, activeTenantId);
      await persistFiles(storedFilesRef.current.filter((item) => item.id !== fileId));
      toast({
        title: 'Archivo eliminado',
        description: 'El archivo se ha eliminado correctamente.',
      });
    } catch (error: unknown) {
      console.error('Error deleting file:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el archivo.',
        variant: 'destructive',
      });
    }
  };

  return {
    sentFiles,
    receivedFiles,
    loading,
    shareFile,
    downloadFile,
    getFileBlob,
    deleteFile: deleteFileById,
    reloadFiles: loadFiles,
  };
};
