import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { BarChart3, Save, Send, Trash2 } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/edit";
import { requireUser } from "~/services/auth.server";
import { detectLocale, pick } from "~/services/i18n";
import { loadAssessmentQuestions, saveAssessmentQuestions } from "~/services/questions.server";
import { failCode } from "~/services/forms.server";
import { questionsSchema } from "~/schemas/questions";
import { i18nFromForm } from "~/schemas/content";
import { checkbox, optionalDateTime, optionalInt } from "~/schemas/common";
import { Alert, Button, ButtonLink, Card, CardHeader, Field, Input, PageHeader, Select } from "~/components/ui";
import { I18nInputs } from "~/components/i18n-inputs";
import { QuestionEditor, type EditableQuestion } from "~/components/questions";
import { StatusBadge } from "~/components/status-badge";
import { toLocalInput } from "~/utils/format";
import { check, must, toAppError } from "~/utils/errors";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const locale = detectLocale(request, user.profile.locale);
  const a = must(await supabase.from("assessments").select("*").eq("id", params.id).maybeSingle());
  const [qs, modules, attempts] = await Promise.all([
    loadAssessmentQuestions(supabase, a.id, true),
    supabase.from("modules").select("id,position,title_i18n").eq("course_id", a.course_id).is("deleted_at", null).order("position"),
    supabase.from("assessment_attempts").select("id", { count: "exact", head: true }).eq("assessment_id", a.id),
  ]);
  return {
    a, locked: (attempts.count ?? 0) > 0,
    questions: qs.map((q) => ({ id: q.id, kind: q.kind, points: Number(q.points), prompt: q.prompt_i18n as Record<string, string>, options: q.options, meta: q.meta as EditableQuestion["meta"], correct: q.correct })),
    modules: (modules.data ?? []).map((m) => ({ id: m.id, label: `${m.position}. ${pick(m.title_i18n, locale)}` })),
  };
}

const schema = z.object({
  module_id: z.string().uuid().or(z.literal("")).transform((v) => v || null),
  opens_at: optionalDateTime,
  closes_at: optionalDateTime,
  time_limit_minutes: optionalInt,
  max_attempts: z.coerce.number().int().min(1).max(20),
  random_question_count: optionalInt,
  shuffle: checkbox,
  weight: z.coerce.number().min(0).max(100),
});

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase } = await requireUser(request, context, { teacher: true });
  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "save");
  try {
    if (intent === "delete") {
      check(await supabase.from("assessments").update({ deleted_at: new Date().toISOString(), status: "archived" }).eq("id", params.id));
      throw redirect("/app/assessments");
    }
    const p = schema.safeParse(Object.fromEntries(fd));
    if (!p.success) return failCode("invalid_data");
    if (p.data.opens_at && p.data.closes_at && p.data.closes_at <= p.data.opens_at) return failCode("close_before_open");
    const title = i18nFromForm(fd, "title", 200);
    if (!title.es && !title.fr && !title.ht) return failCode("title_required");
    const qs = questionsSchema.safeParse(JSON.parse(String(fd.get("questions") ?? "[]")));
    if (!qs.success) return failCode(qs.error.issues[0]?.message?.replace("validation.", "") ?? "invalid_data");
    if (p.data.random_question_count && p.data.random_question_count > qs.data.length) return failCode("random_count_too_high");
    const { count } = await supabase.from("assessment_attempts").select("id", { count: "exact", head: true }).eq("assessment_id", params.id);
    if (!count) await saveAssessmentQuestions(supabase, params.id, qs.data);
    let status: "draft" | "published" | "scheduled" | undefined;
    if (intent === "publish") {
      if (qs.data.length === 0) return failCode("questions_required");
      status = p.data.opens_at && Date.parse(p.data.opens_at) > Date.now() ? "scheduled" : "published";
    } else if (intent === "unpublish") status = "draft";
    check(await supabase.from("assessments").update({ ...p.data, title_i18n: title, description_i18n: i18nFromForm(fd, "description", 4000), ...(status ? { status } : {}) }).eq("id", params.id));
    return { ok: true as const, message: intent === "publish" ? "assessments.published" : "common.saved" };
  } catch (e) {
    if (e instanceof Response) throw e;
    return failCode(toAppError(e).code);
  }
}

export default function AssessmentEdit({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const r = useActionData<typeof action>();
  const nav = useNavigation();
  const { a } = loaderData;
  const busy = nav.state === "submitting";
  return (
    <>
      <PageHeader title={t("assessments.builder")} description={<StatusBadge status={a.status} />}
        actions={<ButtonLink to={`/app/assessments/${a.id}/results`} variant="outline"><BarChart3 className="h-4 w-4" />{t("assessments.results")}</ButtonLink>} />
      {r && r.ok && <div className="mb-4"><Alert tone="green">{t(r.message ?? "common.saved")}</Alert></div>}
      {r && !r.ok && <div className="mb-4"><Alert>{t(`errors.${r.error}`, { defaultValue: t(`validation.${r.error}`, { defaultValue: t("errors.invalid_data") }) })}</Alert></div>}
      <Form method="post" className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="grid gap-4 p-5 lg:grid-cols-2">
            <I18nInputs name="title" label={t("common.title")} values={a.title_i18n as Record<string, string>} required />
            <I18nInputs name="description" label={t("assessments.instructions")} values={a.description_i18n as Record<string, string>} multiline />
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">{t("questions.title")}</h2>
            <QuestionEditor name="questions" initial={loaderData.questions} locked={loaderData.locked} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("lessons.publication")} />
            <div className="space-y-3 p-5">
              <Button type="submit" name="intent" value="save" variant="outline" className="w-full" loading={busy && nav.formData?.get("intent") === "save"}><Save className="h-4 w-4" />{t("common.save")}</Button>
              <Button type="submit" name="intent" value="publish" className="w-full" loading={busy && nav.formData?.get("intent") === "publish"}><Send className="h-4 w-4" />{t("lessons.publish")}</Button>
              {a.status !== "draft" && <Button type="submit" name="intent" value="unpublish" variant="ghost" className="w-full">{t("lessons.unpublish")}</Button>}
            </div>
          </Card>
          <Card>
            <CardHeader title={t("assessments.settings")} />
            <div className="space-y-4 p-5">
              <Field label={t("nav.modules")} htmlFor="module_id"><Select id="module_id" name="module_id" defaultValue={a.module_id ?? ""}><option value="">—</option>{loaderData.modules.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
              <Field label={t("assessments.opens")} htmlFor="opens_at"><Input id="opens_at" name="opens_at" type="datetime-local" defaultValue={toLocalInput(a.opens_at)} /></Field>
              <Field label={t("assessments.closes")} htmlFor="closes_at"><Input id="closes_at" name="closes_at" type="datetime-local" defaultValue={toLocalInput(a.closes_at)} /></Field>
              <Field label={t("assessments.time_limit")} htmlFor="tl" hint={t("assessments.time_limit_hint")}><Input id="tl" name="time_limit_minutes" type="number" min={1} max={600} defaultValue={a.time_limit_minutes ?? ""} /></Field>
              <Field label={t("assessments.max_attempts")} htmlFor="ma"><Input id="ma" name="max_attempts" type="number" min={1} max={20} defaultValue={a.max_attempts} /></Field>
              <Field label={t("assessments.random_count")} htmlFor="rq" hint={t("assessments.random_count_hint")}><Input id="rq" name="random_question_count" type="number" min={1} defaultValue={a.random_question_count ?? ""} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shuffle" defaultChecked={a.shuffle} />{t("assessments.shuffle")}</label>
              <Field label={t("grades.weight")} htmlFor="w"><Input id="w" name="weight" type="number" min={0} step="0.5" defaultValue={a.weight} /></Field>
            </div>
          </Card>
          <Button type="submit" name="intent" value="delete" variant="ghost" className="w-full text-red-600" onClick={(e) => { if (!confirm(t("common.are_you_sure"))) e.preventDefault(); }}><Trash2 className="h-4 w-4" />{t("common.delete")}</Button>
          <Link to="/app/assessments" className="block text-center text-sm text-brand-600 hover:underline">{t("common.back")}</Link>
        </div>
      </Form>
    </>
  );
}
