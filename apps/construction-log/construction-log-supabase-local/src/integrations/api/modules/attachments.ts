type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

type ApiFetchFn = (
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<Response>;

type BuildQueryParamsFn = (
  params: Record<string, string | number | boolean | undefined | null>
) => string;

export interface AttachmentsApiDeps {
  apiFetchJson: ApiFetchJsonFn;
  apiFetch: ApiFetchFn;
  buildQueryParams: BuildQueryParamsFn;
  tenantHeader?: (tenantId?: string | number | null) => Record<string, string> | undefined;
}

export interface WorkReportAttachmentApi {
  id: string;
  work_report_id: string;
  image_url: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface UploadGenericImagePayload {
  category: string;
  entity_id: string;
  image_type?: string;
  file: Blob | File;
  filename?: string;
}

export interface GenericImageUploadResponse {
  url: string;
  file_path: string;
  file_size: number;
  content_type: string;
}

export interface SharedFileApi {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  from_user_id: string;
  to_user_id: string;
  work_report_id?: string | null;
  message?: string | null;
  downloaded: boolean;
  created_at: string;
  from_user?: { full_name: string };
  to_user?: { full_name: string };
}

export type SharedFilesDirection = 'sent' | 'received' | 'all';

export interface SharedFileCreatePayload {
  file: File;
  to_user_id: string;
  message?: string;
  work_report_id?: string;
  tenantId?: string | number | null;
}

export function createAttachmentsApi(deps: AttachmentsApiDeps) {
  const listWorkReportAttachments = async (
    workReportId: string
  ): Promise<WorkReportAttachmentApi[]> => {
    return deps.apiFetchJson<WorkReportAttachmentApi[]>(
      `/api/v1/work-reports/${encodeURIComponent(workReportId)}/attachments`
    );
  };

  const createWorkReportAttachment = async (
    workReportId: string,
    payload: { file: Blob | File; description?: string | null; display_order?: number; filename?: string }
  ): Promise<WorkReportAttachmentApi> => {
    const formData = new FormData();
    const fileName = payload.filename || `image-${Date.now()}.jpg`;
    formData.append('file', payload.file, fileName);
    if (payload.description !== undefined && payload.description !== null) {
      formData.append('description', payload.description);
    }
    if (payload.display_order !== undefined && payload.display_order !== null) {
      formData.append('display_order', String(payload.display_order));
    }
    return deps.apiFetchJson<WorkReportAttachmentApi>(
      `/api/v1/work-reports/${encodeURIComponent(workReportId)}/attachments`,
      {
        method: 'POST',
        body: formData,
      }
    );
  };

  const updateWorkReportAttachment = async (
    workReportId: string,
    attachmentId: string,
    payload: { description?: string | null }
  ): Promise<WorkReportAttachmentApi> => {
    return deps.apiFetchJson<WorkReportAttachmentApi>(
      `/api/v1/work-reports/${encodeURIComponent(workReportId)}/attachments/${encodeURIComponent(
        attachmentId
      )}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  };

  const deleteWorkReportAttachment = async (
    workReportId: string,
    attachmentId: string
  ): Promise<void> => {
    return deps.apiFetchJson<void>(
      `/api/v1/work-reports/${encodeURIComponent(workReportId)}/attachments/${encodeURIComponent(
        attachmentId
      )}`,
      {
        method: 'DELETE',
      }
    );
  };

  const uploadGenericImage = async (
    payload: UploadGenericImagePayload
  ): Promise<GenericImageUploadResponse> => {
    const formData = new FormData();
    const fileName = payload.filename || `image-${Date.now()}.jpg`;
    formData.append('category', payload.category);
    formData.append('entity_id', payload.entity_id);
    if (payload.image_type) {
      formData.append('image_type', payload.image_type);
    }
    formData.append('file', payload.file, fileName);
    return deps.apiFetchJson<GenericImageUploadResponse>('/api/v1/attachments/images', {
      method: 'POST',
      body: formData,
    });
  };

  const deleteGenericImageByUrl = async (
    url: string
  ): Promise<{ success: boolean; deleted: boolean }> => {
    return deps.apiFetchJson<{ success: boolean; deleted: boolean }>(
      '/api/v1/attachments/images/by-url',
      {
        method: 'DELETE',
        body: JSON.stringify({ url }),
      }
    );
  };

  const listSharedFiles = async (
    direction: SharedFilesDirection = 'all',
    tenantId?: string | number | null
  ): Promise<SharedFileApi[]> => {
    const query = deps.buildQueryParams({ direction });
    return deps.apiFetchJson<SharedFileApi[]>(`/api/v1/shared-files${query}`, {
      headers: deps.tenantHeader?.(tenantId),
    });
  };

  const createSharedFile = async (payload: SharedFileCreatePayload): Promise<SharedFileApi> => {
    const formData = new FormData();
    formData.append('file', payload.file, payload.file.name || `file-${Date.now()}`);
    formData.append('to_user_id', payload.to_user_id);
    if (payload.message) {
      formData.append('message', payload.message);
    }
    if (payload.work_report_id) {
      formData.append('work_report_id', payload.work_report_id);
    }
    return deps.apiFetchJson<SharedFileApi>('/api/v1/shared-files', {
      method: 'POST',
      headers: deps.tenantHeader?.(payload.tenantId),
      body: formData,
    });
  };

  const downloadSharedFile = async (
    sharedFileId: string,
    tenantId?: string | number | null
  ): Promise<Blob> => {
    const response = await deps.apiFetch(
      `/api/v1/shared-files/${encodeURIComponent(sharedFileId)}/download`,
      {
        method: 'GET',
        headers: deps.tenantHeader?.(tenantId),
      }
    );
    if (!response.ok) {
      const error = new Error(`API Error: ${response.status} ${response.statusText}`) as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }
    return response.blob();
  };

  const markSharedFileDownloaded = async (
    sharedFileId: string,
    tenantId?: string | number | null
  ): Promise<void> => {
    return deps.apiFetchJson<void>(
      `/api/v1/shared-files/${encodeURIComponent(sharedFileId)}/mark-downloaded`,
      {
        method: 'POST',
        headers: deps.tenantHeader?.(tenantId),
      }
    );
  };

  const deleteSharedFile = async (
    sharedFileId: string,
    tenantId?: string | number | null
  ): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/shared-files/${encodeURIComponent(sharedFileId)}`, {
      method: 'DELETE',
      headers: deps.tenantHeader?.(tenantId),
    });
  };

  return {
    listWorkReportAttachments,
    createWorkReportAttachment,
    updateWorkReportAttachment,
    deleteWorkReportAttachment,
    uploadGenericImage,
    deleteGenericImageByUrl,
    listSharedFiles,
    createSharedFile,
    downloadSharedFile,
    markSharedFileDownloaded,
    deleteSharedFile,
  };
}
