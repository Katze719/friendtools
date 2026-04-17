import { api } from "./client";
import type { AdminUserRow } from "./types";

export const adminApi = {
  listUsers: (status?: "pending" | "approved") => {
    const qs = status ? `?status=${status}` : "";
    return api<AdminUserRow[]>(`/api/admin/users${qs}`);
  },
  approve: (id: string) =>
    api<AdminUserRow>(`/api/admin/users/${id}/approve`, { method: "POST" }),
  promote: (id: string) =>
    api<AdminUserRow>(`/api/admin/users/${id}/promote`, { method: "POST" }),
  demote: (id: string) =>
    api<AdminUserRow>(`/api/admin/users/${id}/demote`, { method: "POST" }),
  remove: (id: string) =>
    api<{ ok: boolean }>(`/api/admin/users/${id}`, { method: "DELETE" }),
};
