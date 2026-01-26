import { apiClient } from "./client";

export type ExternalCollaborationType =
  | "Universidades"
  | "Auditoria"
  | "Consultoras"
  | "Centros tecnologicos";

export interface ExternalCollaboration {
  id: number;
  collaboration_type: ExternalCollaborationType;
  name: string;
  legal_name: string;
  cif: string;
  contact_email: string;
  created_at: string;
  updated_at: string;
}

export interface ExternalCollaborationCreate {
  collaboration_type: ExternalCollaborationType;
  name: string;
  legal_name: string;
  cif: string;
  contact_email: string;
}

export type ExternalCollaborationUpdate = Partial<ExternalCollaborationCreate>;

export async function fetchExternalCollaborations() {
  const response = await apiClient.get<ExternalCollaboration[]>(
    "/api/v1/erp/external-collaborations"
  );
  return response.data;
}

export async function createExternalCollaboration(
  payload: ExternalCollaborationCreate
) {
  const response = await apiClient.post<ExternalCollaboration>(
    "/api/v1/erp/external-collaborations",
    payload
  );
  return response.data;
}

export async function updateExternalCollaboration(
  collaborationId: number,
  payload: ExternalCollaborationUpdate
) {
  const response = await apiClient.patch<ExternalCollaboration>(
    `/api/v1/erp/external-collaborations/${collaborationId}`,
    payload
  );
  return response.data;
}

export async function deleteExternalCollaboration(collaborationId: number) {
  await apiClient.delete(
    `/api/v1/erp/external-collaborations/${collaborationId}`
  );
}
