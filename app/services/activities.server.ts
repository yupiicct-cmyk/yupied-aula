import type { DB } from "~/services/supabase/server";
import { pickTranslation } from "~/services/content.server";
import type { Locale } from "~/services/i18n";

export async function activityTranslation(supabase: DB, id: string, locale: Locale, original: string) {
  const { data } = await supabase.from("activity_translations").select("*").eq("activity_id", id);
  return { all: data ?? [], chosen: pickTranslation(data ?? [], locale, original) ?? null };
}
