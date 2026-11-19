import type { DB } from "~/services/supabase/server";
import type { Locale } from "~/services/i18n";

/** Elige la mejor traducción disponible: idioma del usuario → original → cualquiera. */
export function pickTranslation<T extends { locale: string }>(rows: T[], locale: Locale, original?: string | null): T | undefined {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === original) ?? rows.find((r) => r.locale === "es") ?? rows[0];
}

export async function lessonTitles(supabase: DB, ids: string[], locale: Locale) {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await supabase.from("lesson_translations").select("lesson_id,locale,title").in("lesson_id", ids);
  const grouped = new Map<string, { locale: string; title: string }[]>();
  for (const r of data ?? []) (grouped.get(r.lesson_id) ?? grouped.set(r.lesson_id, []).get(r.lesson_id)!).push(r);
  for (const [id, rows] of grouped) map.set(id, pickTranslation(rows, locale)?.title ?? "");
  return map;
}

export async function activityTitles(supabase: DB, ids: string[], locale: Locale) {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await supabase.from("activity_translations").select("activity_id,locale,title").in("activity_id", ids);
  const grouped = new Map<string, { locale: string; title: string }[]>();
  for (const r of data ?? []) (grouped.get(r.activity_id) ?? grouped.set(r.activity_id, []).get(r.activity_id)!).push(r);
  for (const [id, rows] of grouped) map.set(id, pickTranslation(rows, locale)?.title ?? "");
  return map;
}

export function isReleased(status: string, publishAt: string | null) {
  return status === "published" || (status === "scheduled" && !!publishAt && Date.parse(publishAt) <= Date.now());
}
