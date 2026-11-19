import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";

export const LOCALES = ["es", "ht", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_LABELS: Record<Locale, string> = { es: "Español", ht: "Kreyòl", fr: "Français" };
export const LANG_COOKIE = "aula_lang";

// Cada archivo locales/<idioma>/<módulo>.json se monta bajo la clave <módulo>.
// Ej.: locales/es/lessons.json → t("lessons.title")
const files = import.meta.glob<{ default: Record<string, unknown> }>("../locales/*/*.json", { eager: true });
const resources: Record<string, { translation: Record<string, unknown> }> = {};
for (const [path, mod] of Object.entries(files)) {
  const m = path.match(/locales\/(\w+)\/(\w+)\.json$/);
  if (!m) continue;
  const [, lng, ns] = m as unknown as [string, string, string];
  (resources[lng] ??= { translation: {} }).translation[ns] = mod.default;
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function makeI18n(lng: Locale): i18n {
  const inst = i18next.createInstance();
  void inst.use(initReactI18next).init({
    lng,
    fallbackLng: "es",
    resources,
    interpolation: { escapeValue: false },
    initAsync: false,
    returnNull: false,
  });
  return inst;
}

/** Idioma: perfil del usuario > cookie > navegador > español. */
export function detectLocale(request: Request, profileLocale?: string | null): Locale {
  if (isLocale(profileLocale)) return profileLocale;
  const cookie = request.headers.get("Cookie") ?? "";
  const c = cookie.match(new RegExp(`${LANG_COOKIE}=(\\w+)`))?.[1];
  if (isLocale(c)) return c;
  const accept = request.headers.get("Accept-Language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return "es";
}

/** Elige el texto de un campo multilingüe {es,ht,fr} según el idioma, con respaldo. */
export function pick(i18nField: unknown, locale: Locale, fallback = ""): string {
  if (!i18nField || typeof i18nField !== "object") return fallback;
  const o = i18nField as Record<string, string | undefined>;
  return o[locale] || o.es || o.fr || o.ht || fallback;
}

export function resourcesFor(): typeof resources {
  return resources;
}
