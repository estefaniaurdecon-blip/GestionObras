import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Star, UserCircle2 } from "lucide-react";

interface Contact {
  id: string;
  full_name: string;
}

interface FavoriteContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  favoriteContactIds: string[];
  onToggleFavorite: (contactId: string) => void;
}

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

export function FavoriteContactsDialog({
  open,
  onOpenChange,
  contacts,
  favoriteContactIds,
  onToggleFavorite,
}: FavoriteContactsDialogProps) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  const normalizedSearch = search.trim().toLowerCase();

  const sortedContacts = useMemo(() => {
    const favorites = new Set(favoriteContactIds);
    const filtered = contacts.filter((contact) =>
      normalizedSearch ? contact.full_name.toLowerCase().includes(normalizedSearch) : true,
    );

    return [...filtered].sort((left, right) => {
      const favoriteDelta = Number(favorites.has(right.id)) - Number(favorites.has(left.id));
      if (favoriteDelta !== 0) {
        return favoriteDelta;
      }

      return left.full_name.localeCompare(right.full_name, "es", { sensitivity: "base" });
    });
  }, [contacts, favoriteContactIds, normalizedSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Contactos favoritos</DialogTitle>
          <DialogDescription>
            Marca con estrella los contactos que quieras ver primero en la
            mensajeria.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b pb-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contactos..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 text-base"
          />
        </div>

        <ScrollArea className="max-h-[60svh] pr-1">
          <div className="space-y-2 py-1">
            {sortedContacts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <UserCircle2 className="mb-3 h-10 w-10 opacity-40" />
                <p className="text-base">
                  {normalizedSearch
                    ? "No hay contactos para esta busqueda"
                    : "No hay contactos disponibles"}
                </p>
              </div>
            )}

            {sortedContacts.map((contact) => {
              const isFavorite = favoriteContactIds.includes(contact.id);

              return (
                <div
                  key={contact.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-white px-3 py-3"
                >
                  <Avatar className="h-11 w-11 shrink-0">
                    <AvatarFallback
                      className={`${nameColor(contact.id)} text-base font-semibold text-white`}
                    >
                      {getInitials(contact.full_name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-gray-900">
                      {contact.full_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isFavorite ? "Marcado como favorito" : "Pulsa la estrella para destacarlo"}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`shrink-0 rounded-full ${
                      isFavorite
                        ? "text-amber-500 hover:text-amber-600"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
                    onClick={() => onToggleFavorite(contact.id)}
                  >
                    <Star className={`h-5 w-5 ${isFavorite ? "fill-current" : ""}`} />
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
