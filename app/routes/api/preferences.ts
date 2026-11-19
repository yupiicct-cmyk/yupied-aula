import { data, redirect } from "react-router";
import type { Route } from "./+types/preferences";
import { getOptionalUser, getSupabase } from "~/services/auth.server";
import { COURSE_COOKIE } from "~/services/courses.server";
import { isLocale, LANG_COOKIE } from "~/services/i18n";

const YEAR = 60 * 60 * 24 * 365;

export async function action({ request, context }: Route.ActionArgs) {
  const fd = await request.formData();
  const intent = fd.get("intent");
  const user = await getOptionalUser(context);
  const supabase = getSupabase(context);
  const headers = new Headers();

  if (intent === "locale") {
    const locale = fd.get("locale");
    if (!isLocale(locale)) return data({ ok: false }, { status: 400 });
    headers.append("Set-Cookie", `${LANG_COOKIE}=${locale}; Path=/; SameSite=Lax; Max-Age=${YEAR}`);
    if (user) {
      await supabase.from("profiles").update({ locale }).eq("id", user.id);
      await supabase.from("user_preferences").upsert({ user_id: user.id, locale });
    }
  } else if (intent === "theme") {
    const theme = String(fd.get("theme"));
    if (!["light", "dark", "system"].includes(theme)) return data({ ok: false }, { status: 400 });
    headers.append("Set-Cookie", `aula_theme=${theme}; Path=/; SameSite=Lax; Max-Age=${YEAR}`);
    if (user) await supabase.from("user_preferences").upsert({ user_id: user.id, theme });
  } else if (intent === "course") {
    const id = String(fd.get("course") ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return data({ ok: false }, { status: 400 });
    headers.append("Set-Cookie", `${COURSE_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${YEAR}`);
    const back = String(fd.get("back") ?? "/app");
    throw redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/app", { headers });
  } else {
    return data({ ok: false }, { status: 400 });
  }
  return data({ ok: true }, { headers });
}
