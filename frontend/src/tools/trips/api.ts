import { api } from "../../api/client";
import type { TripLink } from "../../api/types";

export const tripsApi = {
  list: (groupId: string) =>
    api<TripLink[]>(`/api/groups/${groupId}/trips/links`),

  create: (groupId: string, payload: { url: string; note?: string }) =>
    api<TripLink>(`/api/groups/${groupId}/trips/links`, {
      method: "POST",
      body: payload,
    }),

  update: (groupId: string, linkId: string, payload: { note?: string }) =>
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
};
