import { apiClient } from "./client";

export type ContractStatus =
  | "DRAFT"
  | "PENDING_JEFE_OBRA"
  | "PENDING_GERENCIA"
  | "PENDING_ADMIN"
  | "PENDING_COMPRAS"
  | "PENDING_JURIDICO"
  | "IN_SIGNATURE"
  | "SIGNED"
  | "REJECTED";

export type ContractType = "SUMINISTRO" | "SERVICIO" | "SUBCONTRATACION";

export interface Contract {
  id: number;
  tenant_id: number;
  created_by_id: number;
  project_id?: number | null;
  type: ContractType;
  status: ContractStatus;
  title?: string | null;
  description?: string | null;
  selected_offer_id?: number | null;
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  supplier_address?: string | null;
  supplier_city?: string | null;
  supplier_postal_code?: string | null;
  supplier_country?: string | null;
  supplier_contact_name?: string | null;
  supplier_bank_iban?: string | null;
  supplier_bank_bic?: string | null;
  total_amount?: string | number | null;
  currency?: string | null;
  comparative_data?: Record<string, unknown> | null;
  contract_data?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  signed_at?: string | null;
}

export interface ContractOffer {
  id: number;
  tenant_id: number;
  contract_id: number;
  created_by_id: number;
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  total_amount?: string | number | null;
  currency?: string | null;
  notes?: string | null;
  file_path?: string | null;
  original_filename?: string | null;
  created_at: string;
}

export interface ContractFilters {
  status?: ContractStatus | null;
  pendingOnly?: boolean;
}

export interface ContractCreatePayload {
  type: ContractType;
  title?: string | null;
  description?: string | null;
  project_id?: number | null;
  comparative_data?: Record<string, unknown> | null;
  contract_data?: Record<string, unknown> | null;
}

export interface ContractUpdatePayload {
  title?: string | null;
  description?: string | null;
  project_id?: number | null;
  type?: ContractType;
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  supplier_address?: string | null;
  supplier_city?: string | null;
  supplier_postal_code?: string | null;
  supplier_country?: string | null;
  supplier_contact_name?: string | null;
  supplier_bank_iban?: string | null;
  supplier_bank_bic?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  comparative_data?: Record<string, unknown> | null;
  contract_data?: Record<string, unknown> | null;
}

export interface ContractOfferCreatePayload {
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  notes?: string | null;
}

const buildTenantHeaders = (tenantId?: number) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

export async function fetchContracts(
  tenantId?: number,
  filters: ContractFilters = {},
): Promise<Contract[]> {
  const params: Record<string, string> = {};
  if (filters.status) params.status_filter = String(filters.status);
  if (filters.pendingOnly) params.pending_only = "true";

  const response = await apiClient.get<Contract[]>("/api/v1/contracts", {
    params,
    ...(buildTenantHeaders(tenantId) ?? {}),
  });
  return response.data;
}

export async function createContract(
  payload: ContractCreatePayload,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    "/api/v1/contracts",
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function updateContract(
  contractId: number,
  payload: ContractUpdatePayload,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.patch<Contract>(
    `/api/v1/contracts/${contractId}`,
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function addContractOffer(
  contractId: number,
  file: File,
  payload: ContractOfferCreatePayload,
  tenantId?: number,
): Promise<ContractOffer> {
  const formData = new FormData();
  formData.append("file", file);
  if (payload.supplier_name) formData.append("supplier_name", payload.supplier_name);
  if (payload.supplier_tax_id) formData.append("supplier_tax_id", payload.supplier_tax_id);
  if (payload.supplier_email) formData.append("supplier_email", payload.supplier_email);
  if (payload.supplier_phone) formData.append("supplier_phone", payload.supplier_phone);
  if (payload.total_amount != null) formData.append("total_amount", String(payload.total_amount));
  if (payload.currency) formData.append("currency", payload.currency);
  if (payload.notes) formData.append("notes", payload.notes);

  const response = await apiClient.post<ContractOffer>(
    `/api/v1/contracts/${contractId}/offers`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
        ...(buildTenantHeaders(tenantId)?.headers ?? {}),
      },
    },
  );
  return response.data;
}

export async function selectContractOffer(
  contractId: number,
  offerId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/select-offer`,
    { offer_id: offerId },
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function generateContractDocs(
  contractId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/generate-docs`,
    {},
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function submitContractGerencia(
  contractId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/submit-gerencia`,
    {},
    buildTenantHeaders(tenantId),
  );
  return response.data;
}
