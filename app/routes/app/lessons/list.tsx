import { Form, Link, redirect, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { BookOpen, Pencil, Plus } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/list";
import { requireUser } from "~/services/auth.server";
import { requireCourse } from "~/services/courses.server";
import { detectLocale, pick } from "~/services/i18n";
import { lessonTitles } from "~/services/content.server";
import { failCode } from "~/services/forms.server";
import { Button, Card, EmptyState, PageHeader, Select, Table, Td, Th } from "~/components/ui";
import { StatusBadge } from "~/components/status-badge";
import { fmtDate } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, must, toAppError } from "~/utils/errors";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const locale = detectLocale(request, user.profile.locale);
  const { course } = await requireCourse(request, supabase);
  const status = new URL(request.url).searchParams.get("status");
  let q = supabase.from("lessons").select("id,module_id,number,status,scheduled_date,publish_at").eq("course_id", course.id).is("deleted_at", null);
  if (status && ["draft", "scheduled", "published", "archived"].includes(status)) q = q.eq("status", status as "draft");
  else if (!user.isTeacher || !status) q = q.neq("status", "archived");
  const [lessons, modules] = await Promise.all([q.order("scheduled_date", { nullsFirst: false }).order("number"),
    supabase.from("modules").select("id,position,title_i18n").eq("course_id", course.id).is("deleted_at", null).order("position")]);
  const titles = await lessonTitles(supabase, (lessons.data ?? []).map((l) => l.id), locale);
  const modMap = new Map((modules.data ?? []).map((m) => [m.id, `${m.position}. ${pick(m.title_i18n, locale)}`]));
  return {
    isTeacher: user.isTeacher,
    lessons: (lessons.data ?? []).map((l) => ({ ...l, title: titles.get(l.id) ?? "", module: modMap.get(l.module_id) ?? "" })),
    modules: (modules.data ?? []).map((m) => ({ id: m.id, label: modMap.get(m.id)! })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const { course } = await requireCourse(request, supabase);
  try {
    const moduleId = z.string().uuid().parse((await request.formData()).get("module"));
    const { count } = await supabase.from("lessons").select("id", { count: "exact", head: true }).eq("module_id", moduleId);
    const lesson = must(await supabase.from("lessons").insert({ course_id: course.id, module_id: moduleId, number: (count ?? 0) + 1, created_by: user.id }).select("id").single());
    check(await supabase.from("lesson_translations").insert({ lesson_id: lesson.id, locale: "es", title: "", updated_by: user.id }));
    throw redirect(`/app/lessons/${lesson.id}/edit`);
  } catch (e) {
    if (e instanceof Response) throw e;
    return failCode(toAppError(e).code);
  }
}

export default function Lessons({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [params, setParams] = useSearchParams();
  return (
    <>
      <PageHeader title={loaderData.isTeacher ? t("nav.lessons") : t("nav.my_classes")}
        actions={loaderData.isTeacher && loaderData.modules.length > 0 && (
          <Form method="post" className="flex gap-2">
            <Select name="module" aria-label={t("nav.modules")} className="w-56">{loaderData.modules.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>
            <Button><Plus className="h-4 w-4" />{t("lessons.new")}</Button>
          </Form>
        )} />
      {loaderData.isTeacher && (
        <div className="mb-4 flex gap-2">
          {["", "draft", "scheduled", "published", "archived"].map((s) => (
            <button key={s} onClick={() => setParams(s ? { status: s } : {})} className={`rounded-full px-3 py-1 text-xs font-medium ${(params.get("status") ?? "") === s ? "bg-navy-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10"}`}>
              {s ? t(`status.${s}`) : t("common.all")}
            </button>
          ))}
        </div>
      )}
      <Card>
        {loaderData.lessons.length === 0 ? <EmptyState icon={<BookOpen />} title={t("lessons.empty")} description={loaderData.isTeacher && loaderData.modules.length === 0 ? t("lessons.create_module_first") : undefined} /> : (
          <Table>
            <thead><tr><Th>#</Th><Th>{t("common.title")}</Th><Th>{t("nav.modules")}</Th><Th>{t("lessons.date")}</Th>{loaderData.isTeacher && <><Th>{t("common.status")}</Th><Th /></>}</tr></thead>
            <tbody>{loaderData.lessons.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                <Td>{l.number}</Td>
                <Td><Link to={`/app/lessons/${l.id}`} className="font-medium hover:text-brand-600">{l.title || t("lessons.untitled")}</Link></Td>
                <Td className="text-slate-500">{l.module}</Td>
                <Td>{fmtDate(l.scheduled_date, locale)}</Td>
                {loaderData.isTeacher && <><Td><StatusBadge status={l.status} /></Td><Td><Link to={`/app/lessons/${l.id}/edit`} className="text-slate-500 hover:text-brand-600" aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Link></Td></>}
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
