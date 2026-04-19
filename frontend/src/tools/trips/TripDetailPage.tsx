import {
  ArrowLeft,
  Backpack,
  CalendarDays,
  Info,
  Link2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type { GroupDetail, Trip } from "../../api/types";
import InfoTab from "./InfoTab";
import ItineraryTab from "./ItineraryTab";
import LinksTab from "./LinksTab";
import PackingTab from "./PackingTab";
import { tripsApi } from "./api";

type TabId = "links" | "itinerary" | "packing" | "info";

const TAB_STORAGE_PREFIX = "friendflow.tripTool.tab.";

function readTab(tripId: string | undefined): TabId {
  if (!tripId || typeof window === "undefined") return "links";
  const raw = localStorage.getItem(TAB_STORAGE_PREFIX + tripId);
  if (raw === "links" || raw === "itinerary" || raw === "packing" || raw === "info") {
    return raw;
  }
  return "links";
}

function writeTab(tripId: string, tab: TabId) {
  try {
    localStorage.setItem(TAB_STORAGE_PREFIX + tripId, tab);
  } catch {
    /* storage may be disabled */
  }
}

/**
 * Single-trip detail page. Owns the `Trip` object and refreshes it when
 * the Info tab saves (so the header reflects renames/date changes without
 * a full page reload).
 */
export default function TripDetailPage() {
  const { t } = useTranslation();
  const { groupId, tripId } = useParams<{ groupId: string; tripId: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>(() => readTab(tripId));

  useEffect(() => {
    setTab(readTab(tripId));
  }, [tripId]);

  const load = useCallback(() => {
    if (!groupId || !tripId) return;
    Promise.all([groupsApi.get(groupId), tripsApi.getTrip(groupId, tripId)])
      .then(([g, t]) => {
        setGroup(g);
        setTrip(t);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [groupId, tripId, t]);

  useEffect(() => {
    load();
  }, [load]);

  function selectTab(next: TabId) {
    setTab(next);
    if (tripId) writeTab(tripId, next);
  }

  if (error && (!group || !trip)) {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        {error}
      </p>
    );
  }
  if (!group || !trip) {
    return <p className="text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;
  }

  const tabs: { id: TabId; icon: typeof Link2; label: string }[] = [
    { id: "links", icon: Link2, label: t("trips.tabs.links") },
    { id: "itinerary", icon: CalendarDays, label: t("trips.tabs.itinerary") },
    { id: "packing", icon: Backpack, label: t("trips.tabs.packing") },
    { id: "info", icon: Info, label: t("trips.tabs.info") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/groups/${group.id}/trips`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> {t("trips.detail.backToList")}
        </Link>
        <div className="mt-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {trip.name}
          </h1>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">
            {group.name} - {t("trips.overview.subtitle")}
          </p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t("trips.tabs.ariaLabel")}
        className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800"
      >
        {tabs.map(({ id, icon: Icon, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              aria-controls={`trip-tab-${id}`}
              id={`trip-tab-btn-${id}`}
              onClick={() => selectTab(id)}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition ${
                active
                  ? "border-brand-500 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`trip-tab-${tab}`}
        aria-labelledby={`trip-tab-btn-${tab}`}
      >
        {tab === "links" && <LinksTab group={group} trip={trip} />}
        {tab === "itinerary" && <ItineraryTab group={group} trip={trip} />}
        {tab === "packing" && <PackingTab group={group} trip={trip} />}
        {tab === "info" && (
          <InfoTab
            group={group}
            trip={trip}
            onTripChanged={(updated) => setTrip(updated)}
          />
        )}
      </div>
    </div>
  );
}
