import {
  Calendar,
  DollarSign,
  MapPin,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api/client";
import type {
  GroupDetail,
  Settlement,
  SplitwiseSummary,
  TripDestination,
  TripInfo,
} from "../../api/types";
import { splitwiseApi } from "../splitwise/api";
import { useToast } from "../../ui/UIProvider";
import { tripsApi } from "./api";

/**
 * The "Info" tab collects the lightweight metadata that turns a link board
 * into a real trip: dates, destinations and a budget. Every field is
 * optional; empty state means "not tracked".
 */
export default function InfoTab({ group }: { group: GroupDetail }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [info, setInfo] = useState<TripInfo | null>(null);
  const [summary, setSummary] = useState<SplitwiseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("");
  const [destinations, setDestinations] = useState<TripDestination[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      tripsApi.getInfo(group.id),
      // Summary is only needed for the budget widget; tolerate failures so
      // the Info tab still works if Splitwise hasn't been opened yet.
      splitwiseApi.summary(group.id).catch(() => null),
    ])
      .then(([i, s]) => {
        if (!alive) return;
        setInfo(i);
        setSummary(s);
        setStartDate(i.start_date ?? "");
        setEndDate(i.end_date ?? "");
        setBudget(
          i.budget_cents == null ? "" : (i.budget_cents / 100).toFixed(2),
        );
        setDestinations(i.destinations ?? []);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        toast.error(e instanceof ApiError ? e.message : t("common.error"));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [group.id, t, toast]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (startDate && endDate && startDate > endDate) {
      toast.error(t("trips.info.errorDates"));
      return;
    }
    let budgetCents: number | null = null;
    if (budget.trim() !== "") {
      const parsed = Number.parseFloat(budget.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error(t("trips.info.errorBudget"));
        return;
      }
      budgetCents = Math.round(parsed * 100);
    }
    const clean = destinations
      .map((d) => ({
        name: d.name.trim(),
        lat: d.lat ?? null,
        lng: d.lng ?? null,
      }))
      .filter((d) => d.name.length > 0);

    setSaving(true);
    try {
      const updated = await tripsApi.updateInfo(group.id, {
        start_date: startDate || null,
        end_date: endDate || null,
        budget_cents: budgetCents,
        destinations: clean,
      });
      setInfo(updated);
      toast.success(t("trips.info.saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  function addDestination() {
    setDestinations((d) => [...d, { name: "", lat: null, lng: null }]);
  }

  function updateDestination(idx: number, patch: Partial<TripDestination>) {
    setDestinations((d) =>
      d.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
    );
  }

  function removeDestination(idx: number) {
    setDestinations((d) => d.filter((_, i) => i !== idx));
  }

  if (loading) {
    return <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;
  }

  return (
    <form onSubmit={onSave} className="space-y-6">
      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Calendar className="h-5 w-5 text-brand-500" />
          {t("trips.info.datesTitle")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="label" htmlFor="trip_start">
              {t("trips.info.startDate")}
            </label>
            <input
              id="trip_start"
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="label" htmlFor="trip_end">
              {t("trips.info.endDate")}
            </label>
            <input
              id="trip_end"
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || undefined}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("trips.info.datesHint")}
        </p>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MapPin className="h-5 w-5 text-brand-500" />
            {t("trips.info.destinationsTitle")}
          </h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={addDestination}
          >
            <Plus className="h-4 w-4" />
            {t("trips.info.addDestination")}
          </button>
        </div>
        {destinations.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("trips.info.destinationsEmpty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {destinations.map((d, idx) => (
              <li
                key={idx}
                className="grid items-end gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-[minmax(0,1fr)_112px_112px_auto]"
              >
                <div>
                  <label className="label" htmlFor={`dest_name_${idx}`}>
                    {t("trips.info.destinationName")}
                  </label>
                  <input
                    id={`dest_name_${idx}`}
                    className="input"
                    value={d.name}
                    onChange={(e) =>
                      updateDestination(idx, { name: e.target.value })
                    }
                    placeholder={t("trips.info.destinationNamePlaceholder")}
                    maxLength={120}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`dest_lat_${idx}`}>
                    {t("trips.info.lat")}
                  </label>
                  <input
                    id={`dest_lat_${idx}`}
                    className="input"
                    inputMode="decimal"
                    value={d.lat ?? ""}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      if (val === "") {
                        updateDestination(idx, { lat: null });
                        return;
                      }
                      const num = Number.parseFloat(val.replace(",", "."));
                      updateDestination(idx, {
                        lat: Number.isFinite(num) ? num : d.lat,
                      });
                    }}
                    placeholder="38.72"
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`dest_lng_${idx}`}>
                    {t("trips.info.lng")}
                  </label>
                  <input
                    id={`dest_lng_${idx}`}
                    className="input"
                    inputMode="decimal"
                    value={d.lng ?? ""}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      if (val === "") {
                        updateDestination(idx, { lng: null });
                        return;
                      }
                      const num = Number.parseFloat(val.replace(",", "."));
                      updateDestination(idx, {
                        lng: Number.isFinite(num) ? num : d.lng,
                      });
                    }}
                    placeholder="-9.14"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <MapLinks destination={d} />
                  <button
                    type="button"
                    className="btn-ghost text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
                    onClick={() => removeDestination(idx)}
                    aria-label={t("common.delete")}
                    title={t("common.delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("trips.info.destinationsHint")}
        </p>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <DollarSign className="h-5 w-5 text-brand-500" />
          {t("trips.info.budgetTitle")}
        </h2>
        <div className="space-y-1">
          <label className="label" htmlFor="trip_budget">
            {t("trips.info.budgetLabel", { currency: group.currency })}
          </label>
          <input
            id="trip_budget"
            className="input"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder={t("trips.info.budgetPlaceholder")}
          />
        </div>
        <BudgetWidget
          info={info}
          summary={summary}
          currency={group.currency}
        />
      </section>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}

function MapLinks({ destination }: { destination: TripDestination }) {
  const { t } = useTranslation();
  const q = destination.name.trim();
  if (!q && destination.lat == null) return null;

  let gmapsUrl = "";
  let osmUrl = "";
  if (destination.lat != null && destination.lng != null) {
    gmapsUrl = `https://www.google.com/maps?q=${destination.lat},${destination.lng}`;
    osmUrl = `https://www.openstreetmap.org/?mlat=${destination.lat}&mlon=${destination.lng}#map=13/${destination.lat}/${destination.lng}`;
  } else if (q) {
    const encoded = encodeURIComponent(q);
    gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    osmUrl = `https://www.openstreetmap.org/search?query=${encoded}`;
  }

  return (
    <div className="flex items-center gap-1">
      <a
        href={gmapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-ghost text-xs"
        title={t("trips.info.openInGoogleMaps")}
      >
        GMaps
      </a>
      <a
        href={osmUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-ghost text-xs"
        title={t("trips.info.openInOsm")}
      >
        OSM
      </a>
    </div>
  );
}

function BudgetWidget({
  info,
  summary,
  currency,
}: {
  info: TripInfo | null;
  summary: SplitwiseSummary | null;
  currency: string;
}) {
  const { t, i18n } = useTranslation();
  if (!info || info.budget_cents == null) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("trips.info.budgetEmptyHint")}
      </p>
    );
  }

  const spentCents = summary ? totalSpendFromSummary(summary) : 0;
  const pct =
    info.budget_cents === 0
      ? 0
      : Math.min(100, Math.round((spentCents / info.budget_cents) * 100));
  const over = spentCents > info.budget_cents;

  const fmt = (c: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(c / 100);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-slate-500 dark:text-slate-400">
          {t("trips.info.budgetSpent")}
        </span>
        <span
          className={`font-semibold tabular-nums ${
            over ? "text-rose-600 dark:text-rose-400" : ""
          }`}
        >
          {fmt(spentCents)} / {fmt(info.budget_cents)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full transition-all ${
            over
              ? "bg-rose-500"
              : pct > 80
                ? "bg-amber-500"
                : "bg-emerald-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {over
          ? t("trips.info.budgetOverBy", {
              amount: fmt(spentCents - info.budget_cents),
            })
          : t("trips.info.budgetRemaining", {
              amount: fmt(info.budget_cents - spentCents),
            })}
      </p>
    </div>
  );
}

/**
 * Approximate "total spend on the trip" from the Splitwise summary: sum the
 * absolute value of every negative balance (i.e. total owed to payers). This
 * equals the sum of all expenses in the group regardless of split rules.
 *
 * We deliberately avoid pulling the expense list separately — the summary is
 * already loaded and this keeps the Info tab cheap.
 */
function totalSpendFromSummary(summary: SplitwiseSummary): number {
  // Use the direct_settlements list if available as it reflects what was
  // actually owed. Fall back to summing negative balances.
  const direct: Settlement[] = summary.direct_settlements ?? [];
  if (direct.length > 0) {
    return direct.reduce((acc, s) => acc + s.amount_cents, 0);
  }
  return summary.balances
    .filter((b) => b.balance_cents < 0)
    .reduce((acc, b) => acc + Math.abs(b.balance_cents), 0);
}
