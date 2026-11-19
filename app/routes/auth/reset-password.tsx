import { Form, redirect, useActionData, useNavigation, useSearchParams, data } from "react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { Route } from "./+types/reset-password";
import { AuthShell } from "~/components/layout/auth-shell";
import { Alert, Button, Field, Input } from "~/components/ui";
import { getOptionalUser, getSupabase } from "~/services/auth.server";
import { getEnv } from "~/services/env.server";
import { getAppName } from "~/services/settings.server";

export async function loader({ context }: Route.LoaderArgs) {
  const user = await getOptionalUser(context);
  if (!user) throw redirect("/login?error=link_expired");
  return { appName: await getAppName(getSupabase(context), getEnv(context).APP_NAME), email: user.email };
}

export const passwordSchema = z.object({
  password: z.string().min(8, "validation.password_min").max(72, "validation.too_long")
    .regex(/[A-Za-z]/, "validation.password_letter").regex(/\d/, "validation.password_number"),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { message: "validation.password_match", path: ["confirm"] });

export async function action({ request, context }: Route.ActionArgs) {
  const user = await getOptionalUser(context);
  if (!user) throw redirect("/login?error=link_expired");
  const parsed = passwordSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return data({ error: parsed.error.issues[0]?.message ?? "validation.invalid" }, { status: 400 });
  const supabase = getSupabase(context);
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return data({ error: error.code === "same_password" ? "errors.same_password" : "errors.unexpected" }, { status: 400 });
  await supabase.rpc("clear_password_flag");
  throw redirect("/app?welcome=1");
}

export default function Reset({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const [params] = useSearchParams();
  return (
    <AuthShell appName={loaderData.appName} title={t(params.get("first") ? "auth.first_password_title" : "auth.new_password_title")} subtitle={loaderData.email}>
      <Form method="post" className="space-y-4">
        {a?.error && <Alert>{t(a.error)}</Alert>}
        <Field label={t("auth.new_password")} htmlFor="password" hint={t("auth.password_rules")}>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label={t("auth.confirm_password")} htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Button type="submit" className="w-full" loading={nav.state !== "idle"}>{t("auth.save_password")}</Button>
      </Form>
    </AuthShell>
  );
}
