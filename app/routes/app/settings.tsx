import { Form, useActionData, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { Save } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/settings";
import { requireUser } from "~/services/auth.server";
import { getEnv } from "~/services/env.server";
import { getAppName } from "~/services/settings.server";
import { failCode } from "~/services/forms.server";
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Select, Table, Td, Th } from "~/components/ui";
import { LanguageSwitcher } from "~/components/layout/language-switcher";
import { check, toAppError } from "~/utils/errors";
import { fmtNumber } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const [scales, prefs, maxMb] = await Promise.all([
    supabase.from("grade_scales").select("*").order("name"),
    supabase.from("user_preferences").select("theme").eq("user_id", user.id).maybeSingle(),
    supabase.from("system_settings").select("value").eq("key", "max_upload_mb").maybeSingle(),
  ]);
  return { isAdmin: user.isAdmin, appName: await getAppName(supabase, getEnv(context).APP_NAME), scales: scales.data ?? [], theme: prefs.data?.theme ?? "system", maxMb: Number(maxMb.data?.value ?? getEnv(context).MAX_UPLOAD_MB) };
}

const scaleSchema = z.object({
  name: z.string().trim().min(2).max(80), country: z.string().trim().min(2).max(2).toUpperCase(),
  min_grade: z.coerce.number(), max_grade: z.coerce.number(), pass_grade: z.coerce.number(),
  exigency: z.coerce.number().min(1).max(99).transform((v) => v / 100), decimals: z.coerce.number().int().min(0).max(2),
}).refine((v) => v.min_grade < v.pass_grade && v.pass_grade < v.max_grade, { message: "scale_order" });

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const fd = await request.formData();
  try {
    const intent = fd.get("intent");
    if (intent === "app") {
      if (!user.isAdmin) return failCode("forbidden", 403);
      const name = z.string().trim().min(2).max(80).parse(fd.get("app_name"));
      const mb = z.coerce.number().int().min(1).max(5000).parse(fd.get("max_upload_mb"));
      check(await supabase.from("system_settings").upsert([{ key: "app_name", value: name }, { key: "max_upload_mb", value: mb }]));
    } else if (intent === "scale") {
      const s = scaleSchema.safeParse(Object.fromEntries(fd));
      if (!s.success) return failCode(s.error.issues[0]?.message === "scale_order" ? "scale_order" : "invalid_data");
      check(await supabase.from("grade_scales").insert(s.data));
    } else if (intent === "update-scale") {
      const id = z.string().uuid().parse(fd.get("id"));
      const exigency = z.coerce.number().min(1).max(99).parse(fd.get("exigency")) / 100;
      check(await supabase.from("grade_scales").update({ exigency }).eq("id", id));
    } else return failCode("invalid_data");
    return { ok: true as const };
  } catch (e) {
    return failCode(e instanceof z.ZodError ? "invalid_data" : toAppError(e).code);
  }
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  return (
    <>
      <PageHeader title={t("nav.settings")} />
      {a && a.ok && <div className="mb-4"><Alert tone="green">{t("common.saved")}</Alert></div>}
      {a && !a.ok && <div className="mb-4"><Alert>{t(`errors.${a.error}`)}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("settings.preferences")} />
          <div className="space-y-4 p-5">
            <div><p className="mb-2 text-sm font-medium">{t("common.language")}</p><LanguageSwitcher /></div>
            <Form method="post" action="/api/preferences" className="flex items-end gap-2" reloadDocument>
              <input type="hidden" name="intent" value="theme" />
              <Field label={t("settings.theme")} htmlFor="theme"><Select id="theme" name="theme" defaultValue={loaderData.theme}>
                {(["system", "light", "dark"] as const).map((x) => <option key={x} value={x}>{t(`settings.themes.${x}`)}</option>)}</Select></Field>
              <Button variant="outline">{t("common.save")}</Button>
            </Form>
          </div>
        </Card>
        {loaderData.isAdmin && (
          <Card>
            <CardHeader title={t("settings.platform")} />
            <Form method="post" className="space-y-4 p-5">
              <input type="hidden" name="intent" value="app" />
              <Field label={t("settings.app_name")} htmlFor="app_name"><Input id="app_name" name="app_name" defaultValue={loaderData.appName} required /></Field>
              <Field label={t("settings.max_upload")} htmlFor="mu" hint={t("settings.max_upload_hint")}><Input id="mu" name="max_upload_mb" type="number" min={1} defaultValue={loaderData.maxMb} /></Field>
              <Button loading={nav.state === "submitting"}><Save className="h-4 w-4" />{t("common.save")}</Button>
            </Form>
          </Card>
        )}
        <Card className="lg:col-span-2">
          <CardHeader title={t("grades.scales")} description={t("grades.scales_hint")} />
          <Table><thead><tr><Th>{t("common.name")}</Th><Th>{t("grades.range")}</Th><Th>{t("grades.pass")}</Th><Th>{t("grades.exigency")}</Th></tr></thead>
            <tbody>{loaderData.scales.map((s) => (
              <tr key={s.id}><Td className="font-medium">{s.name}</Td><Td>{fmtNumber(s.min_grade, locale)} – {fmtNumber(s.max_grade, locale)}</Td><Td>{fmtNumber(s.pass_grade, locale)}</Td>
                <Td><Form method="post" className="flex items-center gap-1"><input type="hidden" name="intent" value="update-scale" /><input type="hidden" name="id" value={s.id} />
                  <Input name="exigency" type="number" min={1} max={99} defaultValue={Math.round(Number(s.exigency) * 100)} className="h-8 w-20" aria-label={t("grades.exigency")} />%
                  <Button size="sm" variant="ghost">{t("common.save")}</Button></Form></Td></tr>
            ))}</tbody></Table>
          <Form method="post" className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-4 lg:grid-cols-8 dark:border-white/10">
            <input type="hidden" name="intent" value="scale" />
            <Input name="name" placeholder={t("common.name")} required className="sm:col-span-2" aria-label={t("common.name")} />
            <Input name="country" placeholder="CL / HT" required maxLength={2} aria-label={t("grades.country")} />
            <Input name="min_grade" type="number" step="0.1" placeholder={t("grades.min")} required aria-label={t("grades.min")} />
            <Input name="max_grade" type="number" step="0.1" placeholder={t("grades.max")} required aria-label={t("grades.max")} />
            <Input name="pass_grade" type="number" step="0.1" placeholder={t("grades.pass")} required aria-label={t("grades.pass")} />
            <Input name="exigency" type="number" min={1} max={99} placeholder="60 %" required aria-label={t("grades.exigency")} />
            <input type="hidden" name="decimals" value="1" />
            <Button>{t("grades.add_scale")}</Button>
          </Form>
        </Card>
      </div>
    </>
  );
}
