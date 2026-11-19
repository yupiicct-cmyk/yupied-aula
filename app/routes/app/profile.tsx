import { Form, useActionData, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { Route } from "./+types/profile";
import { requireUser } from "~/services/auth.server";
import { detectLocale, LOCALES, LOCALE_LABELS } from "~/services/i18n";
import { loadStudent360, pendingActivities } from "~/services/student360.server";
import { fail, parseForm } from "~/services/forms.server";
import { Student360 } from "~/components/student-360";
import { Alert, Button, ButtonLink, Card, CardHeader, Field, Input, PageHeader, Select } from "~/components/ui";
import { localeEnum } from "~/schemas/common";
import { check } from "~/utils/errors";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const locale = detectLocale(request, user.profile.locale);
  if (user.isStudent && !user.isTeacher) {
    const data = await loadStudent360(supabase, user.id, locale);
    const pending = await pendingActivities(supabase, user.id, data.courses.map((c) => c.id));
    return { profile: user.profile, data: { ...data, pending } };
  }
  return { profile: user.profile, data: null };
}

const schema = z.object({
  first_name: z.string().trim().min(1, "validation.required").max(120),
  last_name: z.string().trim().min(1, "validation.required").max(120),
  locale: localeEnum,
});

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context);
  const p = parseForm(await request.formData(), schema);
  if (!p.success) return fail(p.fieldErrors);
  check(await supabase.from("profiles").update(p.data).eq("id", user.id));
  check(await supabase.from("user_preferences").upsert({ user_id: user.id, locale: p.data.locale }));
  return { ok: true as const };
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const p = loaderData.profile;
  return (
    <>
      <PageHeader title={t("nav.my_profile")} actions={<ButtonLink to="/reset-password" variant="outline">{t("auth.change_password")}</ButtonLink>} />
      <Card className="mb-6">
        <CardHeader title={t("profile.personal_data")} />
        <Form method="post" className="grid gap-4 p-5 sm:grid-cols-3">
          {a?.ok && <div className="sm:col-span-3"><Alert tone="green">{t("common.saved")}</Alert></div>}
          <Field label={t("students.first_name")} htmlFor="fn"><Input id="fn" name="first_name" defaultValue={p.first_name} required /></Field>
          <Field label={t("students.last_name")} htmlFor="ln"><Input id="ln" name="last_name" defaultValue={p.last_name} required /></Field>
          <Field label={t("profile.preferred_language")} htmlFor="lc"><Select id="lc" name="locale" defaultValue={p.locale}>{LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}</Select></Field>
          <div><Button type="submit" loading={nav.state === "submitting"}>{t("common.save")}</Button></div>
        </Form>
      </Card>
      {loaderData.data && <Student360 data={loaderData.data} teacherView={false} />}
    </>
  );
}
