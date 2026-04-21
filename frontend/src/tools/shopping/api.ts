import { api } from "../../api/client";
import type { ShoppingItem, ShoppingList } from "../../api/types";

export interface CreateItemPayload {
  name: string;
  quantity?: string;
  note?: string;
}

export interface UpdateItemPayload {
  name?: string;
  quantity?: string;
  note?: string;
}

export interface CreateListPayload {
  name: string;
}

export interface RenameListPayload {
  name: string;
}

/** List-level CRUD. A group can own any number of shopping lists; the UI
 *  lets users switch between them via a dropdown. */
export const shoppingListsApi = {
  list: (groupId: string) =>
    api<ShoppingList[]>(`/api/groups/${groupId}/shopping/lists`),
  create: (groupId: string, body: CreateListPayload) =>
    api<ShoppingList>(`/api/groups/${groupId}/shopping/lists`, {
      method: "POST",
      body,
    }),
  rename: (groupId: string, listId: string, body: RenameListPayload) =>
    api<ShoppingList>(`/api/groups/${groupId}/shopping/lists/${listId}`, {
      method: "PATCH",
      body,
    }),
  /** Returns the list the UI should switch to (the safeguard list if the
   *  caller deleted the last one; else any remaining list). */
  remove: (groupId: string, listId: string) =>
    api<ShoppingList>(`/api/groups/${groupId}/shopping/lists/${listId}`, {
      method: "DELETE",
    }),
};

/** Item CRUD - all scoped to a specific list now. */
export const shoppingApi = {
  list: (groupId: string, listId: string) =>
    api<ShoppingItem[]>(
      `/api/groups/${groupId}/shopping/lists/${listId}/items`,
    ),
  create: (groupId: string, listId: string, body: CreateItemPayload) =>
    api<ShoppingItem>(
      `/api/groups/${groupId}/shopping/lists/${listId}/items`,
      { method: "POST", body },
    ),
  update: (
    groupId: string,
    listId: string,
    itemId: string,
    body: UpdateItemPayload,
  ) =>
    api<ShoppingItem>(
      `/api/groups/${groupId}/shopping/lists/${listId}/items/${itemId}`,
      { method: "PATCH", body },
    ),
  toggle: (groupId: string, listId: string, itemId: string, done?: boolean) =>
    api<ShoppingItem>(
      `/api/groups/${groupId}/shopping/lists/${listId}/items/${itemId}/toggle`,
      {
        method: "PUT",
        body: done === undefined ? {} : { done },
      },
    ),
  remove: (groupId: string, listId: string, itemId: string) =>
    api<{ ok: true }>(
      `/api/groups/${groupId}/shopping/lists/${listId}/items/${itemId}`,
      { method: "DELETE" },
    ),
  clearDone: (groupId: string, listId: string) =>
    api<{ ok: true; removed: number }>(
      `/api/groups/${groupId}/shopping/lists/${listId}/items/clear-done`,
      { method: "POST" },
    ),
};

// -------------------------------------------------------------------------
// Personal shopping (mirrors the group API, but under /api/me/shopping/...
// so every list/item is owned by the authenticated user and never shared).
// -------------------------------------------------------------------------

export const personalShoppingListsApi = {
  list: () => api<ShoppingList[]>("/api/me/shopping/lists"),
  create: (body: CreateListPayload) =>
    api<ShoppingList>("/api/me/shopping/lists", { method: "POST", body }),
  rename: (listId: string, body: RenameListPayload) =>
    api<ShoppingList>(`/api/me/shopping/lists/${listId}`, {
      method: "PATCH",
      body,
    }),
  remove: (listId: string) =>
    api<ShoppingList>(`/api/me/shopping/lists/${listId}`, {
      method: "DELETE",
    }),
};

export const personalShoppingApi = {
  list: (listId: string) =>
    api<ShoppingItem[]>(`/api/me/shopping/lists/${listId}/items`),
  create: (listId: string, body: CreateItemPayload) =>
    api<ShoppingItem>(`/api/me/shopping/lists/${listId}/items`, {
      method: "POST",
      body,
    }),
  update: (listId: string, itemId: string, body: UpdateItemPayload) =>
    api<ShoppingItem>(`/api/me/shopping/lists/${listId}/items/${itemId}`, {
      method: "PATCH",
      body,
    }),
  toggle: (listId: string, itemId: string, done?: boolean) =>
    api<ShoppingItem>(
      `/api/me/shopping/lists/${listId}/items/${itemId}/toggle`,
      {
        method: "PUT",
        body: done === undefined ? {} : { done },
      },
    ),
  remove: (listId: string, itemId: string) =>
    api<{ ok: true }>(`/api/me/shopping/lists/${listId}/items/${itemId}`, {
      method: "DELETE",
    }),
  clearDone: (listId: string) =>
    api<{ ok: true; removed: number }>(
      `/api/me/shopping/lists/${listId}/items/clear-done`,
      { method: "POST" },
    ),
};
