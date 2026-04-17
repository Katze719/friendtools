import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type { GroupDetail } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { formatMoney, parseAmountToCents } from "../../lib/format";
import { splitwiseApi } from "./api";

type SplitMode = "equal" | "exact";

export default function SplitwiseNewExpensePage() {
  const { t } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [paidBy, setPaidBy] = useState<string>("");
  const [mode, setMode] = useState<SplitMode>("equal");
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    groupsApi
      .get(groupId)
      .then((g) => {
        setGroup(g);
        setPaidBy(user?.id ?? g.members[0]?.id ?? "");
        setParticipants(new Set(g.members.map((m) => m.id)));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : t("common.error")));
  }, [groupId, user?.id, t]);

  const amountCents = useMemo(() => parseAmountToCents(amountInput), [amountInput]);

  const equalSplits = useMemo(() => {
    if (!group) return [] as { user_id: string; amount_cents: number }[];
    if (amountCents == null || amountCents <= 0) return [];
    const active = group.members.filter((m) => participants.has(m.id));
    if (active.length === 0) return [];
    const base = Math.floor(amountCents / active.length);
    let remainder = amountCents - base * active.length;
    return active.map((m) => {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder -= 1;
      return { user_id: m.id, amount_cents: base + extra };
    });
  }, [group, amountCents, participants]);

  const exactSplits = useMemo(() => {
    if (!group) return [] as { user_id: string; amount_cents: number }[];
    return group.members
      .map((m) => {
        const raw = exactAmounts[m.id] ?? "";
        const c = parseAmountToCents(raw);
        return { user_id: m.id, amount_cents: c ?? 0 };
      })
      .filter((s) => s.amount_cents > 0);
  }, [group, exactAmounts]);

  const splits = mode === "equal" ? equalSplits : exactSplits;
  const splitsTotal = splits.reduce((a, s) => a + s.amount_cents, 0);
  const matches = amountCents != null && splitsTotal === amountCents;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!groupId || !group) return;
    setError(null);

    if (amountCents == null || amountCents <= 0) {
      setError(t("splitwise.newExpense.errorInvalidAmount"));
      return;
    }
    if (!matches) {
      setError(
        t("splitwise.newExpense.errorSumMismatch", {
          sum: formatMoney(splitsTotal, group.currency),
          amount: formatMoney(amountCents, group.currency),
        }),
      );
      return;
    }
    if (splits.length === 0) {
      setError(t("splitwise.newExpense.errorNoParticipants"));
      return;
    }

    setSubmitting(true);
    try {
      await splitwiseApi.createExpense(groupId, {
        description: description.trim(),
        amount_cents: amountCents,
        paid_by: paidBy,
        splits,
      });
      navigate(`/groups/${groupId}/splitwise`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !group) {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
    );
  }
  if (!group) return <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;

  return (
    <div className="space-y-5">
      <div>
        <Link
          to={`/groups/${group.id}/splitwise`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> {t("splitwise.newExpense.back")}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {t("splitwise.newExpense.title")}
        </h1>
      </div>

      <form onSubmit={submit} className="card space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="label" htmlFor="description">
              {t("splitwise.newExpense.description")}
            </label>
            <input
              id="description"
              className="input"
              required
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("splitwise.newExpense.descriptionPlaceholder")}
            />
          </div>

          <div className="space-y-1">
            <label className="label" htmlFor="amount">
              {t("splitwise.newExpense.amount", { currency: group.currency })}
            </label>
            <input
              id="amount"
              inputMode="decimal"
              className="input tabular-nums"
              required
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1">
            <label className="label" htmlFor="paid_by">
              {t("splitwise.newExpense.paidBy")}
            </label>
            <select
              id="paid_by"
              className="input"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
            >
              {group.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="label">{t("splitwise.newExpense.split")}</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                className={`rounded px-2.5 py-1 ${mode === "equal" ? "bg-brand-600 text-white" : "text-slate-600 dark:text-slate-300"}`}
                onClick={() => setMode("equal")}
              >
                {t("splitwise.newExpense.modeEqual")}
              </button>
              <button
                type="button"
                className={`rounded px-2.5 py-1 ${mode === "exact" ? "bg-brand-600 text-white" : "text-slate-600 dark:text-slate-300"}`}
                onClick={() => setMode("exact")}
              >
                {t("splitwise.newExpense.modeExact")}
              </button>
            </div>
          </div>

          {mode === "equal" ? (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
              {group.members.map((m) => {
                const split = equalSplits.find((s) => s.user_id === m.id);
                const active = participants.has(m.id);
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => {
                          setParticipants((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(m.id);
                            else next.delete(m.id);
                            return next;
                          });
                        }}
                      />
                      {m.display_name}
                    </label>
                    <span className="tabular-nums text-slate-600 dark:text-slate-300">
                      {active && split
                        ? formatMoney(split.amount_cents, group.currency)
                        : "-"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="mt-2 space-y-2">
              {group.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <label className="text-sm" htmlFor={`exact_${m.id}`}>
                    {m.display_name}
                  </label>
                  <input
                    id={`exact_${m.id}`}
                    inputMode="decimal"
                    className="input w-32 tabular-nums"
                    value={exactAmounts[m.id] ?? ""}
                    onChange={(e) =>
                      setExactAmounts((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              {t("splitwise.newExpense.sum", {
                amount: formatMoney(splitsTotal, group.currency),
              })}
            </span>
            {amountCents != null && (
              <span className={matches ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                {matches
                  ? t("splitwise.newExpense.matches")
                  : t("splitwise.newExpense.difference", {
                      amount: formatMoney(splitsTotal - amountCents, group.currency),
                    })}
              </span>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting
              ? t("splitwise.newExpense.submitting")
              : t("splitwise.newExpense.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
