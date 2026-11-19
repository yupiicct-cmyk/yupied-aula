import { useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { Eye, Save, Send, Trash2 } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/edit";
import { requireUser } from "~/services/auth.server";
import { courseStudents } from "~/services/courses.server";
import { detectLocale, LOCALES, LOCALE_LABELS, pick } from "~/services/i18n";
import { lessonTitles } from "~/services/content.server";
import { loadActivityQuestions, saveActivityQuestions } from "~/services/questions.server";
import { usesQuestions } from "~/utils/activity-types";
import { failCode } from "~/services/forms.server";
import { questionsSchema } from "~/schemas/questions";
import { optionalDateTime, checkbox } from "~/schemas/common";
import { sanitizeHtml } from "~/utils/sanitize.server";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Tabs } from "~/components/ui";
import { RichText } from "~/components/rich-text";
import { QuestionEditor, type EditableQuestion } from "~/components/questions";
import { StatusBadge } from "~/components/status-badge";
import { toLocalInput, fullName } from "~/utils/format";
import { check, must, toAppError } from "~/utils/errors";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const locale = detectLocale(request, user.profile.locale);
  const activity = must(await supabase.from("activities").select("*").eq("id", params.id).maybeSingle());
  const [tr, questions, lessons, modules, students, assigned, subs] = await Promise.all([
    supabase.from("activity_translations").select("*").eq("activity_id", activity.id),
    loadActivityQuestions(supabase, activity.id, true),
    supabase.from("lessons").select("id,number").eq("course_id", activity.course_id).is("deleted_at", null).order("number"),
    supabase.from("modules").select("id,position,title_i18n").eq("course_id", activity.course_id).is("deleted_at", null).order("position"),
    courseStudents(supabase, activity.course_id),
    supabase.from("activity_assignments").select("student_id,group_name").eq("activity_id", activity.id),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("activity_id", activity.id).neq("status", "draft"),
  ]);
  const lt = await lessonTitles(supabase, (lessons.data ?? []).map((l) => l.id), locale);
  return {
    activity, translations: tr.data ?? [],
    questions: questions.map((q) => ({ id: q.id, kind: q.kind, points: Number(q.points), prompt: q.prompt_i18n as Record<string, string>, options: q.options, meta: q.meta as EditableQuestion["meta"], correct: q.correct })),
    lessons: (lessons.data ?? []).map((l) => ({ id: l.id, label: `${l.number}. ${lt.get(l.id) ?? ""}` })),
    modules: (modules.data ?? []).map((m) => ({ id: m.id, label: `${m.position}. ${pick(m.title_i18n, locale)}` })),
    students: students.map((s) => ({ id: s.id, name: fullName(s) })),
    assigned: assigned.data ?? [],
    locked: (subs.count ?? 0) > 0,
  };
}

const schema = z.object({
  lesson_id: z.string().uuid().or(z.literal("")).transform((v) => v || null),
  module_id: z.string().uuid().or(z.literal("")).transform((v) => v || null),
  publish_at: optionalDateTime,
  due_at: optionalDateTime,
  allow_late: checkbox,
  max_score: z.coerce.number().positive().max(1000),
  weight: z.coerce.number().min(0).max(100),
  original_locale: z.enum(["es", "ht", "fr"]),
  assign_mode: z.enum(["all", "selected"]),
});

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "save");
  try {
    const activity = must(await supabase.from("activities").select("*").eq("id", params.id).maybeSingle());
    if (intent === "delete") {
      check(await supabase.from("activities").update({ deleted_at: new Date().toISOString(), status: "archived" }).eq("id", activity.id));
      throw redirect("/app/activities");
    }
    const p = schema.safeParse(Object.fromEntries(fd));
    if (!p.success) return failCode("invalid_data");
    if (p.data.due_at && p.data.publish_at && p.data.due_at <= p.data.publish_at) return failCode("due_before_publish");

    const trs = LOCALES.map((l) => ({
      activity_id: activity.id, locale: l, updated_by: user.id,
      status: (["draft", "ai_proposed", "approved"].includes(String(fd.get(`t_${l}_status`))) ? String(fd.get(`t_${l}_status`)) : "draft") as "draft" | "ai_proposed" | "approved",
      title: String(fd.get(`t_${l}_title`) ?? "").trim().slice(0, 300),
      description: sanitizeHtml(String(fd.get(`t_${l}_description`) ?? "")),
      instructions: sanitizeHtml(String(fd.get(`t_${l}_instructions`) ?? "")),
    }));
    const original = trs.find((x) => x.locale === p.data.original_locale)!;
    let status = activity.status;
    if (intent === "publish") {
      if (!original.title) return failCode("title_required");
      original.status = "approved";
      status = p.data.publish_at && Date.parse(p.data.publish_at) > Date.now() ? "scheduled" : "published";
    } else if (intent === "unpublish") status = "draft";
    else if (intent === "close") status = "archived";

    if (usesQuestions(activity.type) && fd.has("questions")) {
      const qs = questionsSchema.safeParse(JSON.parse(String(fd.get("questions"))));
      if (!qs.success) return failCode(qs.error.issues[0]?.message?.replace("validation.", "") ?? "invalid_data");
      if (intent === "publish" && qs.data.length === 0) return failCode("questions_required");
      const { count } = await supabase.from("submissions").select("id", { count: "exact", head: true }).eq("activity_id", activity.id).neq("status", "draft");
      if (!count) await saveActivityQuestions(supabase, activity.id, qs.data);
    }

    const { assign_mode, ...rest } = p.data;
    check(await supabase.from("activities").update({ ...rest, status }).eq("id", activity.id));
    check(await supabase.from("activity_translations").upsert(trs.filter((x) => x.locale === p.data.original_locale || x.title || x.description || x.instructions)));

    check(await supabase.from("activity_assignments").delete().eq("activity_id", activity.id));
    if (assign_mode === "selected") {
      const ids = fd.getAll("students[]").map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v));
      if (ids.length === 0) return failCode("select_students");
      check(await supabase.from("activity_assignments").insert(ids.map((student_id) => ({
        activity_id: activity.id, student_id, group_name: String(fd.get(`group_${student_id}`) ?? "").trim().slice(0, 60) || null,
      }))));
    }
    return { ok: true as const, message: intent === "publish" ? "activities.published" : "common.saved" };
  } catch (e) {
    if (e instanceof Response) throw e;
    return failCode(toAppError(e).code);
  }
}

export default function ActivityEdit({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const { activity, translations } = loaderData;
  const [tab, setTab] = useState<string>(activity.original_locale);
  const [assignMode, setAssignMode] = useState(loaderData.assigned.length ? "selected" : "all");
  const assigned = new Map(loaderData.assigned.map((x) => [x.student_id, x.group_name]));
  const busy = nav.state === "submitting";
  const tr = (l: string) => translations.find((x) => x.locale === l);

  return (
    <>
      <PageHeader title={t("activities.builder")} description={<span className="flex items-center gap-2"><Badge tone="blue">{t(`activities.types.${activity.type}`)}</Badge><StatusBadge status={activity.status} /></span>}
        actions={<Link to={`/app/activities/${activity.id}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium dark:border-white/15"><Eye className="h-4 w-4" />{t("lessons.preview")}</Link>} />
      {a && a.ok && <div className="mb-4"><Alert tone="green">{t(a.message ?? "common.saved")}</Alert></div>}
      {a && !a.ok && <div className="mb-4"><Alert>{t(`errors.${a.error}`, { defaultValue: t(`validation.${a.error}`, { defaultValue: t("errors.invalid_data") }) })}</Alert></div>}
      <Form method="post" className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <div className="px-4 pt-3"><Tabs active={tab} onChange={setTab} items={LOCALES.map((l) => ({ key: l, label: LOCALE_LABELS[l] }))} /></div>
            {LOCALES.map((l) => (
              <div key={l} hidden={tab !== l} className="space-y-4 p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label={t("common.title")} htmlFor={`t_${l}_title`} className="min-w-64 flex-1"><Input id={`t_${l}_title`} name={`t_${l}_title`} defaultValue={tr(l)?.title ?? ""} maxLength={300} /></Field>
                  <Field label={t("translation.status")} htmlFor={`t_${l}_status`}><Select id={`t_${l}_status`} name={`t_${l}_status`} defaultValue={tr(l)?.status ?? "draft"}>
                    {(["draft", "ai_proposed", "approved"] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Field>
                </div>
                <RichText name={`t_${l}_description`} defaultValue={tr(l)?.description ?? ""} label={t("common.description")} />
                <RichText name={`t_${l}_instructions`} defaultValue={tr(l)?.instructions ?? ""} label={t("activities.instructions")} />
              </div>
            ))}
          </Card>
          {usesQuestions(activity.type) && (
            <Card className="p-5">
              <h2 className="mb-4 font-semibold">{t("questions.title")}</h2>
              <QuestionEditor name="questions" initial={loaderData.questions} locked={loaderData.locked} />
            </Card>
          )}
          <Card>
            <CardHeader title={t("activities.assignment")} />
            <div className="space-y-3 p-5">
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="assign_mode" value="all" checked={assignMode === "all"} onChange={() => setAssignMode("all")} />{t("activities.assign_all")}</label>
                <label className="flex items-center gap-2"><input type="radio" name="assign_mode" value="selected" checked={assignMode === "selected"} onChange={() => setAssignMode("selected")} />{t("activities.assign_selected")}</label>
              </div>
              {assignMode === "selected" && (
                <div className="grid gap-2 sm:grid-cols-2">{loaderData.students.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-white/10">
                    <input type="checkbox" name="students[]" value={s.id} defaultChecked={assigned.has(s.id)} aria-label={s.name} />
                    <span className="flex-1 truncate">{s.name}</span>
                    {activity.type === "group" && <Input name={`group_${s.id}`} defaultValue={assigned.get(s.id) ?? ""} placeholder={t("activities.group")} className="h-7 w-24 text-xs" aria-label={t("activities.group")} />}
                  </div>
                ))}</div>
              )}
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("lessons.publication")} />
            <div className="space-y-3 p-5">
              <Button type="submit" name="intent" value="save" variant="outline" className="w-full" loading={busy && nav.formData?.get("intent") === "save"}><Save className="h-4 w-4" />{t("lessons.save_draft")}</Button>
              <Button type="submit" name="intent" value="publish" className="w-full" loading={busy && nav.formData?.get("intent") === "publish"}><Send className="h-4 w-4" />{t("lessons.publish")}</Button>
              {activity.status !== "draft" && <Button type="submit" name="intent" value="unpublish" variant="ghost" className="w-full">{t("lessons.unpublish")}</Button>}
              {activity.status === "published" && <Button type="submit" name="intent" value="close" variant="ghost" className="w-full">{t("activities.close")}</Button>}
            </div>
          </Card>
          <Card>
            <CardHeader title={t("lessons.details")} />
            <div className="space-y-4 p-5">
              <Field label={t("lessons.publish_at")} htmlFor="publish_at"><Input id="publish_at" name="publish_at" type="datetime-local" defaultValue={toLocalInput(activity.publish_at)} /></Field>
              <Field label={t("activities.due_date")} htmlFor="due_at"><Input id="due_at" name="due_at" type="datetime-local" defaultValue={toLocalInput(activity.due_at)} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allow_late" defaultChecked={activity.allow_late} />{t("activities.allow_late")}</label>
              <Field label={t("activities.max_score")} htmlFor="max_score"><Input id="max_score" name="max_score" type="number" min={1} step="0.5" defaultValue={activity.max_score} /></Field>
              <Field label={t("grades.weight")} htmlFor="weight" hint={t("grades.weight_hint")}><Input id="weight" name="weight" type="number" min={0} step="0.5" defaultValue={activity.weight} /></Field>
              <Field label={t("nav.lessons")} htmlFor="lesson_id"><Select id="lesson_id" name="lesson_id" defaultValue={activity.lesson_id ?? ""}><option value="">—</option>{loaderData.lessons.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</Select></Field>
              <Field label={t("nav.modules")} htmlFor="module_id"><Select id="module_id" name="module_id" defaultValue={activity.module_id ?? ""}><option value="">—</option>{loaderData.modules.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
              <Field label={t("translation.original_language")} htmlFor="original_locale"><Select id="original_locale" name="original_locale" defaultValue={activity.original_locale}>{LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}</Select></Field>
            </div>
          </Card>
          <Button type="submit" name="intent" value="delete" variant="ghost" className="w-full text-red-600" onClick={(e) => { if (!confirm(t("common.are_you_sure"))) e.preventDefault(); }}><Trash2 className="h-4 w-4" />{t("common.delete")}</Button>
        </div>
      </Form>
    </>
  );
}
