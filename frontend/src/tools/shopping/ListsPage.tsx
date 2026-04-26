import {
  CheckCircle2,
  ListChecks,
  Plus,
  ShoppingBasket,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type { GroupDetail, ShoppingList } from "../../api/types";
import LoadingState from "../../components/LoadingState";
import PageHeader from "../../components/PageHeader";
import { useConfirm, useToast } from "../../ui/UIProvider";
import { shoppingListsApi } from "./api";

/**
 * Landing page for the shopping tool: shows every list the group owns as
 * clickable cards (mirrors the Trips list UI so switching between tools
 * feels consistent). Clicking a card opens the items view for that list.
 */
export default function ShoppingListsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [lists, setLists] = useState<ShoppingList[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!groupId) return;
    Promise.all([groupsApi.get(groupId), shoppingListsApi.list(groupId)])
      .then(([g, ls]) => {
        setGroup(g);
        setLists(ls);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [groupId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onDelete(list: ShoppingList) {
    if (!groupId) return;
    const ok = await confirm({
      title: t("shopping.lists.deleteTitle"),
      message: t("shopping.lists.deleteConfirm", { name: list.name }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await shoppingListsApi.remove(groupId, list.id);
      reload();
      toast.success(t("shopping.lists.deleted"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  if (error && !group) {
    return <p className="alert-error">{error}</p>;
  }
  if (!group || !lists) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backLink={{
          to: `/groups/${group.id}`,
          label: t("shopping.lists.backToGroup"),
        }}
        title={t("shopping.lists.title")}
        subtitle={`${group.name} - ${t("shopping.lists.subtitle")}`}
        actions={
          <button
            className="btn-primary w-full sm:w-auto"
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
          >
            <Plus className="h-4 w-4" /> {t("shopping.lists.newList")}
          </button>
        }
      />

      {showForm && (
        <NewListForm
          groupId={group.id}
          onDone={(created) => {
            setShowForm(false);
            if (created) {
              reload();
              navigate(`/groups/${group.id}/shopping/${created.id}`);
            }
          }}
        />
      )}

      {lists.length === 0 ? (
        <EmptyListsState onAdd={() => setShowForm(true)} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <ListCard
              key={list.id}
              list={list}
              groupId={group.id}
              onDelete={() => onDelete(list)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyListsState({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="card p-8 text-center">
      <ShoppingBasket className="mx-auto h-10 w-10 text-slate-400 dark:text-slate-500" />
      <h2 className="mt-3 text-lg font-semibold">
        {t("shopping.lists.emptyTitle")}
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {t("shopping.lists.emptyHint")}
      </p>
      <button type="button" className="btn-primary mt-4" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        {t("shopping.lists.createFirst")}
      </button>
    </div>
  );
}

function ListCard({
  list,
  groupId,
  onDelete,
}: {
  list: ShoppingList;
  groupId: string;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const total = list.items_open + list.items_done;
  const allDone = total > 0 && list.items_open === 0;

  return (
    <li className="group card relative flex flex-col overflow-hidden p-0 transition hover:border-brand-400 hover:shadow-md dark:hover:border-brand-600">
      <Link
        to={`/groups/${groupId}/shopping/${list.id}`}
        className="flex flex-1 flex-col gap-3 p-5"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{list.name}</h3>
            <ListStatusPill list={list} />
          </div>
          <ShoppingBasket
            className="h-5 w-5 shrink-0 text-brand-500"
            aria-hidden
          />
        </div>
        <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
          {total === 0 ? (
            <p className="inline-flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
              <ListChecks className="h-3.5 w-3.5 shrink-0" />
              <span className="italic">{t("shopping.lists.cardEmpty")}</span>
            </p>
          ) : (
            <>
              <p className="inline-flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {t("shopping.lists.cardOpen", { count: list.items_open })}
              </p>
              {list.items_done > 0 && (
                <p className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {t("shopping.lists.cardDone", { count: list.items_done })}
                </p>
              )}
            </>
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
        title={t("shopping.lists.delete")}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {/* Status hint lives on the pill, but keep the done indicator when
          everything is ticked off - it's nice visual closure. */}
      {allDone && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-emerald-400"
          aria-hidden
        />
      )}
    </li>
  );
}

function ListStatusPill({ list }: { list: ShoppingList }) {
  const { t } = useTranslation();
  const total = list.items_open + list.items_done;
  let status: "empty" | "active" | "done";
  if (total === 0) status = "empty";
  else if (list.items_open === 0) status = "done";
  else status = "active";

  const styles: Record<typeof status, string> = {
    empty:
      "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    active:
      "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  };
  return (
    <span
      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {t(`shopping.lists.status.${status}`)}
    </span>
  );
}

function NewListForm({
  groupId,
  onDone,
}: {
  groupId: string;
  onDone: (created: ShoppingList | null) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const created = await shoppingListsApi.create(groupId, {
        name: trimmed,
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
      <h2 className="font-semibold">{t("shopping.lists.newList")}</h2>
      <div className="space-y-1">
        <label className="label" htmlFor="new_list_name">
          {t("shopping.lists.nameLabel")}
        </label>
        <input
          id="new_list_name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("shopping.lists.namePlaceholder")}
          maxLength={120}
          required
          autoFocus
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => onDone(null)}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          <Plus className="h-4 w-4" />
          {saving ? t("common.saving") : t("shopping.lists.create")}
        </button>
      </div>
    </form>
  );
}
