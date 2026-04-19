import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  ExternalLink,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type {
  CalendarEvent,
  GroupDetail,
  Trip,
  TripItineraryItem,
} from "../../api/types";
import { useConfirm, useToast } from "../../ui/UIProvider";
import DayPicker from "../../components/DayPicker";
import MonthCalendar, {
  type DayBadge,
} from "../../components/MonthCalendar";
import {
  addDays,
  formatDayLong,
  isSameDay,
  startOfDay,
  startOfMonth,
  toDateKey,
} from "../../lib/date";
import { formatDateTime, formatTime } from "../../lib/format";
import { tripsApi } from "../trips/api";
import { calendarApi } from "./api";

type View = "agenda" | "month";

export default function CalendarOverviewPage() {
  const { t } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [tripItems, setTripItems] = useState<TripItineraryItem[]>([]);
  const [tripsById, setTripsById] = useState<Map<string, Trip>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("month");
  const [visibleMonth, setVisibleMonth] = useState<Date>(() =>
    startOfMonth(new Date()),
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [formDefaults, setFormDefaults] = useState<{ date?: string } | null>(
    null,
  );

  const reload = useCallback(() => {
    if (!groupId) return;
    // Fetch group and calendar events first; itinerary overlay comes from
    // iterating every trip in the group. Trips API failures are tolerated
    // so the calendar still renders without them.
    Promise.all([
      groupsApi.get(groupId),
      calendarApi.list(groupId),
      tripsApi.listTrips(groupId).catch(() => [] as Trip[]),
    ])
      .then(async ([g, e, trips]) => {
        setGroup(g);
        setEvents(e);
        setTripsById(new Map(trips.map((tp) => [tp.id, tp])));
        // Fan out one request per trip in parallel. An individual failure
        // only drops that trip's itinerary; it doesn't break the view.
        const perTrip = await Promise.all(
          trips.map((tp) =>
            tripsApi
              .listItinerary(groupId, tp.id)
              .catch(() => [] as TripItineraryItem[]),
          ),
        );
        setTripItems(perTrip.flat());
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [groupId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const { upcoming, past } = useMemo(() => {
    if (!events) return { upcoming: [], past: [] };
    const now = Date.now();
    const up: CalendarEvent[] = [];
    const pa: CalendarEvent[] = [];
    for (const ev of events) {
      const end = ev.ends_at
        ? new Date(ev.ends_at).getTime()
        : new Date(ev.starts_at).getTime();
      if (end >= now) up.push(ev);
      else pa.push(ev);
    }
    pa.reverse();
    return { upcoming: up, past: pa };
  }, [events]);

  /** Events bucketed per local day (multi-day events appear on each covered day). */
  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    if (!events) return map;
    for (const ev of events) {
      const start = startOfDay(new Date(ev.starts_at));
      const end = ev.ends_at
        ? startOfDay(new Date(ev.ends_at))
        : start;
      let cursor = start;
      // Bound to 60 days of sweep to avoid runaway events.
      let guard = 0;
      while (cursor.getTime() <= end.getTime() && guard < 60) {
        const key = toDateKey(cursor);
        (map[key] ??= []).push(ev);
        cursor = addDays(cursor, 1);
        guard++;
      }
    }
    return map;
  }, [events]);

  const tripItemsByDay = useMemo(() => {
    const map: Record<string, TripItineraryItem[]> = {};
    for (const it of tripItems) {
      (map[it.day_date] ??= []).push(it);
    }
    for (const bucket of Object.values(map)) {
      bucket.sort((a, b) => {
        const at = a.start_time ?? "99:99:99";
        const bt = b.start_time ?? "99:99:99";
        if (at !== bt) return at.localeCompare(bt);
        return a.position - b.position;
      });
    }
    return map;
  }, [tripItems]);

  const badgesByDay = useMemo(() => {
    const out: Record<string, DayBadge[]> = {};
    for (const [day, evs] of Object.entries(eventsByDay)) {
      out[day] = evs.map((e) => ({
        id: e.id,
        label: e.title,
        accent: "bg-brand-500",
      }));
    }
    for (const [day, its] of Object.entries(tripItemsByDay)) {
      const existing = out[day] ?? [];
      out[day] = existing.concat(
        its.map((it) => ({
          id: "trip-" + it.id,
          label: it.title,
          accent: "bg-sky-500",
        })),
      );
    }
    return out;
  }, [eventsByDay, tripItemsByDay]);

  const dayEvents = useMemo(() => {
    if (!selectedDay) return [];
    return eventsByDay[toDateKey(selectedDay)] ?? [];
  }, [selectedDay, eventsByDay]);

  const dayTripItems = useMemo(() => {
    if (!selectedDay) return [];
    return tripItemsByDay[toDateKey(selectedDay)] ?? [];
  }, [selectedDay, tripItemsByDay]);

  function openCreateForDay(day: Date) {
    setEditing(null);
    setFormDefaults({ date: toDateKey(day) });
    setShowForm(true);
  }

  function openEdit(ev: CalendarEvent) {
    setEditing(ev);
    setFormDefaults(null);
    setShowForm(true);
  }

  if (error && !group) {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        {error}
      </p>
    );
  }
  if (!group || !events) {
    return <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/groups/${group.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> {t("calendar.overview.backToGroup")}
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("calendar.overview.title")}
            </h1>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {group.name} - {t("calendar.overview.subtitle")}
            </p>
          </div>
          <button
            className="btn-primary w-full sm:w-auto"
            onClick={() => {
              setEditing(null);
              setFormDefaults(null);
              setShowForm((v) => !v);
            }}
            aria-expanded={showForm}
          >
            <Plus className="h-4 w-4" /> {t("calendar.overview.add")}
          </button>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-slate-900">
        <ViewTab
          active={view === "agenda"}
          label={t("calendar.overview.viewAgenda")}
          onClick={() => setView("agenda")}
        />
        <ViewTab
          active={view === "month"}
          label={t("calendar.overview.viewMonth")}
          onClick={() => setView("month")}
        />
      </div>

      {showForm && (
        <EventForm
          groupId={group.id}
          event={editing}
          defaults={formDefaults}
          onDone={(changed) => {
            setShowForm(false);
            setEditing(null);
            setFormDefaults(null);
            if (changed) reload();
          }}
        />
      )}

      {view === "agenda" ? (
        events.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <EventSection
              title={t("calendar.overview.upcoming")}
              events={upcoming}
              groupId={group.id}
              onChanged={reload}
              onEdit={openEdit}
              empty={t("calendar.overview.noUpcoming")}
            />
            {past.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer select-none text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                  {t("calendar.overview.pastToggle", { count: past.length })}
                </summary>
                <div className="mt-3">
                  <EventSection
                    title={t("calendar.overview.past")}
                    events={past}
                    groupId={group.id}
                    onChanged={reload}
                    onEdit={openEdit}
                    empty=""
                    dim
                  />
                </div>
              </details>
            )}
          </>
        )
      ) : (
        <div className="card p-3 sm:p-5">
          <MonthCalendar
            month={visibleMonth}
            onMonthChange={setVisibleMonth}
            selected={selectedDay}
            onSelectDay={(d) => setSelectedDay(d)}
            badgesByDay={badgesByDay}
            ariaLabel={t("calendar.overview.title")}
          />
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            {selectedDay ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold sm:text-base">
                    {t("calendar.overview.dayTitle", {
                      date: formatDayLong(selectedDay),
                    })}
                  </h3>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => openCreateForDay(selectedDay)}
                  >
                    <Plus className="h-4 w-4" />
                    {t("calendar.overview.add")}
                  </button>
                </div>
                {dayEvents.length === 0 && dayTripItems.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t("calendar.overview.dayEmpty")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {dayEvents.map((ev) => (
                      <EventCard
                        key={ev.id}
                        event={ev}
                        groupId={group.id}
                        onChanged={reload}
                        onEdit={() => openEdit(ev)}
                        dim={false}
                        anchorDay={selectedDay}
                      />
                    ))}
                    {dayTripItems.map((it) => (
                      <TripEntryCard
                        key={"trip-" + it.id}
                        item={it}
                        groupId={group.id}
                        tripName={tripsById.get(it.trip_id)?.name ?? null}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("calendar.overview.hintPickDay")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ViewTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-2.5 py-1 ${
        active
          ? "bg-brand-600 text-white"
          : "text-slate-600 dark:text-slate-300"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="card p-8 text-center">
      <CalendarDays className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
      <h2 className="mt-3 text-lg font-semibold">
        {t("calendar.overview.empty.title")}
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {t("calendar.overview.empty.description")}
      </p>
    </div>
  );
}

function EventSection({
  title,
  events,
  groupId,
  onChanged,
  onEdit,
  empty,
  dim = false,
}: {
  title: string;
  events: CalendarEvent[];
  groupId: string;
  onChanged: () => void;
  onEdit: (ev: CalendarEvent) => void;
  empty: string;
  dim?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {events.length === 0 ? (
        empty ? (
          <p className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {empty}
          </p>
        ) : null
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <EventCard
              key={ev.id}
              event={ev}
              groupId={groupId}
              onChanged={onChanged}
              onEdit={() => onEdit(ev)}
              dim={dim}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function EventCard({
  event,
  groupId,
  onChanged,
  onEdit,
  dim,
  anchorDay,
}: {
  event: CalendarEvent;
  groupId: string;
  onChanged: () => void;
  onEdit: () => void;
  dim: boolean;
  /** When rendered for a specific day, show `HH:MM` if the event starts/ends that day. */
  anchorDay?: Date;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const startDate = new Date(event.starts_at);
  const endDate = event.ends_at ? new Date(event.ends_at) : null;
  const sameDay = endDate
    ? startDate.toDateString() === endDate.toDateString()
    : true;

  let when: string;
  if (anchorDay) {
    const startsToday = isSameDay(startDate, anchorDay);
    const endsToday = endDate ? isSameDay(endDate, anchorDay) : true;
    if (event.all_day) {
      when = t("calendar.overview.allDay");
    } else if (startsToday && endsToday) {
      when = endDate
        ? `${formatTime(event.starts_at)} – ${formatTime(event.ends_at!)}`
        : formatTime(event.starts_at);
    } else if (startsToday) {
      when = `${formatTime(event.starts_at)} – …`;
    } else if (endsToday && endDate) {
      when = `… – ${formatTime(event.ends_at!)}`;
    } else {
      when = t("calendar.overview.allDay");
    }
  } else {
    const startText = formatDateTime(event.starts_at, event.all_day);
    const endText = endDate
      ? sameDay && !event.all_day
        ? formatTime(event.ends_at!)
        : formatDateTime(event.ends_at!, event.all_day)
      : null;
    when = `${startText}${endText ? ` – ${endText}` : ""}`;
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("calendar.overview.deleteTitle"),
      message: t("calendar.overview.deleteConfirm", { title: event.title }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await calendarApi.remove(groupId, event.id);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`card p-4 ${dim ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-brand-700 dark:text-brand-300">
            <CalendarClock className="h-3.5 w-3.5" />
            <span>
              {when}
              {event.all_day && !anchorDay && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {t("calendar.overview.allDay")}
                </span>
              )}
            </span>
          </div>
          <h3 className="mt-1 break-words text-base font-semibold">
            {event.title}
          </h3>
          {event.location && (
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="break-words">{event.location}</span>
            </p>
          )}
          {event.description && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-300">
              {event.description}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {t("calendar.overview.createdBy", {
              name: event.created_by_display_name,
            })}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            className="btn-ghost -my-1"
            onClick={onEdit}
            aria-label={t("common.edit")}
            title={t("common.edit")}
            disabled={busy}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="btn-ghost -my-1 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
            onClick={onDelete}
            aria-label={t("common.delete")}
            title={t("common.delete")}
            disabled={busy}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Read-only card for a trip itinerary item shown inside a calendar day list.
 * Editing happens in the trip planner; keeping it read-only here avoids
 * two-way sync pitfalls.
 */
function TripEntryCard({
  item,
  groupId,
  tripName,
}: {
  item: TripItineraryItem;
  groupId: string;
  tripName: string | null;
}) {
  const { t } = useTranslation();
  const timeLabel = formatTripTimeRange(item.start_time, item.end_time);
  return (
    <li className="card border-dashed border-sky-300/70 bg-sky-50/40 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-sky-700 dark:text-sky-300">
            <Plane className="h-3.5 w-3.5" />
            <span>
              {timeLabel || t("calendar.overview.allDay")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
              {tripName
                ? t("calendar.overview.fromTripNamed", { name: tripName })
                : t("calendar.overview.fromTrip")}
            </span>
          </div>
          <h3 className="mt-1 break-words text-base font-semibold">
            {item.title}
          </h3>
          {item.location && (
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="break-words">{item.location}</span>
            </p>
          )}
          {item.note && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-300">
              {item.note}
            </p>
          )}
        </div>
        <Link
          to={`/groups/${groupId}/trips/${item.trip_id}`}
          className="btn-ghost -my-1 shrink-0 text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
          aria-label={t("calendar.overview.openInTrip")}
          title={t("calendar.overview.openInTrip")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </li>
  );
}

function formatTripTimeRange(
  start: string | null,
  end: string | null,
): string {
  const s = start?.slice(0, 5);
  const e = end?.slice(0, 5);
  if (s && e) return `${s} - ${e}`;
  if (s) return s;
  if (e) return `- ${e}`;
  return "";
}

function EventForm({
  groupId,
  event,
  defaults,
  onDone,
}: {
  groupId: string;
  event: CalendarEvent | null;
  defaults: { date?: string } | null;
  onDone: (changed: boolean) => void;
}) {
  const { t } = useTranslation();

  const initial = useMemo(() => {
    if (event) return splitIsoLocal(event.starts_at);
    const d = new Date();
    if (defaults?.date) {
      const dk = defaults.date;
      const [y, m, da] = dk.split("-").map(Number);
      const seed = new Date(y, m - 1, da, 18, 0, 0);
      return { date: toDateKey(seed), time: toTimeKey(seed) };
    }
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return { date: toDateKey(d), time: toTimeKey(d) };
  }, [event, defaults]);

  const initialEnd = useMemo(() => {
    if (event?.ends_at) return splitIsoLocal(event.ends_at);
    return { date: "", time: "" };
  }, [event]);

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [startDate, setStartDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.time);
  const [endDate, setEndDate] = useState(initialEnd.date);
  const [endTime, setEndTime] = useState(initialEnd.time);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const startIso = composeIso(startDate, allDay ? "00:00" : startTime);
    if (!startIso) {
      setError(t("calendar.overview.errorInvalidStart"));
      return;
    }

    let endIso: string | null = null;
    if (endDate) {
      endIso = composeIso(endDate, allDay ? "23:59" : endTime || "23:59");
      if (!endIso) {
        setError(t("calendar.overview.errorInvalidEnd"));
        return;
      }
    }
    if (endIso && new Date(endIso).getTime() < new Date(startIso).getTime()) {
      setError(t("calendar.overview.errorEndBeforeStart"));
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        starts_at: startIso,
        ends_at: endIso,
        all_day: allDay,
      };
      if (event) {
        await calendarApi.update(groupId, event.id, payload);
      } else {
        await calendarApi.create(groupId, payload);
      }
      onDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">
          {event
            ? t("calendar.overview.editTitle")
            : t("calendar.overview.addTitle")}
        </h3>
        <button
          type="button"
          className="btn-ghost -my-1"
          onClick={() => onDone(false)}
          aria-label={t("common.cancel")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1">
        <label className="label" htmlFor="ev_title">
          {t("calendar.overview.eventTitle")}
        </label>
        <input
          id="ev_title"
          required
          maxLength={200}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("calendar.overview.eventTitlePlaceholder")}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="label" htmlFor="ev_start_date">
            {t("calendar.overview.startDate")}
          </label>
          <DayPicker
            id="ev_start_date"
            value={startDate}
            onChange={(v) => {
              setStartDate(v);
              // Auto-advance end date if it's before the new start.
              if (endDate && endDate < v) setEndDate(v);
            }}
            required
            ariaLabel={t("calendar.overview.startDate")}
          />
        </div>
        {!allDay && (
          <div className="space-y-1">
            <label className="label" htmlFor="ev_start_time">
              {t("calendar.overview.startTime")}
            </label>
            <input
              id="ev_start_time"
              type="time"
              required
              className="input tabular-nums"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="label" htmlFor="ev_end_date">
            {t("calendar.overview.endDate")}
          </label>
          <DayPicker
            id="ev_end_date"
            value={endDate}
            onChange={setEndDate}
            ariaLabel={t("calendar.overview.endDate")}
            placeholder={t("calendar.overview.endOptional")}
          />
        </div>
        {!allDay && (
          <div className="space-y-1">
            <label className="label" htmlFor="ev_end_time">
              {t("calendar.overview.endTime")}
            </label>
            <input
              id="ev_end_time"
              type="time"
              className="input tabular-nums"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={!endDate}
            />
          </div>
        )}
      </div>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
        />
        {t("calendar.overview.allDay")}
      </label>

      <div className="space-y-1">
        <label className="label" htmlFor="ev_location">
          {t("calendar.overview.location")}
        </label>
        <input
          id="ev_location"
          maxLength={200}
          className="input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={t("calendar.overview.locationPlaceholder")}
        />
      </div>

      <div className="space-y-1">
        <label className="label" htmlFor="ev_desc">
          {t("calendar.overview.descriptionOptional")}
        </label>
        <textarea
          id="ev_desc"
          maxLength={2000}
          className="input min-h-[88px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("calendar.overview.descriptionPlaceholder")}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onDone(false)}
        >
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading
            ? t("common.saving")
            : event
              ? t("common.save")
              : t("calendar.overview.add")}
        </button>
      </div>
    </form>
  );
}

// ---------- helpers ----------

function toTimeKey(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function splitIsoLocal(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return { date: toDateKey(d), time: toTimeKey(d) };
}

function composeIso(dateKey: string, timeKey: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const tm = /^(\d{2}):(\d{2})$/.exec(timeKey);
  if (!m || !tm) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(tm[1]),
    Number(tm[2]),
    0,
    0,
  );
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
