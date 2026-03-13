type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

export interface CompanyPortfolioApiDeps {
  apiFetchJson: ApiFetchJsonFn;
}

interface ApiExternalCollaborationItem {
  id: number;
  collaboration_type: string;
  name: string;
  legal_name: string;
  cif: string;
  contact_email: string;
  created_at: string;
  updated_at: string;
}

interface ExternalCollaborationCreatePayload {
  collaboration_type: string;
  name: string;
  legal_name: string;
  cif: string;
  contact_email: string;
}

interface ExternalCollaborationUpdatePayload {
  collaboration_type?: string;
  name?: string;
  legal_name?: string;
  cif?: string;
  contact_email?: string;
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

const COMPANY_TYPES_PATH = '/api/v1/erp/company-types';
const COMPANY_PORTFOLIO_PATH = '/api/v1/erp/company-portfolio';
const EXTERNAL_COLLABORATIONS_PATH = '/api/v1/erp/external-collaborations';

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { status?: unknown }).status === 404;
}

function mapExternalToCompany(item: ApiExternalCollaborationItem): ApiCompanyPortfolioItem {
  return {
    id: item.id,
    tenant_id: 0,
    company_name: item.name,
    company_type: [item.collaboration_type],
    contact_email: item.contact_email,
    fiscal_id: item.cif,
    notes: item.legal_name && item.legal_name !== item.name ? `Razon social: ${item.legal_name}` : null,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function mapTypesFromExternal(items: ApiExternalCollaborationItem[]): ApiCompanyType[] {
  const nowIso = new Date().toISOString();
  const uniqueTypes = Array.from(
    new Set(
      items
        .map((item) => item.collaboration_type?.trim())
        .filter((typeName): typeName is string => Boolean(typeName)),
    ),
  );

  return uniqueTypes.map((typeName, index) => ({
    id: index + 1,
    tenant_id: 0,
    type_name: typeName,
    created_at: nowIso,
    updated_at: nowIso,
  }));
}

function buildExternalCreatePayload(
  payload: CreateCompanyPortfolioPayload,
): ExternalCollaborationCreatePayload {
  const companyName = payload.company_name?.trim();
  const collaborationType = payload.company_type?.map((item) => item.trim()).find(Boolean);
  const fiscalId = payload.fiscal_id?.trim();
  const contactEmail = payload.contact_email?.trim();

  if (!companyName || !collaborationType || !fiscalId || !contactEmail) {
    throw new Error(
      'Este backend requiere nombre, tipo, CIF y email para guardar empresas en cartera.',
    );
  }

  return {
    collaboration_type: collaborationType,
    name: companyName,
    legal_name: companyName,
    cif: fiscalId,
    contact_email: contactEmail,
  };
}

function buildExternalUpdatePayload(
  payload: UpdateCompanyPortfolioPayload,
): ExternalCollaborationUpdatePayload {
  const mapped: ExternalCollaborationUpdatePayload = {};

  if (typeof payload.company_name === 'string' && payload.company_name.trim()) {
    mapped.name = payload.company_name.trim();
    mapped.legal_name = payload.company_name.trim();
  }

  if (Array.isArray(payload.company_type) && payload.company_type.length > 0) {
    const nextType = payload.company_type.map((item) => item.trim()).find(Boolean);
    if (nextType) mapped.collaboration_type = nextType;
  }

  if (typeof payload.fiscal_id === 'string' && payload.fiscal_id.trim()) {
    mapped.cif = payload.fiscal_id.trim();
  }

  if (typeof payload.contact_email === 'string' && payload.contact_email.trim()) {
    mapped.contact_email = payload.contact_email.trim();
  }

  return mapped;
}

export function createCompanyPortfolioApi(deps: CompanyPortfolioApiDeps) {
  const listCompanyTypes = async (): Promise<ApiCompanyType[]> => {
    try {
      return await deps.apiFetchJson<ApiCompanyType[]>(COMPANY_TYPES_PATH);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      const externalItems = await deps.apiFetchJson<ApiExternalCollaborationItem[]>(
        EXTERNAL_COLLABORATIONS_PATH,
      );
      return mapTypesFromExternal(externalItems || []);
    }
  };

  const createCompanyType = async (typeName: string): Promise<ApiCompanyType> => {
    try {
      return await deps.apiFetchJson<ApiCompanyType>(COMPANY_TYPES_PATH, {
        method: 'POST',
        body: JSON.stringify({ type_name: typeName }),
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new Error('El backend activo no soporta crear tipos personalizados.');
      }
      throw error;
    }
  };

  const renameCompanyType = async (typeName: string, newTypeName: string): Promise<ApiCompanyType> => {
    try {
      return await deps.apiFetchJson<ApiCompanyType>(
        `${COMPANY_TYPES_PATH}/${encodeURIComponent(typeName)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ new_type_name: newTypeName }),
        },
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new Error('El backend activo no soporta renombrar tipos personalizados.');
      }
      throw error;
    }
  };

  const deleteCompanyType = async (typeName: string): Promise<void> => {
    try {
      return await deps.apiFetchJson<void>(
        `${COMPANY_TYPES_PATH}/${encodeURIComponent(typeName)}`,
        {
          method: 'DELETE',
        },
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new Error('El backend activo no soporta eliminar tipos personalizados.');
      }
      throw error;
    }
  };

  const listCompanyPortfolio = async (): Promise<ApiCompanyPortfolioItem[]> => {
    try {
      return await deps.apiFetchJson<ApiCompanyPortfolioItem[]>(COMPANY_PORTFOLIO_PATH);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      const externalItems = await deps.apiFetchJson<ApiExternalCollaborationItem[]>(
        EXTERNAL_COLLABORATIONS_PATH,
      );
      return (externalItems || []).map(mapExternalToCompany);
    }
  };

  const createCompanyPortfolioItem = async (
    payload: CreateCompanyPortfolioPayload
  ): Promise<ApiCompanyPortfolioItem> => {
    try {
      return await deps.apiFetchJson<ApiCompanyPortfolioItem>(COMPANY_PORTFOLIO_PATH, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      const fallbackPayload = buildExternalCreatePayload(payload);
      const created = await deps.apiFetchJson<ApiExternalCollaborationItem>(
        EXTERNAL_COLLABORATIONS_PATH,
        {
          method: 'POST',
          body: JSON.stringify(fallbackPayload),
        },
      );
      return mapExternalToCompany(created);
    }
  };

  const updateCompanyPortfolioItem = async (
    companyId: number,
    payload: UpdateCompanyPortfolioPayload
  ): Promise<ApiCompanyPortfolioItem> => {
    try {
      return await deps.apiFetchJson<ApiCompanyPortfolioItem>(
        `${COMPANY_PORTFOLIO_PATH}/${companyId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      );
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      const fallbackPayload = buildExternalUpdatePayload(payload);
      if (Object.keys(fallbackPayload).length === 0) {
        throw new Error(
          'En este backend solo se pueden editar nombre, tipo, CIF y email en cartera.',
        );
      }
      const updated = await deps.apiFetchJson<ApiExternalCollaborationItem>(
        `${EXTERNAL_COLLABORATIONS_PATH}/${companyId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(fallbackPayload),
        },
      );
      return mapExternalToCompany(updated);
    }
  };

  const deleteCompanyPortfolioItem = async (companyId: number): Promise<void> => {
    try {
      return await deps.apiFetchJson<void>(`${COMPANY_PORTFOLIO_PATH}/${companyId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      return deps.apiFetchJson<void>(`${EXTERNAL_COLLABORATIONS_PATH}/${companyId}`, {
        method: 'DELETE',
      });
    }
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
