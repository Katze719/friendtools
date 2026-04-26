import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import { groupsApi } from "../api/groups";
import type {
  CalendarCategory,
  CalendarEvent,
  GroupSummary,
} from "../api/types";
import LoadingState from "../components/LoadingState";
import { calendarApi } from "../tools/calendar/api";
import CalendarView from "../tools/calendar/CalendarView";

const OVERLAY_KEY = "calendar.personal.groupOverlay";

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

/**
 * Per-user calendar at /me/calendar. Shows private events owned by the
 * current user and, when the "show group events" toggle is enabled,
 * also overlays events from every group the user is a member of.
 * Group events are read-only here; editing jumps to the respective
 * group calendar page so the user doesn't need a second category list
 * loaded client-side.
 */
export default function PersonalCalendarPage() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [categories, setCategories] = useState<CalendarCategory[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showGroupOverlay, setShowGroupOverlay] = useState<boolean>(() =>
    loadOverlayPref(),
  );

  const reload = useCallback(() => {
    // Always fetch personal data; only fan out to groups when the
    // overlay is on, to keep the per-page request count proportional
    // to what's actually rendered. Group fetches are tolerant: a
    // failing group doesn't break the page.
    Promise.all([
      calendarApi.listEvents({ kind: "personal" }),
      calendarApi.listCategories({ kind: "personal" }),
      showGroupOverlay ? groupsApi.list().catch(() => [] as GroupSummary[]) : Promise.resolve([] as GroupSummary[]),
    ])
      .then(async ([personal, cats, gs]) => {
        setCategories(cats);
        setGroups(gs);
        const perGroup = await Promise.all(
          gs.map((g) =>
            calendarApi
              .listEvents({ kind: "group", groupId: g.id })
              .catch(() => [] as CalendarEvent[]),
          ),
        );
        setEvents([...personal, ...perGroup.flat()]);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t("common.error")),
      );
  }, [t, showGroupOverlay]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (error && !events) {
    return <p className="alert-error">{error}</p>;
  }
  if (!events) {
    return <LoadingState />;
  }

  const groupsById = new Map(groups.map((g) => [g.id, g]));

  return (
    <CalendarView
      scope={{ kind: "personal" }}
      title={t("calendar.overview.personalTitle")}
      subtitle={t("calendar.overview.personalSubtitle")}
      backLink={{
        to: "/",
        label: t("layout.backToDashboard"),
      }}
      events={events}
      categories={categories}
      groupsById={groupsById}
      overlayToggle={{
        enabled: showGroupOverlay,
        onToggle: () => {
          const next = !showGroupOverlay;
          setShowGroupOverlay(next);
          saveOverlayPref(next);
        },
        label: t("calendar.overview.toggleGroupEvents"),
      }}
      onEventsChanged={reload}
      onCategoriesChanged={reload}
    />
  );
}
