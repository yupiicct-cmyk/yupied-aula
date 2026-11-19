import { createContext } from "react-router";
import type { AppEnv } from "~/services/env.server";
import type { DB } from "~/services/supabase/server";
import type { SessionInfo } from "~/services/auth.server";

export const cloudflareContext = createContext<{ env: AppEnv; ctx: ExecutionContext }>();

/** Sesión por petición: el cliente Supabase y una carga perezosa (memoizada) del usuario. */
export const sessionContext = createContext<{
  supabase: DB;
  headers: Headers;
  prefs: { remember: boolean };
  load: () => Promise<SessionInfo | null>;
}>();
