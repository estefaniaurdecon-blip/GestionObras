type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

export interface OrganizationApiDeps {
  apiFetchJson: ApiFetchJsonFn;
}

export interface ApiOrganization {
  id: string;
  name: string;
  commercial_name?: string | null;
  logo?: string | null;
  subscription_status?: string | null;
  subscription_end_date?: string | null;
  trial_end_date?: string | null;
  updated_at?: string | null;
  invitation_code?: string | null;
  brand_color?: string | null;
  fiscal_id?: string | null;
  legal_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  max_users: number;
  current_users: number;
}

export interface UpdateOrganizationPayload {
  name?: string;
  commercial_name?: string | null;
  fiscal_id?: string | null;
  legal_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  brand_color?: string | null;
  max_users?: number;
  subscription_status?: string | null;
}

export interface BrandingTenantApi {
  logo?: string | null;
  accent_color: string;
  company_name?: string | null;
}

export type UserPlatformPreference = 'all' | 'windows' | 'android' | 'web';

export interface UserPreferencesApi {
  user_platform: UserPlatformPreference;
  updated_at?: string | null;
}

export function createOrganizationApi(deps: OrganizationApiDeps) {
  const getMyOrganization = async (): Promise<ApiOrganization> => {
    return deps.apiFetchJson<ApiOrganization>('/api/v1/organization/me');
  };

  const updateMyOrganization = async (
    payload: UpdateOrganizationPayload
  ): Promise<ApiOrganization> => {
    return deps.apiFetchJson<ApiOrganization>('/api/v1/organization/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  };

  const uploadMyOrganizationLogo = async (
    file: Blob | File,
    filename = 'logo.png'
  ): Promise<ApiOrganization> => {
    const formData = new FormData();
    formData.append('logo', file, filename);
    return deps.apiFetchJson<ApiOrganization>('/api/v1/organization/me/logo', {
      method: 'POST',
      body: formData,
    });
  };

  const removeMyOrganizationLogo = async (): Promise<ApiOrganization> => {
    return deps.apiFetchJson<ApiOrganization>('/api/v1/organization/me/logo', {
      method: 'DELETE',
    });
  };

  const getBrandingByTenant = async (
    tenantId: string | number
  ): Promise<BrandingTenantApi> => {
    return deps.apiFetchJson<BrandingTenantApi>(
      `/api/v1/branding/${encodeURIComponent(String(tenantId))}`
    );
  };

  const getMyUserPreferences = async (): Promise<UserPreferencesApi> => {
    return deps.apiFetchJson<UserPreferencesApi>('/api/v1/users/me/preferences');
  };

  const updateMyUserPreferences = async (
    userPlatform: UserPlatformPreference
  ): Promise<UserPreferencesApi> => {
    return deps.apiFetchJson<UserPreferencesApi>('/api/v1/users/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ user_platform: userPlatform }),
    });
  };

  return {
    getMyOrganization,
    updateMyOrganization,
    uploadMyOrganizationLogo,
    removeMyOrganizationLogo,
    getBrandingByTenant,
    getMyUserPreferences,
    updateMyUserPreferences,
  };
}
