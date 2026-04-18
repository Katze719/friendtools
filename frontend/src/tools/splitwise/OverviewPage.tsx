import {
  ArrowLeft,
  ArrowRight,
  HandCoins,
  List as ListIcon,
  Network,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type {
  Expense,
  GroupDetail,
  Payment,
  Settlement,
  SplitwiseSummary,
} from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { formatDateTime, formatMoney } from "../../lib/format";
import CashflowGraph from "./CashflowGraph";
import PaymentDialog from "./PaymentDialog";
import { splitwiseApi } from "./api";

type ActivityItem =
  | { kind: "expense"; at: string; data: Expense }
  | { kind: "payment"; at: string; data: Payment };

type SettlementMode = "simplified" | "direct";
type SettlementView = "list" | "graph";

export default function SplitwiseOverviewPage() {
  const { t } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [summary, setSummary] = useState<SplitwiseSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settlementMode, setSettlementMode] =
    useState<SettlementMode>("simplified");
  const [settlementView, setSettlementView] =
    useState<SettlementView>("list");
  const [paymentInitial, setPaymentInitial] = useState<
    | {
        fromUserId?: string;
        toUserId?: string;
        amountCents?: number;
      }
    | null
  >(null);

  const reload = useCallback(() => {
    if (!groupId) return;
    Promise.all([
      groupsApi.get(groupId),
      splitwiseApi.summary(groupId),
      splitwiseApi.listExpenses(groupId),
      splitwiseApi.listPayments(groupId),
    ])
      .then(([g, s, es, ps]) => {
        setGroup(g);
        setSummary(s);
        setExpenses(es);
        setPayments(ps);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : t("common.error")));
  }, [groupId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const activity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    for (const e of expenses ?? []) {
      items.push({ kind: "expense", at: e.happened_at, data: e });
    }
    for (const p of payments ?? []) {
      items.push({ kind: "payment", at: p.happened_at, data: p });
    }
    items.sort((a, b) => b.at.localeCompare(a.at));
    return items;
  }, [expenses, payments]);

  if (error && !group) {
    return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>;
  }
  if (!group || !summary || !expenses || !payments)
    return <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;

  const currency = summary.currency;
  const myBalance = summary.my_balance_cents;
  const activeSettlements: Settlement[] =
    settlementMode === "simplified"
      ? summary.settlements
      : summary.direct_settlements;
  const hasSettlements = activeSettlements.length > 0;

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

  async function onDeletePayment(p: Payment) {
    if (!groupId) return;
    if (!confirm(t("splitwise.overview.paymentDeleteConfirm"))) return;
    try {
      await splitwiseApi.deletePayment(groupId, p.id);
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
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button
              className="btn-secondary"
              onClick={() => setPaymentInitial({})}
            >
              <HandCoins className="h-4 w-4" />
              {t("splitwise.overview.recordPayment")}
            </button>
            <button
              className="btn-primary"
              onClick={() =>
                navigate(`/groups/${group.id}/splitwise/new-expense`)
              }
            >
              <Plus className="h-4 w-4" />
              {t("splitwise.overview.addExpense")}
            </button>
          </div>
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

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t("splitwise.overview.settlementsTitle")}
            </h3>
            {hasSettlements && (
              <div
                className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                role="tablist"
                aria-label={t("splitwise.overview.viewAria")}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={settlementView === "list"}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 ${
                    settlementView === "list"
                      ? "bg-brand-600 text-white"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                  onClick={() => setSettlementView("list")}
                >
                  <ListIcon className="h-3.5 w-3.5" />
                  {t("splitwise.overview.viewList")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={settlementView === "graph"}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 ${
                    settlementView === "graph"
                      ? "bg-brand-600 text-white"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                  onClick={() => setSettlementView("graph")}
                >
                  <Network className="h-3.5 w-3.5" />
                  {t("splitwise.overview.viewGraph")}
                </button>
              </div>
            )}
          </div>

          {hasSettlements && (
            <div
              className="mt-2 inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              role="tablist"
              aria-label={t("splitwise.overview.modeAria")}
            >
              <button
                type="button"
                role="tab"
                aria-selected={settlementMode === "simplified"}
                className={`rounded px-2.5 py-1 ${
                  settlementMode === "simplified"
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 dark:text-slate-300"
                }`}
                onClick={() => setSettlementMode("simplified")}
                title={t("splitwise.overview.modeSimplifiedHint")}
              >
                {t("splitwise.overview.modeSimplified")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={settlementMode === "direct"}
                className={`rounded px-2.5 py-1 ${
                  settlementMode === "direct"
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 dark:text-slate-300"
                }`}
                onClick={() => setSettlementMode("direct")}
                title={t("splitwise.overview.modeDirectHint")}
              >
                {t("splitwise.overview.modeDirect")}
              </button>
            </div>
          )}

          {!hasSettlements ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              {t("splitwise.overview.allSettled")}
            </p>
          ) : settlementView === "list" ? (
            <ul className="mt-3 space-y-1 text-sm">
              {activeSettlements.map((s, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{s.from_display_name}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                    <span className="font-medium">{s.to_display_name}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">
                      {formatMoney(s.amount_cents, currency)}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost h-7 px-2 py-0 text-xs text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                      onClick={() =>
                        setPaymentInitial({
                          fromUserId: s.from_user_id,
                          toUserId: s.to_user_id,
                          amountCents: s.amount_cents,
                        })
                      }
                      title={t("splitwise.overview.paymentSettlementHint")}
                    >
                      <HandCoins className="h-3.5 w-3.5" />
                      {t("splitwise.overview.markPaid")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3">
              <CashflowGraph
                participants={summary.balances.map((b) => ({
                  id: b.user_id,
                  display_name: b.display_name,
                  balance_cents: b.balance_cents,
                }))}
                settlements={activeSettlements}
                currency={currency}
                highlightUserId={user?.id ?? null}
              />
            </div>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t("splitwise.overview.history")}
        </h2>
        {activity.length === 0 ? (
          <p className="card p-8 text-center text-slate-500 dark:text-slate-400">
            {t("splitwise.overview.noActivity")}
          </p>
        ) : (
          <ul className="space-y-2">
            {activity.map((item) =>
              item.kind === "expense" ? (
                <ExpenseItem
                  key={`e:${item.data.id}`}
                  expense={item.data}
                  currency={currency}
                  currentUserId={user?.id ?? null}
                  onEdit={() =>
                    navigate(
                      `/groups/${group.id}/splitwise/expenses/${item.data.id}/edit`,
                    )
                  }
                  onDelete={() => onDelete(item.data)}
                />
              ) : (
                <PaymentItem
                  key={`p:${item.data.id}`}
                  payment={item.data}
                  currency={currency}
                  currentUserId={user?.id ?? null}
                  onDelete={() => onDeletePayment(item.data)}
                />
              ),
            )}
          </ul>
        )}
      </section>

      {paymentInitial !== null && (
        <PaymentDialog
          groupId={group.id}
          members={group.members}
          currency={currency}
          initial={paymentInitial}
          onClose={() => setPaymentInitial(null)}
          onSaved={() => {
            setPaymentInitial(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function ExpenseItem({
  expense: e,
  currency,
  currentUserId,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  currency: string;
  currentUserId: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const myShare =
    e.splits.find((s) => s.user_id === currentUserId)?.amount_cents ?? 0;
  const iPaid = currentUserId !== null && e.paid_by === currentUserId;
  const lent = iPaid ? e.amount_cents - myShare : 0;
  const borrowed = !iPaid ? myShare : 0;

  let involvementBadge;
  if (iPaid && lent > 0) {
    involvementBadge = (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/60">
        {t("splitwise.overview.youLent", {
          amount: formatMoney(lent, currency),
        })}
      </span>
    );
  } else if (!iPaid && borrowed > 0) {
    involvementBadge = (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/60">
        {t("splitwise.overview.youBorrowed", {
          amount: formatMoney(borrowed, currency),
        })}
      </span>
    );
  } else {
    involvementBadge = (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200/70 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700/70">
        {iPaid
          ? t("splitwise.overview.selfPaid")
          : t("splitwise.overview.notInvolved")}
      </span>
    );
  }

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words">{e.description}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("splitwise.overview.paidBy", { name: e.paid_by_display_name })} -{" "}
            {formatDateTime(e.happened_at)}
          </p>
          <div className="mt-1.5">{involvementBadge}</div>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <span className="tabular-nums font-semibold">
            {formatMoney(e.amount_cents, currency)}
          </span>
          <button
            className="btn-ghost -my-1 text-slate-400 hover:text-brand-600 dark:text-slate-500 dark:hover:text-brand-400"
            onClick={onEdit}
            aria-label={t("splitwise.overview.editAria")}
            title={t("splitwise.overview.editTooltip")}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            className="btn-ghost -my-1 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
            onClick={onDelete}
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
            <li key={s.user_id} className="flex items-center justify-between">
              <span>
                {s.display_name}
                {s.user_id === currentUserId && (
                  <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500">
                    ({t("splitwise.overview.you")})
                  </span>
                )}
              </span>
              <span className="tabular-nums">
                {formatMoney(s.amount_cents, currency)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function PaymentItem({
  payment: p,
  currency,
  currentUserId,
  onDelete,
}: {
  payment: Payment;
  currency: string;
  currentUserId: string | null;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const iPaid = currentUserId !== null && p.from_user_id === currentUserId;
  const iReceived = currentUserId !== null && p.to_user_id === currentUserId;

  const headline = iPaid
    ? t("splitwise.overview.paymentYouPaid", { name: p.to_display_name })
    : iReceived
      ? t("splitwise.overview.paymentYouReceived", { name: p.from_display_name })
      : t("splitwise.overview.paymentTitle", {
          from: p.from_display_name,
          to: p.to_display_name,
        });

  // Paying/receiving flips sign meaning compared to expenses:
  // - If I paid someone, my debt went down — a positive event (green).
  // - If somebody paid me, my credit went down — neutral/informational.
  const amountTone = iPaid
    ? "text-emerald-600 dark:text-emerald-400"
    : iReceived
      ? "text-slate-600 dark:text-slate-300"
      : "text-slate-700 dark:text-slate-200";

  return (
    <li className="card border-l-4 border-l-emerald-400/70 p-4 dark:border-l-emerald-500/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              <HandCoins className="h-3.5 w-3.5" />
            </span>
            <span className="break-words">{headline}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {formatDateTime(p.happened_at)}
          </p>
          {p.note && (
            <p className="mt-1 text-xs italic text-slate-600 dark:text-slate-300 break-words">
              {p.note}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <span className={`tabular-nums font-semibold ${amountTone}`}>
            {formatMoney(p.amount_cents, currency)}
          </span>
          <button
            className="btn-ghost -my-1 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
            onClick={onDelete}
            aria-label={t("splitwise.overview.paymentDeleteAria")}
            title={t("splitwise.overview.deleteTooltip")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}
