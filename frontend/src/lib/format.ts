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

// Accepts both "1,23" (EU-style) and "1.23" (US-style) inputs.
export function parseAmountToCents(input: string): number | null {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const n = Math.round(parseFloat(normalized) * 100);
  if (!Number.isFinite(n)) return null;
  return n;
}
