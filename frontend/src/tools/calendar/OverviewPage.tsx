import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { groupsApi } from "../../api/groups";
import type {
  CalendarCategory,
  CalendarEvent,
  GroupDetail,
  Trip,
  TripItineraryItem,
} from "../../api/types";
import LoadingState from "../../components/LoadingState";
import { tripsApi } from "../trips/api";
import { calendarApi } from "./api";
import CalendarView from "./CalendarView";

const OVERLAY_KEY = "calendar.personalOverlay";

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

export default function CalendarOverviewPage() {
  const { t } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [groupEvents, setGroupEvents] = useState<CalendarEvent[] | null>(null);
  const [personalEvents, setPersonalEvents] = useState<CalendarEvent[]>([]);
  const [categories, setCategories] = useState<CalendarCategory[]>([]);
  const [tripItems, setTripItems] = useState<TripItineraryItem[]>([]);
  const [tripsById, setTripsById] = useState<Map<string, Trip>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [showPersonalOverlay, setShowPersonalOverlay] = useState<boolean>(() =>
    loadOverlayPref(),
  );

  const reloadEvents = useCallback(() => {
    if (!groupId) return;
    // Fetch group calendar, group categories, trips, and (when the
    // overlay is enabled) the user's personal events. Per-trip
    // itinerary fetches are tolerated to fail individually so one
    // broken trip doesn't take the whole page down.
    Promise.all([
      groupsApi.get(groupId),
      calendarApi.listEvents({ kind: "group", groupId }),
      calendarApi.listCategories({ kind: "group", groupId }),
      tripsApi.listTrips(groupId).catch(() => [] as Trip[]),
      showPersonalOverlay
        ? calendarApi
            .listEvents({ kind: "personal" })
            .catch(() => [] as CalendarEvent[])
        : Promise.resolve([] as CalendarEvent[]),
    ])
      .then(async ([g, e, cats, trips, personal]) => {
        setGroup(g);
        setGroupEvents(e);
        setCategories(cats);
        setPersonalEvents(personal);
        setTripsById(new Map(trips.map((tp) => [tp.id, tp])));
        const perTrip = await Promise.all(
          trips.map((tp) =>
            tripsApi
              .listItinerary(groupId, tp.id)
              .catch(() => [] as TripItineraryItem[]),
          ),
        );
        setTripItems(perTrip.flat());
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [groupId, t, showPersonalOverlay]);

  useEffect(() => {
    reloadEvents();
  }, [reloadEvents]);

  if (error && !group) {
    return (
      <p className="alert-error">{error}</p>
    );
  }
  if (!group || !groupEvents) {
    return <LoadingState />;
  }

  const mergedEvents: CalendarEvent[] = showPersonalOverlay
    ? [...groupEvents, ...personalEvents]
    : groupEvents;

  return (
    <CalendarView
      scope={{ kind: "group", groupId: group.id }}
      title={t("calendar.overview.title")}
      subtitle={`${group.name} - ${t("calendar.overview.subtitle")}`}
      backLink={{
        to: `/groups/${group.id}`,
        label: t("calendar.overview.backToGroup"),
      }}
      events={mergedEvents}
      categories={categories}
      tripItems={tripItems}
      tripsById={tripsById}
      overlayToggle={{
        enabled: showPersonalOverlay,
        onToggle: () => {
          const next = !showPersonalOverlay;
          setShowPersonalOverlay(next);
          saveOverlayPref(next);
        },
        label: t("calendar.overview.togglePersonal"),
      }}
      onEventsChanged={reloadEvents}
      onCategoriesChanged={reloadEvents}
    />
  );
}
