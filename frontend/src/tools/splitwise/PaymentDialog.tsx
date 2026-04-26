import { X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api/client";
import type { Member } from "../../api/types";
import {
  datetimeLocalToIso,
  isoToDatetimeLocal,
} from "../../lib/format";
import { splitwiseApi } from "./api";

interface PaymentDialogProps {
  groupId: string;
  members: Member[];
  currency: string;
  /** Prefilled sender / recipient / amount (e.g. from a settlement row). */
  initial?: {
    fromUserId?: string;
    toUserId?: string;
    amountCents?: number;
  };
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Modal for recording a "X paid Y N EUR" transfer between two group
 * members. Validates on the client; the backend re-validates.
 */
export default function PaymentDialog({
  groupId,
  members,
  currency,
  initial,
  onClose,
  onSaved,
}: PaymentDialogProps) {
  const { t } = useTranslation();

  const firstMember = members[0]?.id ?? "";
  const secondMember = members[1]?.id ?? firstMember;

  const [fromUser, setFromUser] = useState<string>(
    initial?.fromUserId ?? firstMember,
  );
  const [toUser, setToUser] = useState<string>(
    initial?.toUserId ?? secondMember,
  );
  const [amount, setAmount] = useState<string>(
    initial?.amountCents && initial.amountCents > 0
      ? (initial.amountCents / 100).toFixed(2)
      : "",
  );
  const [note, setNote] = useState<string>("");
  const [happenedAt, setHappenedAt] = useState<string>(() =>
    isoToDatetimeLocal(new Date().toISOString()),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const amountCents = useMemo(() => parseAmountToCents(amount), [amount]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amountCents || amountCents <= 0) {
      setError(t("splitwise.payment.errorInvalidAmount"));
      return;
    }
    if (fromUser === toUser) {
      setError(t("splitwise.payment.errorSameUser"));
      return;
    }
    setSubmitting(true);
    try {
      // A filled datetime-local value always parses; fall back to "now"
      // if it somehow ended up empty.
      const happenedIso =
        datetimeLocalToIso(happenedAt) ?? new Date().toISOString();
      await splitwiseApi.createPayment(groupId, {
        from_user: fromUser,
        to_user: toUser,
        amount_cents: amountCents,
        note: note.trim() || undefined,
        happened_at: happenedIso,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md space-y-4 p-5"
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              {t("splitwise.payment.title")}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("splitwise.payment.subtitle")}
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost -mr-2 -mt-2"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="label" htmlFor="payment_from">
              {t("splitwise.payment.from")}
            </label>
            <select
              id="payment_from"
              className="input"
              value={fromUser}
              onChange={(e) => setFromUser(e.target.value)}
              required
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="label" htmlFor="payment_to">
              {t("splitwise.payment.to")}
            </label>
            <select
              id="payment_to"
              className="input"
              value={toUser}
              onChange={(e) => setToUser(e.target.value)}
              required
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="label" htmlFor="payment_amount">
              {t("splitwise.payment.amount", { currency })}
            </label>
            <input
              id="payment_amount"
              type="text"
              inputMode="decimal"
              className="input"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="label" htmlFor="payment_date">
              {t("splitwise.payment.date")}
            </label>
            <input
              id="payment_date"
              type="datetime-local"
              className="input"
              value={happenedAt}
              onChange={(e) => setHappenedAt(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="label" htmlFor="payment_note">
            {t("splitwise.payment.note")}
          </label>
          <input
            id="payment_note"
            type="text"
            className="input"
            placeholder={t("splitwise.payment.notePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
          />
        </div>

        {error && (
          <p className="alert-error">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={submitting}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
          >
            {submitting
              ? t("splitwise.payment.submitting")
              : t("splitwise.payment.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Parse a user-typed decimal amount into integer cents. Accepts both "."
 * and "," as decimal separators, mirroring NewExpensePage's behaviour.
 */
function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
