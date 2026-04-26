import { ClipboardList, Eraser, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { groupsApi } from "../api/groups";
import type { GroupSummary, Task } from "../api/types";
import LoadingState from "../components/LoadingState";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { personalTasksApi, tasksApi } from "../tools/tasks/api";
import {
  AddTaskForm,
  AssigneeChip,
  DueChip,
  PriorityChip,
  TaskRow,
  type TaskClient,
} from "../tools/tasks/TaskComponents";
import { useConfirm, useToast } from "../ui/UIProvider";

const OVERLAY_KEY = "tasks.personal.groupOverlay";

function loadOverlayPref(): boolean {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function saveOverlayPref(v: boolean): void {
  try {
    localStorage.setItem(OVERLAY_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

interface AssignedGroupTasks {
  group: GroupSummary;
  tasks: Task[];
}

/**
 * Per-user tasks page at /me/tasks. Combines two feeds:
 *
 * 1. "Meine Aufgaben" - genuine personal tasks owned by the current
 *    user (full CRUD, no assignee concept).
 * 2. "Mir zugeteilt in Gruppen" - tasks from every group the user is
 *    a member of, filtered to ones assigned to the user. Tickable
 *    inline; edits jump to the group's task page.
 */
export default function PersonalTasksPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [personalTasks, setPersonalTasks] = useState<Task[] | null>(null);
  const [assigned, setAssigned] = useState<AssignedGroupTasks[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState<boolean>(() =>
    loadOverlayPref(),
  );
  const [showAdd, setShowAdd] = useState(false);
  const [clearing, setClearing] = useState(false);

  const reload = useCallback(() => {
    Promise.all([
      personalTasksApi.list(),
      showOverlay
        ? groupsApi.list().catch(() => [] as GroupSummary[])
        : Promise.resolve([] as GroupSummary[]),
    ])
      .then(async ([personal, groups]) => {
        setPersonalTasks(personal);
        if (groups.length === 0 || !user) {
          setAssigned([]);
          return;
        }
        const bundles = await Promise.all(
          groups.map(async (g) => ({
            group: g,
            tasks: (await tasksApi
              .list(g.id)
              .catch(() => [] as Task[]))
              .filter((tk) => tk.assigned_to === user.id),
          })),
        );
        setAssigned(bundles);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [t, showOverlay, user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const personalClient = useMemo<TaskClient>(
    () => ({
      create: (body) => {
        // Strip assigned_to - personal tasks reject it at the API boundary.
        const { assigned_to: _assignedTo, ...rest } = body;
        return personalTasksApi.create(rest);
      },
      toggle: (id, done) => personalTasksApi.toggle(id, done),
      update: (id, body) => {
        const { assigned_to: _assignedTo, ...rest } = body;
        return personalTasksApi.update(id, rest);
      },
      remove: async (id) => {
        await personalTasksApi.remove(id);
      },
      clearDone: () => personalTasksApi.clearDone(),
    }),
    [],
  );

  const { open, done, allDoneCount } = useMemo(() => {
    if (!personalTasks) {
      return {
        open: [] as Task[],
        done: [] as Task[],
        allDoneCount: 0,
      };
    }
    return {
      open: personalTasks.filter((tk) => !tk.is_done),
      done: personalTasks.filter((tk) => tk.is_done),
      allDoneCount: personalTasks.filter((tk) => tk.is_done).length,
    };
  }, [personalTasks]);

  function replacePersonal(updated: Task) {
    setPersonalTasks((prev) =>
      prev ? prev.map((tk) => (tk.id === updated.id ? updated : tk)) : prev,
    );
  }
  function removePersonalLocal(id: string) {
    setPersonalTasks((prev) =>
      prev ? prev.filter((tk) => tk.id !== id) : prev,
    );
  }
  function prependPersonal(task: Task) {
    setPersonalTasks((prev) => (prev ? [task, ...prev] : [task]));
  }

  async function onClearDone() {
    if (allDoneCount === 0) return;
    const ok = await confirm({
      title: t("tasks.overview.clearTitle"),
      message: t("tasks.overview.clearConfirm", { count: allDoneCount }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    setClearing(true);
    try {
      await personalTasksApi.clearDone();
      setPersonalTasks((prev) =>
        prev ? prev.filter((tk) => !tk.is_done) : prev,
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setClearing(false);
    }
  }

  async function onToggleAssigned(groupId: string, task: Task) {
    // Optimistic flip; revert on error.
    const optimistic: Task = {
      ...task,
      is_done: !task.is_done,
      done_at: !task.is_done ? new Date().toISOString() : null,
    };
    setAssigned((prev) =>
      prev.map((bundle) =>
        bundle.group.id === groupId
          ? {
              ...bundle,
              tasks: bundle.tasks.map((tk) =>
                tk.id === task.id ? optimistic : tk,
              ),
            }
          : bundle,
      ),
    );
    try {
      const updated = await tasksApi.toggle(groupId, task.id);
      setAssigned((prev) =>
        prev.map((bundle) =>
          bundle.group.id === groupId
            ? {
                ...bundle,
                tasks: bundle.tasks.map((tk) =>
                  tk.id === task.id ? updated : tk,
                ),
              }
            : bundle,
        ),
      );
    } catch (e) {
      setAssigned((prev) =>
        prev.map((bundle) =>
          bundle.group.id === groupId
            ? {
                ...bundle,
                tasks: bundle.tasks.map((tk) =>
                  tk.id === task.id ? task : tk,
                ),
              }
            : bundle,
        ),
      );
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  if (error && !personalTasks) {
    return <p className="alert-error">{error}</p>;
  }
  if (!personalTasks) {
    return <LoadingState />;
  }

  const assignedNonEmpty = assigned.filter((b) => b.tasks.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        backLink={{ to: "/", label: t("layout.backToDashboard") }}
        title={t("tasks.personal.title")}
        subtitle={t("tasks.personal.subtitle")}
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

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
          checked={showOverlay}
          onChange={(e) => {
            const next = e.target.checked;
            setShowOverlay(next);
            saveOverlayPref(next);
          }}
        />
        {t("tasks.personal.toggleOverlay")}
      </label>

      {showAdd && (
        <AddTaskForm
          group={null}
          client={personalClient}
          onCreated={(task) => {
            prependPersonal(task);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">
          {t("tasks.personal.yourTasksTitle")}
        </h2>
        {personalTasks.length === 0 ? (
          <div className="card p-8 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
            <h3 className="mt-3 text-lg font-semibold">
              {t("tasks.personal.emptyTitle")}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("tasks.personal.emptyHint")}
            </p>
          </div>
        ) : (
          <>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("tasks.overview.openTitle", { count: open.length })}
            </h3>
            {open.length === 0 ? (
              <p className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {t("tasks.overview.allDone")}
              </p>
            ) : (
              <ul className="card divide-y divide-slate-100 overflow-hidden p-0 dark:divide-slate-800">
                {open.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    group={null}
                    client={personalClient}
                    onReplace={replacePersonal}
                    onRemove={removePersonalLocal}
                  />
                ))}
              </ul>
            )}

            {done.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("tasks.overview.doneTitle", { count: done.length })}
                  </h3>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onClearDone}
                    disabled={clearing}
                  >
                    <Eraser className="h-4 w-4" />
                    {t("tasks.overview.clearDone")}
                  </button>
                </div>
                <ul className="card divide-y divide-slate-100 overflow-hidden p-0 dark:divide-slate-800">
                  {done.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      group={null}
                      client={personalClient}
                      onReplace={replacePersonal}
                      onRemove={removePersonalLocal}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {showOverlay && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">
            {t("tasks.personal.assignedInGroups")}
          </h2>
          {assignedNonEmpty.length === 0 ? (
            <p className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {t("tasks.personal.noAssignedTasks")}
            </p>
          ) : (
            <div className="space-y-4">
              {assignedNonEmpty.map((bundle) => (
                <div key={bundle.group.id} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {bundle.group.name}
                    </h3>
                    <Link
                      to={`/groups/${bundle.group.id}/tasks`}
                      className="text-xs text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {t("tasks.personal.openInGroup")}
                    </Link>
                  </div>
                  <ul className="card divide-y divide-slate-100 overflow-hidden p-0 dark:divide-slate-800">
                    {bundle.tasks.map((task) => (
                      <AssignedTaskRow
                        key={task.id}
                        task={task}
                        groupId={bundle.group.id}
                        onToggle={() => onToggleAssigned(bundle.group.id, task)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Read-only-ish row for a task assigned in a group. The checkbox flips
 * `is_done` inline; everything else links to the group task page so
 * the user doesn't accidentally re-implement the full edit flow here.
 */
function AssignedTaskRow({
  task,
  groupId,
  onToggle,
}: {
  task: Task;
  groupId: string;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <li className="flex items-start gap-3 p-3 sm:p-4">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={task.is_done}
        aria-label={
          task.is_done
            ? t("tasks.overview.markOpen")
            : t("tasks.overview.markDone")
        }
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
          task.is_done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-slate-300 hover:border-brand-500 dark:border-slate-600"
        }`}
      >
        {task.is_done ? (
          <span aria-hidden className="text-xs">
            ✓
          </span>
        ) : null}
      </button>
      <Link
        to={`/groups/${groupId}/tasks`}
        className="min-w-0 flex-1 space-y-1"
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={`break-words font-medium ${
              task.is_done
                ? "text-slate-400 line-through dark:text-slate-500"
                : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {task.title}
          </span>
          {!task.is_done && task.priority !== "normal" && (
            <PriorityChip priority={task.priority} />
          )}
          {task.due_date && (
            <DueChip dueDate={task.due_date} isDone={task.is_done} />
          )}
          {task.assigned_to_display_name && (
            <AssigneeChip name={task.assigned_to_display_name} />
          )}
        </div>
        {task.description && (
          <p
            className={`whitespace-pre-line break-words text-sm ${
              task.is_done
                ? "text-slate-400 dark:text-slate-500"
                : "text-slate-600 dark:text-slate-300"
            }`}
          >
            {task.description}
          </p>
        )}
      </Link>
    </li>
  );
}
