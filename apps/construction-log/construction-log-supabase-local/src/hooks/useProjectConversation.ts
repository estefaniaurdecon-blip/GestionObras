import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  createProjectConversationMessage,
  getProjectConversationShell,
  listProjectConversationMessages,
  type ProjectConversationApi,
  type ProjectConversationMessageApi,
  type ProjectConversationParticipantApi,
} from '@/integrations/api/client';
import { ACTIVE_TENANT_CHANGED_EVENT, getActiveTenantId } from '@/offline-db/tenantScope';

export interface ProjectConversationSelection {
  workId: number;
  workName: string;
}

export const useProjectConversation = (
  selection: ProjectConversationSelection | null,
  enabled = true,
) => {
  const { user } = useAuth();
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ProjectConversationApi | null>(null);
  const [participants, setParticipants] = useState<ProjectConversationParticipantApi[]>([]);
  const [messages, setMessages] = useState<ProjectConversationMessageApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workId = selection?.workId ?? null;

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

  const reload = useCallback(async () => {
    if (!enabled || !user || !activeTenantId || workId == null) {
      setConversation(null);
      setParticipants([]);
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [shell, list] = await Promise.all([
        getProjectConversationShell(workId, activeTenantId),
        listProjectConversationMessages(workId, activeTenantId),
      ]);
      setError(null);
      setConversation(shell.conversation);
      setParticipants(shell.participants);
      setMessages(list.items);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Error inesperado';
      console.error('Error loading project conversation:', loadError);
      setError(message);
      setConversation(null);
      setParticipants([]);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, enabled, user, workId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!enabled || !user || !activeTenantId || workId == null) {
        return null;
      }
      const body = message.trim();
      if (!body) {
        return null;
      }

      setSending(true);
      try {
        const created = await createProjectConversationMessage(
          workId,
          { message: body },
          activeTenantId,
        );
        setError(null);
        setMessages((prev) => prev.concat(created));
        setConversation((prev) =>
          prev
            ? {
                ...prev,
                updated_at: created.created_at,
                last_message_at: created.created_at,
              }
            : prev
        );
        return created;
      } finally {
        setSending(false);
      }
    },
    [activeTenantId, enabled, user, workId],
  );

  const participantCount = useMemo(() => participants.length, [participants]);

  return {
    conversation,
    participants,
    participantCount,
    messages,
    loading,
    sending,
    error,
    reload,
    sendMessage,
  };
};
