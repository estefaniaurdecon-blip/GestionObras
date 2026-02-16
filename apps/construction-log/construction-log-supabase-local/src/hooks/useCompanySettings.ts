import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CompanySettings } from '@/types/workReport';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';

// Helper function to upload logo to Storage
const uploadLogoToStorage = async (userId: string, logoDataUrl: string): Promise<string> => {
  try {
    // Convert base64 to blob
    const response = await fetch(logoDataUrl);
    const blob = await response.blob();
    
    // Create unique filename
    const fileExt = blob.type.split('/')[1];
    const fileName = `${userId}/logo.${fileExt}`;
    
    // Delete old logo if exists
    const { data: existingFiles } = await supabase.storage
      .from('company-logos')
      .list(userId);
    
    if (existingFiles && existingFiles.length > 0) {
      await supabase.storage
        .from('company-logos')
        .remove(existingFiles.map(f => `${userId}/${f.name}`));
    }
    
    // Upload new logo
    const { error: uploadError } = await supabase.storage
      .from('company-logos')
      .upload(fileName, blob, {
        cacheControl: '3600',
        upsert: true
      });
    
    if (uploadError) throw uploadError;
    
    // Get public URL
    const { data } = supabase.storage
      .from('company-logos')
      .getPublicUrl(fileName);
    
    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading logo:', error);
    throw error;
  }
};

export const useCompanySettings = () => {
  const [companySettings, setCompanySettings] = useState<CompanySettings>({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Load company settings from Supabase
  const loadSettings = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setCompanySettings({
          name: data.company_name || undefined,
          logo: data.company_logo || undefined,
        });
      }
    } catch (error: any) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [user]);

  // Save company settings to Supabase
  const saveSettings = async (settings: CompanySettings) => {
    if (!user) return;

    try {
      let logoUrl = settings.logo;
      
      // If logo is base64, upload to Storage
      if (logoUrl && logoUrl.startsWith('data:')) {
        logoUrl = await uploadLogoToStorage(user.id, logoUrl);
      }
      
      const { error } = await supabase
        .from('company_settings')
        .upsert({
          user_id: user.id,
          company_name: settings.name || null,
          company_logo: logoUrl || null,
        }, { onConflict: 'user_id' });

      if (error) throw error;

      // Update local state with storage URL
      setCompanySettings({ ...settings, logo: logoUrl || undefined });
      
      toast({
        title: "Configuración guardada",
        description: "La configuración de la empresa se ha guardado correctamente.",
      });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error al guardar configuración",
        description: error.message,
        variant: "destructive",
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
