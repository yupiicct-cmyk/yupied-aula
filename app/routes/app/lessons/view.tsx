import { useState } from "react";
import { Form, Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ClipboardList, Clock, ExternalLink, FileText, Pencil } from "lucide-react";
import type { Route } from "./+types/view";
import { requireUser } from "~/services/auth.server";
import { detectLocale, isLocale, LOCALE_LABELS, pick, type Locale } from "~/services/i18n";
import { activityTitles, pickTranslation } from "~/services/content.server";
import { LESSON_TEXT_FIELDS } from "~/schemas/content";
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, EmptyState, PageHeader } from "~/components/ui";
import { RichView } from "~/components/rich-text";
import { FileViewer } from "~/components/file-viewer";
import { StatusBadge } from "~/components/status-badge";
import { fmtDate } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, must } from "~/utils/errors";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const userLocale = detectLocale(request, user.profile.locale);
  const lang = new URL(request.url).searchParams.get("lang");
  const lesson = must(await supabase.from("lessons").select("*").eq("id", params.id).maybeSingle()); // RLS: solo si es visible
  const [trs, mod, lm, acts, prog] = await Promise.all([
    supabase.from("lesson_translations").select("*").eq("lesson_id", lesson.id),
    supabase.from("modules").select("title_i18n,position").eq("id", lesson.module_id).maybeSingle(),
    supabase.from("lesson_materials").select("material_id,position").eq("lesson_id", lesson.id).order("position"),
    supabase.from("activities").select("id,due_at,type").eq("lesson_id", lesson.id).is("deleted_at", null),
    user.isStudent ? supabase.from("lesson_progress").select("completed_at").eq("lesson_id", lesson.id).eq("student_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const available = (trs.data ?? []).filter((r) => user.isTeacher || r.status === "approved");
  const chosen = isLocale(lang) ? available.find((r) => r.locale === lang) : undefined;
  const tr = chosen ?? pickTranslation(available, userLocale, lesson.original_locale);
  const matIds = (lm.data ?? []).map((m) => m.material_id);
  const { data: mats } = matIds.length ? await supabase.from("materials").select("id,title,mime_type").in("id", matIds) : { data: [] };
  const aTitles = await activityTitles(supabase, (acts.data ?? []).map((a) => a.id), userLocale);
  if (user.isStudent && !user.isTeacher) await supabase.rpc("track_lesson", { p_lesson: lesson.id, p_completed: false });
  return {
    isTeacher: user.isTeacher,
    isStudent: user.isStudent,
    lesson,
    tr: tr ?? null,
    languages: available.map((r) => r.locale as Locale),
    module: mod.data ? `${mod.data.position}. ${pick(mod.data.title_i18n, userLocale)}` : "",
    materials: matIds.map((id) => (mats ?? []).find((m) => m.id === id)).filter(Boolean) as { id: string; title: string; mime_type: string }[],
    activities: (acts.data ?? []).map((a) => ({ ...a, title: aTitles.get(a.id) ?? "" })),
    completed: Boolean(prog.data?.completed_at),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase } = await requireUser(request, context, { student: true });
  check(await supabase.rpc("track_lesson", { p_lesson: params.id, p_completed: true }));
  return { ok: true };
}

export default function LessonView({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [params] = useSearchParams();
  const [viewing, setViewing] = useState<{ id: string; mime: string; title: string } | null>(null);
  const { lesson, tr, materials, activities } = loaderData;
  const links = (tr?.links as string[] | null) ?? [];
  return (
    <>
      {params.get("preview") && <div className="mb-4"><Alert tone="blue">{t("lessons.preview_notice")}</Alert></div>}
      <PageHeader
        title={<>{t("lessons.session_n", { n: lesson.number })}: {tr?.title || t("lessons.untitled")}</>}
        description={<span className="flex flex-wrap items-center gap-3">{loaderData.module}
          {lesson.scheduled_date && <span>· {fmtDate(lesson.scheduled_date, locale)}</span>}
          {lesson.duration_minutes && <span className="inline-flex items-center gap-1">· <Clock className="h-3.5 w-3.5" />{t("lessons.minutes", { n: lesson.duration_minutes })}</span>}
          {loaderData.isTeacher && <StatusBadge status={lesson.status} />}</span>}
        actions={<>
          {loaderData.languages.length > 1 && loaderData.languages.map((l) => (
            <Link key={l} to={`?lang=${l}`} className={`rounded-md px-2 py-1 text-xs font-semibold uppercase ${tr?.locale === l ? "bg-brand-500 text-white" : "bg-slate-100 dark:bg-white/10"}`} title={LOCALE_LABELS[l]}>{l}</Link>
          ))}
          {loaderData.isTeacher && <ButtonLink to={`/app/lessons/${lesson.id}/edit`} variant="outline"><Pencil className="h-4 w-4" />{t("common.edit")}</ButtonLink>}
        </>} />
      {tr && tr.locale !== locale && <div className="mb-4"><Alert tone="amber">{t("translation.not_available", { lang: LOCALE_LABELS[tr.locale as Locale] })}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="p-6">
          {!tr ? <EmptyState title={t("lessons.no_content")} /> : (
            <div className="space-y-6">
              {LESSON_TEXT_FIELDS.filter((f) => tr[f]).map((f) => (
                <section key={f}>
                  <h2 className="mb-2 border-b border-slate-100 pb-1 text-sm font-semibold uppercase tracking-wide text-brand-600 dark:border-white/10">{t(`lessons.fields.${f}`)}</h2>
                  <RichView html={tr[f]} />
                </section>
              ))}
              {links.length > 0 && (
                <section><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-600">{t("lessons.links")}</h2>
                  <ul className="space-y-1">{links.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ExternalLink className="h-3.5 w-3.5" />{l}</a></li>)}</ul>
                </section>
              )}
            </div>
          )}
        </Card>
        <div className="space-y-6">
          {loaderData.isStudent && !loaderData.isTeacher && (
            <Card className="p-5">
              {loaderData.completed ? <p className="flex items-center gap-2 font-medium text-emerald-600"><CheckCircle2 className="h-5 w-5" />{t("lessons.completed")}</p> : (
                <Form method="post"><Button className="w-full"><CheckCircle2 className="h-4 w-4" />{t("lessons.mark_completed")}</Button></Form>
              )}
            </Card>
          )}
          <Card>
            <CardHeader title={t("lessons.materials")} />
            {materials.length === 0 ? <EmptyState title={t("library.empty")} /> : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">{materials.map((m) => (
                <li key={m.id}><button className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => setViewing({ id: m.id, mime: m.mime_type, title: m.title })}>
                  <FileText className="h-4 w-4 text-brand-500" /><span className="truncate">{m.title}</span></button></li>
              ))}</ul>
            )}
          </Card>
          <Card>
            <CardHeader title={t("nav.activities")} />
            {activities.length === 0 ? <EmptyState title={t("activities.none")} /> : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">{activities.map((a) => (
                <li key={a.id}><Link to={`/app/activities/${a.id}`} className="flex items-center gap-2 px-5 py-3 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
                  <ClipboardList className="h-4 w-4 text-brand-500" /><span className="flex-1 truncate">{a.title || t("activities.untitled")}</span>
                  {a.due_at && <Badge tone="amber">{fmtDate(a.due_at, locale)}</Badge>}</Link></li>
              ))}</ul>
            )}
          </Card>
        </div>
      </div>
      {viewing && <FileViewer {...viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
