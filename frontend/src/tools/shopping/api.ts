import { api } from "../../api/client";
import type { ShoppingItem } from "../../api/types";

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

export const shoppingApi = {
  list: (groupId: string) =>
    api<ShoppingItem[]>(`/api/groups/${groupId}/shopping/items`),
  create: (groupId: string, body: CreateItemPayload) =>
    api<ShoppingItem>(`/api/groups/${groupId}/shopping/items`, {
      method: "POST",
      body,
    }),
  update: (groupId: string, itemId: string, body: UpdateItemPayload) =>
    api<ShoppingItem>(`/api/groups/${groupId}/shopping/items/${itemId}`, {
      method: "PATCH",
      body,
    }),
  toggle: (groupId: string, itemId: string, done?: boolean) =>
    api<ShoppingItem>(
      `/api/groups/${groupId}/shopping/items/${itemId}/toggle`,
      {
        method: "PUT",
        body: done === undefined ? {} : { done },
      },
    ),
  remove: (groupId: string, itemId: string) =>
    api<{ ok: true }>(`/api/groups/${groupId}/shopping/items/${itemId}`, {
      method: "DELETE",
    }),
  clearDone: (groupId: string) =>
    api<{ ok: true; removed: number }>(
      `/api/groups/${groupId}/shopping/items/clear-done`,
      { method: "POST" },
    ),
};
