import {
  CheckCircle2,
  ChevronRight,
  ListChecks,
  Plus,
  ShoppingBasket,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { groupsApi } from "../api/groups";
import type { GroupSummary, ShoppingList } from "../api/types";
import LoadingState from "../components/LoadingState";
import PageHeader from "../components/PageHeader";
import {
  personalShoppingListsApi,
  shoppingListsApi,
} from "../tools/shopping/api";
import { useConfirm, useToast } from "../ui/UIProvider";

const OVERLAY_KEY = "shopping.personal.groupOverlay";

function loadOverlayPref(): boolean {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY);
    return raw === null ? false : raw === "1";
  } catch {
    return false;
  }
}

function saveOverlayPref(v: boolean): void {
  try {
    localStorage.setItem(OVERLAY_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

interface GroupOverlay {
  group: GroupSummary;
  lists: ShoppingList[];
}

/**
 * Per-user shopping index at /me/shopping. Shows the user's own
 * personal lists as editable cards, plus an optional read-only overlay
 * of every group's lists so the user can pop into any shared list
 * without going through the group's detail page first.
 */
export default function PersonalShoppingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [lists, setLists] = useState<ShoppingList[] | null>(null);
  const [groupOverlays, setGroupOverlays] = useState<GroupOverlay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showGroupOverlay, setShowGroupOverlay] = useState<boolean>(() =>
    loadOverlayPref(),
  );
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(() => {
    Promise.all([
      personalShoppingListsApi.list(),
      showGroupOverlay
        ? groupsApi.list().catch(() => [] as GroupSummary[])
        : Promise.resolve([] as GroupSummary[]),
    ])
      .then(async ([personal, groups]) => {
        setLists(personal);
        if (groups.length === 0) {
          setGroupOverlays([]);
          return;
        }
        const overlays = await Promise.all(
          groups.map(async (g) => ({
            group: g,
            lists: await shoppingListsApi
              .list(g.id)
              .catch(() => [] as ShoppingList[]),
          })),
        );
        setGroupOverlays(overlays);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [t, showGroupOverlay]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onDelete(list: ShoppingList) {
    const ok = await confirm({
      title: t("shopping.lists.deleteTitle"),
      message: t("shopping.lists.deleteConfirm", { name: list.name }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await personalShoppingListsApi.remove(list.id);
      reload();
      toast.success(t("shopping.lists.deleted"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  if (error && !lists) {
    return <p className="alert-error">{error}</p>;
  }
  if (!lists) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backLink={{ to: "/", label: t("layout.backToDashboard") }}
        title={t("shopping.personal.title")}
        subtitle={t("shopping.personal.subtitle")}
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

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
          checked={showGroupOverlay}
          onChange={(e) => {
            const next = e.target.checked;
            setShowGroupOverlay(next);
            saveOverlayPref(next);
          }}
        />
        {t("shopping.personal.toggleGroupLists")}
      </label>

      {showForm && (
        <NewListForm
          onDone={(created) => {
            setShowForm(false);
            if (created) {
              reload();
              navigate(`/me/shopping/${created.id}`);
            }
          }}
        />
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">
          {t("shopping.personal.yourListsTitle")}
        </h2>
        {lists.length === 0 ? (
          <div className="card p-8 text-center">
            <ShoppingBasket className="mx-auto h-10 w-10 text-slate-400 dark:text-slate-500" />
            <h3 className="mt-3 text-lg font-semibold">
              {t("shopping.personal.emptyTitle")}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("shopping.personal.emptyHint")}
            </p>
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={() => setShowForm(true)}
            >
              <Plus className="h-4 w-4" />
              {t("shopping.lists.createFirst")}
            </button>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <PersonalListCard
                key={list.id}
                list={list}
                onDelete={() => onDelete(list)}
              />
            ))}
          </ul>
        )}
      </section>

      {showGroupOverlay && groupOverlays.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            {t("shopping.personal.groupListsTitle")}
          </h2>
          {groupOverlays.every((o) => o.lists.length === 0) ? (
            <p className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {t("shopping.personal.noGroupLists")}
            </p>
          ) : (
            groupOverlays.map((o) =>
              o.lists.length === 0 ? null : (
                <div key={o.group.id} className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {o.group.name}
                  </h3>
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {o.lists.map((list) => (
                      <GroupListCard
                        key={list.id}
                        list={list}
                        groupId={o.group.id}
                      />
                    ))}
                  </ul>
                </div>
              ),
            )
          )}
        </section>
      )}
    </div>
  );
}

function PersonalListCard({
  list,
  onDelete,
}: {
  list: ShoppingList;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const total = list.items_open + list.items_done;
  const allDone = total > 0 && list.items_open === 0;

  return (
    <li className="group card relative flex flex-col overflow-hidden p-0 transition hover:border-brand-400 hover:shadow-md dark:hover:border-brand-600">
      <Link
        to={`/me/shopping/${list.id}`}
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
      {allDone && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-emerald-400"
          aria-hidden
        />
      )}
    </li>
  );
}

function GroupListCard({
  list,
  groupId,
}: {
  list: ShoppingList;
  groupId: string;
}) {
  const { t } = useTranslation();
  const total = list.items_open + list.items_done;

  return (
    <li className="card p-0 transition hover:border-brand-400 hover:shadow-md dark:hover:border-brand-600">
      <Link
        to={`/groups/${groupId}/shopping/${list.id}`}
        className="flex items-center gap-3 p-4"
      >
        <ShoppingBasket
          className="h-5 w-5 shrink-0 text-slate-400"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{list.name}</h3>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {total === 0
              ? t("shopping.lists.cardEmpty")
              : t("shopping.lists.cardOpen", { count: list.items_open })}
          </p>
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-slate-400"
          aria-hidden
        />
      </Link>
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
    empty: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
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
  onDone,
}: {
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
      const created = await personalShoppingListsApi.create({ name: trimmed });
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
        <label className="label" htmlFor="new_personal_list_name">
          {t("shopping.lists.nameLabel")}
        </label>
        <input
          id="new_personal_list_name"
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
