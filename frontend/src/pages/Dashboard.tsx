import {
  ArrowRight,
  CalendarRange,
  ClipboardList,
  Plus,
  ShoppingBasket,
  UserPlus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { groupsApi } from "../api/groups";
import type { GroupSummary } from "../api/types";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";

/**
 * localStorage key for the cached groups list. Lets the dashboard paint the
 * group cards instantly on reload (stale-while-revalidate) instead of
 * showing the spinner for a full network round-trip every time.
 *
 * Kept in sync with `clearAuthCaches()` in AuthContext - if you add more
 * dashboard-level caches, clear them there too so logout doesn't leak
 * data across sessions.
 */
const GROUPS_CACHE_KEY = "friendflow.groups";

function readCachedGroups(): GroupSummary[] | null {
  try {
    const raw = localStorage.getItem(GROUPS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    // Loose structural check - if the shape evolves we'd rather drop the
    // cache than render with missing fields.
    for (const g of parsed) {
      if (
        !g ||
        typeof g !== "object" ||
        typeof (g as GroupSummary).id !== "string" ||
        typeof (g as GroupSummary).name !== "string"
      ) {
        return null;
      }
    }
    return parsed as GroupSummary[];
  } catch {
    return null;
  }
}

function writeCachedGroups(groups: GroupSummary[] | null): void {
  try {
    if (groups) localStorage.setItem(GROUPS_CACHE_KEY, JSON.stringify(groups));
    else localStorage.removeItem(GROUPS_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupSummary[] | null>(() =>
    readCachedGroups(),
  );
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const firstName = user?.display_name.split(" ")[0] ?? "you";

  const reload = useCallback(() => {
    groupsApi
      .list()
      .then((list) => {
        setGroups(list);
        writeCachedGroups(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-brand-600 dark:text-brand-400">{t("dashboard.eyebrow")}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("dashboard.greeting", { name: firstName })}
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-300">{t("dashboard.subtitle")}</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button
              className="btn-secondary flex-1 sm:flex-none"
              onClick={() => {
                setShowJoin((v) => !v);
                setShowCreate(false);
              }}
            >
              <UserPlus className="h-4 w-4" /> {t("dashboard.join")}
            </button>
            <button
              className="btn-primary flex-1 sm:flex-none"
              onClick={() => {
                setShowCreate((v) => !v);
                setShowJoin(false);
              }}
            >
              <Plus className="h-4 w-4" /> {t("dashboard.newGroup")}
            </button>
          </div>
        </div>
      </section>

      {showCreate && (
        <CreateGroupForm
          onDone={(created) => {
            setShowCreate(false);
            if (created) reload();
          }}
        />
      )}
      {showJoin && (
        <JoinGroupForm
          onDone={(joined) => {
            setShowJoin(false);
            if (joined) reload();
          }}
        />
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t("dashboard.personalTools")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <PersonalToolCard
            to="/me/calendar"
            title={t("layout.personalCalendar")}
            description={t("dashboard.personalCalendarDescription")}
            icon={<CalendarRange className="h-5 w-5" />}
            iconBg="bg-violet-500"
          />
          <PersonalToolCard
            to="/me/shopping"
            title={t("layout.personalShopping")}
            description={t("dashboard.personalShoppingDescription")}
            icon={<ShoppingBasket className="h-5 w-5" />}
            iconBg="bg-amber-500"
          />
          <PersonalToolCard
            to="/me/tasks"
            title={t("layout.personalTasks")}
            description={t("dashboard.personalTasksDescription")}
            icon={<ClipboardList className="h-5 w-5" />}
            iconBg="bg-emerald-500"
          />
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("dashboard.yourGroups")}</h2>
        {groups === null ? (
          <LoadingState compact />
        ) : groups.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PersonalToolCard({
  to,
  title,
  description,
  icon,
  iconBg,
}: {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  const { t } = useTranslation();
  return (
    <li>
      <Link
        to={to}
        className="card group flex h-full flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-white ${iconBg}`}
          >
            {icon}
          </span>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {description}
        </p>
        <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition-all group-hover:gap-2 dark:text-brand-400">
          {t("dashboard.open")} <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
    </li>
  );
}

function GroupCard({ group }: { group: GroupSummary }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/groups/${group.id}`}
      className="card block p-5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{group.name}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Users className="h-3.5 w-3.5" />
            {t("dashboard.memberCount", { count: group.member_count })} - {group.currency}
          </p>
        </div>
        {group.my_role === "owner" && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            {t("dashboard.roleOwner")}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        {t("dashboard.inviteCode")}:{" "}
        {group.invite_code ? (
          <span className="font-mono tracking-wider text-slate-600 dark:text-slate-300">
            {group.invite_code}
          </span>
        ) : (
          <span className="italic text-slate-500 dark:text-slate-400">
            {t("dashboard.inviteClosed")}
          </span>
        )}
      </p>
    </Link>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
        <Users className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">{t("dashboard.empty.title")}</h2>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
        {t("dashboard.empty.description")}
      </p>
    </div>
  );
}

function CreateGroupForm({ onDone }: { onDone: (created: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const g = await groupsApi.create(name.trim(), currency.trim());
      onDone(true);
      navigate(`/groups/${g.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h3 className="font-semibold">{t("dashboard.create.title")}</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          <label className="label" htmlFor="group_name">
            {t("dashboard.create.name")}
          </label>
          <input
            id="group_name"
            className="input"
            required
            minLength={1}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("dashboard.create.namePlaceholder")}
          />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="currency">
            {t("dashboard.create.currency")}
          </label>
          <input
            id="currency"
            className="input w-24"
            required
            minLength={3}
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </div>
      </div>
      {error && <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => onDone(false)}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "..." : t("dashboard.create.submit")}
        </button>
      </div>
    </form>
  );
}

function JoinGroupForm({ onDone }: { onDone: (joined: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const g = await groupsApi.join(code.trim());
      onDone(true);
      navigate(`/groups/${g.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h3 className="font-semibold">{t("dashboard.joinForm.title")}</h3>
      <div className="space-y-1">
        <label className="label" htmlFor="invite_code">
          {t("dashboard.joinForm.code")}
        </label>
        <input
          id="invite_code"
          className="input font-mono uppercase tracking-widest"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t("dashboard.joinForm.codePlaceholder")}
        />
      </div>
      {error && <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => onDone(false)}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "..." : t("dashboard.joinForm.submit")}
        </button>
      </div>
    </form>
  );
}
