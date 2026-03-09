type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

type BuildQueryParamsFn = (
  params: Record<string, string | number | boolean | undefined | null>
) => string;

export interface MessagesApiDeps {
  apiFetchJson: ApiFetchJsonFn;
  buildQueryParams: BuildQueryParamsFn;
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
}

export interface MessageCreatePayload {
  to_user_id: string;
  message: string;
  work_report_id?: string;
}

export function createMessagesApi(deps: MessagesApiDeps) {
  const listMessages = async (params: ListMessagesParams = {}): Promise<ApiMessageListResponse> => {
    const query = deps.buildQueryParams({
      limit: params.limit,
      offset: params.offset,
    });
    return deps.apiFetchJson<ApiMessageListResponse>(`/api/v1/messages${query}`);
  };

  const createMessage = async (payload: MessageCreatePayload): Promise<ApiMessageRead> => {
    return deps.apiFetchJson<ApiMessageRead>('/api/v1/messages', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const markMessageAsRead = async (messageId: number): Promise<ApiMessageRead> => {
    return deps.apiFetchJson<ApiMessageRead>(`/api/v1/messages/${messageId}/read`, {
      method: 'POST',
    });
  };

  const deleteMessage = async (messageId: number): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/messages/${messageId}`, {
      method: 'DELETE',
    });
  };

  const deleteConversationMessages = async (otherUserId: string): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/messages/conversation/${encodeURIComponent(otherUserId)}`, {
      method: 'DELETE',
    });
  };

  const clearAllMessages = async (): Promise<void> => {
    return deps.apiFetchJson<void>('/api/v1/messages/clear-all', {
      method: 'DELETE',
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
