import { useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation, useSearchParams, data } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { Route } from "./+types/login";
import { AuthShell } from "~/components/layout/auth-shell";
import { Alert, Button, Field, Input } from "~/components/ui";
import { getOptionalUser, getSupabase, setRememberSession } from "~/services/auth.server";
import { getEnv } from "~/services/env.server";
import { getAppName } from "~/services/settings.server";
import { clientIp, rateLimit } from "~/services/cloudflare/ratelimit.server";
import { REMEMBER_COOKIE } from "~/services/supabase/server";
import { countryBySlug, countryCookie, preferredCountry } from "~/countries/registry";
import { AppError } from "~/utils/errors";

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Login · ${loaderData?.productName ?? "YupiEd"}` }];

/** /chile/login o /haiti/login → país explícito; /login → preferencia guardada. */
function countryFromRequest(request: Request) {
  const slug = new URL(request.url).pathname.split("/").filter(Boolean)[0];
  return { country: countryBySlug(slug) ?? preferredCountry(request), explicit: !!countryBySlug(slug) };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { country, explicit } = countryFromRequest(request);
  if (await getOptionalUser(context)) throw redirect("/app");
  const appName = await getAppName(getSupabase(context), getEnv(context).APP_NAME);
  return data(
    { appName, productName: country?.productName ?? appName, country: country ? { slug: country.slug, code: country.code, name: country.name } : null, googleEnabled: true },
    explicit && country ? { headers: { "Set-Cookie": countryCookie(country.slug) } } : undefined,
  );
}

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200), remember: z.string().optional(), next: z.string().optional() });

function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const fd = await request.formData();
  const intent = fd.get("intent");
  const supabase = getSupabase(context);
  const remember = fd.get("remember") === "on";
  const rememberCookie = `${REMEMBER_COOKIE}=${remember ? "1" : "0"}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;

  try {
    await rateLimit(env, "auth", clientIp(request));
  } catch (e) {
    if (e instanceof AppError) return data({ error: e.code }, { status: 429 });
    throw e;
  }

  if (intent === "google") {
    const origin = new URL(request.url).origin;
    const { data: d, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(String(fd.get("next") ?? "")))}` },
    });
    if (error || !d.url) return data({ error: "google_unavailable" }, { status: 400 });
    throw redirect(d.url, { headers: { "Set-Cookie": rememberCookie } });
  }

  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return data({ error: "invalid_credentials" }, { status: 400 });
  setRememberSession(context, remember);
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    const code = error.code === "email_not_confirmed" ? "email_not_confirmed" : error.status === 429 ? "rate_limited" : "invalid_credentials";
    return data({ error: code }, { status: 401 });
  }
  throw redirect(safeNext(parsed.data.next), { headers: { "Set-Cookie": rememberCookie } });
}

export default function Login({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const [params] = useSearchParams();
  const [show, setShow] = useState(false);
  const busy = nav.state !== "idle";
  const error = actionData?.error ?? params.get("error");

  return (
    <AuthShell appName={loaderData.appName} title={loaderData.productName} subtitle={t("auth.welcome")} country={loaderData.country}>
      <Form method="post" className="space-y-4" replace>
        <input type="hidden" name="next" value={params.get("next") ?? ""} />
        {error && <Alert>{t(`errors.${error}`, { defaultValue: t("errors.unexpected") })}</Alert>}
        {params.get("reset") === "1" && <Alert tone="green">{t("auth.password_updated")}</Alert>}
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <Field label={t("auth.password")} htmlFor="password">
          <div className="relative">
            <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required className="pr-10" />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t("auth.hide_password") : t("auth.show_password")}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-slate-800">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <input type="checkbox" name="remember" defaultChecked className="h-4 w-4 rounded border-slate-300 text-brand-500" />
            {t("auth.remember")}
          </label>
          <Link to="/forgot-password" className="font-medium text-brand-600 hover:underline">{t("auth.forgot")}</Link>
        </div>
        <Button type="submit" name="intent" value="password" className="w-full" size="lg" loading={busy && nav.formData?.get("intent") === "password"}>
          {t("auth.sign_in")}
        </Button>
        <div className="relative py-1 text-center text-xs text-slate-400">
          <span className="relative z-10 bg-white px-2 dark:bg-navy-900">{t("common.or")}</span>
          <div className="absolute inset-x-0 top-1/2 -z-0 border-t border-slate-200 dark:border-white/10" aria-hidden />
        </div>
        <Button type="submit" name="intent" value="google" variant="outline" className="w-full" formNoValidate loading={busy && nav.formData?.get("intent") === "google"}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>
          {t("auth.google")}
        </Button>
        <p className="text-center text-xs text-slate-500">{t("auth.private_notice")}</p>
      </Form>
    </AuthShell>
  );
}
