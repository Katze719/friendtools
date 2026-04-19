import { api } from "../../api/client";
import type {
  Trip,
  TripFolder,
  TripItineraryItem,
  TripLink,
  TripPackingItem,
} from "../../api/types";

export type CreateTripPayload = {
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  destinations?: { name: string; lat?: number | null; lng?: number | null }[];
  budget_cents?: number | null;
};

export type UpdateTripPayload = {
  name?: string;
  start_date?: string | null;
  end_date?: string | null;
  destinations?: { name: string; lat?: number | null; lng?: number | null }[];
  budget_cents?: number | null;
};

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

const base = (groupId: string, tripId?: string) =>
  tripId
    ? `/api/groups/${groupId}/trips/${tripId}`
    : `/api/groups/${groupId}/trips`;

export const tripsApi = {
  // --- Trips (collection) ---------------------------------------------
  listTrips: (groupId: string) => api<Trip[]>(base(groupId)),

  createTrip: (groupId: string, payload: CreateTripPayload) =>
    api<Trip>(base(groupId), { method: "POST", body: payload }),

  getTrip: (groupId: string, tripId: string) =>
    api<Trip>(base(groupId, tripId)),

  updateTrip: (groupId: string, tripId: string, payload: UpdateTripPayload) =>
    api<Trip>(base(groupId, tripId), { method: "PATCH", body: payload }),

  deleteTrip: (groupId: string, tripId: string) =>
    api<{ ok: boolean }>(base(groupId, tripId), { method: "DELETE" }),

  // --- Links ----------------------------------------------------------
  listLinks: (groupId: string, tripId: string) =>
    api<TripLink[]>(`${base(groupId, tripId)}/links`),

  createLink: (groupId: string, tripId: string, payload: CreateLinkPayload) =>
    api<TripLink>(`${base(groupId, tripId)}/links`, {
      method: "POST",
      body: payload,
    }),

  updateLink: (
    groupId: string,
    tripId: string,
    linkId: string,
    payload: UpdateLinkPayload,
  ) =>
    api<TripLink>(`${base(groupId, tripId)}/links/${linkId}`, {
      method: "PATCH",
      body: payload,
    }),

  deleteLink: (groupId: string, tripId: string, linkId: string) =>
    api<{ ok: boolean }>(`${base(groupId, tripId)}/links/${linkId}`, {
      method: "DELETE",
    }),

  refreshLink: (groupId: string, tripId: string, linkId: string) =>
    api<TripLink>(`${base(groupId, tripId)}/links/${linkId}/refresh`, {
      method: "POST",
    }),

  voteLink: (
    groupId: string,
    tripId: string,
    linkId: string,
    value: 1 | -1 | 0,
  ) =>
    api<TripLink>(`${base(groupId, tripId)}/links/${linkId}/vote`, {
      method: "PUT",
      body: { value },
    }),

  moveLink: (
    groupId: string,
    tripId: string,
    linkId: string,
    folderId: string | null,
  ) =>
    api<TripLink>(`${base(groupId, tripId)}/links/${linkId}/folder`, {
      method: "PUT",
      body: { folder_id: folderId },
    }),

  reorderLinks: (
    groupId: string,
    tripId: string,
    folderId: string | null,
    ids: string[],
  ) =>
    api<TripLink[]>(`${base(groupId, tripId)}/links/reorder`, {
      method: "PUT",
      body: { folder_id: folderId, ids },
    }),

  // --- Folders --------------------------------------------------------
  listFolders: (groupId: string, tripId: string) =>
    api<TripFolder[]>(`${base(groupId, tripId)}/folders`),

  createFolder: (groupId: string, tripId: string, name: string) =>
    api<TripFolder>(`${base(groupId, tripId)}/folders`, {
      method: "POST",
      body: { name },
    }),

  updateFolder: (
    groupId: string,
    tripId: string,
    folderId: string,
    name: string,
  ) =>
    api<TripFolder>(`${base(groupId, tripId)}/folders/${folderId}`, {
      method: "PATCH",
      body: { name },
    }),

  deleteFolder: (groupId: string, tripId: string, folderId: string) =>
    api<{ ok: boolean }>(`${base(groupId, tripId)}/folders/${folderId}`, {
      method: "DELETE",
    }),

  // --- Packing list ---------------------------------------------------
  listPacking: (groupId: string, tripId: string) =>
    api<TripPackingItem[]>(`${base(groupId, tripId)}/packing`),

  createPacking: (
    groupId: string,
    tripId: string,
    payload: CreatePackingPayload,
  ) =>
    api<TripPackingItem>(`${base(groupId, tripId)}/packing`, {
      method: "POST",
      body: payload,
    }),

  updatePacking: (
    groupId: string,
    tripId: string,
    itemId: string,
    payload: UpdatePackingPayload,
  ) =>
    api<TripPackingItem>(`${base(groupId, tripId)}/packing/${itemId}`, {
      method: "PATCH",
      body: payload,
    }),

  togglePacking: (groupId: string, tripId: string, itemId: string) =>
    api<TripPackingItem>(
      `${base(groupId, tripId)}/packing/${itemId}/toggle`,
      { method: "POST" },
    ),

  deletePacking: (groupId: string, tripId: string, itemId: string) =>
    api<{ ok: boolean }>(`${base(groupId, tripId)}/packing/${itemId}`, {
      method: "DELETE",
    }),

  reorderPacking: (groupId: string, tripId: string, ids: string[]) =>
    api<TripPackingItem[]>(`${base(groupId, tripId)}/packing/reorder`, {
      method: "PUT",
      body: { ids },
    }),

  // --- Itinerary ------------------------------------------------------
  listItinerary: (groupId: string, tripId: string) =>
    api<TripItineraryItem[]>(`${base(groupId, tripId)}/itinerary`),

  createItinerary: (
    groupId: string,
    tripId: string,
    payload: CreateItineraryPayload,
  ) =>
    api<TripItineraryItem>(`${base(groupId, tripId)}/itinerary`, {
      method: "POST",
      body: payload,
    }),

  updateItinerary: (
    groupId: string,
    tripId: string,
    itemId: string,
    payload: UpdateItineraryPayload,
  ) =>
    api<TripItineraryItem>(`${base(groupId, tripId)}/itinerary/${itemId}`, {
      method: "PATCH",
      body: payload,
    }),

  deleteItinerary: (groupId: string, tripId: string, itemId: string) =>
    api<{ ok: boolean }>(`${base(groupId, tripId)}/itinerary/${itemId}`, {
      method: "DELETE",
    }),

  reorderItinerary: (
    groupId: string,
    tripId: string,
    dayDate: string,
    ids: string[],
  ) =>
    api<TripItineraryItem[]>(`${base(groupId, tripId)}/itinerary/reorder`, {
      method: "PUT",
      body: { day_date: dayDate, ids },
    }),
};
