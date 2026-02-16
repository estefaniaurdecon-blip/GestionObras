import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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

  const loadOrganization = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Get user's profile to find their organization_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Error loading profile:', profileError);
        setLoading(false);
        return;
      }

      if (!profile?.organization_id) {
        setLoading(false);
        return;
      }

      // Get organization details including logo
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profile.organization_id)
        .single();

      if (orgError) {
        console.error('Error loading organization:', orgError);
      } else {
        setOrganization(org);
      }
    } catch (error) {
      console.error('Error in loadOrganization:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrganization();
  }, [user]);

  // Subscribe to organization changes
  useEffect(() => {
    if (!user || !organization?.id) return;

    const channel = supabase
      .channel('organization-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organizations',
          filter: `id=eq.${organization.id}`,
        },
        (payload) => {
          console.log('Organization updated:', payload);
          setOrganization(payload.new as Organization);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, organization?.id]);

  return {
    organization,
    loading,
    reload: loadOrganization,
  };
};
