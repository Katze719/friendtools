import { api } from "./client";
import type { GroupDetail, GroupSummary } from "./types";

export const groupsApi = {
  list: () => api<GroupSummary[]>("/api/groups"),
  create: (name: string, currency = "EUR") =>
    api<GroupSummary>("/api/groups", {
      method: "POST",
      body: { name, currency },
    }),
  join: (inviteCode: string) =>
    api<GroupSummary>("/api/groups/join", {
      method: "POST",
      body: { invite_code: inviteCode },
    }),
  get: (id: string) => api<GroupDetail>(`/api/groups/${id}`),
  delete: (id: string) =>
    api<{ ok: boolean }>(`/api/groups/${id}`, { method: "DELETE" }),
};
