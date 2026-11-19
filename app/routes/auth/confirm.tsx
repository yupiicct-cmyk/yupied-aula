import { redirect } from "react-router";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { Route } from "./+types/confirm";
import { getSupabase } from "~/services/auth.server";

const TYPES: EmailOtpType[] = ["recovery", "invite", "signup", "email", "email_change", "magiclink"];

/** Enlaces de correo (invitación, recuperación, verificación): token_hash → sesión. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/app";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  const supabase = getSupabase(context);
  if (tokenHash && type && TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) throw redirect(type === "recovery" || type === "invite" ? "/reset-password" : safe);
  }
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) throw redirect(safe);
  }
  throw redirect("/login?error=link_expired");
}
