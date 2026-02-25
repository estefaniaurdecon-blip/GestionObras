import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getMyOrganization, type ApiOrganization } from '@/integrations/api/client';

export interface Organization {
  id: string;
  name: string;
  commercial_name?: string;
  logo?: string;
  subscription_status?: string;
  subscription_end_date?: string;
  trial_end_date?: string;
  updated_at?: string;
  invitation_code?: string;
  brand_color?: string;
}

export const useOrganization = () => {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const mapOrganization = (apiOrg: ApiOrganization): Organization => ({
    id: String(apiOrg.id),
    name: apiOrg.name,
    commercial_name: apiOrg.commercial_name || undefined,
    logo: apiOrg.logo || undefined,
    subscription_status: apiOrg.subscription_status || undefined,
    subscription_end_date: apiOrg.subscription_end_date || undefined,
    trial_end_date: apiOrg.trial_end_date || undefined,
    updated_at: apiOrg.updated_at || undefined,
    invitation_code: apiOrg.invitation_code || undefined,
    brand_color: apiOrg.brand_color || undefined,
  });

  const loadOrganization = async () => {
    if (!user) {
      setOrganization(null);
      setLoading(false);
      return;
    }

    try {
      const apiOrganization = await getMyOrganization();
      setOrganization(mapOrganization(apiOrganization));
    } catch (error: unknown) {
      console.error('Error in loadOrganization:', error);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrganization();
  }, [user]);

  return {
    organization,
    loading,
    reload: loadOrganization,
  };
};
