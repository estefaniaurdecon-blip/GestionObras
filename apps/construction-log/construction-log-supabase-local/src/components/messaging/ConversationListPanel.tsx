import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Search, MessageCircle, Loader2 } from "lucide-react";
import { ConversationListItem, type ConversationListItemData } from "./ConversationListItem";
import { AI_HELP_USER_ID, AI_HELP_USER_NAME } from "@/lib/aiHelp";
import type { Message } from "@/types/notifications";
import type { WorkConversationSummary } from "@/hooks/useWorkConversationSummaries";

export interface ConversationListPanelProps {
  currentUserId: string | null;
  messages: Message[];
  favoriteContactIds: string[];
  loadingContacts: boolean;
  selectedUserId: string;
  selectedWorkConversationId: number | null;
  onSelectConversation: (userId: string) => void;
  onDeleteConversation: (userId: string) => void;
  workConversationSummaries: WorkConversationSummary[];
  aiHelpMessages: Message[];
  onSelectWorkConversation: (workId: number, workName: string) => void;
}

function buildConversationSnippet(raw: string | null | undefined, fallback: string): string {
  const base = (raw ?? "").trim();
  if (!base) return fallback;

  const cleaned = base
    .replace(/\r?\n+/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[`*_>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return fallback;
  return cleaned.length > 72 ? `${cleaned.slice(0, 69).trimEnd()}...` : cleaned;
}

function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

/**
 * View model that merges:
 * 1. DM conversations (from messages) - sorted by last message timestamp
 * 2. Obra group conversations WITH messages - sorted by last message timestamp, interleaved with DMs
 */
function useConversationListViewModel(
  currentUserId: string | null,
  messages: Message[],
  favoriteContactIds: string[],
  workSummaries: WorkConversationSummary[],
  aiHelpMessages: Message[],
  search: string,
): ConversationListItemData[] {
  return useMemo(() => {
    if (!currentUserId) return [];

    const favoriteIds = new Set(favoriteContactIds);

    const convMap = new Map<
      string,
      { userName: string; unread: number; lastSnippet: string; lastAt: string; lastTs: number }
    >();

    for (const m of messages) {
      const isFromMe = m.from_user_id === currentUserId;
      const otherId = isFromMe ? m.to_user_id : m.from_user_id;
      const otherName =
        (isFromMe ? m.to_user?.full_name : m.from_user?.full_name) || "Usuario";
      const ts = new Date(m.created_at).getTime();

      const existing = convMap.get(otherId);
      if (!existing) {
        convMap.set(otherId, {
          userName: otherName,
          unread: !isFromMe && !m.read ? 1 : 0,
          lastSnippet: buildConversationSnippet(m.message, "Sin mensajes todavía"),
          lastAt: formatTimestamp(m.created_at),
          lastTs: ts,
        });
      } else {
        if (ts > existing.lastTs) {
          existing.lastSnippet = buildConversationSnippet(m.message, "Sin mensajes todavía");
          existing.lastAt = formatTimestamp(m.created_at);
          existing.lastTs = ts;
        }
        if (!isFromMe && !m.read) existing.unread += 1;
      }
    }

    const dmItems: (ConversationListItemData & { _sortTs: number })[] = [];
    for (const [userId, c] of convMap) {
      dmItems.push({
        userId,
        userName: c.userName,
        unread: c.unread,
        lastSnippet: c.lastSnippet,
        lastAt: c.lastAt,
        hasConversation: true,
        isFavorite: favoriteIds.has(userId),
        type: "dm",
        _sortTs: c.lastTs,
      });
    }

    const workItems: (ConversationListItemData & { _sortTs: number })[] = workSummaries.map((ws) => ({
      userId: `work-${ws.workId}`,
      userName: ws.workName,
      unread: 0,
      lastSnippet: buildConversationSnippet(ws.lastMessage, "Conversacion de obra"),
      lastAt: formatTimestamp(ws.lastMessageAt),
      hasConversation: true,
      type: "work" as const,
      workId: ws.workId,
      _sortTs: ws.lastMessageTs,
    }));

    const all = [...dmItems, ...workItems].sort((a, b) => {
      const favoriteDelta = Number(Boolean(b.isFavorite && b.type === "dm")) - Number(Boolean(a.isFavorite && a.type === "dm"));
      if (favoriteDelta !== 0) return favoriteDelta;
      return b._sortTs - a._sortTs;
    });
    const result: ConversationListItemData[] = all.map(({ _sortTs, ...rest }) => rest);

    const aiLastMessage = aiHelpMessages[aiHelpMessages.length - 1];
    const aiHelpItem: ConversationListItemData = {
      userId: AI_HELP_USER_ID,
      userName: AI_HELP_USER_NAME,
      unread: 0,
      lastSnippet: buildConversationSnippet(
        aiLastMessage?.message,
        "Pregunta como hacer algo en la aplicacion",
      ),
      lastAt: aiLastMessage ? formatTimestamp(aiLastMessage.created_at) : null,
      hasConversation: true,
      isAiHelp: true,
      type: "dm",
    };

    if (!search.trim()) return [aiHelpItem, ...result];
    const q = search.trim().toLowerCase();
    const filtered = result.filter((item) => item.userName.toLowerCase().includes(q));
    const matchesAi =
      AI_HELP_USER_NAME.toLowerCase().includes(q) ||
      aiHelpItem.lastSnippet?.toLowerCase().includes(q);
    return matchesAi ? [aiHelpItem, ...filtered] : filtered;
  }, [aiHelpMessages, currentUserId, favoriteContactIds, messages, workSummaries, search]);
}

export function ConversationListPanel({
  currentUserId,
  messages,
  favoriteContactIds,
  loadingContacts,
  selectedUserId,
  selectedWorkConversationId,
  onSelectConversation,
  onDeleteConversation,
  workConversationSummaries,
  aiHelpMessages,
  onSelectWorkConversation,
}: ConversationListPanelProps) {
  const [search, setSearch] = useState("");
  const items = useConversationListViewModel(
    currentUserId,
    messages,
    favoriteContactIds,
    workConversationSummaries,
    aiHelpMessages,
    search,
  );

  const handleSelect = (item: ConversationListItemData) => {
    if (item.type === "work" && item.workId != null) {
      onSelectWorkConversation(item.workId, item.userName);
    } else {
      onSelectConversation(item.userId);
    }
  };

  const isItemSelected = (item: ConversationListItemData) => {
    if (item.type === "work") return selectedWorkConversationId === item.workId;
    return selectedUserId === item.userId;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar conversaciones..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 text-base"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 p-2">
          {loadingContacts && items.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              <span className="text-base">Cargando...</span>
            </div>
          )}

          {!loadingContacts && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageCircle className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-base">
                {search.trim() ? "Sin resultados para esta busqueda" : "No hay conversaciones aun"}
              </p>
            </div>
          )}

          {items.map((item) => (
            <ConversationListItem
              key={item.userId}
              item={item}
              isSelected={isItemSelected(item)}
              onSelect={handleSelect}
              onDelete={item.type === "dm" ? onDeleteConversation : undefined}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
