import {
  Backpack,
  CalendarDays,
  Info,
  LayoutGrid,
  Link2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type { GroupDetail, Trip } from "../../api/types";
import LoadingState from "../../components/LoadingState";
import PageHeader from "../../components/PageHeader";
import InfoTab from "./InfoTab";
import ItineraryTab from "./ItineraryTab";
import LinksTab from "./LinksTab";
import OverviewTab from "./OverviewTab";
import PackingTab from "./PackingTab";
import { tripsApi } from "./api";

type TabId = "overview" | "links" | "itinerary" | "packing" | "info";

const TAB_STORAGE_PREFIX = "friendflow.tripTool.tab.";

/** Read the persisted tab for a trip. Returns `null` if the user hasn't
 *  explicitly picked one yet, so the caller can fall back to a smart default. */
function readStoredTab(tripId: string | undefined): TabId | null {
  if (!tripId || typeof window === "undefined") return null;
  const raw = localStorage.getItem(TAB_STORAGE_PREFIX + tripId);
  if (
    raw === "overview" ||
    raw === "links" ||
    raw === "itinerary" ||
    raw === "packing" ||
    raw === "info"
  ) {
    return raw;
  }
  return null;
}

function writeTab(tripId: string, tab: TabId) {
  try {
    localStorage.setItem(TAB_STORAGE_PREFIX + tripId, tab);
  } catch {
    /* storage may be disabled */
  }
}

/**
 * A trip counts as "needing setup" when neither destinations nor dates have
 * been filled in. In that state we highlight the Info tab so the user
 * notices they should record the basics - but we don't force them to.
 */
function needsInfoSetup(trip: Trip): boolean {
  return (
    (trip.destinations?.length ?? 0) === 0 &&
    !trip.start_date &&
    !trip.end_date
  );
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
  // `null` means "not decided yet" - we wait for the trip to load so we can
  // pick a sensible default based on whether the trip is still empty.
  const [tab, setTab] = useState<TabId | null>(null);
  const initializedFor = useRef<string | null>(null);

  // Reset the tab when navigating between trips so the default logic runs
  // again for the new trip.
  useEffect(() => {
    initializedFor.current = null;
    setTab(null);
  }, [tripId]);

  // Pick the initial tab exactly once per trip: honour the user's stored
  // choice if there is one, otherwise land on Info for an unconfigured
  // trip. This nudges new users towards filling in destinations/dates
  // first without locking them in - a single click moves them away.
  useEffect(() => {
    if (!tripId || !trip) return;
    if (initializedFor.current === tripId) return;
    initializedFor.current = tripId;
    const stored = readStoredTab(tripId);
    if (stored) {
      setTab(stored);
      return;
    }
    setTab(needsInfoSetup(trip) ? "info" : "overview");
  }, [tripId, trip]);

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
    return <p className="alert-error">{error}</p>;
  }
  if (!group || !trip || !tab) {
    return <LoadingState />;
  }

  const incomplete = needsInfoSetup(trip);
  const tabs: { id: TabId; icon: typeof Link2; label: string }[] = [
    { id: "overview", icon: LayoutGrid, label: t("trips.tabs.overview") },
    { id: "links", icon: Link2, label: t("trips.tabs.links") },
    { id: "itinerary", icon: CalendarDays, label: t("trips.tabs.itinerary") },
    { id: "packing", icon: Backpack, label: t("trips.tabs.packing") },
    { id: "info", icon: Info, label: t("trips.tabs.info") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        backLink={{
          to: `/groups/${group.id}/trips`,
          label: t("trips.detail.backToList"),
        }}
        title={trip.name}
        subtitle={`${group.name} - ${t("trips.overview.subtitle")}`}
      />

      <div
        role="tablist"
        aria-label={t("trips.tabs.ariaLabel")}
        className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800"
      >
        {tabs.map(({ id, icon: Icon, label }) => {
          const active = tab === id;
          const highlightInfo = id === "info" && incomplete;
          // When the trip still needs basic info, pull attention towards the
          // Info tab: amber idle text + a pulse dot. Active-tab styling wins
          // either way so the user's current position stays obvious.
          const className = active
            ? "inline-flex shrink-0 items-center gap-2 border-b-2 border-brand-500 px-3 py-2 text-sm font-medium text-brand-600 transition dark:text-brand-400"
            : highlightInfo
              ? "inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-amber-700 transition hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
              : "inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200";
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              aria-controls={`trip-tab-${id}`}
              id={`trip-tab-btn-${id}`}
              onClick={() => selectTab(id)}
              className={className}
              title={highlightInfo ? t("trips.detail.infoNeeded") : undefined}
            >
              <Icon className="h-4 w-4" />
              {label}
              {highlightInfo && (
                <span
                  className="relative ml-0.5 flex h-2 w-2"
                  aria-label={t("trips.detail.infoNeeded")}
                >
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`trip-tab-${tab}`}
        aria-labelledby={`trip-tab-btn-${tab}`}
      >
        {tab === "overview" && (
          <OverviewTab
            group={group}
            trip={trip}
            onSelectTab={(next) => selectTab(next)}
          />
        )}
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
