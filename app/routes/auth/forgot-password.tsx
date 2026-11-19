import { Form, Link, useActionData, useNavigation, data } from "react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { Route } from "./+types/forgot-password";
import { AuthShell } from "~/components/layout/auth-shell";
import { Alert, Button, Field, Input } from "~/components/ui";
import { getSupabase } from "~/services/auth.server";
import { getEnv } from "~/services/env.server";
import { getAppName } from "~/services/settings.server";
import { clientIp, rateLimit } from "~/services/cloudflare/ratelimit.server";
import { AppError } from "~/utils/errors";

export async function loader({ context }: Route.LoaderArgs) {
  return { appName: await getAppName(getSupabase(context), getEnv(context).APP_NAME) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  try {
    await rateLimit(env, "auth", `forgot:${clientIp(request)}`);
  } catch (e) {
    if (e instanceof AppError) return data({ sent: false, error: e.code }, { status: 429 });
    throw e;
  }
  const fd = await request.formData();
  const parsed = z.string().trim().toLowerCase().email().safeParse(fd.get("email"));
  if (!parsed.success) return data({ sent: false, error: "validation.email" }, { status: 400 });
  const origin = new URL(request.url).origin;
  // Respuesta idéntica exista o no la cuenta (no revela qué correos están registrados).
  await getSupabase(context).auth.resetPasswordForEmail(parsed.data, { redirectTo: `${origin}/auth/confirm?next=/reset-password` });
  return { sent: true, error: null };
}

export default function Forgot({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  return (
    <AuthShell appName={loaderData.appName} title={t("auth.forgot_title")} subtitle={t("auth.forgot_subtitle")}>
      {a?.sent ? (
        <div className="space-y-4">
          <Alert tone="green">{t("auth.reset_sent")}</Alert>
          <Link to="/login" className="block text-center text-sm font-medium text-brand-600 hover:underline">{t("auth.back_to_login")}</Link>
        </div>
      ) : (
        <Form method="post" className="space-y-4">
          {a?.error && <Alert>{t(a.error.includes(".") ? a.error : `errors.${a.error}`)}</Alert>}
          <Field label={t("auth.email")} htmlFor="email"><Input id="email" name="email" type="email" required autoFocus autoComplete="email" /></Field>
          <Button type="submit" className="w-full" loading={nav.state !== "idle"}>{t("auth.send_link")}</Button>
          <Link to="/login" className="block text-center text-sm text-slate-500 hover:underline">{t("auth.back_to_login")}</Link>
        </Form>
      )}
    </AuthShell>
  );
}
