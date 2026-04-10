type ApiFetchJsonFn = <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
) => Promise<T>;

type BuildQueryParamsFn = (
  params: Record<string, string | number | boolean | undefined | null>
) => string;

export interface NotificationsApiDeps {
  apiFetchJson: ApiFetchJsonFn;
  buildQueryParams: BuildQueryParamsFn;
}

export type ApiNotificationType =
  | 'work_report_pending'
  | 'work_report_approved'
  | 'work_assigned'
  | 'machinery_expiry_warning'
  | 'new_message'

export interface ApiNotificationCreate {
  user_id: number;
  type?: ApiNotificationType;
  title: string;
  body?: string | null;
  reference?: string | null;
}

export interface ApiNotificationRead {
  id: number;
  tenant_id: number;
  user_id: number;
  type: ApiNotificationType;
  title: string;
  body?: string | null;
  reference?: string | null;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
}

export interface ApiNotificationListResponse {
  items: ApiNotificationRead[];
  total: number;
}

export interface ListNotificationsParams {
  onlyUnread?: boolean;
  limit?: number;
  offset?: number;
}

export function createNotificationsApi(deps: NotificationsApiDeps) {
  const listNotifications = async (
    params: ListNotificationsParams = {}
  ): Promise<ApiNotificationListResponse> => {
    const query = deps.buildQueryParams({
      only_unread: params.onlyUnread,
      limit: params.limit,
      offset: params.offset,
    });
    return deps.apiFetchJson<ApiNotificationListResponse>(`/api/v1/notifications${query}`);
  };

  const markNotificationAsRead = async (notificationId: number): Promise<ApiNotificationRead> => {
    return deps.apiFetchJson<ApiNotificationRead>(`/api/v1/notifications/${notificationId}/read`, {
      method: 'POST',
    });
  };

  const markAllNotificationsAsRead = async (): Promise<void> => {
    return deps.apiFetchJson<void>('/api/v1/notifications/read-all', {
      method: 'POST',
    });
  };

  const deleteNotification = async (notificationId: number): Promise<void> => {
    return deps.apiFetchJson<void>(`/api/v1/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  };

  const createNotification = async (payload: ApiNotificationCreate): Promise<ApiNotificationRead> => {
    return deps.apiFetchJson<ApiNotificationRead>('/api/v1/notifications', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  return {
    listNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    createNotification,
  };
}
