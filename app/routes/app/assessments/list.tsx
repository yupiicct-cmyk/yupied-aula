import { useState } from "react";
import { Form, Link, redirect, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { NotebookPen, Pencil, Plus, BarChart3 } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/list";
import { requireUser } from "~/services/auth.server";
import { requireCourse } from "~/services/courses.server";
import { detectLocale, pick } from "~/services/i18n";
import { failCode } from "~/services/forms.server";
import { i18nFromForm } from "~/schemas/content";
import { Button, Card, EmptyState, Field, PageHeader, Select, Table, Td, Th } from "~/components/ui";
import { I18nInputs } from "~/components/i18n-inputs";
import { StatusBadge } from "~/components/status-badge";
import { fmtDate, fmtNumber } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { must, toAppError } from "~/utils/errors";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const locale = detectLocale(request, user.profile.locale);
  const { course } = await requireCourse(request, supabase);
  const [as, modules, attempts] = await Promise.all([
    supabase.from("assessments").select("id,title_i18n,status,opens_at,closes_at,module_id,max_attempts,time_limit_minutes").eq("course_id", course.id).is("deleted_at", null).order("opens_at", { nullsFirst: false }),
    supabase.from("modules").select("id,position,title_i18n").eq("course_id", course.id).is("deleted_at", null).order("position"),
    supabase.from("assessment_attempts").select("assessment_id,student_id,status,score,max_score"),
  ]);
  return {
    isTeacher: user.isTeacher,
    modules: (modules.data ?? []).map((m) => ({ id: m.id, label: `${m.position}. ${pick(m.title_i18n, locale)}` })),
    items: (as.data ?? []).map((a) => {
      const at = (attempts.data ?? []).filter((x) => x.assessment_id === a.id);
      const mine = at.filter((x) => x.student_id === user.id && x.score !== null);
      const best = mine.length ? Math.max(...mine.map((x) => Number(x.score))) : null;
      return { ...a, title: pick(a.title_i18n, locale), attempts: new Set(at.map((x) => x.student_id)).size, pendingReview: at.filter((x) => x.status === "submitted").length,
        myBest: best, myMax: mine[0]?.max_score ?? null, myCount: at.filter((x) => x.student_id === user.id).length };
    }),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const { course } = await requireCourse(request, supabase);
  const fd = await request.formData();
  try {
    const title = i18nFromForm(fd, "title", 200);
    if (!title.es && !title.fr && !title.ht) return failCode("title_required");
    const module_id = z.string().uuid().or(z.literal("")).parse(fd.get("module_id") ?? "") || null;
    const a = must(await supabase.from("assessments").insert({ course_id: course.id, module_id, title_i18n: title, created_by: user.id }).select("id").single());
    throw redirect(`/app/assessments/${a.id}/edit`);
  } catch (e) {
    if (e instanceof Response) throw e;
    return failCode(toAppError(e).code);
  }
}

export default function Assessments({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [params] = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  const { isTeacher, items } = loaderData;
  return (
    <>
      <PageHeader title={isTeacher ? t("nav.assessments") : t("nav.my_assessments")}
        actions={isTeacher && <Button onClick={() => setOpen((o) => !o)}><Plus className="h-4 w-4" />{t("assessments.create")}</Button>} />
      {open && isTeacher && (
        <Card className="mb-6 p-5">
          <Form method="post" className="grid gap-4 lg:grid-cols-2">
            <I18nInputs name="title" label={t("common.title")} required />
            <div className="space-y-4">
              <Field label={t("nav.modules")} htmlFor="module_id"><Select id="module_id" name="module_id" defaultValue={params.get("module") ?? ""}><option value="">—</option>{loaderData.modules.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
              <Button type="submit">{t("common.create")}</Button>
            </div>
          </Form>
        </Card>
      )}
      <Card>
        {items.length === 0 ? <EmptyState icon={<NotebookPen />} title={t("assessments.none")} /> : (
          <Table>
            <thead><tr><Th>{t("common.title")}</Th><Th>{t("assessments.opens")}</Th><Th>{t("assessments.closes")}</Th><Th>{isTeacher ? t("common.status") : t("assessments.attempts")}</Th><Th>{isTeacher ? t("assessments.participants") : t("grades.score")}</Th>{isTeacher && <Th />}</tr></thead>
            <tbody>{items.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                <Td><Link to={`/app/assessments/${a.id}`} className="font-medium hover:text-brand-600">{a.title || t("assessments.untitled")}</Link></Td>
                <Td>{fmtDate(a.opens_at, locale, true)}</Td>
                <Td>{fmtDate(a.closes_at, locale, true)}</Td>
                <Td>{isTeacher ? <StatusBadge status={a.status} /> : `${a.myCount} / ${a.max_attempts}`}</Td>
                <Td>{isTeacher ? <>{a.attempts}{a.pendingReview > 0 && <span className="ml-2 text-xs text-amber-600">({t("activities.to_review", { n: a.pendingReview })})</span>}</> : a.myBest !== null ? `${fmtNumber(a.myBest, locale)} / ${fmtNumber(a.myMax, locale)}` : "—"}</Td>
                {isTeacher && <Td><div className="flex gap-2"><Link to={`/app/assessments/${a.id}/edit`} aria-label={t("common.edit")} className="text-slate-500 hover:text-brand-600"><Pencil className="h-4 w-4" /></Link>
                  <Link to={`/app/assessments/${a.id}/results`} aria-label={t("assessments.results")} className="text-slate-500 hover:text-brand-600"><BarChart3 className="h-4 w-4" /></Link></div></Td>}
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
