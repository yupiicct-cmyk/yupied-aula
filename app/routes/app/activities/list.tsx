import { Form, Link, redirect } from "react-router";
import { useTranslation } from "react-i18next";
import { ClipboardList, Pencil, Plus, Users } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/list";
import { requireUser } from "~/services/auth.server";
import { requireCourse } from "~/services/courses.server";
import { detectLocale } from "~/services/i18n";
import { activityTitles } from "~/services/content.server";
import { failCode } from "~/services/forms.server";
import { Badge, Button, Card, EmptyState, PageHeader, Select, Table, Td, Th } from "~/components/ui";
import { StatusBadge } from "~/components/status-badge";
import { fmtDate, fmtNumber } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, must, toAppError } from "~/utils/errors";

const TYPES = ["multiple_choice", "true_false", "open_question", "fill_blanks", "matching", "ordering", "research", "practical", "file_upload", "group"] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const locale = detectLocale(request, user.profile.locale);
  const { course } = await requireCourse(request, supabase);
  const { data: acts } = await supabase.from("activities").select("id,type,status,publish_at,due_at,max_score,lesson_id").eq("course_id", course.id).is("deleted_at", null).order("due_at", { nullsFirst: false });
  const ids = (acts ?? []).map((a) => a.id);
  const [titles, subs] = await Promise.all([
    activityTitles(supabase, ids, locale),
    ids.length ? supabase.from("submissions").select("activity_id,status,score,student_id").in("activity_id", ids) : Promise.resolve({ data: [] }),
  ]);
  return {
    isTeacher: user.isTeacher,
    activities: (acts ?? []).map((a) => {
      const s = (subs.data ?? []).filter((x) => x.activity_id === a.id);
      const mine = s.find((x) => x.student_id === user.id);
      return { ...a, title: titles.get(a.id) ?? "", submitted: s.filter((x) => x.status !== "draft").length, toReview: s.filter((x) => x.status === "submitted").length,
        myStatus: mine?.status ?? null, myScore: mine?.score ?? null };
    }),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const { course } = await requireCourse(request, supabase);
  try {
    const type = z.enum(TYPES).parse((await request.formData()).get("type"));
    const a = must(await supabase.from("activities").insert({ course_id: course.id, type, created_by: user.id }).select("id").single());
    check(await supabase.from("activity_translations").insert({ activity_id: a.id, locale: "es", title: "", updated_by: user.id }));
    throw redirect(`/app/activities/${a.id}/edit`);
  } catch (e) {
    if (e instanceof Response) throw e;
    return failCode(toAppError(e).code);
  }
}

export default function Activities({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { isTeacher, activities } = loaderData;
  return (
    <>
      <PageHeader title={isTeacher ? t("nav.activities") : t("nav.my_activities")}
        actions={isTeacher && (
          <Form method="post" className="flex gap-2">
            <Select name="type" aria-label={t("activities.type")} className="w-56">{TYPES.map((ty) => <option key={ty} value={ty}>{t(`activities.types.${ty}`)}</option>)}</Select>
            <Button><Plus className="h-4 w-4" />{t("activities.create")}</Button>
          </Form>
        )} />
      <Card>
        {activities.length === 0 ? <EmptyState icon={<ClipboardList />} title={t("activities.none")} /> : (
          <Table>
            <thead><tr><Th>{t("common.title")}</Th><Th>{t("activities.type")}</Th><Th>{t("activities.due_date")}</Th><Th>{t("common.status")}</Th><Th>{isTeacher ? t("activities.submissions") : t("grades.score")}</Th>{isTeacher && <Th />}</tr></thead>
            <tbody>{activities.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                <Td><Link to={`/app/activities/${a.id}`} className="font-medium hover:text-brand-600">{a.title || t("activities.untitled")}</Link></Td>
                <Td><Badge>{t(`activities.types.${a.type}`)}</Badge></Td>
                <Td className={a.due_at && Date.parse(a.due_at) < Date.now() ? "text-red-600" : ""}>{fmtDate(a.due_at, locale, true)}</Td>
                <Td>{isTeacher ? <StatusBadge status={a.status} /> : <StatusBadge status={a.myStatus ?? "pending"} />}</Td>
                <Td>{isTeacher ? (
                  <Link to={`/app/activities/${a.id}/submissions`} className="inline-flex items-center gap-1 text-sm hover:text-brand-600"><Users className="h-4 w-4" />{a.submitted}{a.toReview > 0 && <Badge tone="amber">{t("activities.to_review", { n: a.toReview })}</Badge>}</Link>
                ) : a.myScore !== null ? `${fmtNumber(a.myScore, locale)} / ${fmtNumber(a.max_score, locale)}` : "—"}</Td>
                {isTeacher && <Td><Link to={`/app/activities/${a.id}/edit`} className="text-slate-500 hover:text-brand-600" aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Link></Td>}
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
