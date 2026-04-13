type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean; timeoutMs?: number }
) => Promise<T>;

type BuildQueryParamsFn = (
  params: Record<string, string | number | boolean | undefined | null>
) => string;

export interface MessagesApiDeps {
  apiFetchJson: ApiFetchJsonFn;
  buildQueryParams: BuildQueryParamsFn;
  tenantHeader?: (tenantId?: string | number | null) => Record<string, string> | undefined;
}

export interface ApiMessageUserRead {
  full_name: string;
}

export interface ApiMessageRead {
  id: number;
  tenant_id: number;
  from_user_id: string;
  to_user_id: string;
  work_report_id?: string | null;
  message: string;
  read: boolean;
  created_at: string;
  from_user?: ApiMessageUserRead | null;
  to_user?: ApiMessageUserRead | null;
}

export interface ApiMessageListResponse {
  items: ApiMessageRead[];
  total: number;
}

export interface ListMessagesParams {
  limit?: number;
  offset?: number;
  tenantId?: string | number | null;
}

export interface MessageCreatePayload {
  to_user_id: string;
  message: string;
  work_report_id?: string;
  tenantId?: string | number | null;
}

const MESSAGING_API_TIMEOUT_MS = 10000;

export function createMessagesApi(deps: MessagesApiDeps) {
  const listMessages = async (params: ListMessagesParams = {}): Promise<ApiMessageListResponse> => {
    const query = deps.buildQueryParams({
      limit: params.limit,
      offset: params.offset,
    });
    return deps.apiFetchJson<ApiMessageListResponse>(`/api/v1/messages${query}`, {
      headers: deps.tenantHeader?.(params.tenantId),
      timeoutMs: MESSAGING_API_TIMEOUT_MS,
    });
  };

  const createMessage = async (payload: MessageCreatePayload): Promise<ApiMessageRead> => {
    const { tenantId, ...body } = payload;
    return deps.apiFetchJson<ApiMessageRead>('/api/v1/messages', {
      method: 'POST',
      headers: deps.tenantHeader?.(tenantId),
      body: JSON.stringify(body),
      timeoutMs: MESSAGING_API_TIMEOUT_MS,
    });
  };

  const markMessageAsRead = async (
    messageId: number,
    tenantId?: string | number | null
  ): Promise<ApiMessageRead> => {
    return deps.apiFetchJson<ApiMessageRead>(`/api/v1/messages/${messageId}/read`, {
      method: 'POST',
      headers: deps.tenantHeader?.(tenantId),
      timeoutMs: MESSAGING_API_TIMEOUT_MS,
    });
  };

  const deleteMessage = async (messageId: number, tenantId?: string | number | null): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/messages/${messageId}`, {
      method: 'DELETE',
      headers: deps.tenantHeader?.(tenantId),
      timeoutMs: MESSAGING_API_TIMEOUT_MS,
    });
  };

  const deleteConversationMessages = async (
    otherUserId: string,
    tenantId?: string | number | null
  ): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/messages/conversation/${encodeURIComponent(otherUserId)}`, {
      method: 'DELETE',
      headers: deps.tenantHeader?.(tenantId),
      timeoutMs: MESSAGING_API_TIMEOUT_MS,
    });
  };

  const clearAllMessages = async (tenantId?: string | number | null): Promise<void> => {
    return deps.apiFetchJson<void>('/api/v1/messages/clear-all', {
      method: 'DELETE',
      headers: deps.tenantHeader?.(tenantId),
      timeoutMs: MESSAGING_API_TIMEOUT_MS,
    });
  };

  return {
    listMessages,
    createMessage,
    markMessageAsRead,
    deleteMessage,
    deleteConversationMessages,
    clearAllMessages,
  };
}
