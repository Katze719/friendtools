import {
  ChevronDown,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  ImagePlus,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Type,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api/client";
import type { GroupDetail, Trip, TripFolder, TripLink } from "../../api/types";
import LoadingState from "../../components/LoadingState";
import { formatDate } from "../../lib/format";
import { useConfirm, useToast } from "../../ui/UIProvider";
import { tripsApi } from "./api";

/**
 * A "virtual" folder the UI renders: either a real TripFolder or the
 * synthetic "Unsorted" bucket for links with folder_id === null.
 */
type Section = {
  id: string | null;
  name: string;
  folder?: TripFolder;
};

const UNSORTED_KEY = "__unsorted__";
const COLLAPSE_STORAGE_PREFIX = "friendflow.tripFolders.collapsed.";

function sectionKey(id: string | null): string {
  return id ?? UNSORTED_KEY;
}

function readCollapsed(tripId: string | undefined): Set<string> {
  if (!tripId || typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_PREFIX + tripId);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeCollapsed(tripId: string | undefined, collapsed: Set<string>) {
  if (!tripId) return;
  try {
    localStorage.setItem(
      COLLAPSE_STORAGE_PREFIX + tripId,
      JSON.stringify([...collapsed]),
    );
  } catch {
    /* storage may be disabled; nothing we can do */
  }
}

/**
 * Drag payload encoded as text/plain when moving a link. The browser's
 * DataTransfer is unreliable across frames, so we also stash the dragged id
 * in a module-local ref as a fallback.
 */
const DRAG_MIME = "application/x-friendflow-trip-link";

export default function LinksTab({
  group,
  trip,
}: {
  group: GroupDetail;
  trip: Trip;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [links, setLinks] = useState<TripLink[] | null>(null);
  const [folders, setFolders] = useState<TripFolder[] | null>(null);
  const [composerFolderId, setComposerFolderId] = useState<
    string | null | undefined
  >(undefined);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    readCollapsed(trip.id),
  );

  useEffect(() => {
    setCollapsed(readCollapsed(trip.id));
  }, [trip.id]);

  const toggleCollapsed = useCallback(
    (id: string | null) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        const key = sectionKey(id);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        writeCollapsed(trip.id, next);
        return next;
      });
    },
    [trip.id],
  );

  const reload = useCallback(() => {
    Promise.all([
      tripsApi.listLinks(group.id, trip.id),
      tripsApi.listFolders(group.id, trip.id),
    ])
      .then(([l, f]) => {
        setLinks(l);
        setFolders(f);
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : t("common.error")));
  }, [group.id, trip.id, t, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const replaceLink = useCallback((updated: TripLink) => {
    setLinks((prev) =>
      prev ? prev.map((l) => (l.id === updated.id ? updated : l)) : prev,
    );
  }, []);

  const sections: Section[] = useMemo(() => {
    const list: Section[] = (folders ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      folder: f,
    }));
    list.push({ id: null, name: t("trips.overview.unsorted") });
    return list;
  }, [folders, t]);

  if (!links || !folders) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          className="btn-secondary"
          onClick={() => {
            setShowFolderForm((v) => !v);
            setComposerFolderId(undefined);
          }}
          aria-expanded={showFolderForm}
        >
          <FolderPlus className="h-4 w-4" /> {t("trips.overview.newFolder")}
        </button>
        <button
          className="btn-primary"
          onClick={() => {
            setComposerFolderId((v) => (v === undefined ? null : undefined));
            setShowFolderForm(false);
          }}
          aria-expanded={composerFolderId !== undefined}
        >
          <Plus className="h-4 w-4" /> {t("trips.overview.add")}
        </button>
      </div>

      {showFolderForm && (
        <AddFolderForm
          groupId={group.id}
          tripId={trip.id}
          onDone={(created) => {
            setShowFolderForm(false);
            if (created) reload();
          }}
        />
      )}

      {composerFolderId !== undefined && (
        <AddLinkForm
          groupId={group.id}
          tripId={trip.id}
          folders={folders}
          existingUrls={links.map((l) => l.url)}
          initialFolderId={composerFolderId}
          onDone={(created) => {
            setComposerFolderId(undefined);
            if (created) reload();
          }}
        />
      )}

      {links.length === 0 && folders.length === 0 ? (
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
        <div className="space-y-8">
          {sections.map((section) => {
            const inFolder = links
              .filter((l) => l.folder_id === section.id)
              .sort((a, b) => a.position - b.position);
            if (
              section.id === null &&
              inFolder.length === 0 &&
              folders.length > 0
            ) {
              return null;
            }
            const key = sectionKey(section.id);
            return (
              <FolderSection
                key={key}
                section={section}
                links={inFolder}
                groupId={group.id}
                tripId={trip.id}
                folders={folders}
                collapsed={collapsed.has(key)}
                onToggleCollapsed={() => toggleCollapsed(section.id)}
                onAddLinkHere={() => {
                  setComposerFolderId(section.id);
                  setShowFolderForm(false);
                }}
                onChanged={reload}
                onReplace={replaceLink}
                onLocalSetLinks={(next) => setLinks(next)}
                allLinks={links}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function FolderSection({
  section,
  links,
  groupId,
  tripId,
  folders,
  collapsed,
  onToggleCollapsed,
  onAddLinkHere,
  onChanged,
  onReplace,
  onLocalSetLinks,
  allLinks,
}: {
  section: Section;
  links: TripLink[];
  groupId: string;
  tripId: string;
  folders: TripFolder[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onAddLinkHere: () => void;
  onChanged: () => void;
  onReplace: (updated: TripLink) => void;
  onLocalSetLinks: (next: TripLink[]) => void;
  allLinks: TripLink[];
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(section.name);
  const [dragOver, setDragOver] = useState(false);
  const dragFrom = useRef<string | null>(null);

  const isUnsorted = section.id === null;

  useEffect(() => {
    setName(section.name);
  }, [section.name]);

  const confirm = useConfirm();
  const toast = useToast();

  async function onDeleteFolder() {
    if (!section.folder) return;
    const ok = await confirm({
      title: t("trips.overview.folder.deleteTitle"),
      message: t("trips.overview.folder.deleteConfirm", {
        name: section.folder.name,
      }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await tripsApi.deleteFolder(groupId, tripId, section.folder.id);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  async function saveRename(e: FormEvent) {
    e.preventDefault();
    if (!section.folder) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await tripsApi.updateFolder(groupId, tripId, section.folder.id, trimmed);
      setRenaming(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    }
  }

  /**
   * Commit a reorder within this folder: optimistic local update, then ask
   * the server to rewrite positions. Revert on failure.
   */
  async function commitReorder(nextOrder: TripLink[]) {
    const prev = allLinks;
    // Rewrite the whole allLinks array preserving other folders' ordering.
    const next = allLinks.filter((l) => l.folder_id !== section.id);
    for (const l of nextOrder) next.push(l);
    onLocalSetLinks(next);
    try {
      await tripsApi.reorderLinks(
        groupId,
        tripId,
        section.id,
        nextOrder.map((l) => l.id),
      );
    } catch (e) {
      onLocalSetLinks(prev);
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  async function handleDropIntoSection(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const id = dragFrom.current ?? e.dataTransfer.getData(DRAG_MIME);
    dragFrom.current = null;
    if (!id) return;
    const moved = allLinks.find((l) => l.id === id);
    if (!moved) return;
    if (moved.folder_id === section.id) return;
    // Cross-folder move: call moveLink (it also appends at the end).
    try {
      const updated = await tripsApi.moveLink(groupId, tripId, id, section.id);
      onReplace(updated);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    }
  }

  async function handleDropOnCard(overId: string) {
    const fromId = dragFrom.current;
    dragFrom.current = null;
    if (!fromId || fromId === overId) return;
    const fromLink = allLinks.find((l) => l.id === fromId);
    if (!fromLink) return;

    if (fromLink.folder_id !== section.id) {
      // Cross-folder move onto a specific card; just move to this folder;
      // backend places it at the end. The user can drag again to fine-tune.
      try {
        const updated = await tripsApi.moveLink(
          groupId,
          tripId,
          fromId,
          section.id,
        );
        onReplace(updated);
        onChanged();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t("common.error"));
      }
      return;
    }

    const next = links.slice();
    const fromIdx = next.findIndex((l) => l.id === fromId);
    const toIdx = next.findIndex((l) => l.id === overId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [m] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, m);
    await commitReorder(next);
  }

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDropIntoSection}
      className={`rounded-lg transition ${
        dragOver ? "bg-brand-50/50 ring-2 ring-brand-300 dark:bg-brand-900/10" : ""
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {renaming && section.folder ? (
          <form onSubmit={saveRename} className="flex flex-wrap items-center gap-2">
            <FolderOpen className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              autoFocus
              className="input h-8 w-60 max-w-full py-1 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
            <button type="submit" className="btn-primary h-8 py-1 text-sm">
              {t("common.save")}
            </button>
            <button
              type="button"
              className="btn-ghost h-8 py-1 text-sm"
              onClick={() => {
                setName(section.name);
                setRenaming(false);
              }}
            >
              {t("common.cancel")}
            </button>
          </form>
        ) : (
          <>
            <h2 className="text-lg font-semibold">
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-expanded={!collapsed}
                className="inline-flex items-center gap-2 rounded-md text-left hover:text-brand-600 dark:hover:text-brand-400"
                title={
                  collapsed
                    ? t("trips.overview.folder.expand")
                    : t("trips.overview.folder.collapse")
                }
              >
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${
                    collapsed ? "-rotate-90" : ""
                  }`}
                />
                <FolderOpen
                  className={`h-4 w-4 ${
                    isUnsorted
                      ? "text-slate-400 dark:text-slate-500"
                      : "text-brand-500 dark:text-brand-400"
                  }`}
                />
                {section.name}
              </button>
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {links.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn-ghost -my-1 h-7 px-2 text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
                onClick={onAddLinkHere}
                aria-label={t("trips.overview.folder.addLinkAria", {
                  name: section.name,
                })}
                title={t("trips.overview.folder.addLink")}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              {section.folder && (
                <>
                  <button
                    type="button"
                    className="btn-ghost -my-1 h-7 px-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    onClick={() => setRenaming(true)}
                    aria-label={t("trips.overview.folder.renameAria")}
                    title={t("trips.overview.folder.rename")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost -my-1 h-7 px-2 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
                    onClick={onDeleteFolder}
                    aria-label={t("trips.overview.folder.deleteAria")}
                    title={t("trips.overview.folder.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {!collapsed &&
        (links.length === 0 ? (
          <p className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {t("trips.overview.folder.empty")}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {links.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                groupId={groupId}
                tripId={tripId}
                folders={folders}
                onChanged={onChanged}
                onReplace={onReplace}
                onDragStart={() => {
                  dragFrom.current = link.id;
                }}
                onDropOnCard={() => handleDropOnCard(link.id)}
              />
            ))}
          </ul>
        ))}
    </section>
  );
}

function LinkCard({
  link,
  groupId,
  tripId,
  folders,
  onChanged,
  onReplace,
  onDragStart,
  onDropOnCard,
}: {
  link: TripLink;
  groupId: string;
  tripId: string;
  folders: TripFolder[];
  onChanged: () => void;
  onReplace: (updated: TripLink) => void;
  onDragStart: () => void;
  onDropOnCard: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<null | "delete" | "refresh" | "move">(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(link.note);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [votingBusy, setVotingBusy] = useState(false);

  const effectiveTitle = link.title_override ?? link.title;
  const effectiveImage = link.image_override ?? link.image_url;
  const missingMetadata = !effectiveTitle && !effectiveImage;

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
      const updated = await tripsApi.voteLink(groupId, tripId, link.id, nextValue);
      onReplace(updated);
    } catch (e) {
      onReplace(link);
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
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
    const ok = await confirm({
      title: t("trips.overview.deleteTitle"),
      message: t("trips.overview.deleteConfirm"),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    setBusy("delete");
    try {
      await tripsApi.deleteLink(groupId, tripId, link.id);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  async function onRefresh() {
    setBusy("refresh");
    try {
      const updated = await tripsApi.refreshLink(groupId, tripId, link.id);
      onReplace(updated);
      if (!updated.title && !updated.image_url) {
        toast.info(t("trips.overview.refreshEmpty"));
      } else {
        toast.success(t("trips.overview.refreshDone"));
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  async function onMove(folderId: string | null) {
    if (folderId === link.folder_id) return;
    setBusy("move");
    try {
      const updated = await tripsApi.moveLink(groupId, tripId, link.id, folderId);
      onReplace(updated);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  async function saveNote(e: FormEvent) {
    e.preventDefault();
    try {
      await tripsApi.updateLink(groupId, tripId, link.id, { note: note.trim() });
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    }
  }

  return (
    <li
      className="card flex flex-col overflow-hidden"
      draggable
      onDragStart={(e) => {
        onDragStart();
        try {
          e.dataTransfer.setData(DRAG_MIME, link.id);
        } catch {
          /* some browsers reject custom mime types; we also use the ref. */
        }
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropOnCard();
      }}
    >
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block"
      >
        {effectiveImage ? (
          <div className="aspect-[16/9] overflow-hidden bg-slate-100 dark:bg-slate-800">
            <img
              src={effectiveImage}
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
            {effectiveTitle ?? link.url}
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

      {missingMetadata && (
        <div className="mx-3 mb-1 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          <span>{t("trips.overview.unfurlEmpty")}</span>
          <button
            type="button"
            className="btn-ghost h-6 px-1.5 py-0 text-xs"
            onClick={onRefresh}
            disabled={busy === "refresh"}
          >
            <RefreshCw
              className={`h-3 w-3 ${busy === "refresh" ? "animate-spin" : ""}`}
            />
            {t("trips.overview.retryUnfurl")}
          </button>
          <button
            type="button"
            className="btn-ghost h-6 px-1.5 py-0 text-xs"
            onClick={() => setOverrideOpen((v) => !v)}
          >
            <Type className="h-3 w-3" />
            {t("trips.overview.overrideManually")}
          </button>
        </div>
      )}

      {overrideOpen && (
        <OverrideForm
          link={link}
          groupId={groupId}
          tripId={tripId}
          onDone={(updated) => {
            setOverrideOpen(false);
            if (updated) onReplace(updated);
          }}
        />
      )}

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
            onClick={() => setEditing(true)}
            title={t("trips.overview.editNote")}
          >
            "{link.note}"
          </button>
        ) : (
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            onClick={() => setEditing(true)}
          >
            + {t("trips.overview.addNote")}
          </button>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="min-w-0 truncate">
            {t("trips.overview.addedBy", {
              name: link.added_by_display_name,
              date: formatDate(link.created_at),
            })}
          </span>
          <div className="flex items-center gap-1">
            <label
              className="sr-only"
              htmlFor={`folder-select-${link.id}`}
            >
              {t("trips.overview.folder.moveAria")}
            </label>
            <select
              id={`folder-select-${link.id}`}
              className="input-compact max-w-[10rem]"
              value={link.folder_id ?? ""}
              disabled={busy === "move"}
              onChange={(e) => onMove(e.target.value === "" ? null : e.target.value)}
              title={t("trips.overview.folder.moveAria")}
            >
              <option value="">{t("trips.overview.unsorted")}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-ghost -my-1"
              onClick={() => setOverrideOpen((v) => !v)}
              aria-label={t("trips.overview.overrideManually")}
              title={t("trips.overview.overrideManually")}
            >
              <ImagePlus className="h-3.5 w-3.5" />
            </button>
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
          </div>
        </div>
      </div>
    </li>
  );
}

function OverrideForm({
  link,
  groupId,
  tripId,
  onDone,
}: {
  link: TripLink;
  groupId: string;
  tripId: string;
  onDone: (updated: TripLink | null) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [title, setTitle] = useState(link.title_override ?? "");
  const [image, setImage] = useState(link.image_override ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Empty string clears the override; the server treats it the same as
      // null.
      const updated = await tripsApi.updateLink(groupId, tripId, link.id, {
        title_override: title.trim() === "" ? null : title.trim(),
        image_override: image.trim() === "" ? null : image.trim(),
      });
      onDone(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mx-3 mb-2 space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
    >
      <div className="space-y-1">
        <label className="label text-xs" htmlFor={`ovr-title-${link.id}`}>
          {t("trips.overview.overrideTitle")}
        </label>
        <input
          id={`ovr-title-${link.id}`}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={link.title ?? t("trips.overview.overrideTitlePlaceholder")}
          maxLength={500}
        />
      </div>
      <div className="space-y-1">
        <label className="label text-xs" htmlFor={`ovr-image-${link.id}`}>
          {t("trips.overview.overrideImage")}
        </label>
        <input
          id={`ovr-image-${link.id}`}
          className="input"
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="https://..."
          inputMode="url"
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("trips.overview.overrideHint")}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => onDone(null)}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
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

/**
 * Two URLs count as duplicates for our purposes if the normalised form
 * (hostname + path + sorted query string, no hash) matches. This is lenient
 * enough to catch UTM-tagged copies and strict enough not to collapse e.g.
 * two different listings on the same site.
 */
function normalizeUrl(input: string): string {
  try {
    const u = new URL(input.trim());
    const params = Array.from(u.searchParams.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const qs = params
      .filter(([k]) => !k.toLowerCase().startsWith("utm_"))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const path = u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}${qs ? "?" + qs : ""}`.toLowerCase();
  } catch {
    return input.trim().toLowerCase();
  }
}

function AddLinkForm({
  groupId,
  tripId,
  folders,
  existingUrls,
  initialFolderId,
  onDone,
}: {
  groupId: string;
  tripId: string;
  folders: TripFolder[];
  existingUrls: string[];
  initialFolderId: string | null;
  onDone: (created: boolean) => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [folderId, setFolderId] = useState<string>(initialFolderId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingNormalized = useMemo(
    () => new Set(existingUrls.map(normalizeUrl)),
    [existingUrls],
  );
  const localDuplicate = useMemo(() => {
    if (!url.trim()) return false;
    return existingNormalized.has(normalizeUrl(url));
  }, [url, existingNormalized]);

  async function post(force: boolean) {
    setError(null);
    setLoading(true);
    try {
      await tripsApi.createLink(groupId, tripId, {
        url: url.trim(),
        note: note.trim(),
        folder_id: folderId === "" ? null : folderId,
        force,
      });
      onDone(true);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.message.startsWith("duplicate_url")
      ) {
        const ok = await confirm({
          title: t("trips.overview.duplicateTitle"),
          message: t("trips.overview.duplicateConfirm"),
          confirmLabel: t("trips.overview.duplicateAdd"),
        });
        if (ok) {
          return post(true);
        }
      } else {
        setError(err instanceof ApiError ? err.message : t("common.error"));
      }
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (localDuplicate) {
      const ok = await confirm({
        title: t("trips.overview.duplicateTitle"),
        message: t("trips.overview.duplicateConfirm"),
        confirmLabel: t("trips.overview.duplicateAdd"),
      });
      if (!ok) return;
      await post(true);
      return;
    }
    await post(false);
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
          aria-describedby={localDuplicate ? "trip_url_duplicate" : undefined}
        />
        {localDuplicate && (
          <p
            id="trip_url_duplicate"
            className="text-xs text-amber-700 dark:text-amber-300"
          >
            {t("trips.overview.duplicateHint")}
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="label" htmlFor="trip_folder">
            {t("trips.overview.folder.label")}
          </label>
          <select
            id="trip_folder"
            className="input"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          >
            <option value="">{t("trips.overview.unsorted")}</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
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
      </div>
      {error && <p className="alert-error">{error}</p>}
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

function AddFolderForm({
  groupId,
  tripId,
  onDone,
}: {
  groupId: string;
  tripId: string;
  onDone: (created: boolean) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    try {
      await tripsApi.createFolder(groupId, tripId, trimmed);
      onDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h3 className="font-semibold">{t("trips.overview.folder.addTitle")}</h3>
      <div className="space-y-1">
        <label className="label" htmlFor="trip_folder_name">
          {t("trips.overview.folder.name")}
        </label>
        <input
          id="trip_folder_name"
          required
          maxLength={80}
          className="input"
          placeholder={t("trips.overview.folder.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      {error && <p className="alert-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => onDone(false)}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? t("common.saving") : t("trips.overview.folder.create")}
        </button>
      </div>
    </form>
  );
}
