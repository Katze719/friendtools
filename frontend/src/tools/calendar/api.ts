import { api } from "../../api/client";
import type { CalendarEvent } from "../../api/types";

export interface CreateEventPayload {
  title: string;
  description?: string;
  location?: string;
  starts_at: string; // ISO-8601 UTC
  ends_at?: string | null;
  all_day?: boolean;
}

export interface UpdateEventPayload {
  title?: string;
  description?: string;
  location?: string;
  starts_at?: string;
  /** `null` clears ends_at, `undefined` leaves untouched. */
  ends_at?: string | null;
  all_day?: boolean;
}

export const calendarApi = {
  list: (groupId: string) =>
    api<CalendarEvent[]>(`/api/groups/${groupId}/calendar/events`),
  create: (groupId: string, body: CreateEventPayload) =>
    api<CalendarEvent>(`/api/groups/${groupId}/calendar/events`, {
      method: "POST",
      body,
    }),
  update: (groupId: string, eventId: string, body: UpdateEventPayload) =>
    api<CalendarEvent>(`/api/groups/${groupId}/calendar/events/${eventId}`, {
      method: "PATCH",
      body,
    }),
  remove: (groupId: string, eventId: string) =>
    api<{ ok: true }>(`/api/groups/${groupId}/calendar/events/${eventId}`, {
      method: "DELETE",
    }),
};
