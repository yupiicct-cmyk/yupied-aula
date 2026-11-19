import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/types/database";
import type { AppEnv } from "~/services/env.server";
import { AppError } from "~/utils/errors";

/**
 * Cliente con privilegios (clave secreta). SOLO en el servidor y solo para
 * operaciones de administración de cuentas que RLS no puede cubrir.
 * Nunca se envía al navegador.
 */
export function createAdminClient(env: AppEnv) {
  if (!env.SUPABASE_SECRET_KEY) throw new AppError("config_missing", 500, "SUPABASE_SECRET_KEY");
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
