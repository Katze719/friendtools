import {
  Check,
  Eraser,
  Pencil,
  Plus,
  ShoppingBasket,
  Trash2,
} from "lucide-react";
import {
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api/client";
import type { ShoppingItem, ShoppingList } from "../../api/types";
import { useConfirm, useToast } from "../../ui/UIProvider";
import type {
  CreateItemPayload,
  RenameListPayload,
  UpdateItemPayload,
} from "./api";

/** Scope-agnostic item operations used by the view. Concrete callers
 *  bind these to either the group or the personal shopping API. */
export interface ShoppingItemClient {
  create(payload: CreateItemPayload): Promise<ShoppingItem>;
  toggle(itemId: string, done?: boolean): Promise<ShoppingItem>;
  update(itemId: string, payload: UpdateItemPayload): Promise<ShoppingItem>;
  remove(itemId: string): Promise<void>;
  clearDone(): Promise<{ removed: number }>;
}

/** Scope-agnostic list operations (rename / delete). */
export interface ShoppingListClient {
  rename(body: RenameListPayload): Promise<ShoppingList>;
  remove(): Promise<ShoppingList>;
}

/**
 * Curated list of common grocery items for the "type-to-search" suggestions in
 * the add form. The category is only a visual hint in the dropdown - the
 * shopping backend does not store categories.
 */
const SHOPPING_CATALOG: { category: string; items: string[] }[] = [
  {
    category: "dairy",
    items: ["milk", "butter", "cheese", "yoghurt", "cream", "quark", "eggs"],
  },
  {
    category: "bakery",
    items: ["bread", "rolls", "toast", "flour", "sugar", "yeast"],
  },
  {
    category: "fruitVeg",
    items: [
      "tomatoes",
      "onions",
      "potatoes",
      "carrots",
      "cucumber",
      "pepper",
      "salad",
      "garlic",
      "avocado",
      "mushrooms",
      "apples",
      "bananas",
      "oranges",
      "lemons",
      "grapes",
      "berries",
    ],
  },
  {
    category: "meatFish",
    items: ["chicken", "mincedMeat", "ham", "salmon", "tuna", "tofu"],
  },
  {
    category: "pantry",
    items: [
      "pasta",
      "rice",
      "tomatoSauce",
      "oliveOil",
      "vinegar",
      "salt",
      "blackPepper",
      "spices",
      "cereals",
      "oats",
      "peanutButter",
      "jam",
      "honey",
    ],
  },
  {
    category: "frozen",
    items: ["frozenVeg", "frozenPizza", "icecream"],
  },
  {
    category: "drinks",
    items: ["water", "coffee", "tea", "juice", "plantMilk", "beer", "wine"],
  },
  {
    category: "snacks",
    items: ["chocolate", "chips", "cookies", "nuts"],
  },
  {
    category: "household",
    items: [
      "toiletPaper",
      "kitchenRoll",
      "dishSoap",
      "laundryDetergent",
      "trashBags",
      "spongesCloths",
    ],
  },
  {
    category: "hygiene",
    items: ["toothpaste", "shampoo", "showerGel", "soap", "deodorant"],
  },
];

export interface ShoppingListViewProps {
  list: ShoppingList;
  items: ShoppingItem[];
  subtitle: string;
  header: React.ReactNode;
  itemClient: ShoppingItemClient;
  listClient: ShoppingListClient;
  /** Invoked after a successful list rename with the fresh row. */
  onListChanged(next: ShoppingList): void;
  onItemsChanged(next: ShoppingItem[]): void;
  /** Called after the list has been deleted so the caller can
   *  navigate back and refresh the outer index. */
  onListRemoved(): void;
}

/**
 * Renders the full "items of one shopping list" experience: list
 * header with inline rename, add-item form with autocomplete,
 * open + done item sections, and the delete-list footer.
 *
 * Stateless with respect to where the list lives: both the group
 * overview page and /me/shopping/:listId plug in their own clients.
 */
export default function ShoppingListView({
  list,
  items,
  subtitle,
  header,
  itemClient,
  listClient,
  onListChanged,
  onItemsChanged,
  onListRemoved,
}: ShoppingListViewProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const [clearing, setClearing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [busyList, setBusyList] = useState(false);

  const { open, done } = useMemo(() => {
    return {
      open: items.filter((i) => !i.is_done),
      done: items.filter((i) => i.is_done),
    };
  }, [items]);

  function replaceItem(updated: ShoppingItem) {
    onItemsChanged(items.map((i) => (i.id === updated.id ? updated : i)));
  }

  function removeItemLocal(id: string) {
    onItemsChanged(items.filter((i) => i.id !== id));
  }

  function prependItem(item: ShoppingItem) {
    onItemsChanged([item, ...items]);
  }

  async function onClearDone() {
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
      await itemClient.clearDone();
      onItemsChanged(items.filter((i) => !i.is_done));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setClearing(false);
    }
  }

  async function onRenameSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setBusyList(true);
    try {
      const updated = await listClient.rename({ name: trimmed });
      onListChanged(updated);
      setRenaming(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setBusyList(false);
    }
  }

  async function onDeleteList() {
    const ok = await confirm({
      title: t("shopping.lists.deleteTitle"),
      message: t("shopping.lists.deleteConfirm", { name: list.name }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    setBusyList(true);
    try {
      await listClient.remove();
      toast.success(t("shopping.lists.deleted"));
      onListRemoved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
      setBusyList(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        {header}
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <form
                onSubmit={onRenameSubmit}
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
              >
                <div className="flex-1 space-y-1">
                  <label className="label" htmlFor="rename_list">
                    {t("shopping.overview.renameTitle")}
                  </label>
                  <input
                    id="rename_list"
                    className="input"
                    required
                    autoFocus
                    maxLength={120}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 sm:pb-0.5">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setRenaming(false)}
                    disabled={busyList}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={busyList}
                  >
                    {t("common.save")}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                    {list.name}
                  </h1>
                  <button
                    type="button"
                    className="btn-ghost -my-1"
                    onClick={() => {
                      setRenameValue(list.name);
                      setRenaming(true);
                    }}
                    aria-label={t("shopping.overview.renameTitle")}
                    title={t("shopping.overview.renameTitle")}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                  {subtitle}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <AddItemForm
        existing={items}
        client={itemClient}
        onAdded={prependItem}
      />

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
                    client={itemClient}
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
                    client={itemClient}
                    onReplace={replaceItem}
                    onRemove={removeItemLocal}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          className="btn-ghost text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
          onClick={onDeleteList}
          disabled={busyList}
        >
          <Trash2 className="h-4 w-4" />
          {t("shopping.overview.deleteList")}
        </button>
      </div>
    </div>
  );
}

function AddItemForm({
  existing,
  client,
  onAdded,
}: {
  existing: ShoppingItem[];
  client: ShoppingItemClient;
  onAdded: (item: ShoppingItem) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  // Only filter out items that are still open; completed items should be
  // reopenable via the suggestions (otherwise you couldn't quickly re-add
  // "milk" next week just because a checked-off entry still lingers).
  const existingOpenNames = useMemo(() => {
    const set = new Set<string>();
    for (const item of existing) {
      if (!item.is_done) set.add(item.name.trim().toLowerCase());
    }
    return set;
  }, [existing]);

  const catalogFlat = useMemo(() => {
    const out: { name: string; category: string }[] = [];
    for (const entry of SHOPPING_CATALOG) {
      const categoryLabel = t(
        `shopping.overview.catalog.categories.${entry.category}`,
      );
      for (const itemKey of entry.items) {
        out.push({
          name: t(`shopping.overview.catalog.items.${itemKey}`),
          category: categoryLabel,
        });
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
          !existingOpenNames.has(entry.name.toLowerCase()) &&
          entry.name.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [query, catalogFlat, existingOpenNames]);

  function applySuggestion(entry: { name: string; category: string }) {
    setName(entry.name);
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
    setError(null);
    setLoading(true);
    try {
      const created = await client.create({
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
        <div className="relative">
          <input
            id="item_name"
            className="input w-full"
            placeholder={t("shopping.overview.itemPlaceholder")}
            required
            maxLength={200}
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
            autoComplete="off"
            role="combobox"
            aria-expanded={suggestOpen && suggestions.length > 0}
            aria-autocomplete="list"
            aria-controls="shopping-suggestions"
          />
          {suggestOpen && suggestions.length > 0 && (
            <ul
              id="shopping-suggestions"
              role="listbox"
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
              {suggestions.map((entry, idx) => (
                <li
                  key={`${entry.category}:${entry.name}`}
                  role="option"
                  aria-selected={idx === highlight}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => {
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
        <p className="alert-error basis-full">
          {error}
        </p>
      )}
    </form>
  );
}

function ItemRow({
  item,
  client,
  onReplace,
  onRemove,
}: {
  item: ShoppingItem;
  client: ShoppingItemClient;
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
      const updated = await client.toggle(item.id);
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
      await client.remove(item.id);
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
      const updated = await client.update(item.id, {
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
