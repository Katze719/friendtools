import {
  ArrowLeft,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type { GroupDetail, TripLink } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { formatDate } from "../../lib/format";
import { tripsApi } from "./api";

export default function TripsOverviewPage() {
  const { t } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [links, setLinks] = useState<TripLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(() => {
    if (!groupId) return;
    Promise.all([groupsApi.get(groupId), tripsApi.list(groupId)])
      .then(([g, l]) => {
        setGroup(g);
        setLinks(l);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : t("common.error")));
  }, [groupId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (error && !group) {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        {error}
      </p>
    );
  }
  if (!group || !links) {
    return <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/groups/${group.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> {t("trips.overview.backToGroup")}
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("trips.overview.title")}
            </h1>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {group.name} - {t("trips.overview.subtitle")}
            </p>
          </div>
          <button
            className="btn-primary w-full sm:w-auto"
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
          >
            <Plus className="h-4 w-4" /> {t("trips.overview.add")}
          </button>
        </div>
      </div>

      {showForm && (
        <AddLinkForm
          groupId={group.id}
          onDone={(created) => {
            setShowForm(false);
            if (created) reload();
          }}
        />
      )}

      {links.length === 0 ? (
        <div className="card p-8 text-center">
          <Link2 className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <h2 className="mt-3 text-lg font-semibold">
            {t("trips.overview.empty.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("trips.overview.empty.description")}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {links.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              groupId={group.id}
              isMine={link.added_by === user?.id}
              onChanged={reload}
              onReplace={(updated) =>
                setLinks((prev) =>
                  prev
                    ? prev.map((l) => (l.id === updated.id ? updated : l))
                    : prev,
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkCard({
  link,
  groupId,
  isMine,
  onChanged,
  onReplace,
}: {
  link: TripLink;
  groupId: string;
  isMine: boolean;
  onChanged: () => void;
  onReplace: (updated: TripLink) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<null | "delete" | "refresh">(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(link.note);
  const [votingBusy, setVotingBusy] = useState(false);

  async function onVote(target: 1 | -1) {
    if (votingBusy) return;
    const nextValue: 1 | -1 | 0 = link.my_vote === target ? 0 : target;

    const optimistic: TripLink = {
      ...link,
      my_vote: nextValue,
      likes:
        link.likes +
        (nextValue === 1 ? 1 : 0) -
        (link.my_vote === 1 ? 1 : 0),
      dislikes:
        link.dislikes +
        (nextValue === -1 ? 1 : 0) -
        (link.my_vote === -1 ? 1 : 0),
    };
    onReplace(optimistic);

    setVotingBusy(true);
    try {
      const updated = await tripsApi.vote(groupId, link.id, nextValue);
      onReplace(updated);
    } catch (e) {
      // Rollback on failure.
      onReplace(link);
      alert(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setVotingBusy(false);
    }
  }

  const host = useMemo(() => {
    try {
      return new URL(link.url).hostname.replace(/^www\./, "");
    } catch {
      return link.url;
    }
  }, [link.url]);

  const favicon = useMemo(() => {
    try {
      const u = new URL(link.url);
      return `${u.protocol}//${u.hostname}/favicon.ico`;
    } catch {
      return null;
    }
  }, [link.url]);

  async function onDelete() {
    if (!confirm(t("trips.overview.deleteConfirm"))) return;
    setBusy("delete");
    try {
      await tripsApi.remove(groupId, link.id);
      onChanged();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  async function onRefresh() {
    setBusy("refresh");
    try {
      await tripsApi.refresh(groupId, link.id);
      onChanged();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  async function saveNote(e: FormEvent) {
    e.preventDefault();
    try {
      await tripsApi.update(groupId, link.id, { note: note.trim() });
      setEditing(false);
      onChanged();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t("common.error"));
    }
  }

  return (
    <li className="card flex flex-col overflow-hidden">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block"
      >
        {link.image_url ? (
          <div className="aspect-[16/9] overflow-hidden bg-slate-100 dark:bg-slate-800">
            <img
              src={link.image_url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition group-hover:scale-[1.02]"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        ) : null}

        <div className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {favicon && (
              <img
                src={favicon}
                alt=""
                width={14}
                height={14}
                className="h-3.5 w-3.5 rounded-sm"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <span className="truncate">{link.site_name ?? host}</span>
          </div>
          <h3 className="mt-1 line-clamp-2 text-base font-semibold">
            {link.title ?? link.url}
          </h3>
          {link.description && (
            <p className="mt-1 line-clamp-3 text-sm text-slate-600 dark:text-slate-300">
              {link.description}
            </p>
          )}
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 group-hover:underline dark:text-brand-400">
            <ExternalLink className="h-3 w-3" />
            <span className="truncate">{link.url}</span>
          </p>
        </div>
      </a>

      <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        <VoteButton
          active={link.my_vote === 1}
          count={link.likes}
          disabled={votingBusy}
          onClick={() => onVote(1)}
          kind="like"
          label={t("trips.overview.like")}
        />
        <VoteButton
          active={link.my_vote === -1}
          count={link.dislikes}
          disabled={votingBusy}
          onClick={() => onVote(-1)}
          kind="dislike"
          label={t("trips.overview.dislike")}
        />
      </div>

      <div className="border-t border-slate-100 p-3 dark:border-slate-800">
        {editing ? (
          <form onSubmit={saveNote} className="space-y-2">
            <textarea
              className="input min-h-[72px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("trips.overview.notePlaceholder")}
              maxLength={2000}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setNote(link.note);
                  setEditing(false);
                }}
              >
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn-primary">
                {t("common.save")}
              </button>
            </div>
          </form>
        ) : link.note ? (
          <button
            type="button"
            className="w-full text-left text-sm italic text-slate-700 hover:underline dark:text-slate-300"
            onClick={() => isMine && setEditing(true)}
            disabled={!isMine}
            title={isMine ? t("trips.overview.editNote") : undefined}
          >
            "{link.note}"
          </button>
        ) : (
          isMine && (
            <button
              type="button"
              className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              onClick={() => setEditing(true)}
            >
              + {t("trips.overview.addNote")}
            </button>
          )
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            {t("trips.overview.addedBy", {
              name: link.added_by_display_name,
              date: formatDate(link.created_at),
            })}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost -my-1"
              onClick={onRefresh}
              disabled={busy === "refresh"}
              aria-label={t("trips.overview.refresh")}
              title={t("trips.overview.refresh")}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${busy === "refresh" ? "animate-spin" : ""}`}
              />
            </button>
            {isMine && (
              <button
                type="button"
                className="btn-ghost -my-1 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
                onClick={onDelete}
                disabled={busy === "delete"}
                aria-label={t("common.delete")}
                title={t("common.delete")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function VoteButton({
  active,
  count,
  disabled,
  onClick,
  kind,
  label,
}: {
  active: boolean;
  count: number;
  disabled: boolean;
  onClick: () => void;
  kind: "like" | "dislike";
  label: string;
}) {
  const Icon = kind === "like" ? ThumbsUp : ThumbsDown;
  const activeCls =
    kind === "like"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800"
      : "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800";
  const idleCls =
    "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm transition disabled:opacity-60 ${
        active ? activeCls : idleCls
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? "fill-current" : ""}`} />
      <span className="tabular-nums text-xs font-medium">{count}</span>
    </button>
  );
}

function AddLinkForm({
  groupId,
  onDone,
}: {
  groupId: string;
  onDone: (created: boolean) => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await tripsApi.create(groupId, { url: url.trim(), note: note.trim() });
      onDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h3 className="font-semibold">{t("trips.overview.addTitle")}</h3>
      <div className="space-y-1">
        <label className="label" htmlFor="trip_url">
          {t("trips.overview.url")}
        </label>
        <input
          id="trip_url"
          type="url"
          required
          className="input"
          placeholder="https://www.airbnb.com/rooms/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="label" htmlFor="trip_note">
          {t("trips.overview.noteOptional")}
        </label>
        <textarea
          id="trip_note"
          className="input min-h-[72px]"
          placeholder={t("trips.overview.notePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
        />
      </div>
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => onDone(false)}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? t("common.saving") : t("trips.overview.add")}
        </button>
      </div>
    </form>
  );
}
