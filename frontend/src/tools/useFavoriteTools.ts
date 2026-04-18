import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "friendflow.favoriteTools";

function readFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeFavorites(favorites: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
  } catch {
    /* storage may be full or disabled; nothing we can do */
  }
}

/**
 * Per-browser favorites for tool tiles. Kept in localStorage so the choice
 * survives reloads, and synced across tabs via the native `storage` event.
 */
export function useFavoriteTools() {
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavorites());

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      setFavorites(readFavorites());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((toolId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      writeFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (toolId: string) => favorites.has(toolId),
    [favorites],
  );

  return { favorites, toggle, isFavorite };
}
