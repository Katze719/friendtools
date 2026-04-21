import { api } from "../../api/client";
import type { Task, TaskPriority } from "../../api/types";

export interface CreateTaskPayload {
  title: string;
  description?: string;
  /** Null / undefined = unassigned. */
  assigned_to?: string | null;
  /** ISO date (YYYY-MM-DD) or null. */
  due_date?: string | null;
  priority?: TaskPriority;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  /** Pass `null` to clear the assignee, omit to keep as-is. */
  assigned_to?: string | null;
  /** Pass `null` to clear the due date, omit to keep as-is. */
  due_date?: string | null;
  priority?: TaskPriority;
}

export const tasksApi = {
  list: (groupId: string) => api<Task[]>(`/api/groups/${groupId}/tasks`),
  create: (groupId: string, body: CreateTaskPayload) =>
    api<Task>(`/api/groups/${groupId}/tasks`, {
      method: "POST",
      body,
    }),
  update: (groupId: string, taskId: string, body: UpdateTaskPayload) =>
    api<Task>(`/api/groups/${groupId}/tasks/${taskId}`, {
      method: "PATCH",
      body,
    }),
  toggle: (groupId: string, taskId: string, done?: boolean) =>
    api<Task>(`/api/groups/${groupId}/tasks/${taskId}/toggle`, {
      method: "PUT",
      body: done === undefined ? {} : { done },
    }),
  remove: (groupId: string, taskId: string) =>
    api<{ ok: true }>(`/api/groups/${groupId}/tasks/${taskId}`, {
      method: "DELETE",
    }),
  clearDone: (groupId: string) =>
    api<{ ok: true; removed: number }>(
      `/api/groups/${groupId}/tasks/clear-done`,
      { method: "POST" },
    ),
};

/** Personal tasks owned by the authenticated user. The backend rejects
 *  `assigned_to` in payloads here (the owner is implicit), so the UI
 *  must never try to set one. */
export const personalTasksApi = {
  list: () => api<Task[]>("/api/me/tasks"),
  create: (body: Omit<CreateTaskPayload, "assigned_to">) =>
    api<Task>("/api/me/tasks", { method: "POST", body }),
  update: (taskId: string, body: Omit<UpdateTaskPayload, "assigned_to">) =>
    api<Task>(`/api/me/tasks/${taskId}`, { method: "PATCH", body }),
  toggle: (taskId: string, done?: boolean) =>
    api<Task>(`/api/me/tasks/${taskId}/toggle`, {
      method: "PUT",
      body: done === undefined ? {} : { done },
    }),
  remove: (taskId: string) =>
    api<{ ok: true }>(`/api/me/tasks/${taskId}`, { method: "DELETE" }),
  clearDone: () =>
    api<{ ok: true; removed: number }>("/api/me/tasks/clear-done", {
      method: "POST",
    }),
};
