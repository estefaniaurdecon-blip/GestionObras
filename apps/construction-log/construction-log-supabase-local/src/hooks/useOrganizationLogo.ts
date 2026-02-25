import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';
import { removeMyOrganizationLogo, uploadMyOrganizationLogo } from '@/integrations/api/client';

const extensionFromMime = (mime: string): string => {
  const ext = mime.split('/')[1]?.toLowerCase() || 'png';
  return ext === 'jpeg' ? 'jpg' : ext;
};

export const useOrganizationLogo = () => {
  const { user } = useAuth();

  const updateOrganizationLogo = useCallback(
    async (logoDataUrl: string) => {
      if (!user) {
        toast({
          title: 'Error',
          description: 'Debes estar autenticado para actualizar el logo.',
          variant: 'destructive',
        });
        return false;
      }

      try {
        const response = await fetch(logoDataUrl);
        const blob = await response.blob();
        const ext = extensionFromMime(blob.type || 'image/png');
        await uploadMyOrganizationLogo(blob, `logo.${ext}`);

        toast({
          title: 'Logo actualizado',
          description: 'El logo de la empresa se ha actualizado correctamente.',
        });
        return true;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Ocurrio un error al actualizar el logo';
        console.error('Error updating organization logo:', error);
        toast({
          title: 'Error al actualizar logo',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [user]
  );

  const removeOrganizationLogo = useCallback(async () => {
    if (!user) return false;

    try {
      await removeMyOrganizationLogo();
      toast({
        title: 'Logo eliminado',
        description: 'El logo de la empresa se ha eliminado correctamente.',
      });
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'No se pudo eliminar el logo';
      console.error('Error removing organization logo:', error);
      toast({
        title: 'Error al eliminar logo',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  }, [user]);

  return {
    updateOrganizationLogo,
    removeOrganizationLogo,
  };
};
