import { useCallback, useEffect, useRef, useState } from "react";
import {
  getProjectConversationShell,
  listProjectConversationMessages,
} from "@/integrations/api/client";
import { getActiveTenantId } from "@/offline-db/tenantScope";
import { useAuth } from "@/contexts/AuthContext";

export interface WorkConversationSummary {
  workId: number;
  workName: string;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageTs: number;
}

function formatWorkConversationName(work: { name: string; code?: string | null }): string {
  const code = work.code?.trim();
  return code ? `${code} - ${work.name}` : work.name;
}

/**
 * Loads conversation shells for all provided works and returns only those
 * that have real messages (`last_message_at` is set).
 * For each active conversation it also fetches the last message text.
 */
export function useWorkConversationSummaries(
  works: { id: number; name: string; code?: string | null }[],
  enabled: boolean,
) {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<WorkConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const lastWorkIdsRef = useRef<string>("");

  const reload = useCallback(async () => {
    if (!enabled || works.length === 0 || !user) {
      setSummaries([]);
      return;
    }

    const tenantId = await getActiveTenantId(user);
    setLoading(true);

    try {
      // 1. Load shells for all works in parallel
      const shellResults = await Promise.allSettled(
        works.map((w) =>
          getProjectConversationShell(w.id, tenantId).then((shell) => ({
            workId: w.id,
            workName: formatWorkConversationName(w),
            lastMessageAt: shell.conversation.last_message_at,
          })),
        ),
      );

      // 2. Filter to only those with messages
      const activeWorks: { workId: number; workName: string; lastMessageAt: string }[] = [];
      for (const result of shellResults) {
        if (result.status === "fulfilled" && result.value.lastMessageAt) {
          activeWorks.push(
            result.value as { workId: number; workName: string; lastMessageAt: string },
          );
        }
      }

      if (activeWorks.length === 0) {
        setSummaries([]);
        setLoading(false);
        return;
      }

      // 3. Load last message for each active conversation in parallel
      const msgResults = await Promise.allSettled(
        activeWorks.map((aw) =>
          listProjectConversationMessages(aw.workId, tenantId).then((resp) => {
            const msgs = resp.items;
            const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
            return {
              workId: aw.workId,
              workName: aw.workName,
              lastMessage: last
                ? `${last.from_user?.full_name ?? "Usuario"}: ${last.message.slice(0, 50)}`
                : "",
              lastMessageAt: aw.lastMessageAt,
              lastMessageTs: new Date(aw.lastMessageAt).getTime(),
            } satisfies WorkConversationSummary;
          }),
        ),
      );

      const result: WorkConversationSummary[] = [];
      for (const r of msgResults) {
        if (r.status === "fulfilled") result.push(r.value);
      }
      result.sort((a, b) => b.lastMessageTs - a.lastMessageTs);
      setSummaries(result);
    } catch {
      // Keep previous summaries on error
    } finally {
      setLoading(false);
    }
  }, [enabled, works, user]);

  // Reload when works change or enabled toggles
  useEffect(() => {
    const workIds = works
      .map((w) => w.id)
      .sort()
      .join(",");
    if (workIds === lastWorkIdsRef.current && summaries.length > 0) return;
    lastWorkIdsRef.current = workIds;
    void reload();
  }, [works, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  return { summaries, loading, reload };
}
