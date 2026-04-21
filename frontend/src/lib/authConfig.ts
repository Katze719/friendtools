import { useEffect, useState } from "react";
import { api } from "../api/client";

export interface AuthConfig {
  registration_mode: "approval" | "open";
  password_reset_enabled?: boolean;
}

/**
 * Fetches `/api/auth/config` once per page and hands back the tiny
 * public config object. Falls back to `null` on errors so callers can
 * render a best-effort UI while the backend is unreachable - the auth
 * flow itself still works, users just don't see the "forgot password"
 * link or the private/public instance badge.
 */
export function useAuthConfig(): AuthConfig | null {
  const [cfg, setCfg] = useState<AuthConfig | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<AuthConfig>("/api/auth/config", {
      auth: false,
      signal: controller.signal,
    })
      .then((c) => setCfg(c))
      .catch(() => {
        /* offline / old backend - leave null */
      });
    return () => controller.abort();
  }, []);

  return cfg;
}
