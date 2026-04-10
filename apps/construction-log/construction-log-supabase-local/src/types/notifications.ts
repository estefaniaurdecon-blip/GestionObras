export type NotificationType =
  | 'work_report_pending'
  | 'work_report_approved'
  | 'work_assigned'
  | 'task_pending'
  | 'machinery_expiry_warning'
  | 'new_message';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_id?: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

export interface Message {
  id: string;
  from_user_id: string;
  to_user_id: string;
  work_report_id?: string;
  message: string;
  read: boolean;
  created_at: string;
  from_user?: {
    full_name: string;
  };
  to_user?: {
    full_name: string;
  };
}

export interface WorkReportComment {
  id: string;
  work_report_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  user?: {
    full_name: string;
  };
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  created_at: string;
}
