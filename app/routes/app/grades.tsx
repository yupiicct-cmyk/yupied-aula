import { useState } from "react";
import { Form, useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import { Award, Download, FileSpreadsheet, Plus } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/grades";
import { requireUser } from "~/services/auth.server";
import { courseStudents, requireCourse } from "~/services/courses.server";
import { detectLocale, pick } from "~/services/i18n";
import { activityTitles } from "~/services/content.server";
import { failCode } from "~/services/forms.server";
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, StatCard, Table, Td, Th } from "~/components/ui";
import { fmtDate, fmtNumber, fullName } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, toAppError } from "~/utils/errors";
import { downloadCsv, downloadXlsx } from "~/utils/export";
import { cn } from "~/utils/cn";

type Item = { key: string; kind: "activity" | "assessment" | "manual"; id: string | null; title: string; max: number; weight: number };

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const locale = detectLocale(request, user.profile.locale);
  const { course } = await requireCourse(request, supabase);
  const { data: scale } = await supabase.from("grade_scales").select("*").eq("id", course.grade_scale_id ?? "").maybeSingle();
  const { data: grades } = await supabase.from("grades").select("*").eq("course_id", course.id).order("created_at");

  if (!user.isTeacher) {
    const rows = grades ?? [];
    const wsum = rows.reduce((s, g) => s + Number(g.weight), 0);
    const avg = wsum ? rows.reduce((s, g) => s + Number(g.grade ?? 0) * Number(g.weight), 0) / wsum : null;
    return { role: "student" as const, rows, avg, scale };
  }

  const [students, acts, assess] = await Promise.all([
    courseStudents(supabase, course.id),
    supabase.from("activities").select("id,max_score,weight,due_at").eq("course_id", course.id).is("deleted_at", null).neq("status", "draft").order("due_at", { nullsFirst: false }),
    supabase.from("assessments").select("id,title_i18n,weight,opens_at").eq("course_id", course.id).is("deleted_at", null).neq("status", "draft").order("opens_at", { nullsFirst: false }),
  ]);
  const at = await activityTitles(supabase, (acts.data ?? []).map((a) => a.id), locale);
  const { data: aqs } = (assess.data ?? []).length ? await supabase.from("assessment_questions").select("assessment_id,points").in("assessment_id", (assess.data ?? []).map((a) => a.id)) : { data: [] };
  const items: Item[] = [
    ...(acts.data ?? []).map((a) => ({ key: `a:${a.id}`, kind: "activity" as const, id: a.id, title: at.get(a.id) || "—", max: Number(a.max_score), weight: Number(a.weight) })),
    ...(assess.data ?? []).map((a) => ({ key: `e:${a.id}`, kind: "assessment" as const, id: a.id, title: pick(a.title_i18n, locale) || "—",
      max: (aqs ?? []).filter((q) => q.assessment_id === a.id).reduce((s, q) => s + Number(q.points), 0) || 1, weight: Number(a.weight) })),
  ];
  for (const g of grades ?? []) {
    if (!g.activity_id && !g.assessment_id && !items.some((i) => i.kind === "manual" && i.title === g.title)) {
      items.push({ key: `m:${g.title}`, kind: "manual", id: null, title: g.title, max: Number(g.max_score), weight: Number(g.weight) });
    }
  }
  const cell = (studentId: string, it: Item) => (grades ?? []).find((g) => g.student_id === studentId &&
    (it.kind === "activity" ? g.activity_id === it.id : it.kind === "assessment" ? g.assessment_id === it.id : !g.activity_id && !g.assessment_id && g.title === it.title)) ?? null;
  const matrix = students.map((s) => {
    const cells = items.map((it) => cell(s.id, it));
    const filled = cells.filter(Boolean) as NonNullable<ReturnType<typeof cell>>[];
    const wsum = filled.reduce((x, g) => x + Number(g.weight), 0);
    return { student: s, cells: cells.map((g) => (g ? { id: g.id, score: Number(g.score), grade: g.grade === null ? null : Number(g.grade), observation: g.observation } : null)),
      avg: wsum ? filled.reduce((x, g) => x + Number(g.grade ?? 0) * Number(g.weight), 0) / wsum : null };
  });
  return { role: "teacher" as const, course: { id: course.id, name: course.name }, items, matrix, scale };
}

const setSchema = z.object({
  student: z.string().uuid(), kind: z.enum(["activity", "assessment", "manual"]), item: z.string().optional().default(""),
  title: z.string().trim().max(200), max: z.coerce.number().positive(), weight: z.coerce.number().min(0).default(1),
  score: z.string().trim(), observation: z.string().trim().max(2000).optional().default(""),
});

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const { course } = await requireCourse(request, supabase);
  const fd = await request.formData();
  try {
    if (fd.get("intent") === "column") {
      const title = z.string().trim().min(1).max(200).parse(fd.get("title"));
      const max = z.coerce.number().positive().max(1000).parse(fd.get("max"));
      const weight = z.coerce.number().min(0).max(100).parse(fd.get("weight") ?? 1);
      const students = await courseStudents(supabase, course.id);
      if (students.length === 0) return failCode("no_students");
      // La columna existe cuando tiene al menos una nota; se crea con 0 para quien no la tenga (editable).
      const first = students[0]!;
      check(await supabase.from("grades").insert({ course_id: course.id, student_id: first.id, title, score: 0, max_score: max, weight, graded_by: user.id, observation: "" }));
      return { ok: true as const };
    }
    const p = setSchema.parse(Object.fromEntries(fd));
    let q = supabase.from("grades").select("id").eq("course_id", course.id).eq("student_id", p.student);
    q = p.kind === "activity" ? q.eq("activity_id", p.item) : p.kind === "assessment" ? q.eq("assessment_id", p.item) : q.is("activity_id", null).is("assessment_id", null).eq("title", p.title);
    const { data: existing } = await q.maybeSingle();
    if (p.score === "") {
      if (existing) check(await supabase.from("grades").delete().eq("id", existing.id));
      return { ok: true as const };
    }
    const score = Number(p.score.replace(",", "."));
    if (!Number.isFinite(score) || score < 0 || score > p.max) return failCode("score_out_of_range");
    if (existing) check(await supabase.from("grades").update({ score, max_score: p.max, observation: p.observation, graded_by: user.id }).eq("id", existing.id));
    else check(await supabase.from("grades").insert({
      course_id: course.id, student_id: p.student, title: p.title, score, max_score: p.max, weight: p.weight, observation: p.observation, graded_by: user.id,
      activity_id: p.kind === "activity" ? p.item : null, assessment_id: p.kind === "assessment" ? p.item : null,
    }));
    return { ok: true as const };
  } catch (e) {
    return failCode(e instanceof z.ZodError ? "invalid_data" : toAppError(e).code);
  }
}

export default function Grades({ loaderData }: Route.ComponentProps) {
  return loaderData.role === "teacher" ? <Gradebook data={loaderData} /> : <MyGrades data={loaderData} />;
}

function MyGrades({ data }: { data: Extract<Route.ComponentProps["loaderData"], { role: "student" }> }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const pass = Number(data.scale?.pass_grade ?? 4);
  return (
    <>
      <PageHeader title={t("nav.my_grades")} description={data.scale?.name} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("grades.average")} value={fmtNumber(data.avg, locale)} icon={<Award className="h-5 w-5" />} tone={data.avg !== null && data.avg >= pass ? "green" : "amber"} />
        <StatCard label={t("grades.count")} value={data.rows.length} tone="navy" />
      </div>
      <Card>
        {data.rows.length === 0 ? <EmptyState title={t("grades.none")} /> : (
          <Table><thead><tr><Th>{t("common.title")}</Th><Th>{t("grades.score")}</Th><Th>{t("grades.grade")}</Th><Th>{t("grades.observation")}</Th><Th>{t("common.date")}</Th></tr></thead>
            <tbody>{data.rows.map((g) => (
              <tr key={g.id}><Td className="font-medium">{g.title || "—"}</Td><Td>{fmtNumber(g.score, locale)} / {fmtNumber(g.max_score, locale)}</Td>
                <Td><span className={cn("font-bold", Number(g.grade) >= pass ? "text-emerald-600" : "text-red-600")}>{fmtNumber(g.grade, locale)}</span></Td>
                <Td className="text-slate-500">{g.observation}</Td><Td>{fmtDate(g.updated_at, locale)}</Td></tr>
            ))}</tbody></Table>
        )}
      </Card>
    </>
  );
}

function GradeCell({ studentId, item, cell }: { studentId: string; item: Item; cell: { score: number; grade: number | null; observation: string } | null }) {
  const fetcher = useFetcher<typeof action>();
  const { t } = useTranslation();
  const locale = useLocale();
  const err = fetcher.data && !fetcher.data.ok;
  return (
    <fetcher.Form method="post" className="flex items-center gap-1">
      <input type="hidden" name="student" value={studentId} /><input type="hidden" name="kind" value={item.kind} />
      <input type="hidden" name="item" value={item.id ?? ""} /><input type="hidden" name="title" value={item.title} />
      <input type="hidden" name="max" value={item.max} /><input type="hidden" name="weight" value={item.weight} />
      <input type="hidden" name="observation" value={cell?.observation ?? ""} />
      <input name="score" defaultValue={cell ? String(cell.score) : ""} inputMode="decimal" aria-label={`${t("grades.score")} ${item.title}`}
        className={cn("h-8 w-16 rounded border px-1 text-center text-sm dark:bg-navy-950", err ? "border-red-500" : "border-slate-200 dark:border-white/15")}
        onBlur={(e) => { if (e.currentTarget.value !== (cell ? String(cell.score) : "")) e.currentTarget.form?.requestSubmit(); }} />
      <span className={cn("w-8 text-xs font-bold", cell?.grade != null && cell.grade < 4 ? "text-red-600" : "text-emerald-600")}>{cell?.grade != null ? fmtNumber(cell.grade, locale) : ""}</span>
    </fetcher.Form>
  );
}

function Gradebook({ data }: { data: Extract<Route.ComponentProps["loaderData"], { role: "teacher" }> }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [adding, setAdding] = useState(false);
  const exportRows = () => [
    [t("students.name"), "Email", ...data.items.map((i) => `${i.title} (/${i.max})`), t("grades.average")],
    ...data.matrix.map((r) => [fullName(r.student), r.student.email, ...r.cells.map((c) => (c?.grade ?? "")), r.avg === null ? "" : r.avg.toFixed(1)]),
  ];
  const name = `calificaciones-${data.course.name}`;
  return (
    <>
      <PageHeader title={t("grades.gradebook")} description={`${data.course.name} · ${data.scale?.name ?? ""}`}
        actions={<>
          <Button variant="outline" onClick={() => setAdding((a) => !a)}><Plus className="h-4 w-4" />{t("grades.add_column")}</Button>
          <Button variant="outline" onClick={() => downloadCsv(exportRows(), name)}><Download className="h-4 w-4" />CSV</Button>
          <Button variant="outline" onClick={() => void downloadXlsx(exportRows(), name)}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
        </>} />
      <div className="mb-4"><Alert tone="blue">{t("grades.help", { exigency: Math.round(Number(data.scale?.exigency ?? 0.6) * 100) })}</Alert></div>
      {adding && (
        <Card className="mb-6 p-5">
          <Form method="post" className="flex flex-wrap items-end gap-3" onSubmit={() => setAdding(false)}>
            <input type="hidden" name="intent" value="column" />
            <Field label={t("common.title")} htmlFor="ct"><Input id="ct" name="title" required /></Field>
            <Field label={t("grades.max_score")} htmlFor="cm"><Input id="cm" name="max" type="number" min={1} defaultValue={100} className="w-28" /></Field>
            <Field label={t("grades.weight")} htmlFor="cw"><Input id="cw" name="weight" type="number" min={0} step="0.5" defaultValue={1} className="w-24" /></Field>
            <Button>{t("common.create")}</Button>
          </Form>
        </Card>
      )}
      <Card>
        <CardHeader title={t("grades.matrix")} description={t("grades.matrix_hint")} />
        {data.matrix.length === 0 ? <EmptyState title={t("students.empty")} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><Th className="sticky left-0 z-10 bg-slate-50 dark:bg-navy-900">{t("students.name")}</Th>
                {data.items.map((i) => <Th key={i.key} className="min-w-28 text-center normal-case"><span className="block truncate" title={i.title}>{i.title}</span><span className="font-normal text-slate-400">/{i.max} · ×{i.weight}</span></Th>)}
                <Th className="text-center">{t("grades.average")}</Th></tr></thead>
              <tbody>{data.matrix.map((r) => (
                <tr key={r.student.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                  <Td className="sticky left-0 bg-white font-medium dark:bg-navy-900">{fullName(r.student)}</Td>
                  {data.items.map((it, i) => <Td key={it.key}><GradeCell studentId={r.student.id} item={it} cell={r.cells[i] ?? null} /></Td>)}
                  <Td className="text-center"><span className={cn("font-bold", r.avg !== null && r.avg < Number(data.scale?.pass_grade ?? 4) ? "text-red-600" : "text-navy-900 dark:text-white")}>{fmtNumber(r.avg, locale)}</span></Td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
