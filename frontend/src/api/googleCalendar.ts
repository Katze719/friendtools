import { api } from "./client";

export interface GoogleCalendarStatus {
  connected: boolean;
  calendar_id?: string;
}

export interface AuthorizeResponse {
  url: string;
}

export const googleCalendarApi = {
  status: () => api<GoogleCalendarStatus>("/api/me/google-calendar/status"),
  authorizeUrl: () =>
    api<AuthorizeResponse>("/api/me/google-calendar/authorize"),
  disconnect: () =>
    api<{ ok: boolean }>("/api/me/google-calendar/disconnect", {
      method: "POST",
      body: {},
    }),
};
