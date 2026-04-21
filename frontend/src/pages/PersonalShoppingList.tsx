import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import type { ShoppingItem, ShoppingList } from "../api/types";
import LoadingState from "../components/LoadingState";
import {
  personalShoppingApi,
  personalShoppingListsApi,
} from "../tools/shopping/api";
import ShoppingListView, {
  type ShoppingItemClient,
  type ShoppingListClient,
} from "../tools/shopping/ShoppingListView";

/**
 * Items view for a single personal shopping list at
 * /me/shopping/:listId. Same UI as the group list detail page, wired
 * to `personalShoppingApi` and `personalShoppingListsApi`.
 */
export default function PersonalShoppingListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { listId } = useParams<{ listId: string }>();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!listId) return;
    Promise.all([
      personalShoppingListsApi.list(),
      personalShoppingApi.list(listId),
    ])
      .then(([allLists, its]) => {
        const active = allLists.find((l) => l.id === listId) ?? null;
        setList(active);
        setItems(its);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [listId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const itemClient = useMemo<ShoppingItemClient | null>(() => {
    if (!listId) return null;
    return {
      create: (body) => personalShoppingApi.create(listId, body),
      toggle: (id, done) => personalShoppingApi.toggle(listId, id, done),
      update: (id, body) => personalShoppingApi.update(listId, id, body),
      remove: async (id) => {
        await personalShoppingApi.remove(listId, id);
      },
      clearDone: () => personalShoppingApi.clearDone(listId),
    };
  }, [listId]);

  const listClient = useMemo<ShoppingListClient | null>(() => {
    if (!listId) return null;
    return {
      rename: (body) => personalShoppingListsApi.rename(listId, body),
      remove: () => personalShoppingListsApi.remove(listId),
    };
  }, [listId]);

  if (error && !list) {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        {error}
      </p>
    );
  }
  if (!list || !items || !itemClient || !listClient) {
    return <LoadingState />;
  }

  return (
    <ShoppingListView
      list={list}
      items={items}
      subtitle={t("shopping.personal.listSubtitle")}
      header={
        <Link
          to="/me/shopping"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("shopping.personal.backToLists")}
        </Link>
      }
      itemClient={itemClient}
      listClient={listClient}
      onListChanged={(next) => setList(next)}
      onItemsChanged={(next) => setItems(next)}
      onListRemoved={() => navigate("/me/shopping")}
    />
  );
}
