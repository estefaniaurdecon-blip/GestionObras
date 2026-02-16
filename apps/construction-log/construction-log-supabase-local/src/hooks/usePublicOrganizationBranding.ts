import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OrganizationBranding {
  name: string;
  logo: string | null;
  brandColor: string | null;
}

/**
 * Hook para obtener el branding de una organización
 * Puede usarse con o sin autenticación
 */
export const usePublicOrganizationBranding = (organizationId?: string) => {
  const [branding, setBranding] = useState<OrganizationBranding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        let orgId = organizationId;

        // Si no se proporciona organizationId, intentar obtenerlo del usuario actual
        if (!orgId) {
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('organization_id')
              .eq('id', user.id)
              .single();
            
            orgId = profile?.organization_id;
          }
        }

        if (!orgId) {
          // Si no hay organización, usar valores por defecto
          setBranding({
            name: 'Partes de Trabajo',
            logo: null,
            brandColor: null,
          });
          setLoading(false);
          return;
        }

        // Obtener datos de la organización
        const { data: organization } = await supabase
          .from('organizations')
          .select('name, logo, brand_color')
          .eq('id', orgId)
          .single();

        if (organization) {
          setBranding({
            name: organization.name || 'Partes de Trabajo',
            logo: organization.logo,
            brandColor: organization.brand_color,
          });
        } else {
          setBranding({
            name: 'Partes de Trabajo',
            logo: null,
            brandColor: null,
          });
        }
      } catch (error) {
        console.error('Error fetching organization branding:', error);
        setBranding({
          name: 'Partes de Trabajo',
          logo: null,
          brandColor: null,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchBranding();
  }, [organizationId]);

  return { branding, loading };
};
