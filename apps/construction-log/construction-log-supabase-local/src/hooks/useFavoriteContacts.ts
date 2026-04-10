import { useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "chat-favorite-contacts:v1";

function buildStorageKey(userId: string | null, tenantId: string | null): string | null {
  if (!userId) {
    return null;
  }

  return `${STORAGE_PREFIX}:${tenantId ?? "global"}:${userId}`;
}

function normalizeFavoriteIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );
}

export function useFavoriteContacts(userId: string | null, tenantId: string | null) {
  const storageKey = useMemo(() => buildStorageKey(userId, tenantId), [tenantId, userId]);
  const [favoriteContactIds, setFavoriteContactIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) {
      setFavoriteContactIds([]);
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      setFavoriteContactIds(raw ? normalizeFavoriteIds(JSON.parse(raw)) : []);
    } catch {
      setFavoriteContactIds([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(favoriteContactIds));
    } catch {
      // ignore storage errors for this optional preference
    }
  }, [favoriteContactIds, storageKey]);

  const toggleFavoriteContact = (contactId: string) => {
    setFavoriteContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    );
  };

  const isFavoriteContact = (contactId: string) => favoriteContactIds.includes(contactId);

  return {
    favoriteContactIds,
    toggleFavoriteContact,
    isFavoriteContact,
  };
}
