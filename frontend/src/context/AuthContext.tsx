import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken } from "../api/client";
import type { LoginResponse, RegisterResponse, User } from "../api/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    displayName: string,
    password: string,
  ) => Promise<RegisterResponse>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * localStorage key for the cached `/api/auth/me` response. Stored alongside
 * the token so the UI can render the "me" area (greeting, header, avatar)
 * synchronously on reload instead of waiting a round-trip every time.
 */
const USER_CACHE_KEY = "friendflow.user";

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    // Defensive: reject anything that doesn't at least look like a User.
    // Shipping a new required field shouldn't mean stale caches render
    // broken greetings - `display_name` + `id` is the minimum we rely on.
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as User).id !== "string" ||
      typeof (parsed as User).display_name !== "string"
    ) {
      return null;
    }
    return parsed as User;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null): void {
  try {
    if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    /* storage full / disabled - not worth crashing the app over */
  }
}

/**
 * Clears every per-user cache the frontend owns. Called from `logout()` and
 * when the backend rejects our token, so the next user doesn't see stale
 * data from the previous session. Currently covers the auth user and the
 * Dashboard group list; add new keys here as we introduce more caches.
 */
export function clearAuthCaches(): void {
  writeCachedUser(null);
  try {
    localStorage.removeItem("friendflow.groups");
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Hydrate user + loading synchronously from localStorage so the very first
  // render already has the right content when we have a valid-looking token.
  // The network revalidation below still runs; if the token is bad we'll
  // flush the cache and bounce to login.
  const [user, setUser] = useState<User | null>(() => {
    return getToken() ? readCachedUser() : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const token = getToken();
    if (!token) return false;
    // With a cached user we can render immediately and revalidate silently.
    return readCachedUser() === null;
  });

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      // No token but maybe a stale cache from a previous session - drop it.
      clearAuthCaches();
      setLoading(false);
      return;
    }
    api<User>("/api/auth/me")
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        writeCachedUser(u);
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setUser(null);
        clearAuthCaches();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    setToken(res.token);
    writeCachedUser(res.user);
    setUser(res.user);
  }, []);

  const register = useCallback(
    async (email: string, displayName: string, password: string) => {
      const res = await api<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: { email, display_name: displayName, password },
        auth: false,
      });
      if (res.status === "approved" && res.token) {
        setToken(res.token);
        writeCachedUser(res.user);
        setUser(res.user);
      }
      return res;
    },
    [],
  );

  const logout = useCallback(() => {
    setToken(null);
    clearAuthCaches();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
