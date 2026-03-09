type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

export interface CompanyPortfolioApiDeps {
  apiFetchJson: ApiFetchJsonFn;
}

export interface ApiCompanyType {
  id: number;
  tenant_id: number;
  type_name: string;
  created_by_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ApiCompanyPortfolioItem {
  id: number;
  tenant_id: number;
  company_name: string;
  company_type: string[];
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  fiscal_id?: string | null;
  notes?: string | null;
  created_by_id?: number | null;
  updated_by_id?: number | null;
  created_at: string;
  updated_at: string;
  creator_name?: string | null;
  editor_name?: string | null;
}

export interface CreateCompanyPortfolioPayload {
  company_name: string;
  company_type: string[];
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  fiscal_id?: string | null;
  notes?: string | null;
}

export interface UpdateCompanyPortfolioPayload {
  company_name?: string;
  company_type?: string[];
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  fiscal_id?: string | null;
  notes?: string | null;
}

export function createCompanyPortfolioApi(deps: CompanyPortfolioApiDeps) {
  const listCompanyTypes = async (): Promise<ApiCompanyType[]> => {
    return deps.apiFetchJson<ApiCompanyType[]>('/api/v1/erp/company-types');
  };

  const createCompanyType = async (typeName: string): Promise<ApiCompanyType> => {
    return deps.apiFetchJson<ApiCompanyType>('/api/v1/erp/company-types', {
      method: 'POST',
      body: JSON.stringify({ type_name: typeName }),
    });
  };

  const renameCompanyType = async (typeName: string, newTypeName: string): Promise<ApiCompanyType> => {
    return deps.apiFetchJson<ApiCompanyType>(`/api/v1/erp/company-types/${encodeURIComponent(typeName)}`, {
      method: 'PATCH',
      body: JSON.stringify({ new_type_name: newTypeName }),
    });
  };

  const deleteCompanyType = async (typeName: string): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/erp/company-types/${encodeURIComponent(typeName)}`, {
      method: 'DELETE',
    });
  };

  const listCompanyPortfolio = async (): Promise<ApiCompanyPortfolioItem[]> => {
    return deps.apiFetchJson<ApiCompanyPortfolioItem[]>('/api/v1/erp/company-portfolio');
  };

  const createCompanyPortfolioItem = async (
    payload: CreateCompanyPortfolioPayload
  ): Promise<ApiCompanyPortfolioItem> => {
    return deps.apiFetchJson<ApiCompanyPortfolioItem>('/api/v1/erp/company-portfolio', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const updateCompanyPortfolioItem = async (
    companyId: number,
    payload: UpdateCompanyPortfolioPayload
  ): Promise<ApiCompanyPortfolioItem> => {
    return deps.apiFetchJson<ApiCompanyPortfolioItem>(`/api/v1/erp/company-portfolio/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  };

  const deleteCompanyPortfolioItem = async (companyId: number): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/erp/company-portfolio/${companyId}`, {
      method: 'DELETE',
    });
  };

  return {
    listCompanyTypes,
    createCompanyType,
    renameCompanyType,
    deleteCompanyType,
    listCompanyPortfolio,
    createCompanyPortfolioItem,
    updateCompanyPortfolioItem,
    deleteCompanyPortfolioItem,
  };
}
