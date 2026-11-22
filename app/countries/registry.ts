import type { Locale } from "~/services/i18n";
import { chile } from "./chile/config";
import { haiti } from "./haiti/config";
import type { CountryConfig } from "./types";

/**
 * Registro de países. Para agregar un tercero: crear countries/<pais>/ con los
 * cuatro archivos, añadirlo aquí y sembrar la fila en public.countries
 * (ver docs/CONFIGURACION_PAISES.md).
 */
export const COUNTRIES: readonly CountryConfig[] = [chile, haiti];
export const COUNTRY_SLUGS = COUNTRIES.map((c) => c.slug);
export const COUNTRY_COOKIE = "yupied_country";

export type CountryCode = CountryConfig["code"];

export function countryByCode(code: string | null | undefined) {
  return COUNTRIES.find((c) => c.code === code) ?? null;
}

export function countryBySlug(slug: string | null | undefined) {
  return COUNTRIES.find((c) => c.slug === slug) ?? null;
}

/** País preferido (elección explícita guardada en cookie; nunca por IP). */
export function preferredCountry(request: Request) {
  const m = (request.headers.get("Cookie") ?? "").match(new RegExp(`${COUNTRY_COOKIE}=([a-z]+)`));
  return countryBySlug(m?.[1]);
}

export function countryCookie(slug: string | null) {
  return slug
    ? `${COUNTRY_COOKIE}=${slug}; Path=/; SameSite=Lax; Max-Age=31536000`
    : `${COUNTRY_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
}

export function levelName(country: CountryConfig, levelKey: string, locale: Locale) {
  return country.academic.levels.find((l) => l.key === levelKey)?.name[locale] ?? levelKey;
}

export function gradeName(country: CountryConfig, gradeKey: string, locale: Locale) {
  for (const l of country.academic.levels) {
    const g = l.grades.find((x) => x.key === gradeKey);
    if (g) return g.name[locale];
  }
  return gradeKey;
}

export function formatMoney(country: CountryConfig, amount: number, currency = country.localization.currencies[0]!) {
  return new Intl.NumberFormat(country.localization.numberLocale, { style: "currency", currency }).format(amount);
}

/** DD/MM/YYYY en la zona horaria del país. */
export function formatCountryDate(country: CountryConfig, date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: country.localization.timezone, day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

export type { CountryConfig } from "./types";
