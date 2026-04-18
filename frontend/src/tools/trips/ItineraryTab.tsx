import {
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
import { ApiError } from "../../api/client";
import type {
  GroupDetail,
  TripInfo,
  TripItineraryItem,
  TripLink,
} from "../../api/types";
import { useConfirm, useToast } from "../../ui/UIProvider";
import { tripsApi } from "./api";

/**
 * Itinerary tab. Items are grouped by day; inside each day the backend
 * already sorts by start_time (nulls last) then position, so we render in
 * arrival order.
 */
export default function ItineraryTab({ group }: { group: GroupDetail }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<TripItineraryItem[] | null>(null);
  const [info, setInfo] = useState<TripInfo | null>(null);
  const [links, setLinks] = useState<TripLink[]>([]);
  const [composerDay, setComposerDay] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([
      tripsApi.listItinerary(group.id),
      tripsApi.getInfo(group.id),
      tripsApi.list(group.id),
    ])
      .then(([its, i, ls]) => {
        setItems(its);
        setInfo(i);
        setLinks(ls);
      })
      .catch((e) =>
        toast.error(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [group.id, t, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * Build the list of days to render. Union of:
   *   - every day between start_date and end_date (if both set)
   *   - every unique day that already has an item
   * This way users with dates get the full skeleton; users without dates
   * only see the days they've actually added.
   */
  const days = useMemo(() => {
    const set = new Set<string>();
    if (info?.start_date && info?.end_date) {
      const start = new Date(info.start_date + "T00:00:00");
      const end = new Date(info.end_date + "T00:00:00");
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
  }, [info, items]);

  const byDay = useMemo(() => {
    const map = new Map<string, TripItineraryItem[]>();
    for (const it of items ?? []) {
      const bucket = map.get(it.day_date);
      if (bucket) bucket.push(it);
      else map.set(it.day_date, [it]);
    }
    return map;
  }, [items]);

  if (!items || !info) {
    return <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;
  }

  const locale = i18n.language;
  const dayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  if (days.length === 0) {
    return (
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
            links={links}
            initialDay={composerDay}
            onDone={(created) => {
              setComposerDay(null);
              if (created) reload();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {days.map((day) => {
        const dayItems = byDay.get(day) ?? [];
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
                links={links}
                initialDay={day}
                onDone={(created) => {
                  setComposerDay(null);
                  if (created) reload();
                }}
              />
            )}

            {dayItems.length === 0 ? (
              <p className="card p-4 text-sm text-slate-500 dark:text-slate-400">
                {t("trips.itinerary.dayEmpty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {dayItems.map((item) => (
                  <ItineraryCard
                    key={item.id}
                    item={item}
                    group={group}
                    links={links}
                    onChanged={reload}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ItineraryCard({
  item,
  group,
  links,
  onChanged,
}: {
  item: TripItineraryItem;
  group: GroupDetail;
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
      await tripsApi.deleteItinerary(group.id, item.id);
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
  links,
  initialDay,
  onDone,
}: {
  group: GroupDetail;
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
      await tripsApi.createItinerary(group.id, {
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
  links,
  onDone,
}: {
  item: TripItineraryItem;
  group: GroupDetail;
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
      await tripsApi.updateItinerary(group.id, item.id, {
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
