import {
  ArrowLeft,
  Check,
  Eraser,
  Pencil,
  Plus,
  ShoppingBasket,
  Trash2,
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
import type { GroupDetail, ShoppingItem } from "../../api/types";
import { useConfirm, useToast } from "../../ui/UIProvider";
import { shoppingApi } from "./api";

export default function ShoppingOverviewPage() {
  const { t } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const confirm = useConfirm();
  const toast = useToast();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const reload = useCallback(() => {
    if (!groupId) return;
    Promise.all([groupsApi.get(groupId), shoppingApi.list(groupId)])
      .then(([g, i]) => {
        setGroup(g);
        setItems(i);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [groupId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const { open, done } = useMemo(() => {
    if (!items) return { open: [] as ShoppingItem[], done: [] as ShoppingItem[] };
    return {
      open: items.filter((i) => !i.is_done),
      done: items.filter((i) => i.is_done),
    };
  }, [items]);

  function replaceItem(updated: ShoppingItem) {
    setItems((prev) =>
      prev ? prev.map((i) => (i.id === updated.id ? updated : i)) : prev,
    );
  }

  function removeItemLocal(id: string) {
    setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
  }

  function prependItem(item: ShoppingItem) {
    setItems((prev) => (prev ? [item, ...prev] : [item]));
  }

  async function onClearDone() {
    if (!groupId) return;
    if (done.length === 0) return;
    const ok = await confirm({
      title: t("shopping.overview.clearTitle"),
      message: t("shopping.overview.clearConfirm", { count: done.length }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    setClearing(true);
    try {
      await shoppingApi.clearDone(groupId);
      setItems((prev) => (prev ? prev.filter((i) => !i.is_done) : prev));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setClearing(false);
    }
  }

  if (error && !group) {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        {error}
      </p>
    );
  }
  if (!group || !items) {
    return <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/groups/${group.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> {t("shopping.overview.backToGroup")}
        </Link>
        <div className="mt-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("shopping.overview.title")}
          </h1>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">
            {group.name} - {t("shopping.overview.subtitle")}
          </p>
        </div>
      </div>

      <AddItemForm groupId={group.id} onAdded={prependItem} />

      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <ShoppingBasket className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <h2 className="mt-3 text-lg font-semibold">
            {t("shopping.overview.empty.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("shopping.overview.empty.description")}
          </p>
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-lg font-semibold">
              {t("shopping.overview.openTitle", { count: open.length })}
            </h2>
            {open.length === 0 ? (
              <p className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {t("shopping.overview.allDone")}
              </p>
            ) : (
              <ul className="card divide-y divide-slate-100 overflow-hidden p-0 dark:divide-slate-800">
                {open.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    groupId={group.id}
                    onReplace={replaceItem}
                    onRemove={removeItemLocal}
                  />
                ))}
              </ul>
            )}
          </section>

          {done.length > 0 && (
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-600 dark:text-slate-300">
                  {t("shopping.overview.doneTitle", { count: done.length })}
                </h2>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClearDone}
                  disabled={clearing}
                >
                  <Eraser className="h-4 w-4" />
                  {t("shopping.overview.clearDone")}
                </button>
              </div>
              <ul className="card divide-y divide-slate-100 overflow-hidden p-0 dark:divide-slate-800">
                {done.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    groupId={group.id}
                    onReplace={replaceItem}
                    onRemove={removeItemLocal}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function AddItemForm({
  groupId,
  onAdded,
}: {
  groupId: string;
  onAdded: (item: ShoppingItem) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    try {
      const created = await shoppingApi.create(groupId, {
        name: trimmed,
        quantity: quantity.trim(),
      });
      onAdded(created);
      setName("");
      setQuantity("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-end sm:p-4"
    >
      <div className="flex-1 space-y-1">
        <label className="label" htmlFor="item_name">
          {t("shopping.overview.item")}
        </label>
        <input
          id="item_name"
          className="input"
          placeholder={t("shopping.overview.itemPlaceholder")}
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1 sm:w-32">
        <label className="label" htmlFor="item_qty">
          {t("shopping.overview.quantity")}
        </label>
        <input
          id="item_qty"
          className="input"
          placeholder={t("shopping.overview.quantityPlaceholder")}
          maxLength={80}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>
      <button
        type="submit"
        className="btn-primary w-full sm:w-auto"
        disabled={loading}
      >
        <Plus className="h-4 w-4" /> {t("shopping.overview.add")}
      </button>
      {error && (
        <p className="basis-full rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      )}
    </form>
  );
}

function ItemRow({
  item,
  groupId,
  onReplace,
  onRemove,
}: {
  item: ShoppingItem;
  groupId: string;
  onReplace: (updated: ShoppingItem) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [note, setNote] = useState(item.note);

  async function onToggle() {
    if (busy) return;
    const optimistic: ShoppingItem = {
      ...item,
      is_done: !item.is_done,
      done_at: !item.is_done ? new Date().toISOString() : null,
      done_by: !item.is_done ? item.done_by ?? null : null,
      done_by_display_name: !item.is_done ? item.done_by_display_name : null,
    };
    onReplace(optimistic);
    setBusy(true);
    try {
      const updated = await shoppingApi.toggle(groupId, item.id);
      onReplace(updated);
    } catch (e) {
      onReplace(item);
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("shopping.overview.deleteTitle"),
      message: t("shopping.overview.deleteConfirm", { name: item.name }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await shoppingApi.remove(groupId, item.id);
      onRemove(item.id);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const updated = await shoppingApi.update(groupId, item.id, {
        name: trimmed,
        quantity: quantity.trim(),
        note: note.trim(),
      });
      onReplace(updated);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="p-3 sm:p-4">
        <form
          onSubmit={onSave}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1">
            <label className="label" htmlFor={`n_${item.id}`}>
              {t("shopping.overview.item")}
            </label>
            <input
              id={`n_${item.id}`}
              className="input"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:w-32">
            <label className="label" htmlFor={`q_${item.id}`}>
              {t("shopping.overview.quantity")}
            </label>
            <input
              id={`q_${item.id}`}
              className="input"
              maxLength={80}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="basis-full space-y-1">
            <label className="label" htmlFor={`nt_${item.id}`}>
              {t("shopping.overview.noteOptional")}
            </label>
            <input
              id={`nt_${item.id}`}
              className="input"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex basis-full justify-end gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setEditing(false);
                setName(item.name);
                setQuantity(item.quantity);
                setNote(item.note);
              }}
            >
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {t("common.save")}
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 p-3 sm:p-4">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-pressed={item.is_done}
        aria-label={
          item.is_done
            ? t("shopping.overview.markOpen")
            : t("shopping.overview.markDone")
        }
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
          item.is_done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-slate-300 text-transparent hover:border-brand-500 hover:text-brand-500 dark:border-slate-600"
        }`}
      >
        <Check className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={`break-words font-medium ${
              item.is_done
                ? "text-slate-400 line-through dark:text-slate-500"
                : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {item.name}
          </span>
          {item.quantity && (
            <span
              className={`text-sm tabular-nums ${
                item.is_done
                  ? "text-slate-400 line-through dark:text-slate-500"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {item.quantity}
            </span>
          )}
        </div>
        {item.note && (
          <p
            className={`mt-0.5 break-words text-xs ${
              item.is_done
                ? "text-slate-400 dark:text-slate-500"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {item.note}
          </p>
        )}
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
          {item.is_done && item.done_by_display_name
            ? t("shopping.overview.doneBy", {
                name: item.done_by_display_name,
              })
            : t("shopping.overview.addedBy", {
                name: item.added_by_display_name,
              })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="btn-ghost -my-1"
          onClick={() => setEditing(true)}
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
    </li>
  );
}
