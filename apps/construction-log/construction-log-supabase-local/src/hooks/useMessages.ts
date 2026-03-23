import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Message } from '@/types/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { ACTIVE_TENANT_CHANGED_EVENT, getActiveTenantId } from '@/offline-db/tenantScope';
import { toast } from './use-toast';
import {
  clearAllMessages as clearAllApiMessages,
  createMessage,
  deleteConversationMessages,
  listMessages,
  markMessageAsRead,
  type ApiMessageRead,
} from '@/integrations/api/client';
import {
  createPendingMessageRecord,
  mergeMessageRecords,
  readStoredMessages,
  type StoredMessageRecord,
  writeStoredMessages,
} from './messagingOfflineStore';

const POLL_INTERVAL_MS = 15000;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return 'Error inesperado';
};

const isRetriableMessageError = (error: unknown): boolean => {
  if (error instanceof TypeError) return true;

  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? Number((error as { status?: number }).status)
    : null;

  if (status === 0 || status === 401) return true;

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('err_internet_disconnected') ||
    message.includes('sesion expirada') ||
    message.includes('sesi') ||
    message.includes('request timeout')
  );
};

const toApiMessageId = (messageId: string): number | null => {
  const parsed = Number(messageId);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const toLegacyMessage = (row: ApiMessageRead): Message => ({
  id: String(row.id),
  from_user_id: String(row.from_user_id),
  to_user_id: String(row.to_user_id),
  work_report_id: row.work_report_id ?? undefined,
  message: row.message,
  read: Boolean(row.read),
  created_at: row.created_at,
  from_user: row.from_user ? { full_name: row.from_user.full_name } : undefined,
  to_user: row.to_user ? { full_name: row.to_user.full_name } : undefined,
});

const toStoredMessage = (message: Message, syncStatus: StoredMessageRecord['syncStatus'] = 'synced'): StoredMessageRecord => ({
  ...message,
  syncStatus,
  lastSyncError: null,
});

const stripMessageMeta = (message: StoredMessageRecord): Message => {
  const { syncStatus: _syncStatus, lastSyncError: _lastSyncError, ...rest } = message;
  return rest;
};

export const useMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const storedMessagesRef = useRef<StoredMessageRecord[]>([]);
  const { user } = useAuth();

  const messageScopeId = useMemo(
    () => (user && activeTenantId ? `user-${user.id}::tenant-${activeTenantId}` : null),
    [activeTenantId, user]
  );

  useEffect(() => {
    let cancelled = false;

    const resolveTenant = async () => {
      if (!user) {
        if (!cancelled) setActiveTenantId(null);
        return;
      }

      const tenantId = await getActiveTenantId(user);
      if (!cancelled) {
        setActiveTenantId(tenantId);
      }
    };

    void resolveTenant();
    const handleActiveTenantChange = () => {
      void resolveTenant();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(ACTIVE_TENANT_CHANGED_EVENT, handleActiveTenantChange as EventListener);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener(ACTIVE_TENANT_CHANGED_EVENT, handleActiveTenantChange as EventListener);
      }
    };
  }, [user]);

  const applyStoredMessages = useCallback(
    (next: StoredMessageRecord[]) => {
      const currentUserId = user ? String(user.id) : null;
      const visibleMessages = next.map(stripMessageMeta);
      storedMessagesRef.current = next;
      setMessages(visibleMessages);
      setUnreadCount(
        currentUserId
          ? visibleMessages.filter((message) => !message.read && message.to_user_id === currentUserId).length
          : 0
      );
      knownMessageIdsRef.current = new Set(visibleMessages.map((message) => message.id));
    },
    [user]
  );

  const persistMessages = useCallback(
    async (next: StoredMessageRecord[]) => {
      if (!messageScopeId) {
        applyStoredMessages(next);
        return next;
      }

      const stored = await writeStoredMessages(messageScopeId, next);
      applyStoredMessages(stored);
      return stored;
    },
    [applyStoredMessages, messageScopeId]
  );

  const syncPendingMessages = useCallback(
    async (source: StoredMessageRecord[]): Promise<StoredMessageRecord[]> => {
      if (!activeTenantId) {
        return source;
      }

      let next = [...source];
      let changed = false;

      for (const item of source) {
        if (item.syncStatus !== 'pending') continue;

        try {
          const created = await createMessage({
            to_user_id: item.to_user_id,
            message: item.message,
            work_report_id: item.work_report_id,
            tenantId: activeTenantId,
          });

          const synced = toStoredMessage(toLegacyMessage(created), 'synced');
          next = next
            .filter((candidate) => candidate.id !== item.id)
            .concat(synced);
          changed = true;
        } catch (error) {
          if (isRetriableMessageError(error)) {
            next = next.map((candidate) =>
              candidate.id === item.id
                ? {
                    ...candidate,
                    syncStatus: 'pending',
                    lastSyncError: getErrorMessage(error),
                  }
                : candidate
            );
            continue;
          }

          next = next.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  syncStatus: 'error',
                  lastSyncError: getErrorMessage(error),
                }
              : candidate
          );
          changed = true;
        }
      }

      if (changed) {
        return persistMessages(next);
      }

      return next;
    },
    [activeTenantId, persistMessages]
  );

  const loadMessages = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!user || !messageScopeId || !activeTenantId) {
        storedMessagesRef.current = [];
        setMessages([]);
        setUnreadCount(0);
        knownMessageIdsRef.current = new Set();
        setLoading(false);
        return;
      }

      if (!options?.silent) {
        setLoading(true);
      }

      const previousIds = new Set(knownMessageIdsRef.current);
      const cachedMessages = await readStoredMessages(messageScopeId);
      if (cachedMessages.length > 0) {
        applyStoredMessages(cachedMessages);
      }

      try {
        const localAfterSync = await syncPendingMessages(
          cachedMessages.length > 0 ? cachedMessages : storedMessagesRef.current
        );
        const response = await listMessages({ limit: 300, offset: 0, tenantId: activeTenantId });
        const mapped = response.items.map((item) => toStoredMessage(toLegacyMessage(item), 'synced'));
        const merged = mergeMessageRecords(mapped, localAfterSync);
        await persistMessages(merged);

        if (options?.silent) {
          const currentUserId = String(user.id);
          const visibleMessages = merged.map(stripMessageMeta);
          const newIncoming = visibleMessages.filter(
            (message) =>
              !previousIds.has(message.id) &&
              !message.read &&
              message.to_user_id === currentUserId
          );

          if (newIncoming.length > 0) {
            const first = newIncoming[0];
            const fromName = first.from_user?.full_name || 'Nuevo mensaje';
            const snippet =
              first.message.length > 50 ? `${first.message.slice(0, 50)}...` : first.message;
            toast({
              title: 'Nuevo mensaje',
              description: `${fromName}: ${snippet}`,
            });
          }
        }
      } catch (error: unknown) {
        console.error('Error loading messages:', error);

        const fallbackMessages =
          storedMessagesRef.current.length > 0 ? storedMessagesRef.current : cachedMessages;
        if (fallbackMessages.length > 0) {
          applyStoredMessages(fallbackMessages);
        }

        if (!options?.silent && fallbackMessages.length === 0) {
          toast({
            title: 'Error al cargar mensajes',
            description: getErrorMessage(error),
            variant: 'destructive',
          });
        }
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [activeTenantId, applyStoredMessages, messageScopeId, persistMessages, syncPendingMessages, user]
  );

  useEffect(() => {
    void loadMessages();

    if (!user) return;

    const pollId = window.setInterval(() => {
      void loadMessages({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollId);
    };
  }, [user, loadMessages]);

  const sendMessage = async (
    toUserId: string,
    message: string,
    workReportId?: string,
    toUserName?: string
  ) => {
    if (!user || !messageScopeId || !activeTenantId) return;

    const pendingMessage = createPendingMessageRecord({
      fromUserId: String(user.id),
      toUserId: String(toUserId),
      message,
      workReportId,
      fromUserName: user.full_name || user.email,
      toUserName,
    });

    const baseState = storedMessagesRef.current.concat(pendingMessage);
    await persistMessages(baseState);

    try {
      const created = await createMessage({
        to_user_id: String(toUserId),
        message,
        work_report_id: workReportId,
        tenantId: activeTenantId,
      });

      const syncedMessage = toStoredMessage(toLegacyMessage(created), 'synced');
      await persistMessages(
        storedMessagesRef.current
          .filter((item) => item.id !== pendingMessage.id)
          .concat(syncedMessage)
      );
    } catch (error: unknown) {
      console.error('Error sending message:', error);

      if (isRetriableMessageError(error)) {
        await persistMessages(
          storedMessagesRef.current.map((item) =>
            item.id === pendingMessage.id
              ? { ...item, syncStatus: 'pending', lastSyncError: getErrorMessage(error) }
              : item
          )
        );

        toast({
          title: 'Mensaje guardado offline',
          description: 'Se enviará automáticamente cuando vuelvas a tener sesión y conexión.',
        });
        return;
      }

      await persistMessages(
        storedMessagesRef.current.map((item) =>
          item.id === pendingMessage.id
            ? { ...item, syncStatus: 'error', lastSyncError: getErrorMessage(error) }
            : item
        )
      );

      toast({
        title: 'Error al enviar',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const markAsRead = async (messageId: string) => {
    const apiMessageId = toApiMessageId(messageId);
    if (apiMessageId === null || !messageScopeId || !activeTenantId) return;

    await persistMessages(
      storedMessagesRef.current.map((message) =>
        message.id === messageId ? { ...message, read: true } : message
      )
    );

    try {
      await markMessageAsRead(apiMessageId, activeTenantId);
    } catch (error: unknown) {
      console.error('Error marking message as read:', error);
    }
  };

  const deleteConversation = async (otherUserId: string) => {
    if (!user || !activeTenantId) return;

    try {
      await deleteConversationMessages(String(otherUserId), activeTenantId);
      await persistMessages(
        storedMessagesRef.current.filter(
          (message) =>
            !(
              (message.from_user_id === String(user.id) && message.to_user_id === String(otherUserId)) ||
              (message.to_user_id === String(user.id) && message.from_user_id === String(otherUserId))
            )
        )
      );

      toast({
        title: 'Conversacion eliminada',
        description: 'Se han eliminado todos los mensajes de esta conversacion.',
      });
    } catch (error: unknown) {
      console.error('Error deleting conversation:', error);
      toast({
        title: 'Error al eliminar',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const clearAllMessages = async () => {
    if (!user || !activeTenantId) return;

    try {
      await clearAllApiMessages(activeTenantId);
      await persistMessages([]);

      toast({
        title: 'Mensajes eliminados',
        description: 'Se han eliminado todos tus mensajes.',
      });
    } catch (error: unknown) {
      console.error('Error clearing all messages:', error);
      toast({
        title: 'Error al eliminar',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  return {
    messages,
    unreadCount,
    loading,
    sendMessage,
    markAsRead,
    deleteConversation,
    clearAllMessages,
    reloadMessages: loadMessages,
  };
};
