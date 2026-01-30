import { apiClient } from "./client";

export interface BrandingResponse {
  logo: string | null;
  accent_color: string;
  color_palette: Record<string, string>;
  company_name?: string | null;
  company_subtitle?: string | null;
  updated_at?: string | null;
}

export async function fetchBranding(tenantId: number): Promise<BrandingResponse> {
  const response = await apiClient.get<BrandingResponse>(
    `/api/v1/branding/${tenantId}`,
  );
  return response.data;
}

export async function updateBranding(
  tenantId: number,
  payload: {
    accentColor?: string;
    logoFile?: File | null;
    companyName?: string;
    companySubtitle?: string;
  },
): Promise<BrandingResponse> {
  const formData = new FormData();
  if (payload.accentColor) {
    formData.append("accent_color", payload.accentColor);
  }
  if (payload.companyName !== undefined) {
    formData.append("company_name", payload.companyName);
  }
  if (payload.companySubtitle !== undefined) {
    formData.append("company_subtitle", payload.companySubtitle);
  }
  if (payload.logoFile) {
    formData.append("logo", payload.logoFile);
  }
  const response = await apiClient.put<BrandingResponse>(
    `/api/v1/branding/${tenantId}`,
    formData,
  );
  return response.data;
}
