import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type { GroupDetail, Trip } from "../../api/types";
import LoadingState from "../../components/LoadingState";
import PageHeader from "../../components/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { formatMoney, parseAmountToCents } from "../../lib/format";
import { tripsApi } from "../trips/api";
import { splitwiseApi } from "./api";

type SplitMode = "equal" | "exact";

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default function SplitwiseNewExpensePage() {
  const { t } = useTranslation();
  const { groupId, expenseId } = useParams<{
    groupId: string;
    expenseId?: string;
  }>();
  const isEditing = Boolean(expenseId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [paidBy, setPaidBy] = useState<string>("");
  const [mode, setMode] = useState<SplitMode>("equal");
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  // Empty string = "no trip" (maps to null in payload). Using string state
  // keeps the native <select> happy since it cannot hold non-string values.
  const [tripId, setTripId] = useState<string>("");

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setLoading(true);

    const tasks: [
      ReturnType<typeof groupsApi.get>,
      ReturnType<typeof splitwiseApi.getExpense> | null,
      ReturnType<typeof tripsApi.listTrips>,
    ] = [
      groupsApi.get(groupId),
      expenseId ? splitwiseApi.getExpense(groupId, expenseId) : null,
      tripsApi.listTrips(groupId),
    ];

    Promise.all(tasks)
      .then(([g, expense, tripList]) => {
        if (cancelled) return;
        setGroup(g);
        setTrips(tripList);
        if (expense) {
          setDescription(expense.description);
          setAmountInput(centsToInput(expense.amount_cents));
          setPaidBy(expense.paid_by);
          setTripId(expense.trip_id ?? "");
          const splitMap: Record<string, string> = {};
          const activeIds = new Set<string>();
          for (const s of expense.splits) {
            if (s.amount_cents > 0) {
              splitMap[s.user_id] = centsToInput(s.amount_cents);
              activeIds.add(s.user_id);
            }
          }
          setExactAmounts(splitMap);
          setParticipants(activeIds);
          // "Exact" is safe for any existing split distribution; the user
          // can always flip to "Equal" to redistribute.
          setMode("exact");
        } else {
          setPaidBy(user?.id ?? g.members[0]?.id ?? "");
          setParticipants(new Set(g.members.map((m) => m.id)));
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : t("common.error"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId, expenseId, user?.id, t]);

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
      const payload = {
        description: description.trim(),
        amount_cents: amountCents,
        paid_by: paidBy,
        splits,
        trip_id: tripId === "" ? null : tripId,
      };
      if (isEditing && expenseId) {
        await splitwiseApi.updateExpense(groupId, expenseId, payload);
      } else {
        await splitwiseApi.createExpense(groupId, payload);
      }
      navigate(`/groups/${groupId}/splitwise`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !group) {
    return (
      <p className="alert-error">{error}</p>
    );
  }
  if (!group || loading) return <LoadingState />;

  return (
    <div className="space-y-5">
      <PageHeader
        backLink={{
          to: `/groups/${group.id}/splitwise`,
          label: t("splitwise.newExpense.back"),
        }}
        title={
          isEditing
            ? t("splitwise.newExpense.editTitle")
            : t("splitwise.newExpense.title")
        }
      />

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

          {trips.length > 0 && (
            <div className="space-y-1 sm:col-span-2">
              <label className="label" htmlFor="trip_id">
                {t("splitwise.newExpense.trip")}
              </label>
              <select
                id="trip_id"
                className="input"
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
              >
                <option value="">{t("splitwise.newExpense.tripNone")}</option>
                {trips.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("splitwise.newExpense.tripHint")}
              </p>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="label">{t("splitwise.newExpense.split")}</span>
            <div className="segmented">
              <button
                type="button"
                className={`segmented-item ${mode === "equal" ? "segmented-item-active" : "segmented-item-idle"}`}
                onClick={() => setMode("equal")}
              >
                {t("splitwise.newExpense.modeEqual")}
              </button>
              <button
                type="button"
                className={`segmented-item ${mode === "exact" ? "segmented-item-active" : "segmented-item-idle"}`}
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
          <p className="alert-error">{error}</p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigate(-1)}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
          >
            {submitting
              ? t("splitwise.newExpense.submitting")
              : t("splitwise.newExpense.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
