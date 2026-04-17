import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  formatDayLong,
  parseDateKey,
  startOfMonth,
  toDateKey,
} from "../lib/date";
import MonthCalendar from "./MonthCalendar";

export interface DayPickerProps {
  /** Current value as `YYYY-MM-DD` (local date). Empty string = no selection. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  required?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Text-field-like date input that opens a month calendar popover on click.
 * Uses local `YYYY-MM-DD` strings so callers can combine with a separate
 * time input without timezone surprises.
 */
export default function DayPicker({
  value,
  onChange,
  id,
  required,
  ariaLabel,
  placeholder,
  className,
}: DayPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => {
    const parsed = parseDateKey(value);
    return startOfMonth(parsed ?? new Date());
  });

  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedDate = parseDateKey(value);
  const displayText = selectedDate
    ? formatDayLong(selectedDate)
    : (placeholder ?? t("calendar.grid.pickDate"));

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (selectedDate) setVisibleMonth(startOfMonth(selectedDate));
          setOpen((v) => !v);
        }}
        className="input flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={selectedDate ? "" : "text-slate-400 dark:text-slate-500"}>
          {displayText}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
      </button>
      {required && (
        <input
          type="text"
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
          className="sr-only"
        />
      )}
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900 sm:left-auto sm:w-[20rem]"
        >
          <MonthCalendar
            month={visibleMonth}
            onMonthChange={setVisibleMonth}
            selected={selectedDate ?? null}
            compact
            onSelectDay={(d) => {
              onChange(toDateKey(d));
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
