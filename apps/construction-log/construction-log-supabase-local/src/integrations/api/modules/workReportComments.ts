type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

export interface WorkReportCommentsApiDeps {
  apiFetchJson: ApiFetchJsonFn;
}

export interface ApiWorkReportCommentUser {
  full_name: string;
}

export interface ApiWorkReportComment {
  id: number;
  tenant_id: number;
  work_report_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  user: ApiWorkReportCommentUser;
}

export interface CreateWorkReportCommentPayload {
  comment: string;
}

export function createWorkReportCommentsApi(deps: WorkReportCommentsApiDeps) {
  const listWorkReportComments = async (
    workReportId: string
  ): Promise<ApiWorkReportComment[]> => {
    return deps.apiFetchJson<ApiWorkReportComment[]>(
      `/api/v1/work-reports/${encodeURIComponent(workReportId)}/comments`
    );
  };

  const createWorkReportComment = async (
    workReportId: string,
    payload: CreateWorkReportCommentPayload
  ): Promise<ApiWorkReportComment> => {
    return deps.apiFetchJson<ApiWorkReportComment>(
      `/api/v1/work-reports/${encodeURIComponent(workReportId)}/comments`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  };

  return {
    listWorkReportComments,
    createWorkReportComment,
  };
}
