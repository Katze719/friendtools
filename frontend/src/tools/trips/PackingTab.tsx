import {
  Backpack,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api/client";
import type { GroupDetail, TripPackingItem } from "../../api/types";
import { useConfirm, useToast } from "../../ui/UIProvider";
import { tripsApi } from "./api";

/**
 * Simple reorderable checklist. Categories are free-text (optional) so users
 * never have to pick from a fixed list, matching the "optional everything"
 * philosophy.
 */
export default function PackingTab({ group }: { group: GroupDetail }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<TripPackingItem[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(() => {
    tripsApi
      .listPacking(group.id)
      .then(setItems)
      .catch((e) =>
        toast.error(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [group.id, t, toast]);

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
    return <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-4">
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
        <button className="btn-primary" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="h-4 w-4" />
          {t("trips.packing.add")}
        </button>
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
          onDone={(created) => {
            setShowAdd(false);
            if (created) reload();
          }}
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
  onChange,
  onChanged,
}: {
  items: TripPackingItem[];
  groupedByCategory: [string, TripPackingItem[]][];
  group: GroupDetail;
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
      const updated = await tripsApi.togglePacking(group.id, item.id);
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
      await tripsApi.deletePacking(group.id, item.id);
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
  onDragStart,
  onDragOver,
  onDropOn,
  onToggle,
  onDelete,
  onReload,
}: {
  item: TripPackingItem;
  group: GroupDetail;
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
  onDone,
}: {
  item: TripPackingItem;
  group: GroupDetail;
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
      await tripsApi.updatePacking(group.id, item.id, {
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
  onDone,
}: {
  group: GroupDetail;
  onDone: (created: boolean) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await tripsApi.createPacking(group.id, {
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
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={200}
        placeholder={t("trips.packing.namePlaceholder")}
        required
        autoFocus
      />
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
        onChange={(e) => setCategory(e.target.value)}
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
