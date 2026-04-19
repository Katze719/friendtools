import {
  Backpack,
  Calendar,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  Link2,
  MapPin,
  ThumbsUp,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api/client";
import type {
  GroupDetail,
  Trip,
  TripItineraryItem,
  TripLink,
  TripPackingItem,
} from "../../api/types";
import { formatMoney } from "../../lib/format";
import { tripsApi } from "./api";

/**
 * Dashboard-style landing tab for a trip. Instead of jumping straight into a
 * single feature (links, packing, etc.) this gives a quick overview of
 * what's going on across the trip: a strip with the trip's headline facts
 * plus one preview card per subtab with a teaser of its content. Every
 * card is clickable and routes to its respective tab via `onSelectTab`.
 */
export default function OverviewTab({
  group,
  trip,
  onSelectTab,
}: {
  group: GroupDetail;
  trip: Trip;
  onSelectTab: (id: "links" | "itinerary" | "packing" | "info") => void;
}) {
  const { t, i18n } = useTranslation();
  const [links, setLinks] = useState<TripLink[] | null>(null);
  const [itinerary, setItinerary] = useState<TripItineraryItem[] | null>(null);
  const [packing, setPacking] = useState<TripPackingItem[] | null>(null);
  const [errors, setErrors] = useState<{
    links?: string;
    itinerary?: string;
    packing?: string;
  }>({});

  // Fan out the three list endpoints in parallel. Each result lives on its
  // own piece of state so a slow / failed endpoint doesn't block the rest
  // of the overview from rendering.
  useEffect(() => {
    let alive = true;
    tripsApi
      .listLinks(group.id, trip.id)
      .then((l) => alive && setLinks(l))
      .catch((e) =>
        alive &&
        setErrors((prev) => ({
          ...prev,
          links: e instanceof ApiError ? e.message : t("common.error"),
        })),
      );
    tripsApi
      .listItinerary(group.id, trip.id)
      .then((i) => alive && setItinerary(i))
      .catch((e) =>
        alive &&
        setErrors((prev) => ({
          ...prev,
          itinerary: e instanceof ApiError ? e.message : t("common.error"),
        })),
      );
    tripsApi
      .listPacking(group.id, trip.id)
      .then((p) => alive && setPacking(p))
      .catch((e) =>
        alive &&
        setErrors((prev) => ({
          ...prev,
          packing: e instanceof ApiError ? e.message : t("common.error"),
        })),
      );
    return () => {
      alive = false;
    };
  }, [group.id, trip.id, t]);

  const dateRange = useMemo(
    () => formatDateRange(trip.start_date, trip.end_date, i18n.language),
    [trip.start_date, trip.end_date, i18n.language],
  );
  const destNames = trip.destinations
    .map((d) => d.name.trim())
    .filter((n) => n.length > 0);

  return (
    <div className="space-y-5">
      <TripSummaryStrip
        trip={trip}
        dateRange={dateRange}
        destNames={destNames}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <LinksCard
          links={links}
          error={errors.links}
          onOpen={() => onSelectTab("links")}
        />
        <ItineraryCard
          items={itinerary}
          error={errors.itinerary}
          language={i18n.language}
          onOpen={() => onSelectTab("itinerary")}
        />
        <PackingCard
          items={packing}
          error={errors.packing}
          onOpen={() => onSelectTab("packing")}
        />
        <BudgetCard
          trip={trip}
          currency={group.currency}
          onOpen={() => onSelectTab("info")}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header strip                                                        */
/* ------------------------------------------------------------------ */

function TripSummaryStrip({
  trip,
  dateRange,
  destNames,
}: {
  trip: Trip;
  dateRange: string | null;
  destNames: string[];
}) {
  const { t } = useTranslation();
  const status = tripStatus(trip);
  return (
    <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
      <StatusPill status={status} />
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
        <Calendar className="h-3.5 w-3.5 text-slate-400" />
        {dateRange ?? (
          <span className="italic text-slate-400 dark:text-slate-500">
            {t("trips.overview.widgets.noDates")}
          </span>
        )}
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
        <MapPin className="h-3.5 w-3.5 text-slate-400" />
        {destNames.length > 0 ? (
          <span className="line-clamp-1">{destNames.join(", ")}</span>
        ) : (
          <span className="italic text-slate-400 dark:text-slate-500">
            {t("trips.overview.widgets.noDestinations")}
          </span>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview cards                                                       */
/* ------------------------------------------------------------------ */

function WidgetCard({
  icon: Icon,
  title,
  onOpen,
  children,
  footer,
}: {
  icon: typeof Link2;
  title: string;
  onOpen: () => void;
  children: ReactNode;
  /** Optional bottom-right label next to the chevron (e.g. counts). */
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group card flex flex-col gap-3 p-4 text-left transition hover:border-brand-400 hover:shadow-md focus:border-brand-500 focus:outline-none dark:hover:border-brand-600"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand-500" aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </h3>
      </div>
      <div className="min-h-[3rem] flex-1 text-sm text-slate-700 dark:text-slate-200">
        {children}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
        <span>{footer ?? ""}</span>
        <span className="inline-flex items-center gap-0.5 text-brand-500 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
          {t("trips.overview.widgets.openTab")}
          <ChevronRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="italic text-slate-400 dark:text-slate-500">{text}</p>
  );
}

function ErrorHint({ text }: { text: string }) {
  return (
    <p className="text-rose-600 dark:text-rose-400">{text}</p>
  );
}

function LoadingHint() {
  return (
    <div className="space-y-2" aria-hidden>
      <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

function LinksCard({
  links,
  error,
  onOpen,
}: {
  links: TripLink[] | null;
  error: string | undefined;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  // Show the three most liked links first so the preview surfaces what the
  // group has actually endorsed. Fall back to creation order for ties /
  // unvoted links.
  const top = useMemo(() => {
    if (!links) return null;
    const score = (l: TripLink) => l.likes - l.dislikes;
    return [...links]
      .sort((a, b) => {
        const d = score(b) - score(a);
        if (d !== 0) return d;
        return b.created_at.localeCompare(a.created_at);
      })
      .slice(0, 3);
  }, [links]);

  let body: ReactNode;
  if (error) body = <ErrorHint text={error} />;
  else if (top === null) body = <LoadingHint />;
  else if (top.length === 0)
    body = <EmptyHint text={t("trips.overview.widgets.links.empty")} />;
  else
    body = (
      <ul className="space-y-1.5">
        {top.map((l) => {
          const title =
            (l.title_override?.trim() ||
              l.title?.trim() ||
              l.url.replace(/^https?:\/\//, "")).trim();
          return (
            <li key={l.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{title}</span>
              {l.likes - l.dislikes > 0 && (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <ThumbsUp className="h-3 w-3" />
                  {l.likes - l.dislikes}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    );

  const footer = links
    ? t("trips.overview.widgets.links.count", { count: links.length })
    : null;

  return (
    <WidgetCard
      icon={Link2}
      title={t("trips.tabs.links")}
      onOpen={onOpen}
      footer={footer}
    >
      {body}
    </WidgetCard>
  );
}

function ItineraryCard({
  items,
  error,
  language,
  onOpen,
}: {
  items: TripItineraryItem[] | null;
  error: string | undefined;
  language: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const today = useMemo(() => toDateKey(new Date()), []);
  // Surface the next few upcoming entries (including today). If everything
  // is in the past we fall back to the three most recent - still useful as
  // a recap / reference after the trip.
  const preview = useMemo(() => {
    if (!items) return null;
    if (items.length === 0) return [];
    const upcoming = items
      .filter((i) => i.day_date >= today)
      .sort((a, b) => {
        if (a.day_date !== b.day_date) return a.day_date.localeCompare(b.day_date);
        return (a.start_time ?? "").localeCompare(b.start_time ?? "");
      });
    if (upcoming.length > 0) return upcoming.slice(0, 3);
    const past = [...items].sort((a, b) => b.day_date.localeCompare(a.day_date));
    return past.slice(0, 3);
  }, [items, today]);

  let body: ReactNode;
  if (error) body = <ErrorHint text={error} />;
  else if (preview === null) body = <LoadingHint />;
  else if (preview.length === 0)
    body = <EmptyHint text={t("trips.overview.widgets.itinerary.empty")} />;
  else
    body = (
      <ul className="space-y-1.5">
        {preview.map((it) => (
          <li key={it.id} className="flex items-baseline gap-2">
            <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {formatShortDate(it.day_date, language)}
              {it.start_time ? ` - ${trimSeconds(it.start_time)}` : ""}
            </span>
            <span className="min-w-0 flex-1 truncate">{it.title}</span>
          </li>
        ))}
      </ul>
    );

  const footer = items
    ? t("trips.overview.widgets.itinerary.count", { count: items.length })
    : null;

  return (
    <WidgetCard
      icon={CalendarDays}
      title={t("trips.tabs.itinerary")}
      onOpen={onOpen}
      footer={footer}
    >
      {body}
    </WidgetCard>
  );
}

function PackingCard({
  items,
  error,
  onOpen,
}: {
  items: TripPackingItem[] | null;
  error: string | undefined;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { open, packed } = useMemo(() => {
    if (!items) return { open: [] as TripPackingItem[], packed: 0 };
    return {
      open: items.filter((i) => !i.is_packed).slice(0, 3),
      packed: items.filter((i) => i.is_packed).length,
    };
  }, [items]);

  let body: ReactNode;
  if (error) body = <ErrorHint text={error} />;
  else if (items === null) body = <LoadingHint />;
  else if (items.length === 0)
    body = <EmptyHint text={t("trips.overview.widgets.packing.empty")} />;
  else {
    const pct = Math.round((packed / items.length) * 100);
    const done = packed === items.length;
    body = (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            {t("trips.overview.widgets.packing.progress", {
              done: packed,
              total: items.length,
            })}
          </span>
          {done ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("trips.overview.widgets.packing.allPacked")}
            </span>
          ) : (
            <span className="tabular-nums text-slate-400 dark:text-slate-500">
              {pct}%
            </span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full transition-all ${
              done ? "bg-emerald-500" : "bg-brand-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {!done && open.length > 0 && (
          <ul className="space-y-1 pt-1 text-xs text-slate-600 dark:text-slate-300">
            {open.map((it) => (
              <li key={it.id} className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                {it.quantity && (
                  <span className="shrink-0 text-slate-400 dark:text-slate-500">
                    {it.quantity}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const footer = items
    ? t("trips.overview.widgets.packing.count", {
        count: items.length - (items?.filter((i) => i.is_packed).length ?? 0),
      })
    : null;

  return (
    <WidgetCard
      icon={Backpack}
      title={t("trips.tabs.packing")}
      onOpen={onOpen}
      footer={footer}
    >
      {body}
    </WidgetCard>
  );
}

function BudgetCard({
  trip,
  currency,
  onOpen,
}: {
  trip: Trip;
  currency: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const hasBudget = trip.budget_cents != null;
  let body: ReactNode;
  let footer: ReactNode = null;
  if (!hasBudget) {
    body = <EmptyHint text={t("trips.overview.widgets.budget.empty")} />;
  } else {
    const budget = trip.budget_cents as number;
    const spent = trip.spent_cents;
    const pct = budget === 0 ? 0 : Math.min(100, Math.round((spent / budget) * 100));
    const over = spent > budget;
    body = (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            {t("trips.info.budgetSpent")}
          </span>
          <span
            className={`font-semibold tabular-nums ${
              over ? "text-rose-600 dark:text-rose-400" : ""
            }`}
          >
            {formatMoney(spent, currency)} / {formatMoney(budget, currency)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
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
      </div>
    );
    footer = over
      ? t("trips.overview.widgets.budget.over", {
          amount: formatMoney(spent - budget, currency),
        })
      : t("trips.overview.widgets.budget.remaining", {
          amount: formatMoney(budget - spent, currency),
        });
  }
  return (
    <WidgetCard
      icon={Wallet}
      title={t("trips.overview.widgets.budget.title")}
      onOpen={onOpen}
      footer={footer}
    >
      {body}
    </WidgetCard>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers (kept in sync with TripsListPage's status pill)             */
/* ------------------------------------------------------------------ */

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
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {t(`trips.list.status.${status}`)}
    </span>
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

function formatShortDate(isoDate: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(new Date(isoDate + "T00:00:00"));
}

function trimSeconds(time: string): string {
  // API may return HH:MM:SS; keep only HH:MM for the compact preview.
  return time.length >= 5 ? time.slice(0, 5) : time;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
