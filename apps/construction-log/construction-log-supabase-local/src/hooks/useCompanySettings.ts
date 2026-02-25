import { useState, useEffect } from 'react';
import { CompanySettings } from '@/types/workReport';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';
import {
  getMyOrganization,
  updateMyOrganization,
  uploadMyOrganizationLogo,
} from '@/integrations/api/client';

const extensionFromMime = (mime: string): string => {
  const ext = mime.split('/')[1]?.toLowerCase() || 'png';
  return ext === 'jpeg' ? 'jpg' : ext;
};

export const useCompanySettings = () => {
  const [companySettings, setCompanySettings] = useState<CompanySettings>({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const loadSettings = async () => {
    if (!user) {
      setCompanySettings({});
      setLoading(false);
      return;
    }

    try {
      const org = await getMyOrganization();
      setCompanySettings({
        name: org.commercial_name || org.name || undefined,
        logo: org.logo || undefined,
      });
    } catch (error: unknown) {
      console.error('Error loading company settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [user]);

  const saveSettings = async (settings: CompanySettings) => {
    if (!user) return;

    try {
      if (settings.logo && settings.logo.startsWith('data:')) {
        const response = await fetch(settings.logo);
        const blob = await response.blob();
        const ext = extensionFromMime(blob.type || 'image/png');
        await uploadMyOrganizationLogo(blob, `logo.${ext}`);
      }

      const updatedOrg = await updateMyOrganization({
        commercial_name: settings.name?.trim() || null,
      });

      setCompanySettings({
        name: updatedOrg.commercial_name || updatedOrg.name || undefined,
        logo: updatedOrg.logo || undefined,
      });

      toast({
        title: 'Configuracion guardada',
        description: 'La configuracion de la empresa se ha guardado correctamente.',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la configuracion';
      console.error('Error saving company settings:', error);
      toast({
        title: 'Error al guardar configuracion',
        description: message,
        variant: 'destructive',
      });
    }
  };

  return {
    companySettings,
    loading,
    saveSettings,
    setCompanySettings,
  };
};
