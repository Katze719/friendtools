import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Link2,
  Lock,
  LogOut,
  RefreshCw,
  Share2,
  Star,
  Trash2,
  Unlock,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { groupsApi } from "../api/groups";
import type { GroupDetail } from "../api/types";
import LoadingState from "../components/LoadingState";
import { formatDate } from "../lib/format";
import { toolPath, tools } from "../tools";
import { useFavoriteTools } from "../tools/useFavoriteTools";
import { useConfirm, useToast } from "../ui/UIProvider";

export default function GroupHome() {
  const { t } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [showQr, setShowQr] = useState(false);
  const { isFavorite, toggle: toggleFavorite } = useFavoriteTools();

  // Favorites first, otherwise preserve the declaration order from `tools`.
  const orderedTools = useMemo(() => {
    return [...tools].sort((a, b) => {
      const af = isFavorite(a.id) ? 0 : 1;
      const bf = isFavorite(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return tools.indexOf(a) - tools.indexOf(b);
    });
  }, [isFavorite]);

  const inviteUrl = useMemo(() => {
    if (!group?.invite_code) return "";
    return `${window.location.origin}/i/${group.invite_code}`;
  }, [group]);

  const reload = useCallback(() => {
    if (!groupId) return;
    groupsApi
      .get(groupId)
      .then(setGroup)
      .catch((e) => setError(e instanceof ApiError ? e.message : t("common.error")));
  }, [groupId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onCopy(what: "code" | "link") {
    try {
      if (!group?.invite_code) return;
      const text = what === "code" ? group.invite_code : inviteUrl;
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
    } catch {
      /* clipboard may be unavailable in insecure contexts */
    }
  }

  async function onShare() {
    if (!group?.invite_code) return;
    const shareData = {
      title: group.name,
      text: t("group.shareText", { name: group.name }),
      url: inviteUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await onCopy("link");
      }
    } catch {
      /* user cancelled or share failed */
    }
  }

  async function onOpenInvites() {
    if (!group) return;
    try {
      await groupsApi.openInvites(group.id);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  async function onRegenerateInvite() {
    if (!group) return;
    const ok = await confirm({
      title: t("group.regenerateTitle"),
      message: t("group.regenerateConfirm"),
      confirmLabel: t("group.regenerate"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await groupsApi.openInvites(group.id);
      setShowQr(false);
      setCopied(null);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  async function onCloseInvites() {
    if (!group) return;
    const ok = await confirm({
      title: t("group.closeInvitesTitle"),
      message: t("group.closeInvitesConfirm", { name: group.name }),
      confirmLabel: t("group.closeInvites"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await groupsApi.closeInvites(group.id);
      setShowQr(false);
      setCopied(null);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  async function onDelete() {
    if (!group) return;
    const ok = await confirm({
      title: t("group.deleteTitle"),
      message: t("group.deleteConfirm", { name: group.name }),
      confirmLabel: t("common.delete"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await groupsApi.delete(group.id);
      navigate("/");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  async function onLeave() {
    if (!group) return;
    const ok = await confirm({
      title: t("group.leaveTitle"),
      message: t("group.leaveConfirm", { name: group.name }),
      confirmLabel: t("group.leave"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await groupsApi.leave(group.id);
      navigate("/");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    }
  }

  if (error && !group) {
    return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>;
  }
  if (!group) return <LoadingState />;

  const isOwner = group.my_role === "owner";

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> {t("group.backToGroups")}
        </Link>
        <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
          {group.name}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("group.members", { count: group.members.length })} - {group.currency}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("group.tools")}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orderedTools.map((tool) => {
            const Icon = tool.icon;
            const fav = isFavorite(tool.id);
            return (
              <li key={tool.id} className="relative">
                <Link
                  to={toolPath(group.id, tool)}
                  className="card group flex h-full flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-center gap-3 pr-8">
                    <span
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-white ${tool.accent}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {t(tool.nameKey)}
                    </h3>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {t(tool.descriptionKey)}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:gap-2 transition-all dark:text-brand-400">
                    {t("group.open")} <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFavorite(tool.id);
                  }}
                  aria-pressed={fav}
                  aria-label={
                    fav
                      ? t("group.toolFavorite.remove")
                      : t("group.toolFavorite.add")
                  }
                  title={
                    fav
                      ? t("group.toolFavorite.remove")
                      : t("group.toolFavorite.add")
                  }
                  className={`absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    fav
                      ? "text-amber-500 dark:text-amber-400"
                      : "text-slate-300 hover:text-amber-500 dark:text-slate-600 dark:hover:text-amber-400"
                  }`}
                >
                  <Star
                    className="h-5 w-5"
                    fill={fav ? "currentColor" : "none"}
                    strokeWidth={fav ? 1.5 : 2}
                  />
                </button>
              </li>
            );
          })}
          <li className="card flex flex-col items-start gap-2 p-5 ring-dashed ring-2 ring-slate-200 bg-slate-50/60 dark:ring-slate-700 dark:bg-slate-900/40">
            <h3 className="text-lg font-semibold text-slate-500 dark:text-slate-400">
              {t("group.more.title")}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("group.more.description")}
            </p>
          </li>
        </ul>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-semibold">{t("group.membersTitle")}</h2>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {group.members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{m.display_name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {m.email} - {t("group.joined", { date: formatDate(m.joined_at) })}
                  </p>
                </div>
                {m.role === "owner" && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                    {t("dashboard.roleOwner")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="card space-y-4 p-5">
          {group.invite_code ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="label">{t("group.inviteCode")}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm tracking-widest">
                      {group.invite_code}
                    </span>
                    <button
                      className="btn-ghost -my-1"
                      onClick={() => onCopy("code")}
                      aria-label={t("group.copyCode")}
                    >
                      <Copy className="h-4 w-4" />
                      <span className="text-xs">
                        {copied === "code"
                          ? t("common.copied")
                          : t("common.copy")}
                      </span>
                    </button>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <Unlock className="h-3 w-3" /> {t("group.invitesOpen")}
                </span>
              </div>

              <div>
                <p className="label">{t("group.inviteLink")}</p>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="input min-w-0 flex-1 truncate font-mono text-xs"
                    aria-label={t("group.inviteLink")}
                  />
                  <button
                    className="btn-ghost -my-1 shrink-0"
                    onClick={() => onCopy("link")}
                    aria-label={t("group.copyLink")}
                    title={t("group.copyLink")}
                  >
                    <Link2 className="h-4 w-4" />
                    <span className="hidden text-xs sm:inline">
                      {copied === "link"
                        ? t("common.copied")
                        : t("common.copy")}
                    </span>
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={onShare}>
                    <Share2 className="h-4 w-4" /> {t("group.share")}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setShowQr((v) => !v)}
                    aria-expanded={showQr}
                  >
                    {showQr ? t("group.hideQr") : t("group.showQr")}
                  </button>
                </div>
                {showQr && (
                  <div className="mt-3 flex flex-col items-center gap-2 rounded-xl bg-white p-4 dark:bg-slate-100">
                    <QRCodeSVG
                      value={inviteUrl}
                      size={192}
                      level="M"
                      marginSize={2}
                      bgColor="#ffffff"
                      fgColor="#0f172a"
                    />
                    <p className="text-center text-xs text-slate-600">
                      {t("group.qrHint")}
                    </p>
                  </div>
                )}
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("group.inviteHint")}
                </p>
              </div>

              {isOwner && (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button className="btn-secondary" onClick={onRegenerateInvite}>
                    <RefreshCw className="h-4 w-4" /> {t("group.regenerate")}
                  </button>
                  <button
                    className="btn-ghost text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
                    onClick={onCloseInvites}
                  >
                    <Lock className="h-4 w-4" /> {t("group.closeInvites")}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="label">{t("group.inviteCode")}</p>
                  <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t("group.invitesClosed")}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <Lock className="h-3 w-3" /> {t("group.invitesClosedBadge")}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {isOwner
                  ? t("group.invitesClosedOwnerHint")
                  : t("group.invitesClosedMemberHint")}
              </p>
              {isOwner && (
                <button
                  className="btn-primary mt-3"
                  onClick={onOpenInvites}
                >
                  <Unlock className="h-4 w-4" /> {t("group.openInvites")}
                </button>
              )}
            </div>
          )}

          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="btn-ghost text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={onLeave}
              >
                <LogOut className="h-4 w-4" /> {t("group.leave")}
              </button>
              {isOwner && (
                <button
                  className="btn-ghost text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" /> {t("group.delete")}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {isOwner ? t("group.ownerActionsHint") : t("group.leaveHint")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
