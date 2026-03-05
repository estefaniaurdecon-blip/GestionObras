import { useState, useEffect, useCallback, useRef } from 'react';
import { Message } from '@/types/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';
import {
  clearAllMessages as clearAllApiMessages,
  createMessage,
  deleteConversationMessages,
  listMessages,
  markMessageAsRead,
  type ApiMessageRead,
} from '@/integrations/api/client';

const POLL_INTERVAL_MS = 15000;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return 'Error inesperado';
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

export const useMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const { user } = useAuth();

  const loadMessages = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!user) {
        setMessages([]);
        setUnreadCount(0);
        knownMessageIdsRef.current = new Set();
        setLoading(false);
        return;
      }

      const currentUserId = String(user.id);
      if (!options?.silent) {
        setLoading(true);
      }

      try {
        const response = await listMessages({ limit: 300, offset: 0 });
        const mapped = response.items.map(toLegacyMessage);
        setMessages(mapped);
        setUnreadCount(
          mapped.filter((message) => !message.read && message.to_user_id === currentUserId).length
        );
        if (options?.silent) {
          const newIncoming = mapped.filter(
            (message) =>
              !knownMessageIdsRef.current.has(message.id) &&
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
        knownMessageIdsRef.current = new Set(mapped.map((message) => message.id));
      } catch (error: unknown) {
        console.error('Error loading messages:', error);
        if (!options?.silent) {
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
    [user]
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

  const sendMessage = async (toUserId: string, message: string, workReportId?: string) => {
    if (!user) return;

    try {
      await createMessage({
        to_user_id: String(toUserId),
        message,
        work_report_id: workReportId,
      });
      await loadMessages({ silent: true });
    } catch (error: unknown) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error al enviar',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const markAsRead = async (messageId: string) => {
    const apiMessageId = toApiMessageId(messageId);
    if (apiMessageId === null) return;

    try {
      await markMessageAsRead(apiMessageId);
      setMessages((prev) =>
        prev.map((message) => (message.id === messageId ? { ...message, read: true } : message))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error: unknown) {
      console.error('Error marking message as read:', error);
    }
  };

  const deleteConversation = async (otherUserId: string) => {
    if (!user) return;

    try {
      await deleteConversationMessages(String(otherUserId));

      toast({
        title: 'Conversacion eliminada',
        description: 'Se han eliminado todos los mensajes de esta conversacion.',
      });

      await loadMessages({ silent: true });
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
    if (!user) return;

    try {
      await clearAllApiMessages();

      toast({
        title: 'Mensajes eliminados',
        description: 'Se han eliminado todos tus mensajes.',
      });

      await loadMessages({ silent: true });
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
