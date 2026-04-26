import { Check, ChevronDown, Crown, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { adminApi } from "../api/admin";
import { ApiError } from "../api/client";
import type { AdminUserRow } from "../api/types";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/format";
import { useConfirm } from "../ui/UIProvider";

type StatusFilter = "all" | "pending" | "approved" | "admin";

export default function AdminUsers() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const reload = useCallback(() => {
    adminApi
      .listUsers()
      .then((rows) => {
        setUsers(rows);
        window.dispatchEvent(new CustomEvent("admin:pending-changed"));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : t("common.error")));
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filteredUsers = useMemo(() => {
    if (!users) return null;
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter === "pending" && u.status !== "pending") return false;
      if (statusFilter === "approved" && u.status !== "approved") return false;
      if (statusFilter === "admin" && !u.is_admin) return false;
      if (!q) return true;
      return (
        u.display_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });
  }, [users, query, statusFilter]);

  const pendingCount = useMemo(
    () => (users ? users.filter((u) => u.status === "pending").length : 0),
    [users],
  );

  if (!user?.is_admin) {
    return (
      <div className="card p-6">
        <p className="text-sm text-rose-700 dark:text-rose-300">{t("admin.notAdmin")}</p>
      </div>
    );
  }

  async function act(id: string, action: "approve" | "promote" | "demote" | "delete") {
    if (action === "delete") {
      const ok = await confirm({
        title: t("admin.deleteTitle"),
        message: t("admin.deleteConfirm"),
        confirmLabel: t("common.delete"),
        variant: "danger",
      });
      if (!ok) return;
    }
    setBusy(id + ":" + action);
    setError(null);
    try {
      if (action === "approve") await adminApi.approve(id);
      else if (action === "promote") await adminApi.promote(id);
      else if (action === "demote") await adminApi.demote(id);
      else if (action === "delete") await adminApi.remove(id);
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {t("admin.backToDashboard")}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("admin.title")}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("admin.subtitle")}</p>
      </div>

      {error && (
        <p className="alert-error">{error}</p>
      )}

      {users !== null && users.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("admin.searchPlaceholder")}
              aria-label={t("admin.searchPlaceholder")}
              className="input w-full pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("admin.searchClear")}
                title={t("admin.searchClear")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all" as const, label: t("admin.filterAll"), count: users.length },
                {
                  id: "pending" as const,
                  label: t("admin.filterPending"),
                  count: pendingCount,
                },
                {
                  id: "approved" as const,
                  label: t("admin.filterApproved"),
                  count: users.filter((u) => u.status === "approved").length,
                },
                {
                  id: "admin" as const,
                  label: t("admin.filterAdmin"),
                  count: users.filter((u) => u.is_admin).length,
                },
              ] as const
            ).map((chip) => {
              const active = statusFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setStatusFilter(chip.id)}
                  aria-pressed={active}
                  className={
                    active
                      ? "inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900"
                      : "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }
                >
                  {chip.label}
                  <span
                    className={
                      active
                        ? "rounded-full bg-white/20 px-1.5 text-[10px] font-semibold dark:bg-slate-900/20"
                        : "rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {users === null ? (
        <LoadingState compact />
      ) : users.length === 0 ? (
        <p className="card p-8 text-center text-slate-500 dark:text-slate-400">{t("admin.empty")}</p>
      ) : filteredUsers && filteredUsers.length === 0 ? (
        <p className="card p-8 text-center text-slate-500 dark:text-slate-400">
          {t("admin.noResults")}
        </p>
      ) : (
        <ul className="space-y-2">
          {(filteredUsers ?? users).map((u) => {
            const pending = u.status === "pending";
            const isSelf = u.id === user?.id;
            const k = (action: string) => busy === u.id + ":" + action;
            return (
              <li key={u.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{u.display_name}</p>
                      {u.is_admin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          <Crown className="h-3 w-3" /> {t("admin.badgeAdmin")}
                        </span>
                      )}
                      {pending && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          {t("admin.badgePending")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      {t("admin.registered", { date: formatDate(u.created_at) })}
                      {u.approved_at &&
                        " - " +
                          t("admin.approvedAt", { date: formatDate(u.approved_at) })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pending && (
                      <button
                        className="btn-primary"
                        disabled={k("approve")}
                        onClick={() => act(u.id, "approve")}
                      >
                        <Check className="h-4 w-4" /> {t("admin.approve")}
                      </button>
                    )}
                    {!u.is_admin ? (
                      <button
                        className="btn-secondary"
                        disabled={k("promote")}
                        onClick={() => act(u.id, "promote")}
                      >
                        <Crown className="h-4 w-4" /> {t("admin.promote")}
                      </button>
                    ) : (
                      !isSelf && (
                        <button
                          className="btn-secondary"
                          disabled={k("demote")}
                          onClick={() => act(u.id, "demote")}
                        >
                          <ChevronDown className="h-4 w-4" /> {t("admin.demote")}
                        </button>
                      )
                    )}
                    {!isSelf && (
                      <button
                        className="btn-ghost text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        disabled={k("delete")}
                        onClick={() => act(u.id, "delete")}
                        aria-label={t("admin.delete")}
                        title={t("admin.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
