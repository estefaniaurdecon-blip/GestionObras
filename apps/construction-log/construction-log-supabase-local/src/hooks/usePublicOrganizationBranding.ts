import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getBrandingByTenant } from '@/integrations/api/client';

export interface OrganizationBranding {
  name: string;
  logo: string | null;
  brandColor: string | null;
}

export const usePublicOrganizationBranding = (organizationId?: string) => {
  const [branding, setBranding] = useState<OrganizationBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const tenantId = organizationId || (user?.tenant_id ? String(user.tenant_id) : undefined);

        if (!tenantId) {
          setBranding({
            name: 'Partes de Trabajo',
            logo: null,
            brandColor: null,
          });
          setLoading(false);
          return;
        }

        const data = await getBrandingByTenant(tenantId);
        setBranding({
          name: data.company_name || 'Partes de Trabajo',
          logo: data.logo || null,
          brandColor: data.accent_color || null,
        });
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
  }, [organizationId, user?.tenant_id]);

  return { branding, loading };
};
