import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { isNative } from '@/utils/nativeFile';
import {
  createSharedFile,
  deleteSharedFile,
  downloadSharedFile,
  listSharedFiles,
  markSharedFileDownloaded,
} from '@/integrations/api/client';

export interface SharedFile {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  from_user_id: string;
  to_user_id: string;
  work_report_id?: string;
  message?: string;
  downloaded: boolean;
  created_at: string;
  from_user?: {
    full_name: string;
  };
  to_user?: {
    full_name: string;
  };
}

export const useSharedFiles = () => {
  const [sentFiles, setSentFiles] = useState<SharedFile[]>([]);
  const [receivedFiles, setReceivedFiles] = useState<SharedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const loadErrorShown = useRef(false);

  const loadFiles = useCallback(async () => {
    if (!user) {
      setSentFiles([]);
      setReceivedFiles([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [sent, received] = await Promise.all([
        listSharedFiles('sent'),
        listSharedFiles('received'),
      ]);
      setSentFiles(sent);
      setReceivedFiles(received);
      loadErrorShown.current = false;
    } catch (error: unknown) {
      console.error('Error loading shared files:', error);
      if (!loadErrorShown.current) {
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
  }, [user]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles, user]);

  const shareFile = async (
    file: File,
    toUserId: string,
    message?: string,
    workReportId?: string
  ) => {
    if (!user) return;
    try {
      await createSharedFile({
        file,
        to_user_id: toUserId,
        message,
        work_report_id: workReportId,
      });
      toast({
        title: 'Archivo enviado',
        description: 'El archivo se ha compartido correctamente.',
      });
      await loadFiles();
    } catch (error: unknown) {
      console.error('Error sharing file:', error);
      toast({
        title: 'Error',
        description: 'No se pudo compartir el archivo.',
        variant: 'destructive',
      });
    }
  };

  const downloadFile = async (sharedFile: SharedFile, directory?: Directory, customFolder?: string) => {
    try {
      const blob = await downloadSharedFile(sharedFile.id);
      const currentUserId = user ? String(user.id) : null;

      if (isNative() && directory) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          const base64Content = base64Data.split(',')[1];
          try {
            const finalPath = customFolder
              ? `${customFolder}/${sharedFile.file_name}`
              : sharedFile.file_name;

            const result = await Filesystem.writeFile({
              path: finalPath,
              data: base64Content,
              directory,
              recursive: true,
            });

            console.log('File saved to:', result.uri);
            if (currentUserId && currentUserId === sharedFile.to_user_id && !sharedFile.downloaded) {
              await markSharedFileDownloaded(sharedFile.id);
              setTimeout(() => loadFiles(), 500);
            }

            const dirLabel = getDirectoryLabel(directory);
            const locationDescription = customFolder
              ? `${dirLabel}/${customFolder}`
              : dirLabel;
            toast({
              title: 'Archivo guardado',
              description: `El archivo se ha guardado en ${locationDescription}`,
            });
          } catch (err) {
            console.error('Error saving file:', err);
            throw err;
          }
        };
        reader.readAsDataURL(blob);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = sharedFile.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        if (currentUserId && currentUserId === sharedFile.to_user_id && !sharedFile.downloaded) {
          await markSharedFileDownloaded(sharedFile.id);
          setTimeout(() => loadFiles(), 500);
        }

        toast({
          title: 'Descarga iniciada',
          description: 'El archivo se esta descargando.',
        });
      }

      await loadFiles();
    } catch (error: unknown) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Error',
        description: 'No se pudo descargar el archivo.',
        variant: 'destructive',
      });
    }
  };

  const getDirectoryLabel = (dir: Directory): string => {
    switch (dir) {
      case Directory.Documents:
        return 'Documentos';
      case Directory.Data:
        return 'Datos de la app';
      case Directory.Cache:
        return 'Cache';
      case Directory.External:
        return 'Almacenamiento externo';
      case Directory.ExternalStorage:
        return 'Almacenamiento externo publico';
      default:
        return 'Descargas';
    }
  };

  const deleteFileById = async (fileId: string, _filePath: string) => {
    try {
      await deleteSharedFile(fileId);
      toast({
        title: 'Archivo eliminado',
        description: 'El archivo se ha eliminado correctamente.',
      });
      await loadFiles();
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
    deleteFile: deleteFileById,
    reloadFiles: loadFiles,
  };
};
