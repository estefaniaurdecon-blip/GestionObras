import { useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Star, UserCircle2 } from "lucide-react";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

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
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }

  return colors[Math.abs(hash) % colors.length];
}

interface Contact {
  id: string;
  full_name: string;
}

export interface ContactsPanelProps {
  contacts: Contact[];
  favoriteContactIds: string[];
  loading: boolean;
  selectedUserId: string;
  isUserOnline: (userId: string) => boolean;
  onSelectContact: (userId: string) => void;
}

export function ContactsPanel({
  contacts,
  favoriteContactIds,
  loading,
  selectedUserId,
  isUserOnline,
  onSelectContact,
}: ContactsPanelProps) {
  const [search, setSearch] = useState("");

  const normalizedSearch = search.trim().toLowerCase();

  const filteredContacts = useMemo(() => {
    const favorites = new Set(favoriteContactIds);
    const sorted = [...contacts].sort((left, right) => {
      const favoriteDelta = Number(favorites.has(right.id)) - Number(favorites.has(left.id));
      if (favoriteDelta !== 0) {
        return favoriteDelta;
      }

      return left.full_name.localeCompare(right.full_name, "es", { sensitivity: "base" });
    });

    if (!normalizedSearch) {
      return sorted;
    }

    return sorted.filter((contact) =>
      contact.full_name.toLowerCase().includes(normalizedSearch),
    );
  }, [contacts, favoriteContactIds, normalizedSearch]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar contactos..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-10 text-base"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 p-2">
          {loading && filteredContacts.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              <span className="text-base">Cargando contactos...</span>
            </div>
          )}

          {!loading && filteredContacts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <UserCircle2 className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-base">
                {normalizedSearch
                  ? "Sin resultados para esta busqueda"
                  : "No hay contactos disponibles"}
              </p>
            </div>
          )}

          {filteredContacts.map((contact) => {
            const online = isUserOnline(contact.id);
            const isFavorite = favoriteContactIds.includes(contact.id);

            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => onSelectContact(contact.id)}
                className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                  selectedUserId === contact.id
                    ? "bg-blue-50 ring-1 ring-blue-200"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <Avatar className="h-11 w-11">
                      <AvatarFallback
                        className={`${nameColor(contact.id)} text-base font-semibold text-white`}
                      >
                        {getInitials(contact.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white ${
                        online ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-base font-medium text-gray-900">
                        {contact.full_name}
                      </div>
                      {isFavorite && (
                        <Star className="h-4 w-4 shrink-0 fill-current text-amber-500" />
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {online ? "En linea" : "Desconectado"}
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
