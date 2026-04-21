import {
  ArrowLeft,
  Calendar,
  MapPin,
  Plane,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type { GroupDetail, Trip } from "../../api/types";
import HelpBanner from "../../components/HelpBanner";
import LoadingState from "../../components/LoadingState";
import { formatMoney } from "../../lib/format";
import { useConfirm, useToast } from "../../ui/UIProvider";
import { tripsApi } from "./api";

/**
 * Landing page for the trip planner: shows every trip the group has, plus
 * a quick composer to add a new one. Clicking a trip opens the detail
 * page with the tabs (links, itinerary, packing, info).
 */
export default function TripsListPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!groupId) return;
    Promise.all([groupsApi.get(groupId), tripsApi.listTrips(groupId)])
      .then(([g, ts]) => {
        setGroup(g);
        setTrips(ts);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [groupId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onDelete(trip: Trip) {
    if (!groupId) return;
    const ok = await confirm({
      title: t("trips.list.deleteTitle"),
      message: t("trips.list.deleteConfirm", { name: trip.name }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await tripsApi.deleteTrip(groupId, trip.id);
      reload();
      toast.success(t("trips.list.deleted"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  if (error && !group) {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        {error}
      </p>
    );
  }
  if (!group || !trips) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/groups/${group.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> {t("trips.overview.backToGroup")}
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("trips.list.title")}
            </h1>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {group.name} - {t("trips.list.subtitle")}
            </p>
          </div>
          <button
            className="btn-primary w-full sm:w-auto"
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
          >
            <Plus className="h-4 w-4" /> {t("trips.list.newTrip")}
          </button>
        </div>
      </div>

      <HelpBanner
        storageKey="friendflow.banner.tripList"
        title={t("trips.list.bannerTitle")}
      >
        {t("trips.list.bannerBody")}
      </HelpBanner>

      {showForm && (
        <NewTripForm
          groupId={group.id}
          onDone={(created) => {
            setShowForm(false);
            if (created) {
              reload();
              navigate(`/groups/${group.id}/trips/${created.id}`);
            }
          }}
        />
      )}

      {trips.length === 0 ? (
        <EmptyTripsState onAdd={() => setShowForm(true)} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              groupId={group.id}
              currency={group.currency}
              onDelete={() => onDelete(trip)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyTripsState({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="card p-8 text-center">
      <Plane className="mx-auto h-10 w-10 text-slate-400 dark:text-slate-500" />
      <h2 className="mt-3 text-lg font-semibold">
        {t("trips.list.emptyTitle")}
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {t("trips.list.emptyHint")}
      </p>
      <button type="button" className="btn-primary mt-4" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        {t("trips.list.createFirst")}
      </button>
    </div>
  );
}

function TripCard({
  trip,
  groupId,
  currency,
  onDelete,
}: {
  trip: Trip;
  groupId: string;
  currency: string;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const dateRange = useMemo(
    () => formatDateRange(trip.start_date, trip.end_date, i18n.language),
    [trip.start_date, trip.end_date, i18n.language],
  );
  const destNames = trip.destinations
    .map((d) => d.name.trim())
    .filter((n) => n.length > 0);
  const status = tripStatus(trip);

  return (
    <li className="group card relative flex flex-col overflow-hidden p-0 transition hover:border-brand-400 hover:shadow-md dark:hover:border-brand-600">
      <Link
        to={`/groups/${groupId}/trips/${trip.id}`}
        className="flex flex-1 flex-col gap-3 p-5"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{trip.name}</h3>
            <StatusPill status={status} />
          </div>
          <Plane className="h-5 w-5 shrink-0 text-brand-500" aria-hidden />
        </div>
        <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <p className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {dateRange ?? (
              <span className="italic text-slate-400 dark:text-slate-500">
                {t("trips.list.noDates")}
              </span>
            )}
          </p>
          {destNames.length > 0 ? (
            <p className="inline-flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="line-clamp-2">{destNames.join(", ")}</span>
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="italic">{t("trips.list.noDestinations")}</span>
            </p>
          )}
          {trip.budget_cents != null && (
            <p className="inline-flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              {formatMoney(trip.budget_cents, currency)}
            </p>
          )}
        </div>
      </Link>
      <button
        type="button"
        className="btn-ghost absolute right-2 top-2 -my-1 h-7 px-2 text-slate-300 opacity-0 transition-opacity hover:text-rose-600 focus:opacity-100 group-hover:opacity-100 dark:text-slate-600 dark:hover:text-rose-400"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
        aria-label={t("common.delete")}
        title={t("trips.list.delete")}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

type TripStatus = "upcoming" | "ongoing" | "past" | "unscheduled";

function tripStatus(trip: Trip): TripStatus {
  if (!trip.start_date && !trip.end_date) return "unscheduled";
  const today = toDateKey(new Date());
  const start = trip.start_date;
  const end = trip.end_date ?? trip.start_date;
  if (start && today < start) return "upcoming";
  if (end && today > end) return "past";
  return "ongoing";
}

function StatusPill({ status }: { status: TripStatus }) {
  const { t } = useTranslation();
  const styles: Record<TripStatus, string> = {
    upcoming:
      "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300",
    ongoing:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    past: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    unscheduled:
      "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  };
  return (
    <span
      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {t(`trips.list.status.${status}`)}
    </span>
  );
}

function NewTripForm({
  groupId,
  onDone,
}: {
  groupId: string;
  onDone: (created: Trip | null) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (startDate && endDate && startDate > endDate) {
      toast.error(t("trips.info.errorDates"));
      return;
    }
    setSaving(true);
    try {
      const created = await tripsApi.createTrip(groupId, {
        name: trimmed,
        start_date: startDate || null,
        end_date: endDate || null,
      });
      onDone(created);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h2 className="font-semibold">{t("trips.list.newTrip")}</h2>
      <div className="space-y-1">
        <label className="label" htmlFor="trip_name">
          {t("trips.list.nameLabel")}
        </label>
        <input
          id="trip_name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("trips.list.namePlaceholder")}
          maxLength={120}
          required
          autoFocus
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="label" htmlFor="new_trip_start">
            {t("trips.info.startDate")}
          </label>
          <input
            id="new_trip_start"
            type="date"
            className="input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="new_trip_end">
            {t("trips.info.endDate")}
          </label>
          <input
            id="new_trip_end"
            type="date"
            className="input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate || undefined}
          />
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("trips.list.datesHint")}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => onDone(null)}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          <Plus className="h-4 w-4" />
          {saving ? t("common.saving") : t("trips.list.create")}
        </button>
      </div>
    </form>
  );
}

function formatDateRange(
  start: string | null,
  end: string | null,
  locale: string,
): string | null {
  if (!start && !end) return null;
  const fmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (start && end) {
    if (start === end) return fmt.format(new Date(start + "T00:00:00"));
    return `${fmt.format(new Date(start + "T00:00:00"))} - ${fmt.format(new Date(end + "T00:00:00"))}`;
  }
  return fmt.format(new Date((start ?? end!) + "T00:00:00"));
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
