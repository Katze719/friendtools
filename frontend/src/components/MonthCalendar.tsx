import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  addMonths,
  buildMonthGrid,
  formatMonthHeading,
  isSameDay,
  isSameMonth,
  isToday,
  toDateKey,
  weekdayLabels,
} from "../lib/date";

/** Per-day badge description rendered inside a month cell. */
export interface DayBadge {
  /** Unique id for React keys (e.g. event id). */
  id: string;
  /** Short label (title). */
  label: string;
  /** Tailwind background class for the dot/pill. */
  accent?: string;
}

export interface MonthCalendarProps {
  /** Any date within the month to render. */
  month: Date;
  onMonthChange: (month: Date) => void;
  /** Optional: currently selected day (highlighted). */
  selected?: Date | null;
  onSelectDay?: (day: Date) => void;
  /** Optional badges keyed by `toDateKey(day)`. */
  badgesByDay?: Record<string, DayBadge[]>;
  /** When true, shows only dots (used inside a compact popover picker). */
  compact?: boolean;
  /** aria-label for the grid. */
  ariaLabel?: string;
}

export default function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelectDay,
  badgesByDay,
  compact = false,
  ariaLabel,
}: MonthCalendarProps) {
  const { t } = useTranslation();
  const days = buildMonthGrid(month);
  const weekdays = weekdayLabels();

  return (
    <div aria-label={ariaLabel} className="w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="btn-ghost -my-1"
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label={t("calendar.grid.prevMonth")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold tracking-tight sm:text-base">
            {formatMonthHeading(month)}
          </h3>
          <button
            type="button"
            className="btn-ghost -my-1 text-xs"
            onClick={() => onMonthChange(new Date())}
          >
            {t("calendar.grid.today")}
          </button>
        </div>
        <button
          type="button"
          className="btn-ghost -my-1"
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label={t("calendar.grid.nextMonth")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px text-center text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {weekdays.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-slate-200/60 dark:bg-slate-800/60"
        role="grid"
      >
        {days.map((day) => {
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const isSelected = selected ? isSameDay(day, selected) : false;
          const key = toDateKey(day);
          const badges = badgesByDay?.[key] ?? [];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay?.(day)}
              role="gridcell"
              aria-selected={isSelected}
              aria-current={today ? "date" : undefined}
              className={[
                "relative flex min-h-[56px] flex-col items-stretch bg-white text-left transition dark:bg-slate-900",
                compact ? "min-h-[40px] items-center justify-center" : "",
                "hover:bg-brand-50 dark:hover:bg-brand-900/20",
                inMonth
                  ? "text-slate-800 dark:text-slate-100"
                  : "text-slate-400 dark:text-slate-600",
                isSelected
                  ? "outline outline-2 -outline-offset-2 outline-brand-500"
                  : "",
              ].join(" ")}
            >
              <span
                className={[
                  compact ? "" : "px-1.5 pt-1",
                  "text-xs font-medium",
                  today
                    ? "inline-flex h-6 w-6 items-center justify-center self-start rounded-full bg-brand-600 text-white"
                    : "",
                  today && compact ? "self-center" : "",
                ].join(" ")}
              >
                {day.getDate()}
              </span>
              {!compact && badges.length > 0 && (
                <div className="mt-0.5 flex flex-col gap-0.5 overflow-hidden px-1 pb-1">
                  {badges.slice(0, 3).map((b) => (
                    <span
                      key={b.id}
                      title={b.label}
                      className={[
                        "truncate rounded px-1 py-0.5 text-[10px] font-medium text-white",
                        b.accent ?? "bg-brand-500",
                      ].join(" ")}
                    >
                      {b.label}
                    </span>
                  ))}
                  {badges.length > 3 && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      +{badges.length - 3}
                    </span>
                  )}
                </div>
              )}
              {compact && badges.length > 0 && (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
