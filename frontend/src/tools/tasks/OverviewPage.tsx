import { ClipboardList, Eraser, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type { GroupDetail, Task } from "../../api/types";
import LoadingState from "../../components/LoadingState";
import PageHeader from "../../components/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useConfirm, useToast } from "../../ui/UIProvider";
import { tasksApi } from "./api";
import {
  AddTaskForm,
  TaskRow,
  type TaskClient,
} from "./TaskComponents";

type Filter = "all" | "mine" | "unassigned";

/**
 * Group-scoped todo list optimised for flat shares: each task can be
 * assigned to one member, carry a due date and a priority, and is
 * ticked off collaboratively. The row/form UI is shared with the
 * personal /me/tasks page via `TaskComponents`.
 */
export default function TasksOverviewPage() {
  const { t } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [clearing, setClearing] = useState(false);

  const reload = useCallback(() => {
    if (!groupId) return;
    Promise.all([groupsApi.get(groupId), tasksApi.list(groupId)])
      .then(([g, list]) => {
        setGroup(g);
        setTasks(list);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [groupId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const client = useMemo<TaskClient | null>(() => {
    if (!groupId) return null;
    return {
      create: (body) => tasksApi.create(groupId, body),
      toggle: (id, done) => tasksApi.toggle(groupId, id, done),
      update: (id, body) => tasksApi.update(groupId, id, body),
      remove: async (id) => {
        await tasksApi.remove(groupId, id);
      },
      clearDone: () => tasksApi.clearDone(groupId),
    };
  }, [groupId]);

  const filtered = useMemo(() => {
    if (!tasks) return null;
    switch (filter) {
      case "mine":
        return tasks.filter((tk) => tk.assigned_to === user?.id);
      case "unassigned":
        return tasks.filter((tk) => !tk.assigned_to);
      default:
        return tasks;
    }
  }, [tasks, filter, user?.id]);

  const { open, done } = useMemo(() => {
    if (!filtered) return { open: [] as Task[], done: [] as Task[] };
    return {
      open: filtered.filter((tk) => !tk.is_done),
      done: filtered.filter((tk) => tk.is_done),
    };
  }, [filtered]);

  const allDoneCount = useMemo(
    () => (tasks ? tasks.filter((tk) => tk.is_done).length : 0),
    [tasks],
  );

  function replaceTask(updated: Task) {
    setTasks((prev) =>
      prev ? prev.map((tk) => (tk.id === updated.id ? updated : tk)) : prev,
    );
  }

  function removeTaskLocal(id: string) {
    setTasks((prev) => (prev ? prev.filter((tk) => tk.id !== id) : prev));
  }

  function prependTask(task: Task) {
    setTasks((prev) => (prev ? [task, ...prev] : [task]));
  }

  async function onClearDone() {
    if (!client || allDoneCount === 0) return;
    const ok = await confirm({
      title: t("tasks.overview.clearTitle"),
      message: t("tasks.overview.clearConfirm", { count: allDoneCount }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    setClearing(true);
    try {
      await client.clearDone();
      setTasks((prev) => (prev ? prev.filter((tk) => !tk.is_done) : prev));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setClearing(false);
    }
  }

  if (error && !group) {
    return <p className="alert-error">{error}</p>;
  }
  if (!group || !tasks || !client) {
    return <LoadingState />;
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: t("tasks.overview.filterAll") },
    { id: "mine", label: t("tasks.overview.filterMine") },
    { id: "unassigned", label: t("tasks.overview.filterUnassigned") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        backLink={{
          to: `/groups/${group.id}`,
          label: t("tasks.overview.backToGroup"),
        }}
        title={t("tasks.overview.title")}
        subtitle={`${group.name} - ${t("tasks.overview.subtitle")}`}
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAdd((v) => !v)}
          >
            <Plus className="h-4 w-4" />
            {t("tasks.overview.add")}
          </button>
        }
      />

      {showAdd && (
        <AddTaskForm
          group={group}
          client={client}
          onCreated={(task) => {
            prependTask(task);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <div
        className="flex flex-wrap items-center gap-1"
        role="tablist"
        aria-label={t("tasks.overview.filterAria")}
      >
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === f.id
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="card p-8 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <h2 className="mt-3 text-lg font-semibold">
            {t("tasks.overview.empty.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("tasks.overview.empty.description")}
          </p>
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-lg font-semibold">
              {t("tasks.overview.openTitle", { count: open.length })}
            </h2>
            {open.length === 0 ? (
              <p className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {filter === "all"
                  ? t("tasks.overview.allDone")
                  : t("tasks.overview.noneInFilter")}
              </p>
            ) : (
              <ul className="card divide-y divide-slate-100 overflow-hidden p-0 dark:divide-slate-800">
                {open.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    group={group}
                    client={client}
                    onReplace={replaceTask}
                    onRemove={removeTaskLocal}
                  />
                ))}
              </ul>
            )}
          </section>

          {done.length > 0 && (
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-600 dark:text-slate-300">
                  {t("tasks.overview.doneTitle", { count: done.length })}
                </h2>
                {allDoneCount > 0 && filter === "all" && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onClearDone}
                    disabled={clearing}
                  >
                    <Eraser className="h-4 w-4" />
                    {t("tasks.overview.clearDone")}
                  </button>
                )}
              </div>
              <ul className="card divide-y divide-slate-100 overflow-hidden p-0 dark:divide-slate-800">
                {done.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    group={group}
                    client={client}
                    onReplace={replaceTask}
                    onRemove={removeTaskLocal}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
