import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';

export const useOrganizationLogo = () => {
  const { user } = useAuth();

  const updateOrganizationLogo = useCallback(async (logoDataUrl: string) => {
    if (!user) {
      toast({
        title: "Error",
        description: "Debes estar autenticado para actualizar el logo.",
        variant: "destructive",
      });
      return false;
    }

    try {
      console.log('[Logo Update] Starting for user:', user.id);
      
      // Get user's organization
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('[Logo Update] Profile error:', profileError);
        throw profileError;
      }

      if (!profile?.organization_id) {
        throw new Error('No se encontró la organización del usuario');
      }

      console.log('[Logo Update] Organization ID:', profile.organization_id);

      // Convert base64 to blob
      const response = await fetch(logoDataUrl);
      const blob = await response.blob();
      
      // Create unique filename for organization
      const fileExt = blob.type.split('/')[1] || 'png';
      const fileName = `${profile.organization_id}/logo.${fileExt}`;
      
      console.log('[Logo Update] Uploading to storage:', fileName);
      
      // Delete old logo if exists
      const { data: existingFiles } = await supabase.storage
        .from('company-logos')
        .list(profile.organization_id);
      
      if (existingFiles && existingFiles.length > 0) {
        console.log('[Logo Update] Removing old files:', existingFiles.length);
        await supabase.storage
          .from('company-logos')
          .remove(existingFiles.map(f => `${profile.organization_id}/${f.name}`));
      }
      
      // Upload new logo
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: true
        });
      
      if (uploadError) {
        console.error('[Logo Update] Upload error:', uploadError);
        throw uploadError;
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('company-logos')
        .getPublicUrl(fileName);
      
      console.log('[Logo Update] Logo uploaded, URL:', urlData.publicUrl);
      console.log('[Logo Update] Updating organization...');
      
      // Update organization with logo URL and timestamp to force cache refresh
      const { error: updateError, data: updateData } = await supabase
        .from('organizations')
        .update({ 
          logo: urlData.publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.organization_id)
        .select();

      if (updateError) {
        console.error('[Logo Update] Organization update error:', updateError);
        throw updateError;
      }

      console.log('[Logo Update] Organization updated successfully:', updateData);

      toast({
        title: "Logo actualizado",
        description: "El logo de la empresa se ha actualizado correctamente.",
      });

      return true;
    } catch (error: any) {
      console.error('[Logo Update] Error:', error);
      toast({
        title: "Error al actualizar logo",
        description: error.message || 'Ocurrió un error al actualizar el logo',
        variant: "destructive",
      });
      return false;
    }
  }, [user]);

  const removeOrganizationLogo = useCallback(async () => {
    if (!user) return false;

    try {
      // Get user's organization
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile?.organization_id) {
        console.error('No organization found for user');
        return false;
      }

      // Delete logo files from storage
      const { data: existingFiles } = await supabase.storage
        .from('company-logos')
        .list(profile.organization_id);
      
      if (existingFiles && existingFiles.length > 0) {
        await supabase.storage
          .from('company-logos')
          .remove(existingFiles.map(f => `${profile.organization_id}/${f.name}`));
      }

      // Remove logo URL from organization and update timestamp
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ 
          logo: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.organization_id);

      if (updateError) throw updateError;

      toast({
        title: "Logo eliminado",
        description: "El logo de la empresa se ha eliminado correctamente.",
      });

      return true;
    } catch (error: any) {
      console.error('Error removing organization logo:', error);
      toast({
        title: "Error al eliminar logo",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
  }, [user]);

  return {
    updateOrganizationLogo,
    removeOrganizationLogo,
  };
};
