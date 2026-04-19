import {
  ArrowLeft,
  Calendar,
  Check,
  ClipboardList,
  Eraser,
  Pencil,
  Plus,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type { GroupDetail, Task, TaskPriority } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { formatDate } from "../../lib/format";
import { useConfirm, useToast } from "../../ui/UIProvider";
import { tasksApi } from "./api";

type Filter = "all" | "mine" | "unassigned";

/**
 * Group-scoped todo list optimised for flat shares: each task can be
 * assigned to one member, carry a due date and a priority, and is
 * ticked off collaboratively.
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
    if (!groupId) return;
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
      await tasksApi.clearDone(groupId);
      setTasks((prev) => (prev ? prev.filter((tk) => !tk.is_done) : prev));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setClearing(false);
    }
  }

  if (error && !group) {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        {error}
      </p>
    );
  }
  if (!group || !tasks) {
    return (
      <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
    );
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: t("tasks.overview.filterAll") },
    { id: "mine", label: t("tasks.overview.filterMine") },
    { id: "unassigned", label: t("tasks.overview.filterUnassigned") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/groups/${group.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> {t("tasks.overview.backToGroup")}
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("tasks.overview.title")}
            </h1>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {group.name} - {t("tasks.overview.subtitle")}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAdd((v) => !v)}
          >
            <Plus className="h-4 w-4" />
            {t("tasks.overview.add")}
          </button>
        </div>
      </div>

      {showAdd && (
        <AddTaskForm
          group={group}
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

function AddTaskForm({
  group,
  onCreated,
  onCancel,
}: {
  group: GroupDetail;
  onCreated: (task: Task) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const created = await tasksApi.create(group.id, {
        title: trimmed,
        description: description.trim(),
        assigned_to: assignee === "" ? null : assignee,
        due_date: dueDate === "" ? null : dueDate,
        priority,
      });
      onCreated(created);
      setTitle("");
      setDescription("");
      setAssignee("");
      setDueDate("");
      setPriority("normal");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-3 sm:p-4">
      <div className="space-y-1">
        <label className="label" htmlFor="task_title">
          {t("tasks.overview.titleField")}
        </label>
        <input
          id="task_title"
          className="input"
          placeholder={t("tasks.overview.titlePlaceholder")}
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <label className="label" htmlFor="task_desc">
          {t("tasks.overview.descriptionOptional")}
        </label>
        <textarea
          id="task_desc"
          className="input min-h-[72px] resize-y"
          maxLength={2000}
          placeholder={t("tasks.overview.descriptionPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="label" htmlFor="task_assignee">
            {t("tasks.overview.assignee")}
          </label>
          <select
            id="task_assignee"
            className="input"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">{t("tasks.overview.unassigned")}</option>
            {group.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="task_due">
            {t("tasks.overview.dueDate")}
          </label>
          <input
            id="task_due"
            type="date"
            className="input"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="task_priority">
            {t("tasks.overview.priority")}
          </label>
          <select
            id="task_priority"
            className="input"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            <option value="low">{t("tasks.overview.priorityLow")}</option>
            <option value="normal">{t("tasks.overview.priorityNormal")}</option>
            <option value="high">{t("tasks.overview.priorityHigh")}</option>
          </select>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          <Plus className="h-4 w-4" />
          {saving ? t("common.saving") : t("tasks.overview.add")}
        </button>
      </div>
    </form>
  );
}

function TaskRow({
  task,
  group,
  onReplace,
  onRemove,
}: {
  task: Task;
  group: GroupDetail;
  onReplace: (updated: Task) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  async function onToggle() {
    if (busy) return;
    const optimistic: Task = {
      ...task,
      is_done: !task.is_done,
      done_at: !task.is_done ? new Date().toISOString() : null,
    };
    onReplace(optimistic);
    setBusy(true);
    try {
      const updated = await tasksApi.toggle(group.id, task.id);
      onReplace(updated);
    } catch (e) {
      onReplace(task);
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("tasks.overview.deleteTitle"),
      message: t("tasks.overview.deleteConfirm", { title: task.title }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await tasksApi.remove(group.id, task.id);
      onRemove(task.id);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="p-3 sm:p-4">
        <EditTaskForm
          task={task}
          group={group}
          onSaved={(updated) => {
            onReplace(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 p-3 sm:p-4">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-pressed={task.is_done}
        aria-label={
          task.is_done
            ? t("tasks.overview.markOpen")
            : t("tasks.overview.markDone")
        }
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
          task.is_done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-slate-300 text-transparent hover:border-brand-500 hover:text-brand-500 dark:border-slate-600"
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">
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
            className={`mt-1 whitespace-pre-line break-words text-sm ${
              task.is_done
                ? "text-slate-400 dark:text-slate-500"
                : "text-slate-600 dark:text-slate-300"
            }`}
          >
            {task.description}
          </p>
        )}
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          {task.is_done && task.done_by_display_name
            ? t("tasks.overview.doneBy", { name: task.done_by_display_name })
            : t("tasks.overview.addedBy", {
                name: task.created_by_display_name,
              })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="btn-ghost -my-1"
          onClick={() => setEditing(true)}
          aria-label={t("common.edit")}
          title={t("common.edit")}
          disabled={busy}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="btn-ghost -my-1 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
          onClick={onDelete}
          aria-label={t("common.delete")}
          title={t("common.delete")}
          disabled={busy}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

function EditTaskForm({
  task,
  group,
  onSaved,
  onCancel,
}: {
  task: Task;
  group: GroupDetail;
  onSaved: (updated: Task) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [assignee, setAssignee] = useState(task.assigned_to ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const updated = await tasksApi.update(group.id, task.id, {
        title: trimmed,
        description: description.trim(),
        assigned_to: assignee === "" ? null : assignee,
        due_date: dueDate === "" ? null : dueDate,
        priority,
      });
      onSaved(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <label className="label" htmlFor={`edt_${task.id}`}>
          {t("tasks.overview.titleField")}
        </label>
        <input
          id={`edt_${task.id}`}
          className="input"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <label className="label" htmlFor={`edd_${task.id}`}>
          {t("tasks.overview.descriptionOptional")}
        </label>
        <textarea
          id={`edd_${task.id}`}
          className="input min-h-[72px] resize-y"
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="label" htmlFor={`eda_${task.id}`}>
            {t("tasks.overview.assignee")}
          </label>
          <select
            id={`eda_${task.id}`}
            className="input"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">{t("tasks.overview.unassigned")}</option>
            {group.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor={`edu_${task.id}`}>
            {t("tasks.overview.dueDate")}
          </label>
          <input
            id={`edu_${task.id}`}
            type="date"
            className="input"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor={`edp_${task.id}`}>
            {t("tasks.overview.priority")}
          </label>
          <select
            id={`edp_${task.id}`}
            className="input"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            <option value="low">{t("tasks.overview.priorityLow")}</option>
            <option value="normal">{t("tasks.overview.priorityNormal")}</option>
            <option value="high">{t("tasks.overview.priorityHigh")}</option>
          </select>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}

function PriorityChip({ priority }: { priority: TaskPriority }) {
  const { t } = useTranslation();
  const styles: Record<TaskPriority, string> = {
    high: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    normal:
      "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    low: "bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400",
  };
  const labels: Record<TaskPriority, string> = {
    high: t("tasks.overview.priorityHigh"),
    normal: t("tasks.overview.priorityNormal"),
    low: t("tasks.overview.priorityLow"),
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[priority]}`}
    >
      {labels[priority]}
    </span>
  );
}

function DueChip({
  dueDate,
  isDone,
}: {
  dueDate: string;
  isDone: boolean;
}) {
  const { t } = useTranslation();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

  let tone = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  let label: string;
  if (isDone) {
    label = formatDate(dueDate);
  } else if (diffDays < 0) {
    tone = "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
    label = t("tasks.overview.dueOverdue", {
      count: Math.abs(diffDays),
      date: formatDate(dueDate),
    });
  } else if (diffDays === 0) {
    tone = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
    label = t("tasks.overview.dueToday");
  } else if (diffDays === 1) {
    tone = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
    label = t("tasks.overview.dueTomorrow");
  } else if (diffDays <= 7) {
    tone = "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300";
    label = t("tasks.overview.dueInDays", {
      count: diffDays,
      date: formatDate(dueDate),
    });
  } else {
    label = formatDate(dueDate);
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      <Calendar className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

function AssigneeChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
      <UserIcon className="h-3 w-3" aria-hidden />
      {name}
    </span>
  );
}
