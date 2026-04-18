import { api } from "../../api/client";
import type {
  TripFolder,
  TripInfo,
  TripItineraryItem,
  TripLink,
  TripPackingItem,
} from "../../api/types";

export type CreateLinkPayload = {
  url: string;
  note?: string;
  folder_id?: string | null;
  /** Bypass the server's "same URL already on this board" check. */
  force?: boolean;
};

export type UpdateLinkPayload = {
  note?: string;
  /** `null` clears an override; `undefined` leaves it unchanged. */
  title_override?: string | null;
  image_override?: string | null;
};

export type UpdateInfoPayload = {
  start_date?: string | null;
  end_date?: string | null;
  destinations?: { name: string; lat?: number | null; lng?: number | null }[];
  budget_cents?: number | null;
};

export type CreatePackingPayload = {
  name: string;
  quantity?: string;
  category?: string;
  assigned_to?: string | null;
};

export type UpdatePackingPayload = {
  name?: string;
  quantity?: string;
  category?: string;
  is_packed?: boolean;
  /** `null` clears the assignee; `undefined` leaves it unchanged. */
  assigned_to?: string | null;
};

export type CreateItineraryPayload = {
  day_date: string;
  title: string;
  start_time?: string | null;
  end_time?: string | null;
  location?: string;
  note?: string;
  link_id?: string | null;
};

export type UpdateItineraryPayload = {
  day_date?: string;
  title?: string;
  start_time?: string | null;
  end_time?: string | null;
  location?: string;
  note?: string;
  link_id?: string | null;
};

export const tripsApi = {
  // --- Links ------------------------------------------------------------
  list: (groupId: string) =>
    api<TripLink[]>(`/api/groups/${groupId}/trips/links`),

  create: (groupId: string, payload: CreateLinkPayload) =>
    api<TripLink>(`/api/groups/${groupId}/trips/links`, {
      method: "POST",
      body: payload,
    }),

  update: (groupId: string, linkId: string, payload: UpdateLinkPayload) =>
    api<TripLink>(`/api/groups/${groupId}/trips/links/${linkId}`, {
      method: "PATCH",
      body: payload,
    }),

  remove: (groupId: string, linkId: string) =>
    api<{ ok: boolean }>(`/api/groups/${groupId}/trips/links/${linkId}`, {
      method: "DELETE",
    }),

  refresh: (groupId: string, linkId: string) =>
    api<TripLink>(`/api/groups/${groupId}/trips/links/${linkId}/refresh`, {
      method: "POST",
    }),

  vote: (groupId: string, linkId: string, value: 1 | -1 | 0) =>
    api<TripLink>(`/api/groups/${groupId}/trips/links/${linkId}/vote`, {
      method: "PUT",
      body: { value },
    }),

  moveLink: (groupId: string, linkId: string, folderId: string | null) =>
    api<TripLink>(`/api/groups/${groupId}/trips/links/${linkId}/folder`, {
      method: "PUT",
      body: { folder_id: folderId },
    }),

  reorderLinks: (
    groupId: string,
    folderId: string | null,
    ids: string[],
  ) =>
    api<TripLink[]>(`/api/groups/${groupId}/trips/links/reorder`, {
      method: "PUT",
      body: { folder_id: folderId, ids },
    }),

  // --- Folders ----------------------------------------------------------
  listFolders: (groupId: string) =>
    api<TripFolder[]>(`/api/groups/${groupId}/trips/folders`),

  createFolder: (groupId: string, name: string) =>
    api<TripFolder>(`/api/groups/${groupId}/trips/folders`, {
      method: "POST",
      body: { name },
    }),

  updateFolder: (groupId: string, folderId: string, name: string) =>
    api<TripFolder>(`/api/groups/${groupId}/trips/folders/${folderId}`, {
      method: "PATCH",
      body: { name },
    }),

  deleteFolder: (groupId: string, folderId: string) =>
    api<{ ok: boolean }>(`/api/groups/${groupId}/trips/folders/${folderId}`, {
      method: "DELETE",
    }),

  // --- Trip info (dates, destinations, budget) --------------------------
  getInfo: (groupId: string) =>
    api<TripInfo>(`/api/groups/${groupId}/trips/info`),

  updateInfo: (groupId: string, payload: UpdateInfoPayload) =>
    api<TripInfo>(`/api/groups/${groupId}/trips/info`, {
      method: "PUT",
      body: payload,
    }),

  // --- Packing list -----------------------------------------------------
  listPacking: (groupId: string) =>
    api<TripPackingItem[]>(`/api/groups/${groupId}/trips/packing`),

  createPacking: (groupId: string, payload: CreatePackingPayload) =>
    api<TripPackingItem>(`/api/groups/${groupId}/trips/packing`, {
      method: "POST",
      body: payload,
    }),

  updatePacking: (
    groupId: string,
    itemId: string,
    payload: UpdatePackingPayload,
  ) =>
    api<TripPackingItem>(`/api/groups/${groupId}/trips/packing/${itemId}`, {
      method: "PATCH",
      body: payload,
    }),

  togglePacking: (groupId: string, itemId: string) =>
    api<TripPackingItem>(
      `/api/groups/${groupId}/trips/packing/${itemId}/toggle`,
      { method: "POST" },
    ),

  deletePacking: (groupId: string, itemId: string) =>
    api<{ ok: boolean }>(`/api/groups/${groupId}/trips/packing/${itemId}`, {
      method: "DELETE",
    }),

  reorderPacking: (groupId: string, ids: string[]) =>
    api<TripPackingItem[]>(`/api/groups/${groupId}/trips/packing/reorder`, {
      method: "PUT",
      body: { ids },
    }),

  // --- Itinerary --------------------------------------------------------
  listItinerary: (groupId: string) =>
    api<TripItineraryItem[]>(`/api/groups/${groupId}/trips/itinerary`),

  createItinerary: (groupId: string, payload: CreateItineraryPayload) =>
    api<TripItineraryItem>(`/api/groups/${groupId}/trips/itinerary`, {
      method: "POST",
      body: payload,
    }),

  updateItinerary: (
    groupId: string,
    itemId: string,
    payload: UpdateItineraryPayload,
  ) =>
    api<TripItineraryItem>(`/api/groups/${groupId}/trips/itinerary/${itemId}`, {
      method: "PATCH",
      body: payload,
    }),

  deleteItinerary: (groupId: string, itemId: string) =>
    api<{ ok: boolean }>(`/api/groups/${groupId}/trips/itinerary/${itemId}`, {
      method: "DELETE",
    }),

  reorderItinerary: (groupId: string, dayDate: string, ids: string[]) =>
    api<TripItineraryItem[]>(`/api/groups/${groupId}/trips/itinerary/reorder`, {
      method: "PUT",
      body: { day_date: dayDate, ids },
    }),
};
