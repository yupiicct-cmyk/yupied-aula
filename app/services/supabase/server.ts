import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "~/types/database";
import type { AppEnv } from "~/services/env.server";
import { AppError } from "~/utils/errors";

export type DB = SupabaseClient<Database>;

export const REMEMBER_COOKIE = "aula_remember";

/**
 * Cliente de Supabase por petición, con la sesión del usuario en cookies httpOnly.
 * Todas las consultas pasan por RLS con la identidad del usuario.
 */
export function createSupabase(request: Request, env: AppEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new AppError("config_missing", 500, "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY");
  const headers = new Headers();
  const parsed = parseCookieHeader(request.headers.get("Cookie") ?? "");
  const prefs = { remember: parsed.find((c) => c.name === REMEMBER_COOKIE)?.value !== "0" };
  const secure = new URL(request.url).protocol === "https:";

  const supabase = createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return parsed.map((c) => ({ name: c.name, value: c.value ?? "" }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          const opts = { ...options, httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
          // "Recordar sesión" desactivado: cookie de sesión (se borra al cerrar el navegador)
          if (!prefs.remember && value) {
            delete opts.maxAge;
            delete opts.expires;
          }
          headers.append("Set-Cookie", serializeCookieHeader(name, value, opts));
        }
      },
    },
  });
  return { supabase: supabase as DB, headers, prefs };
}
