import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Message } from '@/types/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from './use-toast';

export const useMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const loadMessages = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          from_user:profiles!messages_from_user_id_fkey(full_name),
          to_user:profiles!messages_to_user_id_fkey(full_name)
        `)
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        setMessages(data as any);
        setUnreadCount(data.filter(m => !m.read && m.to_user_id === user.id).length);
      }
    } catch (error: any) {
      console.error('Error loading messages:', error);
      toast({
        title: "Error al cargar mensajes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadMessages();

    if (!user) return;

    // Subscribe to realtime messages
    const channel = supabase
      .channel('messages-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `to_user_id=eq.${user.id}`
        },
        async (payload) => {
          const newMessage = payload.new as Message;
          
          // Fetch user details
          const { data: fromUser } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', newMessage.from_user_id)
            .single();

          const messageWithUser = {
            ...newMessage,
            from_user: fromUser
          };

          setMessages(prev => [messageWithUser as any, ...prev]);
          setUnreadCount(prev => prev + 1);
          
          // Show notification
          toast({
            title: "Nuevo mensaje",
            description: `${fromUser?.full_name}: ${newMessage.message.substring(0, 50)}...`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const sendMessage = async (toUserId: string, message: string, workReportId?: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          from_user_id: user.id,
          to_user_id: toUserId,
          message,
          work_report_id: workReportId
        })
        .select()
        .single();

      if (error) throw error;

      // Notificación: ahora la gestiona un trigger en la BD (notify_message_received)
      // No insertamos directamente en notifications para cumplir RLS y evitar duplicados.

      // No mostramos toast de éxito, se usa el sistema de checks
      await loadMessages();
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: "Error al enviar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const markAsRead = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ read: true })
        .eq('id', messageId);

      if (error) throw error;

      setMessages(prev =>
        prev.map(m => m.id === messageId ? { ...m, read: true } : m)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error: any) {
      console.error('Error marking message as read:', error);
    }
  };

  const deleteConversation = async (otherUserId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .or(`and(from_user_id.eq.${user.id},to_user_id.eq.${otherUserId}),and(from_user_id.eq.${otherUserId},to_user_id.eq.${user.id})`);

      if (error) throw error;

      toast({
        title: "Conversación eliminada",
        description: "Se han eliminado todos los mensajes de esta conversación.",
      });

      await loadMessages();
    } catch (error: any) {
      console.error('Error deleting conversation:', error);
      toast({
        title: "Error al eliminar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const clearAllMessages = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`);

      if (error) throw error;

      toast({
        title: "Mensajes eliminados",
        description: "Se han eliminado todos tus mensajes.",
      });

      await loadMessages();
    } catch (error: any) {
      console.error('Error clearing all messages:', error);
      toast({
        title: "Error al eliminar",
        description: error.message,
        variant: "destructive",
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
