import {
  CalendarClock,
  CalendarDays,
  Clock,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import type {
  CalendarEvent,
  GroupDetail,
  Trip,
  TripItineraryItem,
  TripLink,
} from "../../api/types";
import { useConfirm, useToast } from "../../ui/UIProvider";
import HelpBanner from "../../components/HelpBanner";
import { addDays, startOfDay, toDateKey } from "../../lib/date";
import { formatTime } from "../../lib/format";
import { calendarApi } from "../calendar/api";
import { tripsApi } from "./api";

/**
 * Unified list entry: either a real itinerary item or a calendar event that
 * happens to land on this day. Calendar events show up read-only with a link
 * out to the calendar tool so editing still has a single source of truth.
 */
type DayEntry =
  | { kind: "trip"; item: TripItineraryItem; sortKey: string }
  | { kind: "calendar"; event: CalendarEvent; sortKey: string };

/**
 * Itinerary tab. Items are grouped by day; inside each day the backend
 * already sorts by start_time (nulls last) then position, so we render in
 * arrival order.
 */
export default function ItineraryTab({
  group,
  trip,
}: {
  group: GroupDetail;
  trip: Trip;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<TripItineraryItem[] | null>(null);
  const [links, setLinks] = useState<TripLink[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [composerDay, setComposerDay] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([
      tripsApi.listItinerary(group.id, trip.id),
      tripsApi.listLinks(group.id, trip.id),
      calendarApi.list(group.id).catch(() => [] as CalendarEvent[]),
    ])
      .then(([its, ls, evs]) => {
        setItems(its);
        setLinks(ls);
        setCalendarEvents(evs);
      })
      .catch((e) =>
        toast.error(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [group.id, trip.id, t, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * Calendar events grouped by local day key. Multi-day events appear on each
   * covered day (capped at 60 days to avoid runaway loops).
   */
  const calendarByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of calendarEvents) {
      const start = startOfDay(new Date(ev.starts_at));
      const end = ev.ends_at ? startOfDay(new Date(ev.ends_at)) : start;
      let cursor = start;
      let guard = 0;
      while (cursor.getTime() <= end.getTime() && guard < 60) {
        const key = toDateKey(cursor);
        const bucket = map.get(key);
        if (bucket) bucket.push(ev);
        else map.set(key, [ev]);
        cursor = addDays(cursor, 1);
        guard++;
      }
    }
    return map;
  }, [calendarEvents]);

  /**
   * Build the list of days to render. Union of:
   *   - every day between start_date and end_date (if both set)
   *   - every unique day that already has a trip item
   *
   * Calendar events only overlay onto days the trip already surfaces, so
   * unrelated long-term group events don't flood the itinerary view.
   */
  const days = useMemo(() => {
    const set = new Set<string>();
    if (trip.start_date && trip.end_date) {
      const start = new Date(trip.start_date + "T00:00:00");
      const end = new Date(trip.end_date + "T00:00:00");
      for (
        let d = new Date(start);
        d.getTime() <= end.getTime();
        d.setDate(d.getDate() + 1)
      ) {
        set.add(toIso(d));
      }
    }
    for (const it of items ?? []) set.add(it.day_date);
    return Array.from(set).sort();
  }, [trip.start_date, trip.end_date, items]);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const it of items ?? []) {
      const sortKey = (it.start_time ?? "99:99:99") + "|t" + it.position;
      const entry: DayEntry = { kind: "trip", item: it, sortKey };
      const bucket = map.get(it.day_date);
      if (bucket) bucket.push(entry);
      else map.set(it.day_date, [entry]);
    }
    // Only overlay calendar events on days the itinerary already surfaces.
    for (const day of days) {
      const events = calendarByDay.get(day);
      if (!events) continue;
      for (const ev of events) {
        const timeKey = ev.all_day
          ? "00:00:00"
          : extractLocalTime(ev.starts_at, day);
        const sortKey = timeKey + "|c" + ev.id;
        const entry: DayEntry = { kind: "calendar", event: ev, sortKey };
        const bucket = map.get(day);
        if (bucket) bucket.push(entry);
        else map.set(day, [entry]);
      }
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    }
    return map;
  }, [items, days, calendarByDay]);

  if (!items) {
    return <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;
  }

  const locale = i18n.language;
  const dayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const banner = (
    <HelpBanner
      storageKey="friendflow.banner.trip.itinerary"
      title={t("trips.itinerary.bannerTitle")}
    >
      {t("trips.itinerary.bannerBody")}
    </HelpBanner>
  );

  if (days.length === 0) {
    return (
      <div className="space-y-4">
        {banner}
        <div className="card p-8 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <h2 className="mt-3 text-lg font-semibold">
            {t("trips.itinerary.emptyTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("trips.itinerary.emptyHint")}
          </p>
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={() => setComposerDay(toIso(new Date()))}
          >
            <Plus className="h-4 w-4" />
            {t("trips.itinerary.addFirst")}
          </button>
          {composerDay && (
            <AddItineraryForm
              group={group}
              trip={trip}
              links={links}
              initialDay={composerDay}
              onDone={(created) => {
                setComposerDay(null);
                if (created) reload();
              }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {banner}
      {days.map((day) => {
        const entries = entriesByDay.get(day) ?? [];
        return (
          <section key={day}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {dayFormatter.format(new Date(day + "T00:00:00"))}
              </h3>
              <button
                type="button"
                className="btn-ghost text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
                onClick={() => setComposerDay(composerDay === day ? null : day)}
                aria-label={t("trips.itinerary.addForDay")}
                title={t("trips.itinerary.addForDay")}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {composerDay === day && (
              <AddItineraryForm
                group={group}
                trip={trip}
                links={links}
                initialDay={day}
                onDone={(created) => {
                  setComposerDay(null);
                  if (created) reload();
                }}
              />
            )}

            {entries.length === 0 ? (
              <p className="card p-4 text-sm text-slate-500 dark:text-slate-400">
                {t("trips.itinerary.dayEmpty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {entries.map((entry) =>
                  entry.kind === "trip" ? (
                    <ItineraryCard
                      key={"t-" + entry.item.id}
                      item={entry.item}
                      group={group}
                      trip={trip}
                      links={links}
                      onChanged={reload}
                    />
                  ) : (
                    <CalendarEntryCard
                      key={"c-" + entry.event.id + "-" + day}
                      event={entry.event}
                      groupId={group.id}
                      day={day}
                    />
                  ),
                )}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Read-only card for a calendar event that falls inside the trip window.
 * Users can click through to the calendar to edit; keeping edits in one
 * place avoids two-way sync pitfalls.
 */
function CalendarEntryCard({
  event,
  groupId,
  day,
}: {
  event: CalendarEvent;
  groupId: string;
  day: string;
}) {
  const { t } = useTranslation();
  const startDay = toDateKey(new Date(event.starts_at));
  const endDay = event.ends_at
    ? toDateKey(new Date(event.ends_at))
    : startDay;

  let timeLabel = "";
  if (event.all_day) {
    timeLabel = t("trips.itinerary.allDay");
  } else if (day === startDay && day === endDay) {
    timeLabel = event.ends_at
      ? `${formatTime(event.starts_at)} - ${formatTime(event.ends_at)}`
      : formatTime(event.starts_at);
  } else if (day === startDay) {
    timeLabel = `${formatTime(event.starts_at)} - …`;
  } else if (day === endDay && event.ends_at) {
    timeLabel = `… - ${formatTime(event.ends_at)}`;
  } else {
    timeLabel = t("trips.itinerary.allDay");
  }

  return (
    <li className="card space-y-2 border-dashed border-amber-300/70 bg-amber-50/40 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-start gap-2">
        <div className="w-20 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeLabel}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold leading-tight">{event.title}</h4>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              <CalendarClock className="h-3 w-3" />
              {t("trips.itinerary.fromCalendar")}
            </span>
          </div>
          {event.location && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <MapPin className="h-3 w-3" />
              {event.location}
            </p>
          )}
          {event.description && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
              {event.description}
            </p>
          )}
        </div>
        <Link
          to={`/groups/${groupId}/calendar`}
          className="btn-ghost -my-1 h-7 shrink-0 px-2 text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
          aria-label={t("trips.itinerary.openInCalendar")}
          title={t("trips.itinerary.openInCalendar")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </li>
  );
}

/** Returns the local `HH:MM:SS` component of an ISO timestamp. */
function extractLocalTime(iso: string, dayKey: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "99:99:99";
  if (toDateKey(d) !== dayKey) return "00:00:00";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ItineraryCard({
  item,
  group,
  trip,
  links,
  onChanged,
}: {
  item: TripItineraryItem;
  group: GroupDetail;
  trip: Trip;
  links: TripLink[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const timeLabel = formatTimeRange(item.start_time, item.end_time);

  async function onDelete() {
    const ok = await confirm({
      title: t("trips.itinerary.deleteTitle"),
      message: t("trips.itinerary.deleteConfirm", { title: item.title }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await tripsApi.deleteItinerary(group.id, trip.id, item.id);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  if (editing) {
    return (
      <li>
        <EditItineraryForm
          item={item}
          group={group}
          trip={trip}
          links={links}
          onDone={(changed) => {
            setEditing(false);
            if (changed) onChanged();
          }}
        />
      </li>
    );
  }

  return (
    <li className="card space-y-2 p-3">
      <div className="flex items-start gap-2">
        <div className="w-20 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
          {timeLabel ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeLabel}
            </span>
          ) : (
            <span className="italic text-slate-400 dark:text-slate-500">
              {t("trips.itinerary.allDay")}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold leading-tight">{item.title}</h4>
          {item.location && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <MapPin className="h-3 w-3" />
              {item.location}
            </p>
          )}
          {item.note && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {item.note}
            </p>
          )}
          {item.link_id && item.link_url && (
            <a
              href={item.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400"
            >
              <ExternalLink className="h-3 w-3" />
              {item.link_title ?? item.link_url}
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="btn-ghost -my-1 h-7 px-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            onClick={() => setEditing(true)}
            aria-label={t("common.edit")}
            title={t("common.edit")}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="btn-ghost -my-1 h-7 px-2 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
            onClick={onDelete}
            aria-label={t("common.delete")}
            title={t("common.delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

type ItineraryFormState = {
  day_date: string;
  title: string;
  start_time: string;
  end_time: string;
  location: string;
  note: string;
  link_id: string;
};

function emptyForm(initialDay: string): ItineraryFormState {
  return {
    day_date: initialDay,
    title: "",
    start_time: "",
    end_time: "",
    location: "",
    note: "",
    link_id: "",
  };
}

function AddItineraryForm({
  group,
  trip,
  links,
  initialDay,
  onDone,
}: {
  group: GroupDetail;
  trip: Trip;
  links: TripLink[];
  initialDay: string;
  onDone: (created: boolean) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState<ItineraryFormState>(() => emptyForm(initialDay));
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await tripsApi.createItinerary(group.id, trip.id, {
        day_date: form.day_date,
        title: form.title.trim(),
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location.trim(),
        note: form.note.trim(),
        link_id: form.link_id || null,
      });
      onDone(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-3 space-y-2 p-4">
      <ItineraryFieldset form={form} setForm={setForm} links={links} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => onDone(false)}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? t("common.saving") : t("trips.itinerary.add")}
        </button>
      </div>
    </form>
  );
}

function EditItineraryForm({
  item,
  group,
  trip,
  links,
  onDone,
}: {
  item: TripItineraryItem;
  group: GroupDetail;
  trip: Trip;
  links: TripLink[];
  onDone: (changed: boolean) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState<ItineraryFormState>({
    day_date: item.day_date,
    title: item.title,
    start_time: (item.start_time ?? "").slice(0, 5),
    end_time: (item.end_time ?? "").slice(0, 5),
    location: item.location,
    note: item.note,
    link_id: item.link_id ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await tripsApi.updateItinerary(group.id, trip.id, item.id, {
        day_date: form.day_date,
        title: form.title.trim(),
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location.trim(),
        note: form.note.trim(),
        link_id: form.link_id || null,
      });
      onDone(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-2 p-4">
      <ItineraryFieldset form={form} setForm={setForm} links={links} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => onDone(false)}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}

function ItineraryFieldset({
  form,
  setForm,
  links,
}: {
  form: ItineraryFormState;
  setForm: (f: ItineraryFormState) => void;
  links: TripLink[];
}) {
  const { t } = useTranslation();
  return (
    <>
      <input
        className="input"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        placeholder={t("trips.itinerary.titlePlaceholder")}
        maxLength={200}
        required
        autoFocus
      />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
        <input
          className="input"
          type="date"
          value={form.day_date}
          onChange={(e) => setForm({ ...form, day_date: e.target.value })}
          required
        />
        <input
          className="input"
          type="time"
          value={form.start_time}
          onChange={(e) => setForm({ ...form, start_time: e.target.value })}
          placeholder={t("trips.itinerary.startTime")}
        />
        <input
          className="input"
          type="time"
          value={form.end_time}
          onChange={(e) => setForm({ ...form, end_time: e.target.value })}
          placeholder={t("trips.itinerary.endTime")}
        />
      </div>
      <input
        className="input"
        value={form.location}
        onChange={(e) => setForm({ ...form, location: e.target.value })}
        placeholder={t("trips.itinerary.locationPlaceholder")}
        maxLength={200}
      />
      <textarea
        className="input min-h-[60px]"
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
        placeholder={t("trips.itinerary.notePlaceholder")}
        maxLength={2000}
      />
      <select
        className="input"
        value={form.link_id}
        onChange={(e) => setForm({ ...form, link_id: e.target.value })}
      >
        <option value="">{t("trips.itinerary.noLink")}</option>
        {links.map((l) => (
          <option key={l.id} value={l.id}>
            {l.title_override ?? l.title ?? l.url}
          </option>
        ))}
      </select>
    </>
  );
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTimeRange(
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
