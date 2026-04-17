import { Check, ChevronDown, Crown, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { adminApi } from "../api/admin";
import { ApiError } from "../api/client";
import type { AdminUserRow } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/format";

export default function AdminUsers() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => {
    adminApi
      .listUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof ApiError ? e.message : t("common.error")));
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!user?.is_admin) {
    return (
      <div className="card p-6">
        <p className="text-sm text-rose-700 dark:text-rose-300">{t("admin.notAdmin")}</p>
      </div>
    );
  }

  async function act(id: string, action: "approve" | "promote" | "demote" | "delete") {
    setBusy(id + ":" + action);
    setError(null);
    try {
      if (action === "approve") await adminApi.approve(id);
      else if (action === "promote") await adminApi.promote(id);
      else if (action === "demote") await adminApi.demote(id);
      else if (action === "delete") {
        if (!confirm(t("admin.deleteConfirm"))) {
          setBusy(null);
          return;
        }
        await adminApi.remove(id);
      }
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
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
      )}

      {users === null ? (
        <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
      ) : users.length === 0 ? (
        <p className="card p-8 text-center text-slate-500 dark:text-slate-400">{t("admin.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => {
            const pending = u.status === "pending";
            const isSelf = u.id === user?.id;
            const k = (action: string) => busy === u.id + ":" + action;
            return (
              <li key={u.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{u.display_name}</p>
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
