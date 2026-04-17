import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type { Expense, GroupDetail, SplitwiseSummary } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { formatDate, formatMoney } from "../../lib/format";
import { splitwiseApi } from "./api";

export default function SplitwiseOverviewPage() {
  const { t } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [summary, setSummary] = useState<SplitwiseSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!groupId) return;
    Promise.all([
      groupsApi.get(groupId),
      splitwiseApi.summary(groupId),
      splitwiseApi.listExpenses(groupId),
    ])
      .then(([g, s, es]) => {
        setGroup(g);
        setSummary(s);
        setExpenses(es);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : t("common.error")));
  }, [groupId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (error && !group) {
    return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>;
  }
  if (!group || !summary || !expenses)
    return <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;

  const currency = summary.currency;
  const myBalance = summary.my_balance_cents;

  async function onDelete(exp: Expense) {
    if (!groupId) return;
    if (!confirm(t("splitwise.overview.deleteConfirm", { description: exp.description }))) {
      return;
    }
    try {
      await splitwiseApi.deleteExpense(groupId, exp.id);
      reload();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/groups/${group.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> {t("splitwise.overview.backToGroup")}
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("splitwise.overview.title")}
            </h1>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {group.name} - {t("splitwise.overview.members", { count: group.members.length })}
            </p>
          </div>
          <button
            className="btn-primary w-full sm:w-auto"
            onClick={() => navigate(`/groups/${group.id}/splitwise/new-expense`)}
          >
            <Plus className="h-4 w-4" /> {t("splitwise.overview.addExpense")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5 md:col-span-1">
          <p className="label">{t("splitwise.overview.yourBalance")}</p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              myBalance === 0
                ? "text-slate-600 dark:text-slate-300"
                : myBalance > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {formatMoney(myBalance, currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {myBalance > 0
              ? t("splitwise.overview.positive")
              : myBalance < 0
                ? t("splitwise.overview.negative")
                : t("splitwise.overview.zero")}
          </p>
        </div>

        <div className="card p-5 md:col-span-2">
          <h2 className="font-semibold">{t("splitwise.overview.balances")}</h2>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {summary.balances.map((b) => (
              <li
                key={b.user_id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span>
                  {b.display_name}
                  {b.user_id === user?.id && (
                    <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">
                      ({t("splitwise.overview.you")})
                    </span>
                  )}
                </span>
                <span
                  className={`tabular-nums font-medium ${
                    b.balance_cents === 0
                      ? "text-slate-500 dark:text-slate-400"
                      : b.balance_cents > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {formatMoney(b.balance_cents, currency)}
                </span>
              </li>
            ))}
          </ul>

          {summary.settlements.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t("splitwise.overview.settlementsTitle")}
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {summary.settlements.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{s.from_display_name}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                      <span className="font-medium">{s.to_display_name}</span>
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(s.amount_cents, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("splitwise.overview.expenses")}</h2>
        {expenses.length === 0 ? (
          <p className="card p-8 text-center text-slate-500 dark:text-slate-400">
            {t("splitwise.overview.noExpenses")}
          </p>
        ) : (
          <ul className="space-y-2">
            {expenses.map((e) => (
              <li key={e.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{e.description}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("splitwise.overview.paidBy", { name: e.paid_by_display_name })} -{" "}
                      {formatDate(e.happened_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <span className="tabular-nums font-semibold">
                      {formatMoney(e.amount_cents, currency)}
                    </span>
                    <button
                      className="btn-ghost -my-1 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
                      onClick={() => onDelete(e)}
                      aria-label={t("splitwise.overview.deleteAria")}
                      title={t("splitwise.overview.deleteTooltip")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  <summary className="cursor-pointer select-none">
                    {t("splitwise.overview.breakdown")}
                  </summary>
                  <ul className="mt-2 space-y-0.5">
                    {e.splits.map((s) => (
                      <li
                        key={s.user_id}
                        className="flex items-center justify-between"
                      >
                        <span>{s.display_name}</span>
                        <span className="tabular-nums">
                          {formatMoney(s.amount_cents, currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
