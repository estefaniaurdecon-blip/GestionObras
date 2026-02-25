import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { isNative } from '@/utils/nativeFile';

export interface SharedFile {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  from_user_id: string | number;
  to_user_id: string | number;
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

      const { data: sent, error: sentError } = await supabase
        .from('shared_files')
        .select('*')
        .eq('from_user_id', user.id)
        .order('created_at', { ascending: false });
      if (sentError) throw sentError;

      const { data: received, error: receivedError } = await supabase
        .from('shared_files')
        .select('*')
        .eq('to_user_id', user.id)
        .order('created_at', { ascending: false });
      if (receivedError) throw receivedError;

      setSentFiles(sent || []);
      setReceivedFiles(received || []);
      loadErrorShown.current = false; // reset after success
    } catch (error: any) {
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
  }, [user, loadFiles]);

  const shareFile = async (
    file: File,
    toUserId: string,
    message?: string,
    workReportId?: string
  ) => {
    if (!user) return;

    try {
      // Get user's organization_id
      const { data: profileData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('shared-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create shared file record
      const { error: insertError } = await supabase
        .from('shared_files')
        .insert({
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          from_user_id: user.id,
          to_user_id: toUserId,
          message,
          work_report_id: workReportId,
          organization_id: profileData?.organization_id,
        });

      if (insertError) throw insertError;

      toast({
        title: "Archivo enviado",
        description: "El archivo se ha compartido correctamente.",
      });

      await loadFiles();
    } catch (error: any) {
      console.error('Error sharing file:', error);
      toast({
        title: "Error",
        description: "No se pudo compartir el archivo.",
        variant: "destructive",
      });
    }
  };

  const downloadFile = async (sharedFile: SharedFile, directory?: Directory, customFolder?: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('shared-files')
        .download(sharedFile.file_path);

      if (error) throw error;

      // Check if running on native device
      if (isNative() && directory) {
        // For mobile: save to specified directory
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          const base64Content = base64Data.split(',')[1];

          try {
            // Determine the final path
            const finalPath = customFolder 
              ? `${customFolder}/${sharedFile.file_name}`
              : sharedFile.file_name;

            const result = await Filesystem.writeFile({
              path: finalPath,
              data: base64Content,
              directory: directory,
              recursive: true, // This creates the folder if it doesn't exist
            });

            console.log('File saved to:', result.uri);

        // Mark as downloaded if user is recipient
        if (Number(user?.id) === Number(sharedFile.to_user_id) && !sharedFile.downloaded) {
          const { error: updateError } = await supabase
            .from('shared_files')
            .update({ downloaded: true })
            .eq('id', sharedFile.id);
          
          if (updateError) {
            console.error('Error updating downloaded status:', updateError);
          } else {
            console.log('Successfully marked file as downloaded:', sharedFile.id);
            // Force reload files to ensure UI updates
            setTimeout(() => loadFiles(), 500);
          }
        }

            const dirLabel = getDirectoryLabel(directory);
            const locationDescription = customFolder 
              ? `${dirLabel}/${customFolder}`
              : dirLabel;
            
            toast({
              title: "Archivo guardado",
              description: `El archivo se ha guardado en ${locationDescription}`,
            });
          } catch (err) {
            console.error('Error saving file:', err);
            throw err;
          }
        };
        reader.readAsDataURL(data);
      } else {
        // For web: normal download
        const url = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = sharedFile.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Mark as downloaded if user is recipient
        if (Number(user?.id) === Number(sharedFile.to_user_id) && !sharedFile.downloaded) {
          const { error: updateError } = await supabase
            .from('shared_files')
            .update({ downloaded: true })
            .eq('id', sharedFile.id);
          
          if (updateError) {
            console.error('Error updating downloaded status:', updateError);
          } else {
            console.log('Successfully marked file as downloaded:', sharedFile.id);
            // Force reload files to ensure UI updates
            setTimeout(() => loadFiles(), 500);
          }
        }

        toast({
          title: "Descarga iniciada",
          description: "El archivo se está descargando.",
        });
      }

      await loadFiles();
    } catch (error: any) {
      console.error('Error downloading file:', error);
      toast({
        title: "Error",
        description: "No se pudo descargar el archivo.",
        variant: "destructive",
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
        return 'Caché';
      case Directory.External:
        return 'Almacenamiento externo';
      case Directory.ExternalStorage:
        return 'Almacenamiento externo público';
      default:
        return 'Descargas';
    }
  };

  const deleteFile = async (fileId: string, filePath: string) => {
    try {
      // Eliminar el archivo del storage
      const { error: storageError } = await supabase.storage
        .from('shared-files')
        .remove([filePath]);

      if (storageError) throw storageError;

      // Eliminar el registro de la base de datos
      const { error: dbError } = await supabase
        .from('shared_files')
        .delete()
        .eq('id', fileId);

      if (dbError) throw dbError;

      toast({
        title: "Archivo eliminado",
        description: "El archivo se ha eliminado correctamente.",
      });
      
      await loadFiles();
    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el archivo.",
        variant: "destructive",
      });
    }
  };

  return {
    sentFiles,
    receivedFiles,
    loading,
    shareFile,
    downloadFile,
    deleteFile,
    reloadFiles: loadFiles,
  };
};
