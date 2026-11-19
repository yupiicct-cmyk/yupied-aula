import { redirect } from "react-router";
import type { Route } from "./+types/callback";
import { getSupabase } from "~/services/auth.server";

/** Retorno de Google OAuth (PKCE). */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/app";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  if (!code) throw redirect("/login?error=google_unavailable");
  const supabase = getSupabase(context);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw redirect("/login?error=google_unavailable");
  throw redirect(safe);
}
