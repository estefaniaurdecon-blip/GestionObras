import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/integrations/api/client";
import { ACTIVE_TENANT_CHANGED_EVENT, getActiveTenantId } from "@/offline-db/tenantScope";
import { createAiHelpWelcomeMessage, AI_HELP_USER_ID, AI_HELP_USER_NAME } from "@/lib/aiHelp";
import type { Message } from "@/types/notifications";
import { storage } from "@/utils/storage";
import { toast } from "./use-toast";

const AI_HELP_STORAGE_PREFIX = "ai_help_conversation::v1::";

function toStorageKey(userId: string, tenantId: string | null): string {
  return `${AI_HELP_STORAGE_PREFIX}user-${userId}::tenant-${tenantId ?? "none"}`;
}

function normalizeMessage(value: unknown): Message | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const from_user_id = typeof record.from_user_id === "string" ? record.from_user_id : "";
  const to_user_id = typeof record.to_user_id === "string" ? record.to_user_id : "";
  const message = typeof record.message === "string" ? record.message : "";
  const created_at = typeof record.created_at === "string" ? record.created_at : "";
  if (!id || !from_user_id || !to_user_id || !message || !created_at) return null;
  return {
    id,
    from_user_id,
    to_user_id,
    message,
    created_at,
    read: true,
    work_report_id: typeof record.work_report_id === "string" ? record.work_report_id : undefined,
    from_user:
      record.from_user &&
      typeof record.from_user === "object" &&
      typeof (record.from_user as { full_name?: unknown }).full_name === "string"
        ? { full_name: String((record.from_user as { full_name?: unknown }).full_name) }
        : undefined,
    to_user:
      record.to_user &&
      typeof record.to_user === "object" &&
      typeof (record.to_user as { full_name?: unknown }).full_name === "string"
        ? { full_name: String((record.to_user as { full_name?: unknown }).full_name) }
        : undefined,
  };
}

function sortMessages(items: Message[]): Message[] {
  return [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export function useAiHelpConversation() {
  const { user } = useAuth();
  const currentUserId = user ? String(user.id) : null;
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const storageKey = useMemo(() => {
    if (!currentUserId) return null;
    return toStorageKey(currentUserId, activeTenantId);
  }, [activeTenantId, currentUserId]);

  const persistMessages = useCallback(
    async (next: Message[]) => {
      if (!storageKey) return;
      await storage.setItem(storageKey, JSON.stringify(sortMessages(next)));
    },
    [storageKey],
  );

  useEffect(() => {
    let cancelled = false;

    const resolveTenant = async () => {
      if (!user) {
        if (!cancelled) setActiveTenantId(null);
        return;
      }
      const tenantId = await getActiveTenantId(user);
      if (!cancelled) setActiveTenantId(tenantId);
    };

    void resolveTenant();
    const handleActiveTenantChange = () => {
      void resolveTenant();
    };
    if (typeof window !== "undefined") {
      window.addEventListener(
        ACTIVE_TENANT_CHANGED_EVENT,
        handleActiveTenantChange as EventListener,
      );
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener(
          ACTIVE_TENANT_CHANGED_EVENT,
          handleActiveTenantChange as EventListener,
        );
      }
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const loadConversation = async () => {
      if (!currentUserId || !storageKey) {
        setMessages([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const raw = await storage.getItem(storageKey);
        if (cancelled) return;

        if (!raw) {
          const welcome = [createAiHelpWelcomeMessage(currentUserId)];
          setMessages(welcome);
          await storage.setItem(storageKey, JSON.stringify(welcome));
          return;
        }

        const parsed = JSON.parse(raw);
        const normalized = Array.isArray(parsed)
          ? parsed
              .map(normalizeMessage)
              .filter((item): item is Message => Boolean(item))
          : [];

        if (normalized.length === 0) {
          const welcome = [createAiHelpWelcomeMessage(currentUserId)];
          setMessages(welcome);
          await storage.setItem(storageKey, JSON.stringify(welcome));
          return;
        }

        setMessages(sortMessages(normalized));
      } catch (error) {
        console.error("Error loading AI help conversation:", error);
        const welcome = [createAiHelpWelcomeMessage(currentUserId)];
        setMessages(welcome);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadConversation();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, storageKey]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!currentUserId || !storageKey) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      const now = new Date().toISOString();
      const userMessage: Message = {
        id: crypto.randomUUID(),
        from_user_id: currentUserId,
        to_user_id: AI_HELP_USER_ID,
        message: trimmed,
        read: true,
        created_at: now,
        from_user: { full_name: user?.full_name || "Tú" },
        to_user: { full_name: AI_HELP_USER_NAME },
      };

      const conversationBeforeAssistant = [...messages, userMessage];
      setMessages(conversationBeforeAssistant);
      setSending(true);

      try {
        await persistMessages(conversationBeforeAssistant);

        const response = await apiFetch("/api/v1/ai/help-chat", {
          method: "POST",
          timeoutMs: 90000,
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            messages: conversationBeforeAssistant
              .filter(
                (message) =>
                  message.from_user_id === currentUserId ||
                  message.from_user_id === AI_HELP_USER_ID,
              )
              .slice(-20)
              .map((message) => ({
                role: message.from_user_id === currentUserId ? "user" : "assistant",
                content: message.message,
              })),
          }),
        });

        const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (!contentType.includes("text/event-stream")) {
          const bodyPreview = (await response.text()).slice(0, 180);
          throw new Error(
            bodyPreview
              ? `Ayuda IA devolvio una respuesta no valida: ${bodyPreview}`
              : "Ayuda IA devolvio una respuesta no valida."
          );
        }

        const assistantId = crypto.randomUUID();
        let assistantContent = "";

        // Parse SSE events from response. When BaseHTTPMiddleware buffers the
        // response (e.g. AuditSourceMiddleware), response.body may be null or
        // delivered as a single buffered chunk. Fall back to response.text() in
        // that case so the response is always parsed correctly.
        const parseSSEText = (text: string): string => {
          let content = "";
          for (const rawLine of text.split("\n")) {
            const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const chunk = parsed?.choices?.[0]?.delta?.content;
              if (typeof chunk === "string" && chunk.length > 0) content += chunk;
            } catch {
              // ignore malformed lines
            }
          }
          return content;
        };

        if (!response.body) {
          // Buffered fallback — entire body available as text
          const rawText = await response.text();
          assistantContent = parseSSEText(rawText);
        } else {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex !== -1) {
              let line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) {
                newlineIndex = buffer.indexOf("\n");
                continue;
              }

              const payload = line.slice(6).trim();
              if (payload === "[DONE]") {
                newlineIndex = buffer.indexOf("\n");
                continue;
              }

              try {
                const parsed = JSON.parse(payload);
                const chunk = parsed?.choices?.[0]?.delta?.content;
                if (typeof chunk === "string" && chunk.length > 0) {
                  assistantContent += chunk;
                  const nextMessages = [
                    ...conversationBeforeAssistant,
                    {
                      id: assistantId,
                      from_user_id: AI_HELP_USER_ID,
                      to_user_id: currentUserId,
                      message: assistantContent,
                      read: true,
                      created_at: new Date().toISOString(),
                      from_user: { full_name: AI_HELP_USER_NAME },
                      to_user: { full_name: user?.full_name || "Tú" },
                    },
                  ];
                  setMessages(nextMessages);
                }
              } catch {
                // ignore partial chunks until complete line arrives
              }

              newlineIndex = buffer.indexOf("\n");
            }
          }
        }

        const finalAssistantMessage: Message = {
          id: assistantId,
          from_user_id: AI_HELP_USER_ID,
          to_user_id: currentUserId,
          message:
            assistantContent.trim() || "No he encontrado una respuesta fiable para esa consulta.",
          read: true,
          created_at: new Date().toISOString(),
          from_user: { full_name: AI_HELP_USER_NAME },
          to_user: { full_name: user?.full_name || "Tú" },
        };

        const finalConversation = [...conversationBeforeAssistant, finalAssistantMessage];
        setMessages(finalConversation);
        await persistMessages(finalConversation);
      } catch (error) {
        console.error("AI help chat error:", error);
        setMessages(messages);
        toast({
          title: "Error en Ayuda IA",
          description:
            error instanceof Error ? error.message : "No se pudo generar la respuesta.",
          variant: "destructive",
        });
      } finally {
        setSending(false);
      }
    },
    [currentUserId, messages, persistMessages, storageKey, user?.full_name],
  );

  return {
    messages,
    loading,
    sending,
    sendMessage,
  };
}
