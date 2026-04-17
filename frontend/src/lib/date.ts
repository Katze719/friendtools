import i18n from "../i18n";

function currentLocale(): string {
  return i18n.language || "en";
}

/** Returns true for German / Austrian / Swiss locales (Monday as first day). */
function firstDayOfWeek(): 0 | 1 {
  const lang = currentLocale().toLowerCase();
  // ISO-8601 Monday for de/at/ch/fr/etc. Sunday for en-us.
  return lang.startsWith("en-us") ? 0 : 1;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function addMonths(date: Date, n: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

/** Formats a Date as `YYYY-MM-DD` using local time. */
export function toDateKey(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const [, y, mo, da] = m;
  const d = new Date(Number(y), Number(mo) - 1, Number(da));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * 6x7 = 42 day grid that contains the given month, starting on the
 * locale-appropriate first day of the week.
 */
export function buildMonthGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const weekStart = firstDayOfWeek();
  const offset = (first.getDay() - weekStart + 7) % 7;
  const gridStart = addDays(first, -offset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i));
  return days;
}

/** Localized short weekday labels (Mo/Tu/We...) in grid order. */
export function weekdayLabels(): string[] {
  const weekStart = firstDayOfWeek();
  // 2024-01-01 is a Monday in every modern locale.
  const anchorMonday = new Date(2024, 0, 1);
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(anchorMonday, (i + (weekStart === 0 ? -1 : 0) + 7) % 7);
    labels.push(
      new Intl.DateTimeFormat(currentLocale(), { weekday: "short" }).format(d),
    );
  }
  return labels;
}

export function formatMonthHeading(d: Date): string {
  try {
    return new Intl.DateTimeFormat(currentLocale(), {
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return `${d.getMonth() + 1}/${d.getFullYear()}`;
  }
}

export function formatDayLong(d: Date): string {
  try {
    return new Intl.DateTimeFormat(currentLocale(), {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toDateString();
  }
}
