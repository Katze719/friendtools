import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type { GroupDetail, ShoppingItem, ShoppingList } from "../../api/types";
import LoadingState from "../../components/LoadingState";
import { shoppingApi, shoppingListsApi } from "./api";
import ShoppingListView, {
  type ShoppingItemClient,
  type ShoppingListClient,
} from "./ShoppingListView";

/**
 * Items view for exactly one group-owned shopping list. The actual UI
 * lives in `ShoppingListView`; this page just wires up routing + data
 * loading + clients for the group scope.
 */
export default function ShoppingOverviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupId, listId } = useParams<{
    groupId: string;
    listId: string;
  }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!groupId || !listId) return;
    Promise.all([
      groupsApi.get(groupId),
      shoppingListsApi.list(groupId),
      shoppingApi.list(groupId, listId),
    ])
      .then(([g, allLists, i]) => {
        setGroup(g);
        const active = allLists.find((l) => l.id === listId) ?? null;
        setList(active);
        setItems(i);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [groupId, listId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const itemClient = useMemo<ShoppingItemClient | null>(() => {
    if (!groupId || !listId) return null;
    return {
      create: (body) => shoppingApi.create(groupId, listId, body),
      toggle: (id, done) => shoppingApi.toggle(groupId, listId, id, done),
      update: (id, body) => shoppingApi.update(groupId, listId, id, body),
      remove: async (id) => {
        await shoppingApi.remove(groupId, listId, id);
      },
      clearDone: () => shoppingApi.clearDone(groupId, listId),
    };
  }, [groupId, listId]);

  const listClient = useMemo<ShoppingListClient | null>(() => {
    if (!groupId || !listId) return null;
    return {
      rename: (body) => shoppingListsApi.rename(groupId, listId, body),
      remove: () => shoppingListsApi.remove(groupId, listId),
    };
  }, [groupId, listId]);

  if (error && !group) {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        {error}
      </p>
    );
  }
  if (!group || !list || !items || !itemClient || !listClient) {
    return <LoadingState />;
  }

  return (
    <ShoppingListView
      list={list}
      items={items}
      subtitle={`${group.name} - ${t("shopping.overview.subtitle")}`}
      header={
        <Link
          to={`/groups/${group.id}/shopping`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> {t("shopping.overview.backToLists")}
        </Link>
      }
      itemClient={itemClient}
      listClient={listClient}
      onListChanged={(next) => setList(next)}
      onItemsChanged={(next) => setItems(next)}
      onListRemoved={() => navigate(`/groups/${group.id}/shopping`)}
    />
  );
}
