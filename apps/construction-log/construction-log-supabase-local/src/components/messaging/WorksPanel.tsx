import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Users,
} from "lucide-react";
import type { ActiveWorkConversationContext } from "@/components/chatCenterContext";

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

interface WorkItem {
  id: number;
  name: string;
  code?: string | null;
  visible_member_count: number;
}

function workDisplayName(work: WorkItem): string {
  const code = work.code?.trim();
  return code ? `${code} - ${work.name}` : work.name;
}

interface WorkMember {
  id: string;
  full_name: string;
}

export interface WorksPanelProps {
  works: WorkItem[];
  loadingWorks: boolean;
  membersByWorkId: Record<number, WorkMember[]>;
  loadingMembersByWorkId: Record<number, boolean>;
  loadMembersForWork: (workId: number) => Promise<unknown>;
  onSelectMemberDM: (userId: string, workContext: ActiveWorkConversationContext) => void;
  selectedUserId: string;
}

export function WorksPanel({
  works,
  loadingWorks,
  membersByWorkId,
  loadingMembersByWorkId,
  loadMembersForWork,
  onSelectMemberDM,
  selectedUserId,
}: WorksPanelProps) {
  const [search, setSearch] = useState("");
  const [expandedWorkIds, setExpandedWorkIds] = useState<number[]>([]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredWorks = useMemo(() => {
    if (!normalizedSearch) return works;
    return works.filter((work) => {
      if (work.name.toLowerCase().includes(normalizedSearch)) return true;
      if (work.code?.toLowerCase().includes(normalizedSearch)) return true;
      const members = membersByWorkId[work.id] || [];
      return members.some((m) => m.full_name.toLowerCase().includes(normalizedSearch));
    });
  }, [membersByWorkId, normalizedSearch, works]);

  const toggleWork = async (workId: number) => {
    const isExpanded = expandedWorkIds.includes(workId);
    if (isExpanded) {
      setExpandedWorkIds((prev) => prev.filter((id) => id !== workId));
      return;
    }
    setExpandedWorkIds((prev) => prev.concat(workId));
    await loadMembersForWork(workId);
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Search */}
      <div className="p-3 border-b flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar obras o personas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 text-base"
        />
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-2">
          {loadingWorks && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-base">Cargando obras...</span>
            </div>
          )}

          {!loadingWorks && filteredWorks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Building2 className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-base">
                {normalizedSearch ? "Sin resultados para esta búsqueda" : "No hay obras disponibles"}
              </p>
            </div>
          )}

          {filteredWorks.map((work) => {
            const isExpanded = expandedWorkIds.includes(work.id);
            const members = membersByWorkId[work.id] || [];
            const filteredMembers = normalizedSearch
              ? members.filter((m) => m.full_name.toLowerCase().includes(normalizedSearch))
              : members;
            const displayName = workDisplayName(work);
            const workContext: ActiveWorkConversationContext = { workId: work.id, workName: displayName };

            return (
              <div key={`work-${work.id}`} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                {/* Work header */}
                <button
                  type="button"
                  onClick={() => void toggleWork(work.id)}
                  className="w-full px-3 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-100 shrink-0">
                    <Building2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-gray-900 text-base">{displayName}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Users className="h-3 w-3" />
                      <span>
                        {work.visible_member_count} contacto{work.visible_member_count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-2 py-2 space-y-1">
                    {/* Participants label */}
                    <div className="px-2 pt-1 pb-0.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Participantes en la conversación
                      </span>
                    </div>

                    {/* Members */}
                    {loadingMembersByWorkId[work.id] && (
                      <div className="px-2 py-2 text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span className="text-sm">Cargando personas...</span>
                      </div>
                    )}
                    {!loadingMembersByWorkId[work.id] && filteredMembers.length === 0 && (
                      <div className="px-2 py-2 text-sm text-muted-foreground">No hay personas visibles en esta obra.</div>
                    )}
                    {filteredMembers.map((member) => (
                      <button
                        key={`work-${work.id}-member-${member.id}`}
                        type="button"
                        onClick={() => onSelectMemberDM(member.id, workContext)}
                        className={`w-full text-left rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors ${
                          selectedUserId === member.id ? "bg-gray-50 ring-1 ring-gray-200" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className={`${nameColor(member.id)} text-white text-xs font-medium`}>
                              {getInitials(member.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-base truncate text-gray-900">{member.full_name}</div>
                            <div className="text-xs text-muted-foreground">DM privado</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
