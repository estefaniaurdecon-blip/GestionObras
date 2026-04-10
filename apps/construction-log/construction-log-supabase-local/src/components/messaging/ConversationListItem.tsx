import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { X, Building2, Bot, Star } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function nameColor(id: string): string {
  const colors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-violet-500",
    "bg-cyan-500",
    "bg-pink-500",
    "bg-teal-500",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export interface ConversationListItemData {
  userId: string;
  userName: string;
  unread: number;
  lastSnippet: string | null;
  lastAt: string | null;
  hasConversation: boolean;
  isAiHelp?: boolean;
  isFavorite?: boolean;
  /** "dm" for direct messages / contacts, "work" for obra group conversations */
  type: "dm" | "work";
  /** Only set when type === "work" */
  workId?: number;
}

interface ConversationListItemProps {
  item: ConversationListItemData;
  isSelected: boolean;
  onSelect: (item: ConversationListItemData) => void;
  onDelete?: (userId: string) => void;
}

export function ConversationListItem({ item, isSelected, onSelect, onDelete }: ConversationListItemProps) {
  const isWork = item.type === "work";
  const isAiHelp = item.isAiHelp === true;
  const reservesDeleteSpace = Boolean(onDelete && item.hasConversation && item.type === "dm" && !isAiHelp);

  return (
    <div className="relative group">
      <button
        onClick={() => onSelect(item)}
        className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${reservesDeleteSpace ? "pr-11" : ""} ${
          isSelected ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-gray-50"
        }`}
      >
        <div className="grid min-w-0 grid-cols-[auto,minmax(0,1fr)] items-center gap-3">
          {/* Avatar */}
          <div className="relative shrink-0">
            {isWork ? (
              <div className="flex items-center justify-center h-11 w-11 rounded-full bg-blue-100">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
            ) : isAiHelp ? (
              <div className="flex items-center justify-center h-11 w-11 rounded-full bg-amber-100">
                <Bot className="h-5 w-5 text-amber-700" />
              </div>
            ) : (
              <Avatar className="h-11 w-11">
                <AvatarFallback className={`${nameColor(item.userId)} text-white text-base font-semibold`}>
                  {getInitials(item.userName)}
                </AvatarFallback>
              </Avatar>
            )}
            {item.unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white ring-2 ring-white">
                {item.unread > 9 ? "9+" : item.unread}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <span className={`block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[18px] ${item.unread > 0 ? "font-semibold text-gray-900" : "font-medium text-gray-800"}`}>
                {item.userName}
              </span>
              {item.isFavorite && item.type === "dm" && !isAiHelp && (
                <Star className="h-4 w-4 shrink-0 fill-current text-amber-500" />
              )}
              {item.lastAt && (
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {item.lastAt}
                </span>
              )}
            </div>
            <p
              className={`mt-0.5 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[16px] leading-6 ${item.unread > 0 ? "text-gray-700 font-medium" : "text-muted-foreground"}`}
              title={item.lastSnippet ?? undefined}
            >
              {item.lastSnippet ?? (isWork ? "Conversación de obra" : "Sin mensajes todavía")}
            </p>
          </div>
        </div>
      </button>

      {/* Delete button (only for DM conversations with messages) */}
      {onDelete && item.hasConversation && item.type === "dm" && !isAiHelp && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => e.stopPropagation()}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar conversación?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminarán todos los mensajes con {item.userName}. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(item.userId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
