import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, UserCircle2, Loader2 } from "lucide-react";

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

interface Contact {
  id: string;
  full_name: string;
}

export interface ContactsPanelProps {
  contacts: Contact[];
  loading: boolean;
  selectedUserId: string;
  isUserOnline: (userId: string) => boolean;
  onSelectContact: (userId: string) => void;
}

export function ContactsPanel({
  contacts,
  loading,
  selectedUserId,
  isUserOnline,
  onSelectContact,
}: ContactsPanelProps) {
  const [search, setSearch] = useState("");

  const normalizedSearch = search.trim().toLowerCase();

  const filteredContacts = useMemo(() => {
    const sorted = [...contacts].sort((a, b) => a.full_name.localeCompare(b.full_name));
    if (!normalizedSearch) return sorted;
    return sorted.filter((c) => c.full_name.toLowerCase().includes(normalizedSearch));
  }, [contacts, normalizedSearch]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Search */}
      <div className="p-3 border-b flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar contactos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 text-base"
        />
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-0.5">
          {/* Loading */}
          {loading && filteredContacts.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-base">Cargando contactos...</span>
            </div>
          )}

          {/* Empty */}
          {!loading && filteredContacts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <UserCircle2 className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-base">
                {normalizedSearch ? "Sin resultados para esta búsqueda" : "No hay contactos disponibles"}
              </p>
            </div>
          )}

          {/* Contact list */}
          {filteredContacts.map((contact) => {
            const online = isUserOnline(contact.id);
            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => onSelectContact(contact.id)}
                className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${
                  selectedUserId === contact.id ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <Avatar className="h-11 w-11">
                      <AvatarFallback className={`${nameColor(contact.id)} text-white text-base font-semibold`}>
                        {getInitials(contact.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white ${online ? "bg-green-500" : "bg-gray-300"}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-base truncate text-gray-900">{contact.full_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {online ? "En línea" : "Desconectado"}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
