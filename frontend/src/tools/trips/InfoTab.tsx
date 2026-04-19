import {
  Calendar,
  DollarSign,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import type {
  GroupDetail,
  Settlement,
  SplitwiseSummary,
  Trip,
  TripDestination,
} from "../../api/types";
import HelpBanner from "../../components/HelpBanner";
import { splitwiseApi } from "../splitwise/api";
import { useConfirm, useToast } from "../../ui/UIProvider";
import { tripsApi } from "./api";

/**
 * "Info" tab for a single trip: edit the lightweight metadata that turns a
 * link board into a real trip — name, dates, destinations, budget — plus a
 * delete action. Every field except the name is optional.
 */
export default function InfoTab({
  group,
  trip,
  onTripChanged,
}: {
  group: GroupDetail;
  trip: Trip;
  onTripChanged: (updated: Trip) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SplitwiseSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState(trip.name);
  const [renaming, setRenaming] = useState(false);
  const [startDate, setStartDate] = useState(trip.start_date ?? "");
  const [endDate, setEndDate] = useState(trip.end_date ?? "");
  const [budget, setBudget] = useState(
    trip.budget_cents == null ? "" : (trip.budget_cents / 100).toFixed(2),
  );
  const [destinations, setDestinations] = useState<TripDestination[]>(
    trip.destinations ?? [],
  );

  useEffect(() => {
    setName(trip.name);
    setStartDate(trip.start_date ?? "");
    setEndDate(trip.end_date ?? "");
    setBudget(
      trip.budget_cents == null ? "" : (trip.budget_cents / 100).toFixed(2),
    );
    setDestinations(trip.destinations ?? []);
  }, [trip]);

  useEffect(() => {
    let alive = true;
    splitwiseApi
      .summary(group.id)
      .then((s) => alive && setSummary(s))
      .catch(() => alive && setSummary(null));
    return () => {
      alive = false;
    };
  }, [group.id]);

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
      const updated = await tripsApi.updateTrip(group.id, trip.id, {
        start_date: startDate || null,
        end_date: endDate || null,
        budget_cents: budgetCents,
        destinations: clean,
      });
      onTripChanged(updated);
      toast.success(t("trips.info.saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function submitRename(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === trip.name) {
      setName(trip.name);
      setRenaming(false);
      return;
    }
    try {
      const updated = await tripsApi.updateTrip(group.id, trip.id, {
        name: trimmed,
      });
      onTripChanged(updated);
      setRenaming(false);
      toast.success(t("trips.info.renamed"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    }
  }

  async function onDeleteTrip() {
    const ok = await confirm({
      title: t("trips.info.deleteTitle"),
      message: t("trips.info.deleteConfirm", { name: trip.name }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await tripsApi.deleteTrip(group.id, trip.id);
      toast.success(t("trips.list.deleted"));
      navigate(`/groups/${group.id}/trips`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
      setDeleting(false);
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

  return (
    <form onSubmit={onSave} className="space-y-6">
      <HelpBanner
        storageKey="friendflow.banner.trip.info"
        title={t("trips.info.bannerTitle")}
      >
        {t("trips.info.bannerBody")}
      </HelpBanner>

      <section className="card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Type className="h-5 w-5 text-brand-500" />
          {t("trips.info.nameTitle")}
        </h2>
        {renaming ? (
          <form
            onSubmit={submitRename}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              autoFocus
              className="input h-9 min-w-0 flex-1 py-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
            />
            <button type="submit" className="btn-primary h-9 py-1 text-sm">
              {t("common.save")}
            </button>
            <button
              type="button"
              className="btn-ghost h-9 py-1 text-sm"
              onClick={() => {
                setName(trip.name);
                setRenaming(false);
              }}
            >
              {t("common.cancel")}
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-medium">{trip.name}</span>
            <button
              type="button"
              className="btn-ghost text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              onClick={() => setRenaming(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("trips.info.rename")}
            </button>
          </div>
        )}
      </section>

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
          trip={trip}
          summary={summary}
          currency={group.currency}
        />
      </section>

      <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row">
        <button
          type="button"
          className="btn-ghost self-start text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
          onClick={onDeleteTrip}
          disabled={deleting}
        >
          <Trash2 className="h-4 w-4" />
          {deleting ? t("common.saving") : t("trips.info.deleteTrip")}
        </button>
        <button
          type="submit"
          className="btn-primary self-end"
          disabled={saving}
        >
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
  trip,
  summary,
  currency,
}: {
  trip: Trip;
  summary: SplitwiseSummary | null;
  currency: string;
}) {
  const { t, i18n } = useTranslation();
  if (trip.budget_cents == null) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("trips.info.budgetEmptyHint")}
      </p>
    );
  }

  const spentCents = summary ? totalSpendFromSummary(summary) : 0;
  const pct =
    trip.budget_cents === 0
      ? 0
      : Math.min(100, Math.round((spentCents / trip.budget_cents) * 100));
  const over = spentCents > trip.budget_cents;

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
          {fmt(spentCents)} / {fmt(trip.budget_cents)}
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
              amount: fmt(spentCents - trip.budget_cents),
            })
          : t("trips.info.budgetRemaining", {
              amount: fmt(trip.budget_cents - spentCents),
            })}
      </p>
      <p className="text-[11px] italic text-slate-400 dark:text-slate-500">
        {t("trips.info.budgetGroupWide")}
      </p>
    </div>
  );
}

/**
 * Approximate total group spend from the Splitwise summary: sum all
 * pairwise debts. We deliberately avoid pulling the full expense list so
 * the Info tab stays cheap.
 *
 * NB: this is the whole group's spend, not per-trip. Trips don't carry
 * expenses yet; the note under the widget calls this out to the user.
 */
function totalSpendFromSummary(summary: SplitwiseSummary): number {
  const direct: Settlement[] = summary.direct_settlements ?? [];
  if (direct.length > 0) {
    return direct.reduce((acc, s) => acc + s.amount_cents, 0);
  }
  return summary.balances
    .filter((b) => b.balance_cents < 0)
    .reduce((acc, b) => acc + Math.abs(b.balance_cents), 0);
}
