import type { RouterContextProvider } from "react-router";
import { cloudflareContext } from "~/services/context";

/** Secretos: se definen con `wrangler secret put` (producción) o `.dev.vars` (local). */
export interface AppSecrets {
  SUPABASE_SECRET_KEY?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}

export interface AppEnv extends AppSecrets {
  /** R2 opcional: sin él se usa Supabase Storage (plan gratuito, sin tarjeta). */
  FILES?: R2Bucket;
  AUTH_LIMITER?: RateLimit;
  API_LIMITER?: RateLimit;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  APP_NAME: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ACCOUNT_ID: string;
  MAX_UPLOAD_MB: string;
  /** URL del portal internacional (selector de país). */
  PORTAL_URL?: string;
}

export function getEnv(context: Readonly<RouterContextProvider>): AppEnv {
  return context.get(cloudflareContext).env;
}
