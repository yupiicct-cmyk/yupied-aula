import type { DB } from "~/services/supabase/server";

/** Nombre del aula configurable desde el panel (system_settings.app_name). */
export async function getAppName(supabase: DB, fallback: string) {
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", "app_name").maybeSingle();
    return typeof data?.value === "string" && data.value.trim() ? data.value : fallback;
  } catch {
    return fallback; // la pantalla de acceso no debe caer si la BD no responde
  }
}
