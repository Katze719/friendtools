import {
  Backpack,
  Check,
  GripVertical,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api/client";
import type { GroupDetail, Trip, TripPackingItem } from "../../api/types";
import { useConfirm, useToast } from "../../ui/UIProvider";
import HelpBanner from "../../components/HelpBanner";
import LoadingState from "../../components/LoadingState";
import { tripsApi } from "./api";

/**
 * Curated list of "usual suspects" for a packing list. Each entry references
 * i18n keys under `trips.packing.catalog.categories` and
 * `trips.packing.catalog.items`, so the labels stay translatable without
 * bloating the UI code.
 */
const PACKING_CATALOG: { category: string; items: string[] }[] = [
  {
    category: "documents",
    items: [
      "passport",
      "idCard",
      "drivingLicense",
      "insuranceCard",
      "vaccinationRecord",
      "tickets",
      "bookingConfirmations",
      "cash",
      "creditCard",
      "emergencyContacts",
    ],
  },
  {
    category: "electronics",
    items: [
      "phoneCharger",
      "chargingCable",
      "powerbank",
      "headphones",
      "travelAdapter",
      "camera",
      "laptop",
      "laptopCharger",
      "ereader",
    ],
  },
  {
    category: "toiletries",
    items: [
      "toothbrush",
      "toothpaste",
      "shampoo",
      "showerGel",
      "deodorant",
      "razor",
      "towel",
      "brush",
      "sunscreen",
      "periodProducts",
      "contactLenses",
      "toiletryBag",
    ],
  },
  {
    category: "health",
    items: [
      "painkillers",
      "plasters",
      "personalMeds",
      "insectRepellent",
      "handSanitiser",
    ],
  },
  {
    category: "clothing",
    items: [
      "socks",
      "underwear",
      "tshirts",
      "trousers",
      "sweater",
      "rainJacket",
      "pyjamas",
      "sneakers",
    ],
  },
  {
    category: "outdoor",
    items: [
      "flashlight",
      "pocketKnife",
      "waterBottle",
      "lighter",
      "trashBags",
    ],
  },
  {
    category: "beach",
    items: [
      "swimwear",
      "flipflops",
      "beachTowel",
      "sunglasses",
      "hat",
    ],
  },
  {
    category: "winter",
    items: [
      "winterJacket",
      "gloves",
      "scarf",
      "beanie",
      "thermalLayer",
    ],
  },
  {
    category: "misc",
    items: [
      "sleepMask",
      "earplugs",
      "reusableBag",
      "book",
      "snacks",
    ],
  },
];

/**
 * Simple reorderable checklist. Categories are free-text (optional) so users
 * never have to pick from a fixed list, matching the "optional everything"
 * philosophy.
 */
export default function PackingTab({
  group,
  trip,
}: {
  group: GroupDetail;
  trip: Trip;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<TripPackingItem[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);

  const reload = useCallback(() => {
    tripsApi
      .listPacking(group.id, trip.id)
      .then(setItems)
      .catch((e) =>
        toast.error(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [group.id, trip.id, t, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const byCategory = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, TripPackingItem[]>();
    for (const item of items) {
      const key = item.category.trim() || "";
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return Array.from(map.entries());
  }, [items]);

  const progress = useMemo(() => {
    if (!items || items.length === 0) return null;
    const done = items.filter((i) => i.is_packed).length;
    return { done, total: items.length, pct: Math.round((done / items.length) * 100) };
  }, [items]);

  if (!items) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-4">
      <HelpBanner
        storageKey="friendflow.banner.trip.packing"
        title={t("trips.packing.bannerTitle")}
      >
        {t("trips.packing.bannerBody")}
      </HelpBanner>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("trips.packing.title")}</h2>
          {progress ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("trips.packing.progress", {
                done: progress.done,
                total: progress.total,
                pct: progress.pct,
              })}
            </p>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("trips.packing.empty")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setShowCatalog((v) => !v)}
            aria-expanded={showCatalog}
          >
            <Sparkles className="h-4 w-4" />
            {showCatalog
              ? t("trips.packing.catalog.close")
              : t("trips.packing.catalog.open")}
          </button>
          <button className="btn-primary" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="h-4 w-4" />
            {t("trips.packing.add")}
          </button>
        </div>
      </div>

      {progress && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      )}

      {showAdd && (
        <AddPackingForm
          group={group}
          trip={trip}
          existing={items}
          onDone={(created) => {
            setShowAdd(false);
            if (created) reload();
          }}
        />
      )}

      {showCatalog && (
        <PackingCatalog
          group={group}
          trip={trip}
          existing={items}
          onAdded={(item) =>
            setItems((prev) => (prev ? [...prev, item] : [item]))
          }
        />
      )}

      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <Backpack className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {t("trips.packing.emptyHint")}
          </p>
        </div>
      ) : (
        <PackingList
          items={items}
          groupedByCategory={byCategory}
          group={group}
          trip={trip}
          onChange={setItems}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function PackingList({
  items,
  groupedByCategory,
  group,
  trip,
  onChange,
  onChanged,
}: {
  items: TripPackingItem[];
  groupedByCategory: [string, TripPackingItem[]][];
  group: GroupDetail;
  trip: Trip;
  onChange: (items: TripPackingItem[]) => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const dragFrom = useRef<string | null>(null);

  async function commitReorder(nextItems: TripPackingItem[]) {
    const prevItems = items;
    onChange(nextItems);
    try {
      const result = await tripsApi.reorderPacking(
        group.id,
        trip.id,
        nextItems.map((i) => i.id),
      );
      onChange(result);
    } catch (e) {
      onChange(prevItems);
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  function onDragStart(id: string) {
    dragFrom.current = id;
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  async function onDropOn(overId: string) {
    const fromId = dragFrom.current;
    dragFrom.current = null;
    if (!fromId || fromId === overId) return;

    const fromIdx = items.findIndex((i) => i.id === fromId);
    const toIdx = items.findIndex((i) => i.id === overId);
    if (fromIdx < 0 || toIdx < 0) return;

    const next = items.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    await commitReorder(next);
  }

  async function onToggle(item: TripPackingItem) {
    const optimistic = items.map((i) =>
      i.id === item.id ? { ...i, is_packed: !i.is_packed } : i,
    );
    onChange(optimistic);
    try {
      const updated = await tripsApi.togglePacking(group.id, trip.id, item.id);
      onChange(items.map((i) => (i.id === updated.id ? updated : i)));
    } catch (e) {
      onChange(items);
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  async function onDelete(item: TripPackingItem) {
    const ok = await confirm({
      title: t("trips.packing.deleteTitle"),
      message: t("trips.packing.deleteConfirm", { name: item.name }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await tripsApi.deletePacking(group.id, trip.id, item.id);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  return (
    <div className="space-y-6">
      {groupedByCategory.map(([category, bucket]) => (
        <section key={category || "__none__"}>
          {groupedByCategory.length > 1 && (
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {category || t("trips.packing.categoryNone")}
            </h3>
          )}
          <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
            {bucket.map((item) => (
              <PackingRow
                key={item.id}
                item={item}
                group={group}
                trip={trip}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDropOn={onDropOn}
                onToggle={onToggle}
                onDelete={onDelete}
                onReload={onChanged}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PackingRow({
  item,
  group,
  trip,
  onDragStart,
  onDragOver,
  onDropOn,
  onToggle,
  onDelete,
  onReload,
}: {
  item: TripPackingItem;
  group: GroupDetail;
  trip: Trip;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDropOn: (id: string) => void;
  onToggle: (item: TripPackingItem) => void;
  onDelete: (item: TripPackingItem) => void;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);

  return (
    <li
      className={`flex items-center gap-2 px-3 py-2 ${
        item.is_packed ? "opacity-60" : ""
      }`}
      draggable
      onDragStart={() => onDragStart(item.id)}
      onDragOver={onDragOver}
      onDrop={() => onDropOn(item.id)}
    >
      <GripVertical
        className="h-4 w-4 shrink-0 cursor-grab text-slate-300 dark:text-slate-600"
        aria-hidden
      />
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-brand-500 focus:ring-brand-400 dark:border-slate-600"
        checked={item.is_packed}
        onChange={() => onToggle(item)}
        aria-label={
          item.is_packed
            ? t("trips.packing.markUnpacked")
            : t("trips.packing.markPacked")
        }
      />
      {editing ? (
        <EditPackingInline
          item={item}
          group={group}
          trip={trip}
          onDone={(changed) => {
            setEditing(false);
            if (changed) onReload();
          }}
        />
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
          onClick={() => setEditing(true)}
        >
          <span
            className={`truncate ${
              item.is_packed ? "line-through" : ""
            }`}
          >
            {item.name}
          </span>
          {item.quantity && (
            <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
              ×{item.quantity}
            </span>
          )}
          {item.assigned_to_display_name && (
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
              {item.assigned_to_display_name}
            </span>
          )}
        </button>
      )}
      {!editing && (
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
            onClick={() => onDelete(item)}
            aria-label={t("common.delete")}
            title={t("common.delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

function EditPackingInline({
  item,
  group,
  trip,
  onDone,
}: {
  item: TripPackingItem;
  group: GroupDetail;
  trip: Trip;
  onDone: (changed: boolean) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [category, setCategory] = useState(item.category);
  const [assignee, setAssignee] = useState(item.assigned_to ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await tripsApi.updatePacking(group.id, trip.id, item.id, {
        name: trimmed,
        quantity: quantity.trim(),
        category: category.trim(),
        assigned_to: assignee === "" ? null : assignee,
      });
      onDone(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <input
        className="input h-8 min-w-0 flex-1 py-1 text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={200}
        autoFocus
        required
      />
      <input
        className="input h-8 w-20 py-1 text-sm"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        maxLength={80}
        placeholder={t("trips.packing.quantityShort")}
      />
      <input
        className="input h-8 w-28 py-1 text-sm"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        maxLength={80}
        placeholder={t("trips.packing.categoryShort")}
      />
      <select
        className="input h-8 w-32 py-1 text-sm"
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
      >
        <option value="">{t("trips.packing.assigneeNone")}</option>
        {group.members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name}
          </option>
        ))}
      </select>
      <button type="submit" className="btn-primary h-8 py-1 text-sm" disabled={saving}>
        {t("common.save")}
      </button>
      <button
        type="button"
        className="btn-ghost h-8 py-1 text-sm"
        onClick={() => onDone(false)}
      >
        {t("common.cancel")}
      </button>
    </form>
  );
}

function AddPackingForm({
  group,
  trip,
  existing,
  onDone,
}: {
  group: GroupDetail;
  trip: Trip;
  existing: TripPackingItem[];
  onDone: (created: boolean) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const categoryTouched = useRef(false);

  // Build a flat, translated suggestion list once per render of the form and
  // strip items that are already on the packing list (case-insensitive).
  const existingNames = useMemo(() => {
    const set = new Set<string>();
    for (const item of existing) {
      set.add(item.name.trim().toLowerCase());
    }
    return set;
  }, [existing]);

  const catalogFlat = useMemo(() => {
    const out: { name: string; category: string }[] = [];
    for (const entry of PACKING_CATALOG) {
      const categoryLabel = t(
        `trips.packing.catalog.categories.${entry.category}`,
      );
      for (const itemKey of entry.items) {
        const label = t(`trips.packing.catalog.items.${itemKey}`);
        out.push({ name: label, category: categoryLabel });
      }
    }
    return out;
  }, [t]);

  const query = name.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!query) return [];
    return catalogFlat
      .filter(
        (entry) =>
          !existingNames.has(entry.name.toLowerCase()) &&
          entry.name.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [query, catalogFlat, existingNames]);

  function applySuggestion(entry: { name: string; category: string }) {
    setName(entry.name);
    if (!categoryTouched.current || !category.trim()) {
      setCategory(entry.category);
    }
    setSuggestOpen(false);
    setHighlight(0);
  }

  function onNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(
        (h) => (h - 1 + suggestions.length) % suggestions.length,
      );
    } else if (e.key === "Enter") {
      const picked = suggestions[highlight];
      if (picked) {
        e.preventDefault();
        applySuggestion(picked);
      }
    } else if (e.key === "Escape") {
      setSuggestOpen(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await tripsApi.createPacking(group.id, trip.id, {
        name: trimmed,
        quantity: quantity.trim(),
        category: category.trim(),
        assigned_to: assignee === "" ? null : assignee,
      });
      onDone(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_100px_140px_160px_auto]">
      <div className="relative">
        <input
          className="input w-full"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSuggestOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setSuggestOpen(true)}
          onBlur={() => {
            // Delay so a click on a suggestion can still register.
            window.setTimeout(() => setSuggestOpen(false), 120);
          }}
          onKeyDown={onNameKeyDown}
          maxLength={200}
          placeholder={t("trips.packing.namePlaceholder")}
          required
          autoFocus
          autoComplete="off"
          role="combobox"
          aria-expanded={suggestOpen && suggestions.length > 0}
          aria-autocomplete="list"
          aria-controls="packing-suggestions"
        />
        {suggestOpen && suggestions.length > 0 && (
          <ul
            id="packing-suggestions"
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {suggestions.map((entry, idx) => (
              <li key={`${entry.category}:${entry.name}`} role="option" aria-selected={idx === highlight}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // Prevent blur firing before click.
                    e.preventDefault();
                    applySuggestion(entry);
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                    idx === highlight
                      ? "bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
                      : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  <span className="truncate">{entry.name}</span>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {entry.category}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input
        className="input"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        maxLength={80}
        placeholder={t("trips.packing.quantityPlaceholder")}
      />
      <input
        className="input"
        value={category}
        onChange={(e) => {
          categoryTouched.current = true;
          setCategory(e.target.value);
        }}
        maxLength={80}
        placeholder={t("trips.packing.categoryPlaceholder")}
      />
      <select
        className="input"
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
      >
        <option value="">{t("trips.packing.assigneeNone")}</option>
        {group.members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? t("common.saving") : t("trips.packing.add")}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onDone(false)}
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function PackingCatalog({
  group,
  trip,
  existing,
  onAdded,
}: {
  group: GroupDetail;
  trip: Trip;
  existing: TripPackingItem[] | null;
  onAdded: (item: TripPackingItem) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  // Per-item busy flag so double-clicks don't create duplicates.
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const existingNames = useMemo(() => {
    const set = new Set<string>();
    for (const item of existing ?? []) {
      set.add(item.name.trim().toLowerCase());
    }
    return set;
  }, [existing]);

  async function addItem(itemKey: string, categoryKey: string) {
    const name = t(`trips.packing.catalog.items.${itemKey}`);
    const category = t(`trips.packing.catalog.categories.${categoryKey}`);
    const key = `${categoryKey}:${itemKey}`;
    if (busy[key]) return;
    if (existingNames.has(name.trim().toLowerCase())) return;

    setBusy((prev) => ({ ...prev, [key]: true }));
    try {
      const created = await tripsApi.createPacking(group.id, trip.id, {
        name,
        category,
      });
      onAdded(created);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setBusy((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  return (
    <section
      className="card space-y-4 p-4"
      aria-label={t("trips.packing.catalog.title")}
    >
      <div>
        <h3 className="text-sm font-semibold">
          {t("trips.packing.catalog.title")}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {t("trips.packing.catalog.hint")}
        </p>
      </div>

      <div className="space-y-4">
        {PACKING_CATALOG.map(({ category, items }) => (
          <div key={category}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t(`trips.packing.catalog.categories.${category}`)}
            </h4>
            <div className="flex flex-wrap gap-2">
              {items.map((itemKey) => {
                const label = t(`trips.packing.catalog.items.${itemKey}`);
                const alreadyAdded = existingNames.has(
                  label.trim().toLowerCase(),
                );
                const key = `${category}:${itemKey}`;
                const isBusy = !!busy[key];
                return (
                  <button
                    key={itemKey}
                    type="button"
                    onClick={() => addItem(itemKey, category)}
                    disabled={alreadyAdded || isBusy}
                    title={
                      alreadyAdded
                        ? t("trips.packing.catalog.alreadyAdded")
                        : label
                    }
                    aria-label={
                      alreadyAdded
                        ? `${label} - ${t("trips.packing.catalog.alreadyAdded")}`
                        : label
                    }
                    className={
                      alreadyAdded
                        ? "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                        : "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-500 dark:hover:bg-brand-900/30 dark:hover:text-brand-200"
                    }
                  >
                    {alreadyAdded ? (
                      <Check className="h-3 w-3" aria-hidden />
                    ) : (
                      <Plus className="h-3 w-3" aria-hidden />
                    )}
                    <span className={alreadyAdded ? "line-through" : ""}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
