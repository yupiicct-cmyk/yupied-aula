import { useState } from "react";
import { Form, Link, redirect, useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import { BookOpen, CheckCircle2, ChevronDown, Layers, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/modules";
import { requireUser } from "~/services/auth.server";
import { requireCourse } from "~/services/courses.server";
import { detectLocale, pick } from "~/services/i18n";
import { lessonTitles } from "~/services/content.server";
import { fail, failCode } from "~/services/forms.server";
import { i18nFromForm, moduleSchema } from "~/schemas/content";
import { Button, Card, EmptyState, Field, Input, PageHeader, Progress, Select } from "~/components/ui";
import { StatusBadge } from "~/components/status-badge";
import { I18nInputs } from "~/components/i18n-inputs";
import { fmtDate } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, must, toAppError } from "~/utils/errors";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const locale = detectLocale(request, user.profile.locale);
  const { course } = await requireCourse(request, supabase);
  const [mods, lessons, assessments, progress] = await Promise.all([
    supabase.from("modules").select("id,position,title_i18n,description_i18n,status").eq("course_id", course.id).is("deleted_at", null).order("position"),
    supabase.from("lessons").select("id,module_id,number,status,scheduled_date,publish_at").eq("course_id", course.id).is("deleted_at", null).neq("status", "archived").order("number"),
    supabase.from("assessments").select("id,module_id,title_i18n,status").eq("course_id", course.id).is("deleted_at", null),
    user.isStudent ? supabase.from("lesson_progress").select("lesson_id,completed_at").eq("student_id", user.id) : Promise.resolve({ data: [] as { lesson_id: string; completed_at: string | null }[] }),
  ]);
  const titles = await lessonTitles(supabase, (lessons.data ?? []).map((l) => l.id), locale);
  const done = new Set((progress.data ?? []).filter((p) => p.completed_at).map((p) => p.lesson_id));
  return {
    isTeacher: user.isTeacher,
    course: { id: course.id, name: course.name },
    modules: (mods.data ?? []).map((m) => ({
      ...m,
      title: pick(m.title_i18n, locale),
      description: pick(m.description_i18n, locale),
      lessons: (lessons.data ?? []).filter((l) => l.module_id === m.id).map((l) => ({ ...l, title: titles.get(l.id) ?? "", done: done.has(l.id) })),
      assessments: (assessments.data ?? []).filter((a) => a.module_id === m.id).map((a) => ({ id: a.id, title: pick(a.title_i18n, locale), status: a.status })),
    })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const { course } = await requireCourse(request, supabase);
  const fd = await request.formData();
  const intent = fd.get("intent");
  try {
    if (intent === "create" || intent === "update") {
      const p = moduleSchema.safeParse(Object.fromEntries(fd));
      const title = i18nFromForm(fd, "title", 200);
      if (!p.success || !title.es) return fail({ title: "validation.required" });
      const row = { ...p.data, title_i18n: title, description_i18n: i18nFromForm(fd, "description", 2000) };
      if (intent === "create") check(await supabase.from("modules").insert({ ...row, course_id: course.id }));
      else check(await supabase.from("modules").update(row).eq("id", z.string().uuid().parse(fd.get("id"))));
      return { ok: true as const };
    }
    if (intent === "delete") {
      check(await supabase.from("modules").update({ deleted_at: new Date().toISOString(), status: "archived" }).eq("id", z.string().uuid().parse(fd.get("id"))));
      return { ok: true as const };
    }
    if (intent === "add-lesson") {
      const moduleId = z.string().uuid().parse(fd.get("id"));
      const { count } = await supabase.from("lessons").select("id", { count: "exact", head: true }).eq("module_id", moduleId);
      const lesson = must(await supabase.from("lessons").insert({ course_id: course.id, module_id: moduleId, number: (count ?? 0) + 1, created_by: user.id }).select("id").single());
      check(await supabase.from("lesson_translations").insert({ lesson_id: lesson.id, locale: "es", status: "draft", title: "", updated_by: user.id }));
      throw redirect(`/app/lessons/${lesson.id}/edit`);
    }
    return failCode("invalid_data");
  } catch (e) {
    if (e instanceof Response) throw e;
    return failCode(toAppError(e).code);
  }
}

export default function Modules({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const fetcher = useFetcher();
  const { modules, isTeacher } = loaderData;
  return (
    <>
      <PageHeader title={isTeacher ? t("nav.modules") : t("nav.my_modules")} description={loaderData.course.name}
        actions={isTeacher && <Button onClick={() => setCreating((c) => !c)}><Plus className="h-4 w-4" />{t("modules.create")}</Button>} />
      {creating && (
        <Card className="mb-6 p-5">
          <Form method="post" className="grid gap-4 lg:grid-cols-2" onSubmit={() => setCreating(false)}>
            <input type="hidden" name="intent" value="create" />
            <I18nInputs name="title" label={t("common.title")} required />
            <I18nInputs name="description" label={t("common.description")} multiline />
            <Field label={t("modules.position")} htmlFor="pos"><Input id="pos" name="position" type="number" min={1} defaultValue={modules.length + 1} /></Field>
            <Field label={t("common.status")} htmlFor="st"><Select id="st" name="status" defaultValue="draft">
              {(["draft", "published"] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Field>
            <div><Button type="submit">{t("common.create")}</Button></div>
          </Form>
        </Card>
      )}
      {modules.length === 0 ? <Card><EmptyState icon={<Layers />} title={t("modules.empty")} /></Card> : (
        <div className="space-y-4">
          {modules.map((m) => {
            const done = m.lessons.filter((l) => l.done).length;
            return (
              <Card key={m.id}>
                <details open className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-sm font-bold text-white">{m.position}</span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-navy-900 dark:text-white">{m.title || t("modules.untitled")}</h2>
                      {m.description && <p className="truncate text-sm text-slate-500">{m.description}</p>}
                    </div>
                    {isTeacher ? <StatusBadge status={m.status} /> : <div className="hidden w-32 sm:block"><Progress value={m.lessons.length ? (100 * done) / m.lessons.length : 0} /></div>}
                    <ChevronDown className="h-5 w-5 text-slate-400 transition group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-slate-100 dark:border-white/10">
                    {editing === m.id && (
                      <Form method="post" className="grid gap-4 border-b border-slate-100 p-5 lg:grid-cols-2 dark:border-white/10" onSubmit={() => setEditing(null)}>
                        <input type="hidden" name="intent" value="update" /><input type="hidden" name="id" value={m.id} />
                        <I18nInputs name="title" label={t("common.title")} values={m.title_i18n as Record<string, string>} required />
                        <I18nInputs name="description" label={t("common.description")} values={m.description_i18n as Record<string, string>} multiline />
                        <Field label={t("modules.position")} htmlFor={`p-${m.id}`}><Input id={`p-${m.id}`} name="position" type="number" min={1} defaultValue={m.position} /></Field>
                        <Field label={t("common.status")} htmlFor={`s-${m.id}`}><Select id={`s-${m.id}`} name="status" defaultValue={m.status}>
                          {(["draft", "published", "archived"] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Field>
                        <div className="flex gap-2"><Button type="submit">{t("common.save")}</Button><Button type="button" variant="ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</Button></div>
                      </Form>
                    )}
                    <ul className="divide-y divide-slate-100 dark:divide-white/5">
                      {m.lessons.map((l) => (
                        <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                          {l.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <BookOpen className="h-5 w-5 text-brand-500" />}
                          <Link to={`/app/lessons/${l.id}`} className="flex-1 text-sm font-medium hover:text-brand-600">
                            {t("lessons.session_n", { n: l.number })}: {l.title || t("lessons.untitled")}
                          </Link>
                          <span className="hidden text-xs text-slate-500 sm:inline">{fmtDate(l.scheduled_date, locale)}</span>
                          {isTeacher && <><StatusBadge status={l.status} /><Link to={`/app/lessons/${l.id}/edit`} className="p-1 text-slate-500 hover:text-brand-600" aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Link></>}
                        </li>
                      ))}
                      {m.assessments.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 bg-slate-50/60 px-5 py-3 dark:bg-white/5">
                          <NotebookPen className="h-5 w-5 text-amber-500" />
                          <Link to={`/app/assessments/${a.id}`} className="flex-1 text-sm font-medium hover:text-brand-600">{t("assessments.module_assessment")}: {a.title}</Link>
                          {isTeacher && <StatusBadge status={a.status} />}
                        </li>
                      ))}
                      {m.lessons.length === 0 && m.assessments.length === 0 && <li className="px-5 py-4 text-sm text-slate-500">{t("lessons.empty")}</li>}
                    </ul>
                    {isTeacher && (
                      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3 dark:border-white/10">
                        <Form method="post"><input type="hidden" name="intent" value="add-lesson" /><input type="hidden" name="id" value={m.id} />
                          <Button size="sm"><Plus className="h-4 w-4" />{t("lessons.new")}</Button></Form>
                        <Link to={`/app/assessments?new=1&module=${m.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-medium hover:bg-slate-50 dark:border-white/15 dark:hover:bg-white/5"><NotebookPen className="h-4 w-4" />{t("assessments.create")}</Link>
                        <Button size="sm" variant="outline" onClick={() => setEditing(editing === m.id ? null : m.id)}><Pencil className="h-4 w-4" />{t("common.edit")}</Button>
                        <fetcher.Form method="post" onSubmit={(e) => { if (!confirm(t("common.are_you_sure"))) e.preventDefault(); }}>
                          <input type="hidden" name="intent" value="delete" /><input type="hidden" name="id" value={m.id} />
                          <Button size="sm" variant="ghost" className="text-red-600"><Trash2 className="h-4 w-4" />{t("common.archive")}</Button>
                        </fetcher.Form>
                      </div>
                    )}
                  </div>
                </details>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
