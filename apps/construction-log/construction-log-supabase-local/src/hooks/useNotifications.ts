import { useState, useEffect, useCallback } from 'react';
import type { Notification as NotificationType } from '@/types/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';
import {
  deleteNotification as deleteNotificationById,
  listErpTasks,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type ApiNotificationRead,
  type ApiErpTask,
} from '@/integrations/api/client';
import { storage } from '@/utils/storage';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return 'Error inesperado';
};

const POLL_INTERVAL_MS = 30000;
const SYNTHETIC_TASK_PENDING_PREFIX = 'synthetic-task-pending::';
const TASK_PENDING_ACK_PREFIX = 'task-pending-ack::';

const KNOWN_NOTIFICATION_TYPES: NotificationType['type'][] = [
  'work_report_approved',
  'new_message',
  'work_report_pending',
  'work_assigned',
  'task_pending',
  'machinery_expiry_warning',
];

const normalizeNotificationType = (value: string): NotificationType['type'] | null => {
  if ((KNOWN_NOTIFICATION_TYPES as string[]).includes(value)) {
    return value as NotificationType['type'];
  }
  return null;
};

const toLegacyNotification = (row: ApiNotificationRead): NotificationType | null => {
  const normalizedType = normalizeNotificationType(row.type);
  if (normalizedType === null) {
    return null;
  }

  const rawReference = (row.reference || '').trim();
  let parsedReference = rawReference;
  if (rawReference.includes('=')) {
    const parts = rawReference.split('=');
    parsedReference = (parts[parts.length - 1] || '').trim();
  }

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    type: normalizedType,
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

const isSyntheticTaskPendingNotificationId = (notificationId: string): boolean =>
  notificationId.startsWith(SYNTHETIC_TASK_PENDING_PREFIX);

const getTaskPendingAckKey = (userId: number | string, tenantId?: string | number | null): string =>
  `${TASK_PENDING_ACK_PREFIX}${userId}::${tenantId ?? 'self'}`;

const isTaskPending = (task: ApiErpTask): boolean => {
  const normalizedStatus = String(task.status ?? '').trim().toLowerCase();
  if (normalizedStatus === 'deleted' || normalizedStatus === 'done') return false;
  if (task.is_completed) return false;
  return task.assigned_to_id != null;
};

const buildTaskPendingSignature = (tasks: ApiErpTask[]): string =>
  [...tasks]
    .sort((left, right) => left.id - right.id)
    .map((task) => `${task.id}:${task.status}:${task.start_date ?? ''}:${task.end_date ?? ''}`)
    .join('|');

const buildTaskPendingMessage = (tasks: ApiErpTask[]): string => {
  if (tasks.length === 0) return '';
  const highlightedTitles = tasks
    .slice(0, 2)
    .map((task) => `"${task.title}"`)
    .join(', ');

  if (tasks.length === 1) {
    return `Tienes 1 tarea pendiente: ${highlightedTitles}.`;
  }

  if (tasks.length === 2) {
    return `Tienes 2 tareas pendientes: ${highlightedTitles}.`;
  }

  return `Tienes ${tasks.length} tareas pendientes. Proximas: ${highlightedTitles}.`;
};

const toPendingTaskNotification = (
  userId: number,
  pendingTasks: ApiErpTask[],
  acknowledgedSignature: string | null,
): NotificationType | null => {
  if (pendingTasks.length === 0) return null;

  const signature = buildTaskPendingSignature(pendingTasks);
  const latestCreatedAt = [...pendingTasks]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0]
    ?.created_at ?? new Date().toISOString();

  return {
    id: `${SYNTHETIC_TASK_PENDING_PREFIX}${userId}`,
    user_id: String(userId),
    type: 'task_pending',
    title:
      pendingTasks.length === 1
        ? 'Tienes 1 tarea pendiente'
        : `Tienes ${pendingTasks.length} tareas pendientes`,
    message: buildTaskPendingMessage(pendingTasks),
    related_id: '/task-calendar',
    read: acknowledgedSignature === signature,
    created_at: latestCreatedAt,
    metadata: {
      synthetic: true,
      pendingSignature: signature,
      taskIds: pendingTasks.map((task) => task.id),
      pendingCount: pendingTasks.length,
    },
  };
};

const computeUnreadCount = (items: NotificationType[]): number => items.filter((item) => !item.read).length;

const computeTaskAttentionCount = (items: NotificationType[]): number =>
  items.filter(
    (item) => !item.read && (item.type === 'work_assigned' || item.type === 'task_pending'),
  ).length;

type UseNotificationsOptions = {
  tenantId?: string | number | null;
};

export const useNotifications = (options?: UseNotificationsOptions) => {
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [taskAttentionCount, setTaskAttentionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pendingTaskSignature, setPendingTaskSignature] = useState<string | null>(null);
  const { user } = useAuth();

  const loadNotifications = useCallback(async (loadOptions?: { silent?: boolean }) => {
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      setTaskAttentionCount(0);
      setPendingTaskSignature(null);
      setLoading(false);
      return;
    }

    try {
      const effectiveTenantId = options?.tenantId ?? user.tenant_id ?? null;
      const [response, acknowledgedTaskSignature, taskRows] = await Promise.all([
        listNotifications({ limit: 50, offset: 0 }),
        storage.getItem(getTaskPendingAckKey(user.id, effectiveTenantId)),
        effectiveTenantId != null
          ? listErpTasks(effectiveTenantId).catch((error) => {
              console.error('Error loading task reminders:', error);
              return [] as ApiErpTask[];
            })
          : Promise.resolve([] as ApiErpTask[]),
      ]);

      const mappedNotifications = response.items
        .map(toLegacyNotification)
        .filter((item): item is NotificationType => item !== null);

      const pendingTasks = taskRows.filter(
        (task) => task.assigned_to_id === user.id && isTaskPending(task),
      );
      const pendingNotification = toPendingTaskNotification(
        user.id,
        pendingTasks,
        acknowledgedTaskSignature,
      );
      const mergedNotifications = [...mappedNotifications, ...(pendingNotification ? [pendingNotification] : [])].sort(
        (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      );

      setPendingTaskSignature(
        String(pendingNotification?.metadata?.pendingSignature ?? '') || null,
      );
      setNotifications(mergedNotifications);
      setUnreadCount(computeUnreadCount(mergedNotifications));
      setTaskAttentionCount(computeTaskAttentionCount(mergedNotifications));
    } catch (error: unknown) {
      console.error('Error loading notifications:', error);
      if (!loadOptions?.silent) {
        toast({
          title: "Error al cargar notificaciones",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [options?.tenantId, user]);

  useEffect(() => {
    void loadNotifications();

    if (!user?.id) return;

    const pollId = window.setInterval(() => {
      void loadNotifications({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollId);
    };
  }, [user?.id, loadNotifications]);

  const markAsRead = async (notificationId: string) => {
    if (isSyntheticTaskPendingNotificationId(notificationId)) {
      if (!user?.id || !pendingTaskSignature) return;
      await storage.setItem(
        getTaskPendingAckKey(user.id, options?.tenantId ?? user.tenant_id ?? null),
        pendingTaskSignature,
      );
      setNotifications((prev) => {
        const next = prev.map((notification) =>
          notification.id === notificationId ? { ...notification, read: true } : notification,
        );
        setUnreadCount(computeUnreadCount(next));
        setTaskAttentionCount(computeTaskAttentionCount(next));
        return next;
      });
      return;
    }

    const apiNotificationId = toApiNotificationId(notificationId);
    if (apiNotificationId === null) return;

    try {
      await markNotificationAsRead(apiNotificationId);
      setNotifications((prev) => {
        const next = prev.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n,
        );
        setUnreadCount(computeUnreadCount(next));
        setTaskAttentionCount(computeTaskAttentionCount(next));
        return next;
      });
    } catch (error: unknown) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const hasUnreadPersistedNotifications = notifications.some(
        (notification) =>
          !notification.read && !isSyntheticTaskPendingNotificationId(notification.id),
      );
      if (hasUnreadPersistedNotifications) {
        await markAllNotificationsAsRead();
      }
      if (pendingTaskSignature) {
        await storage.setItem(
          getTaskPendingAckKey(user.id, options?.tenantId ?? user.tenant_id ?? null),
          pendingTaskSignature,
        );
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      setTaskAttentionCount(0);
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
    if (isSyntheticTaskPendingNotificationId(notificationId)) {
      await markAsRead(notificationId);
      return;
    }

    const apiNotificationId = toApiNotificationId(notificationId);
    if (apiNotificationId === null) return;

    try {
      await deleteNotificationById(apiNotificationId);
      setNotifications((prev) => {
        const next = prev.filter((n) => n.id !== notificationId);
        setUnreadCount(computeUnreadCount(next));
        setTaskAttentionCount(computeTaskAttentionCount(next));
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
    taskAttentionCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    reloadNotifications: loadNotifications,
  };
};
