import i18n from "../i18n";

function currentLocale(): string {
  return i18n.language || "en";
}

export function formatMoney(cents: number, currency = "EUR"): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(currentLocale(), {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(currentLocale(), {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string, allDay = false): string {
  try {
    return new Intl.DateTimeFormat(currentLocale(), {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(currentLocale(), {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Converts a `<input type="datetime-local">` value (local time, no TZ) to ISO UTC. */
export function datetimeLocalToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Inverse of `datetimeLocalToIso`. */
export function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

// Accepts both "1,23" (EU-style) and "1.23" (US-style) inputs.
export function parseAmountToCents(input: string): number | null {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const n = Math.round(parseFloat(normalized) * 100);
  if (!Number.isFinite(n)) return null;
  return n;
}
