import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import type {
  CalendarCategory,
  CalendarEvent,
  GroupSummary,
  Trip,
  TripItineraryItem,
} from "../../api/types";
import MonthCalendar, { type DayBadge } from "../../components/MonthCalendar";
import {
  addDays,
  formatDayLong,
  isSameDay,
  startOfDay,
  startOfMonth,
  toDateKey,
} from "../../lib/date";
import { formatDateTime, formatTime } from "../../lib/format";
import { useConfirm, useToast } from "../../ui/UIProvider";
import {
  calendarApi,
  CATEGORY_PALETTE,
  type CalendarScope,
} from "./api";

type View = "agenda" | "month" | "day";

export interface CalendarViewProps {
  /** Default scope used for creating new events. */
  scope: CalendarScope;
  title: string;
  subtitle?: string | null;
  /** Optional "back" link above the header. */
  backLink?: { to: string; label: string } | null;
  events: CalendarEvent[];
  categories: CalendarCategory[];
  /** Trip itinerary overlay. Pass [] for personal scope (no trips). */
  tripItems?: TripItineraryItem[];
  tripsById?: Map<string, Trip>;
  /** Lookup from group id to its summary. Used to render a group badge
   *  and a deep link when a group event shows up in a personal view. */
  groupsById?: Map<string, GroupSummary>;
  /** Optional toggle for the cross-scope overlay: "show personal events"
   *  in a group view or "show group events" in the personal view. */
  overlayToggle?: {
    enabled: boolean;
    onToggle: () => void;
    label: string;
  } | null;
  onEventsChanged: () => void;
  onCategoriesChanged: () => void;
}

/**
 * Every event we render carries back its own scope so mutations hit the
 * right API, even for personal events that are only visible as an
 * overlay inside a group calendar.
 */
function scopeForEvent(
  event: CalendarEvent,
  defaultScope: CalendarScope,
): CalendarScope {
  if (event.owner_user_id) return { kind: "personal" };
  if (event.group_id) return { kind: "group", groupId: event.group_id };
  return defaultScope;
}

function isPersonalEvent(event: CalendarEvent): boolean {
  return event.owner_user_id !== null;
}

/** True when the event belongs to a scope different from the page's
 *  default scope (e.g. a group event showing up inside the personal
 *  calendar). Such events are rendered read-only, with a link to their
 *  own calendar, because the local categories wouldn't match their
 *  scope and we don't want to edit-through across scopes. */
function isCrossScope(event: CalendarEvent, pageScope: CalendarScope): boolean {
  const eventScope = scopeForEvent(event, pageScope);
  return eventScope.kind !== pageScope.kind;
}

function groupHomeLink(event: CalendarEvent): string | null {
  if (!event.group_id) return null;
  return `/groups/${event.group_id}/calendar`;
}

export default function CalendarView({
  scope,
  title,
  subtitle,
  backLink,
  events,
  categories,
  tripItems = [],
  tripsById = new Map(),
  groupsById = new Map(),
  overlayToggle,
  onEventsChanged,
  onCategoriesChanged,
}: CalendarViewProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("month");
  const [visibleMonth, setVisibleMonth] = useState<Date>(() =>
    startOfMonth(new Date()),
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dayViewDate, setDayViewDate] = useState<Date>(() => startOfDay(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [formDefaults, setFormDefaults] = useState<{ date?: string } | null>(
    null,
  );
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  // null = show all; Set of category ids (or "__none__" for uncategorized).
  const [filter, setFilter] = useState<Set<string> | null>(null);

  const filteredEvents = useMemo(() => {
    if (!filter) return events;
    return events.filter((ev) => {
      const key = ev.category?.id ?? "__none__";
      return filter.has(key);
    });
  }, [events, filter]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up: CalendarEvent[] = [];
    const pa: CalendarEvent[] = [];
    for (const ev of filteredEvents) {
      const end = ev.ends_at
        ? new Date(ev.ends_at).getTime()
        : new Date(ev.starts_at).getTime();
      if (end >= now) up.push(ev);
      else pa.push(ev);
    }
    pa.reverse();
    return { upcoming: up, past: pa };
  }, [filteredEvents]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of filteredEvents) {
      const start = startOfDay(new Date(ev.starts_at));
      const end = ev.ends_at ? startOfDay(new Date(ev.ends_at)) : start;
      let cursor = start;
      let guard = 0;
      while (cursor.getTime() <= end.getTime() && guard < 60) {
        const key = toDateKey(cursor);
        (map[key] ??= []).push(ev);
        cursor = addDays(cursor, 1);
        guard++;
      }
    }
    return map;
  }, [filteredEvents]);

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
        accent: categoryAccentClass(e),
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
    // Cross-scope events (e.g. a group event in the personal view)
    // aren't edited inline; the caller is responsible for routing to
    // the event's home calendar. Guarded here so any stray code path
    // stays harmless.
    if (isCrossScope(ev, scope)) return;
    setEditing(ev);
    setFormDefaults(null);
    setShowForm(true);
  }

  // When editing, the form talks to the event's own scope; when creating,
  // the page's default scope applies.
  const formScope = editing ? scopeForEvent(editing, scope) : scope;
  // The categories a new/edited event may pick from must match its scope.
  // If editing a personal event inside a group page, filter categories
  // accordingly - but since the parent only loads in-scope categories,
  // personal-overlay events end up with an empty list here. That's ok,
  // the user can still clear or keep the current category.
  const formCategories = editing && isPersonalEvent(editing) !== (scope.kind === "personal")
    ? []
    : categories;

  // Counts per filter bucket so we can render informative chips.
  const counts = useMemo(() => {
    const byId: Record<string, number> = {};
    let none = 0;
    for (const ev of events) {
      if (ev.category) byId[ev.category.id] = (byId[ev.category.id] ?? 0) + 1;
      else none++;
    }
    return { byId, none, total: events.length };
  }, [events]);

  function toggleFilter(key: string) {
    setFilter((prev) => {
      const next = new Set(prev ?? new Set<string>());
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) return null;
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        {backLink && (
          <Link
            to={backLink.to}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" /> {backLink.label}
          </Link>
        )}
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {title}
            </h1>
            {subtitle && (
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}
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

      {/* Category chips + manager */}
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip
          active={filter === null}
          onClick={() => setFilter(null)}
          label={t("calendar.categories.filterAll", {
            count: counts.total,
          })}
        />
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            active={filter?.has(c.id) ?? false}
            color={c.color}
            label={`${c.name} (${counts.byId[c.id] ?? 0})`}
            onClick={() => toggleFilter(c.id)}
          />
        ))}
        {counts.none > 0 && (
          <CategoryChip
            active={filter?.has("__none__") ?? false}
            label={t("calendar.categories.uncategorized", {
              count: counts.none,
            })}
            onClick={() => toggleFilter("__none__")}
          />
        )}
        <button
          type="button"
          className="btn-ghost -my-1 text-xs"
          onClick={() => setShowCategoryManager(true)}
        >
          <Settings className="h-3.5 w-3.5" />
          {t("calendar.categories.manage")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-slate-900">
          <ViewTab
            active={view === "agenda"}
            label={t("calendar.overview.viewAgenda")}
            onClick={() => setView("agenda")}
          />
          <ViewTab
            active={view === "day"}
            label={t("calendar.overview.viewDay")}
            onClick={() => setView("day")}
          />
          <ViewTab
            active={view === "month"}
            label={t("calendar.overview.viewMonth")}
            onClick={() => setView("month")}
          />
        </div>
        {overlayToggle && (
          <button
            type="button"
            className="btn-ghost -my-1 text-xs"
            onClick={overlayToggle.onToggle}
            aria-pressed={overlayToggle.enabled}
            title={overlayToggle.label}
          >
            {overlayToggle.enabled ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            {overlayToggle.label}
          </button>
        )}
      </div>

      {showForm && (
        <EventForm
          scope={formScope}
          event={editing}
          defaults={formDefaults}
          categories={formCategories}
          onDone={(changed) => {
            setShowForm(false);
            setEditing(null);
            setFormDefaults(null);
            if (changed) onEventsChanged();
          }}
        />
      )}

      {showCategoryManager && (
        <CategoryManager
          scope={scope}
          categories={categories}
          onClose={() => setShowCategoryManager(false)}
          onChanged={() => {
            onCategoriesChanged();
            // Events embed their category; reload so chips reflect renames.
            onEventsChanged();
          }}
        />
      )}

      {view === "agenda" ? (
        filteredEvents.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <EventSection
              title={t("calendar.overview.upcoming")}
              events={upcoming}
              pageScope={scope}
              groupsById={groupsById}
              onChanged={onEventsChanged}
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
                    pageScope={scope}
                    groupsById={groupsById}
                    onChanged={onEventsChanged}
                    onEdit={openEdit}
                    empty=""
                    dim
                  />
                </div>
              </details>
            )}
          </>
        )
      ) : view === "day" ? (
        <DayPanel
          date={dayViewDate}
          onDateChange={setDayViewDate}
          events={eventsByDay[toDateKey(dayViewDate)] ?? []}
          tripItems={tripItemsByDay[toDateKey(dayViewDate)] ?? []}
          tripsById={tripsById}
          pageScope={scope}
          onAdd={() => openCreateForDay(dayViewDate)}
          onEdit={openEdit}
        />
      ) : (
        <div className="card p-3 sm:p-5">
          <MonthCalendar
            month={visibleMonth}
            onMonthChange={setVisibleMonth}
            selected={selectedDay}
            onSelectDay={(d) => setSelectedDay(d)}
            badgesByDay={badgesByDay}
            ariaLabel={title}
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
                        pageScope={scope}
                        groupsById={groupsById}
                        onChanged={onEventsChanged}
                        onEdit={() => openEdit(ev)}
                        dim={false}
                        anchorDay={selectedDay}
                      />
                    ))}
                    {dayTripItems.map((it) => (
                      <TripEntryCard
                        key={"trip-" + it.id}
                        item={it}
                        groupTripLink={
                          scope.kind === "group" ? scope.groupId : null
                        }
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

// ---------- Category chip ----------

function CategoryChip({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
        active
          ? "border-brand-500 bg-brand-50 text-brand-800 dark:border-brand-500 dark:bg-brand-900/30 dark:text-brand-100"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
      ].join(" ")}
    >
      {color && (
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </button>
  );
}

// ---------- Category manager modal ----------

function CategoryManager({
  scope,
  categories,
  onClose,
  onChanged,
}: {
  scope: CalendarScope;
  categories: CalendarCategory[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(CATEGORY_PALETTE[0]);
  const [busy, setBusy] = useState(false);

  async function createOne(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await calendarApi.createCategory(scope, { name, color: newColor });
      setNewName("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function updateOne(c: CalendarCategory, patch: { name?: string; color?: string }) {
    try {
      await calendarApi.updateCategory(scope, c.id, patch);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    }
  }

  async function deleteOne(c: CalendarCategory) {
    const ok = await confirm({
      title: t("calendar.categories.deleteTitle"),
      message: t("calendar.categories.deleteConfirm", { name: c.name }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await calendarApi.removeCategory(scope, c.id);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="card w-full max-w-lg space-y-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{t("calendar.categories.title")}</h3>
          <button
            type="button"
            className="btn-ghost -my-1"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={createOne} className="space-y-2">
          <label className="label" htmlFor="cat_new_name">
            {t("calendar.categories.add")}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="cat_new_name"
              className="input flex-1"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("calendar.categories.name")}
              maxLength={60}
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <button
              type="submit"
              className="btn-primary"
              disabled={busy || newName.trim().length === 0}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </form>

        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {categories.length === 0 && (
            <li className="py-4 text-sm text-slate-500 dark:text-slate-400">
              {t("calendar.categories.none")}
            </li>
          )}
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              onRename={(name) => updateOne(c, { name })}
              onRecolor={(color) => updateOne(c, { color })}
              onDelete={() => deleteOne(c)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  onRename,
  onRecolor,
  onDelete,
}: {
  category: CalendarCategory;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);

  return (
    <li className="flex items-center gap-2 py-2">
      <ColorPicker value={color} onChange={(c) => { setColor(c); onRecolor(c); }} />
      <input
        className="input flex-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim();
          if (trimmed && trimmed !== category.name) onRename(trimmed);
          else setName(category.name);
        }}
        maxLength={60}
      />
      <button
        type="button"
        className="btn-ghost -my-1 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
        onClick={onDelete}
        aria-label={t("common.delete")}
        title={t("common.delete")}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {CATEGORY_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          aria-pressed={value.toLowerCase() === c}
          className={[
            "h-6 w-6 rounded-full border transition",
            value.toLowerCase() === c
              ? "border-slate-900 dark:border-white"
              : "border-transparent",
          ].join(" ")}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

// ---------- View helpers ----------

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
  pageScope,
  groupsById,
  onChanged,
  onEdit,
  empty,
  dim = false,
}: {
  title: string;
  events: CalendarEvent[];
  pageScope: CalendarScope;
  groupsById: Map<string, GroupSummary>;
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
              pageScope={pageScope}
              groupsById={groupsById}
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
  pageScope,
  groupsById,
  onChanged,
  onEdit,
  dim,
  anchorDay,
}: {
  event: CalendarEvent;
  pageScope: CalendarScope;
  groupsById: Map<string, GroupSummary>;
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
  const personal = isPersonalEvent(event);
  const crossScope = isCrossScope(event, pageScope);
  const groupName = event.group_id
    ? groupsById.get(event.group_id)?.name ?? null
    : null;
  const groupHref = groupHomeLink(event);

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
        ? `${formatTime(event.starts_at)} \u2013 ${formatTime(event.ends_at!)}`
        : formatTime(event.starts_at);
    } else if (startsToday) {
      when = `${formatTime(event.starts_at)} \u2013 ...`;
    } else if (endsToday && endDate) {
      when = `... \u2013 ${formatTime(event.ends_at!)}`;
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
    when = `${startText}${endText ? ` \u2013 ${endText}` : ""}`;
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
      await calendarApi.removeEvent(scopeForEvent(event, pageScope), event.id);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={[
        "card p-4",
        dim ? "opacity-70" : "",
        personal ? "border-dashed border-violet-400/60" : "",
        crossScope ? "border-dashed border-sky-300/70 bg-sky-50/30 dark:bg-sky-950/10" : "",
      ].join(" ")}
      style={
        event.category
          ? { boxShadow: `inset 4px 0 0 0 ${event.category.color}` }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-brand-700 dark:text-brand-300">
            <CalendarClock className="h-3.5 w-3.5" />
            <span>{when}</span>
            {event.all_day && !anchorDay && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {t("calendar.overview.allDay")}
              </span>
            )}
            {event.category && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                style={{ backgroundColor: event.category.color }}
              >
                {event.category.name}
              </span>
            )}
            {personal && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
                <Lock className="h-3 w-3" />
                {t("calendar.overview.personalBadge")}
              </span>
            )}
            {crossScope && groupName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                {t("calendar.overview.fromGroup", { name: groupName })}
              </span>
            )}
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
          {crossScope && groupHref ? (
            <Link
              to={groupHref}
              className="btn-ghost -my-1"
              aria-label={t("calendar.overview.openInGroup")}
              title={t("calendar.overview.openInGroup")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function TripEntryCard({
  item,
  groupTripLink,
  tripName,
}: {
  item: TripItineraryItem;
  groupTripLink: string | null;
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
            <span>{timeLabel || t("calendar.overview.allDay")}</span>
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
        {groupTripLink && (
          <Link
            to={`/groups/${groupTripLink}/trips/${item.trip_id}`}
            className="btn-ghost -my-1 shrink-0 text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
            aria-label={t("calendar.overview.openInTrip")}
            title={t("calendar.overview.openInTrip")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
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

// ---------- Day view ----------

function DayPanel({
  date,
  onDateChange,
  events,
  tripItems,
  tripsById,
  pageScope,
  onAdd,
  onEdit,
}: {
  date: Date;
  onDateChange: (d: Date) => void;
  events: CalendarEvent[];
  tripItems: TripItineraryItem[];
  tripsById: Map<string, Trip>;
  pageScope: CalendarScope;
  onAdd: () => void;
  onEdit: (ev: CalendarEvent) => void;
}) {
  const groupTripLink = pageScope.kind === "group" ? pageScope.groupId : null;
  const { t } = useTranslation();

  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);

  const allDayEvents: CalendarEvent[] = [];
  const timedEvents: CalendarEvent[] = [];
  for (const ev of events) {
    const sd = new Date(ev.starts_at);
    const ed = ev.ends_at ? new Date(ev.ends_at) : sd;
    const startsBefore = sd.getTime() < dayStart.getTime();
    const endsAfter = ed.getTime() >= dayEnd.getTime();
    if (ev.all_day || startsBefore || endsAfter) {
      allDayEvents.push(ev);
    } else {
      timedEvents.push(ev);
    }
  }
  timedEvents.sort(
    (a, b) =>
      new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  const allDayTrips: TripItineraryItem[] = [];
  const timedTrips: TripItineraryItem[] = [];
  for (const it of tripItems) {
    if (it.start_time) timedTrips.push(it);
    else allDayTrips.push(it);
  }

  const HOUR_PX = 48;
  const START_HOUR = 0;
  const END_HOUR = 24;
  const hours: number[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) hours.push(h);

  function minutesSinceDayStart(d: Date): number {
    const diff = (d.getTime() - dayStart.getTime()) / 60000;
    return Math.max(0, Math.min(24 * 60, diff));
  }

  function parseTime(s: string): number {
    const m = /^(\d{2}):(\d{2})/.exec(s);
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  const gridHeight = (END_HOUR - START_HOUR) * HOUR_PX;

  return (
    <div className="card p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost -my-1"
            onClick={() => onDateChange(addDays(date, -1))}
            aria-label={t("calendar.overview.prevDay")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="text-sm font-semibold sm:text-base">
            {formatDayLong(date)}
          </h3>
          <button
            type="button"
            className="btn-ghost -my-1"
            onClick={() => onDateChange(addDays(date, 1))}
            aria-label={t("calendar.overview.nextDay")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn-ghost -my-1 ml-1 text-xs"
            onClick={() => onDateChange(startOfDay(new Date()))}
          >
            {t("calendar.grid.today")}
          </button>
        </div>
        <button type="button" className="btn-secondary" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {t("calendar.overview.add")}
        </button>
      </div>

      {(allDayEvents.length > 0 || allDayTrips.length > 0) && (
        <div className="mb-3 space-y-1 border-b border-slate-100 pb-3 dark:border-slate-800">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("calendar.overview.allDay")}
          </p>
          {allDayEvents.map((ev) => {
            const cross = isCrossScope(ev, pageScope);
            const href = cross ? groupHomeLink(ev) : null;
            const style = {
              backgroundColor: ev.category?.color ?? "#6366f1",
            } as const;
            const inner = (
              <>
                {isPersonalEvent(ev) && (
                  <Lock className="mr-1 inline h-3 w-3" />
                )}
                {ev.title}
              </>
            );
            if (cross && href) {
              return (
                <Link
                  key={ev.id}
                  to={href}
                  className="block w-full truncate rounded px-2 py-1 text-left text-xs font-medium text-white hover:brightness-110"
                  style={style}
                  title={ev.title}
                >
                  {inner}
                </Link>
              );
            }
            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => onEdit(ev)}
                className="block w-full truncate rounded px-2 py-1 text-left text-xs font-medium text-white hover:brightness-110"
                style={style}
                title={ev.title}
              >
                {inner}
              </button>
            );
          })}
          {allDayTrips.map((it) => (
            <div
              key={"trip-" + it.id}
              className="truncate rounded border border-sky-300/70 bg-sky-50/70 px-2 py-1 text-xs font-medium text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200"
              title={it.title}
            >
              <Plane className="mr-1 inline h-3 w-3" />
              {it.title}
            </div>
          ))}
        </div>
      )}

      {timedEvents.length === 0 &&
      timedTrips.length === 0 &&
      allDayEvents.length === 0 &&
      allDayTrips.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t("calendar.overview.dayEmpty")}
        </p>
      ) : (
        <div className="relative overflow-hidden rounded-lg border border-slate-100 dark:border-slate-800">
          <div className="relative" style={{ height: `${gridHeight}px` }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 flex border-t border-slate-100 dark:border-slate-800"
                style={{ top: `${(h - START_HOUR) * HOUR_PX}px` }}
              >
                <div className="w-12 shrink-0 -translate-y-2 pl-2 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                  {h < 24 ? `${String(h).padStart(2, "0")}:00` : ""}
                </div>
              </div>
            ))}

            <div className="absolute inset-y-0 left-12 right-0">
              {timedEvents.map((ev) => {
                const sd = new Date(ev.starts_at);
                const ed = ev.ends_at ? new Date(ev.ends_at) : sd;
                const top =
                  (minutesSinceDayStart(sd) / 60) * HOUR_PX -
                  START_HOUR * HOUR_PX;
                const height = Math.max(
                  18,
                  ((minutesSinceDayStart(ed) - minutesSinceDayStart(sd)) / 60) *
                    HOUR_PX,
                );
                const personal = isPersonalEvent(ev);
                const cross = isCrossScope(ev, pageScope);
                const href = cross ? groupHomeLink(ev) : null;
                const bg = ev.category?.color ?? "#6366f1";
                const blockClass = [
                  "absolute left-1 right-1 overflow-hidden rounded px-2 py-1 text-left text-xs text-white shadow-sm hover:brightness-110",
                  personal ? "border border-dashed border-white/60" : "",
                  cross ? "border border-dashed border-white/60" : "",
                ].join(" ");
                const blockStyle = {
                  top: `${top}px`,
                  height: `${height}px`,
                  backgroundColor: bg,
                } as const;
                const inner = (
                  <>
                    <span className="flex items-center gap-1 font-semibold">
                      {personal && <Lock className="h-3 w-3" />}
                      {formatTime(ev.starts_at)}
                      {ev.ends_at ? ` \u2013 ${formatTime(ev.ends_at)}` : ""}
                    </span>
                    <span className="block truncate">{ev.title}</span>
                    {ev.location && (
                      <span className="block truncate text-[10px] opacity-80">
                        {ev.location}
                      </span>
                    )}
                  </>
                );
                if (cross && href) {
                  return (
                    <Link
                      key={ev.id}
                      to={href}
                      className={blockClass}
                      style={blockStyle}
                      title={ev.title}
                    >
                      {inner}
                    </Link>
                  );
                }
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onEdit(ev)}
                    className={blockClass}
                    style={blockStyle}
                    title={ev.title}
                  >
                    {inner}
                  </button>
                );
              })}
              {timedTrips.map((it) => {
                const startMin = parseTime(it.start_time ?? "00:00");
                const endMin = it.end_time
                  ? parseTime(it.end_time)
                  : startMin + 60;
                const top = (startMin / 60) * HOUR_PX - START_HOUR * HOUR_PX;
                const height = Math.max(18, ((endMin - startMin) / 60) * HOUR_PX);
                const trip = tripsById.get(it.trip_id);
                const tripUrl = groupTripLink
                  ? `/groups/${groupTripLink}/trips/${it.trip_id}`
                  : "#";
                return (
                  <Link
                    key={"trip-" + it.id}
                    to={tripUrl}
                    className="absolute left-1 right-1 overflow-hidden rounded border border-sky-300 bg-sky-50/90 px-2 py-1 text-left text-xs text-sky-900 shadow-sm hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-100"
                    style={{ top: `${top}px`, height: `${height}px` }}
                    title={it.title}
                  >
                    <span className="block font-semibold">
                      <Plane className="mr-1 inline h-3 w-3" />
                      {it.start_time?.slice(0, 5)}
                      {it.end_time ? ` \u2013 ${it.end_time.slice(0, 5)}` : ""}
                    </span>
                    <span className="block truncate">{it.title}</span>
                    {trip && (
                      <span className="block truncate text-[10px] opacity-80">
                        {trip.name}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Event form ----------

function EventForm({
  scope,
  event,
  defaults,
  categories,
  onDone,
}: {
  scope: CalendarScope;
  event: CalendarEvent | null;
  defaults: { date?: string } | null;
  categories: CalendarCategory[];
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
  const [categoryId, setCategoryId] = useState<string>(
    event?.category?.id ?? "",
  );
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
        category_id: categoryId || null,
      };
      if (event) {
        await calendarApi.updateEvent(scope, event.id, payload);
      } else {
        await calendarApi.createEvent(scope, payload);
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
          <input
            id="ev_start_date"
            type="date"
            required
            className="input tabular-nums"
            value={startDate}
            aria-label={t("calendar.overview.startDate")}
            onChange={(e) => {
              const v = e.target.value;
              setStartDate(v);
              if (endDate && v && endDate < v) setEndDate(v);
            }}
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
          <input
            id="ev_end_date"
            type="date"
            className="input tabular-nums"
            value={endDate}
            min={startDate || undefined}
            aria-label={t("calendar.overview.endDate")}
            placeholder={t("calendar.overview.endOptional")}
            onChange={(e) => setEndDate(e.target.value)}
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
        <label className="label" htmlFor="ev_category">
          {t("calendar.categories.title")}
        </label>
        <select
          id="ev_category"
          className="input"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">{t("calendar.categories.unassigned")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

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

/** Tailwind bg class chosen for a MonthCalendar badge based on the
 *  event's category color. We fall back to the brand accent for
 *  uncategorized events and tint personal events violet so the overlay
 *  stays visually distinct in the 3-badge preview. */
function categoryAccentClass(e: CalendarEvent): string {
  // MonthCalendar only supports a Tailwind class, not an arbitrary hex;
  // map the palette onto the closest preset. Staying approximate keeps
  // the month cells tidy without bleeding inline styles into them.
  if (isPersonalEvent(e)) return "bg-violet-500";
  const c = e.category?.color?.toLowerCase();
  switch (c) {
    case "#ef4444":
      return "bg-red-500";
    case "#f97316":
      return "bg-orange-500";
    case "#eab308":
      return "bg-yellow-500";
    case "#22c55e":
      return "bg-green-500";
    case "#14b8a6":
      return "bg-teal-500";
    case "#0ea5e9":
      return "bg-sky-500";
    case "#6366f1":
      return "bg-indigo-500";
    case "#a855f7":
      return "bg-purple-500";
    case "#ec4899":
      return "bg-pink-500";
    case "#64748b":
      return "bg-slate-500";
    default:
      return "bg-brand-500";
  }
}
