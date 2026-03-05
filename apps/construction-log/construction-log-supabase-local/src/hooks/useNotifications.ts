import { useState, useEffect, useCallback } from 'react';
import type { Notification as NotificationType } from '@/types/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';
import {
  deleteNotification as deleteNotificationById,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type ApiNotificationRead,
} from '@/integrations/api/client';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return 'Error inesperado';
};

const POLL_INTERVAL_MS = 30000;

const KNOWN_NOTIFICATION_TYPES: NotificationType['type'][] = [
  'work_report_created',
  'work_report_approved',
  'work_report_rejected',
  'new_message',
  'new_comment',
  'new_user_pending',
  'file_downloaded',
  'work_report_pending',
  'work_assigned',
  'work_expiry_warning',
  'machinery_expiry_warning',
  'anomaly_detected',
  'ticket_assigned',
  'ticket_comment',
  'ticket_status',
  'generic',
];

const normalizeNotificationType = (value: string): NotificationType['type'] => {
  if ((KNOWN_NOTIFICATION_TYPES as string[]).includes(value)) {
    return value as NotificationType['type'];
  }
  return 'generic';
};

const toLegacyNotification = (row: ApiNotificationRead): NotificationType => {
  const rawReference = (row.reference || '').trim();
  let parsedReference = rawReference;
  if (rawReference.includes('=')) {
    const parts = rawReference.split('=');
    parsedReference = (parts[parts.length - 1] || '').trim();
  }

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    type: normalizeNotificationType(row.type),
    title: row.title,
    message: row.body || '',
    related_id: parsedReference || undefined,
    read: Boolean(row.is_read),
    created_at: row.created_at,
    metadata: {
      tenant_id: row.tenant_id,
      reference: row.reference || null,
      read_at: row.read_at || null,
    },
  };
};

const toApiNotificationId = (notificationId: string): number | null => {
  const parsed = Number(notificationId);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const loadNotifications = useCallback(async (options?: { silent?: boolean }) => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const response = await listNotifications({ limit: 50, offset: 0 });
      const mapped = response.items.map(toLegacyNotification);
      setNotifications(mapped);
      setUnreadCount(mapped.filter((n) => !n.read).length);
    } catch (error: unknown) {
      console.error('Error loading notifications:', error);
      if (!options?.silent) {
        toast({
          title: "Error al cargar notificaciones",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadNotifications();

    if (!user) return;

    const pollId = window.setInterval(() => {
      void loadNotifications({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollId);
    };
  }, [user, loadNotifications]);

  const markAsRead = async (notificationId: string) => {
    const apiNotificationId = toApiNotificationId(notificationId);
    if (apiNotificationId === null) return;

    try {
      await markNotificationAsRead(apiNotificationId);
      setNotifications((prev) => {
        const next = prev.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n,
        );
        setUnreadCount(next.filter((n) => !n.read).length);
        return next;
      });
    } catch (error: unknown) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      await markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error: unknown) {
      console.error('Error marking all as read:', error);
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const deleteNotification = async (notificationId: string) => {
    const apiNotificationId = toApiNotificationId(notificationId);
    if (apiNotificationId === null) return;

    try {
      await deleteNotificationById(apiNotificationId);
      setNotifications((prev) => {
        const next = prev.filter((n) => n.id !== notificationId);
        setUnreadCount(next.filter((n) => !n.read).length);
        return next;
      });
    } catch (error: unknown) {
      console.error('Error deleting notification:', error);
      toast({
        title: "Error al eliminar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    reloadNotifications: loadNotifications,
  };
};
