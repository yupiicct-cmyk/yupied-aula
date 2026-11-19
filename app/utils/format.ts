import type { Locale } from "~/services/i18n";

const intl: Record<Locale, string> = { es: "es-CL", ht: "fr-HT", fr: "fr-FR" };

export function fmtDate(value: string | null | undefined, locale: Locale, withTime = false) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return new Intl.DateTimeFormat(intl[locale], {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
    timeZone: "America/Santiago",
  }).format(d);
}

export function fmtNumber(n: number | null | undefined, locale: Locale, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(intl[locale], { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** Valor para <input type="datetime-local"> en hora de Chile. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(d);
  return parts.replace(" ", "T");
}

export function fullName(p: { first_name: string; last_name: string } | null | undefined) {
  if (!p) return "—";
  return `${p.first_name} ${p.last_name}`.trim() || "—";
}

export function initials(p: { first_name: string; last_name: string } | null | undefined) {
  if (!p) return "?";
  return `${p.first_name[0] ?? ""}${p.last_name[0] ?? ""}`.toUpperCase() || "?";
}
