import { Form, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, Printer } from "lucide-react";
import type { Route } from "./+types/reports";
import { requireUser } from "~/services/auth.server";
import { courseStudents, requireCourse } from "~/services/courses.server";
import { detectLocale, pick } from "~/services/i18n";
import { activityTitles, lessonTitles } from "~/services/content.server";
import { loadStudent360 } from "~/services/student360.server";
import { Button, Card, Field, PageHeader, Select, Table, Td, Th } from "~/components/ui";
import { downloadXlsx } from "~/utils/export";
import { fmtDate, fullName } from "~/utils/format";

const TYPES = ["course", "student", "attendance", "grades", "activities", "progress", "modules"] as const;
type Cell = string | number | null;
type Section = { heading: string; columns: string[]; rows: Cell[][] };
const r1 = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10);

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const locale = detectLocale(request, user.profile.locale);
  const { course } = await requireCourse(request, supabase);
  const url = new URL(request.url);
  const type = (TYPES as readonly string[]).includes(url.searchParams.get("type") ?? "") ? (url.searchParams.get("type") as (typeof TYPES)[number]) : "course";
  const studentId = url.searchParams.get("student");
  const students = await courseStudents(supabase, course.id);
  const base = { type, students: students.map((s) => ({ id: s.id, name: fullName(s) })), course: course.name, generated: new Date().toISOString(), studentId };
  // Las claves de encabezado se traducen en el cliente (reports.cols.*)
  const sections: Section[] = [];

  const [progress, grades, sessions, acts] = await Promise.all([
    supabase.from("student_progress").select("*").eq("course_id", course.id),
    supabase.from("grades").select("*").eq("course_id", course.id),
    supabase.from("attendance_sessions").select("id,session_date,lesson_id").eq("course_id", course.id).order("session_date"),
    supabase.from("activities").select("id,type,due_at,max_score,module_id,status").eq("course_id", course.id).is("deleted_at", null).neq("status", "draft"),
  ]);
  const sIds = (sessions.data ?? []).map((s) => s.id);
  const { data: att } = sIds.length ? await supabase.from("attendance_records").select("session_id,student_id,status").in("session_id", sIds) : { data: [] };
  const pBy = new Map((progress.data ?? []).map((p) => [p.student_id, p]));
  const attFor = (sid: string) => {
    const r = (att ?? []).filter((a) => a.student_id === sid);
    const c = (st: string) => r.filter((a) => a.status === st).length;
    return { total: r.length, present: c("present"), absent: c("absent"), late: c("late"), excused: c("excused"), pct: r.length ? (100 * (c("present") + c("late") + c("excused"))) / r.length : null };
  };

  if (type === "course" || type === "progress") {
    sections.push({ heading: "reports.sections.summary", columns: ["student", "lessons", "activities", "average", "attendance", "downloads"],
      rows: students.map((s) => { const p = pBy.get(s.id); return [fullName(s), `${p?.lessons_completed ?? 0}/${p?.lessons_total ?? 0}`, `${p?.activities_done ?? 0}/${p?.activities_total ?? 0}`, r1(p?.grade_avg), r1(p?.attendance_pct), p?.downloads ?? 0]; }) });
  }
  if (type === "course" || type === "attendance") {
    sections.push({ heading: "reports.sections.attendance", columns: ["student", "sessions", "present", "absent", "late", "excused", "percentage"],
      rows: students.map((s) => { const a = attFor(s.id); return [fullName(s), a.total, a.present, a.absent, a.late, a.excused, r1(a.pct)]; }) });
  }
  if (type === "attendance") {
    const lt = await lessonTitles(supabase, (sessions.data ?? []).map((s) => s.lesson_id).filter(Boolean) as string[], locale);
    sections.push({ heading: "reports.sections.by_session", columns: ["date", "lesson", "present", "absent", "late", "excused"],
      rows: (sessions.data ?? []).map((s) => { const r = (att ?? []).filter((a) => a.session_id === s.id); const c = (st: string) => r.filter((a) => a.status === st).length;
        return [fmtDate(s.session_date, locale), s.lesson_id ? lt.get(s.lesson_id) ?? "" : "", c("present"), c("absent"), c("late"), c("excused")]; }) });
  }
  if (type === "course" || type === "grades") {
    const titles = [...new Set((grades.data ?? []).map((g) => g.title))];
    sections.push({ heading: "reports.sections.grades", columns: ["student", ...titles.map((x) => `#${x}`), "average"],
      rows: students.map((s) => {
        const gs = (grades.data ?? []).filter((g) => g.student_id === s.id);
        const w = gs.reduce((a, g) => a + Number(g.weight), 0);
        return [fullName(s), ...titles.map((ti) => r1(gs.find((g) => g.title === ti)?.grade ?? null)), r1(w ? gs.reduce((a, g) => a + Number(g.grade ?? 0) * Number(g.weight), 0) / w : null)];
      }) });
  }
  if (type === "activities") {
    const ids = (acts.data ?? []).map((a) => a.id);
    const [at, subs] = await Promise.all([activityTitles(supabase, ids, locale), ids.length ? supabase.from("submissions").select("activity_id,status,score,is_late").in("activity_id", ids) : Promise.resolve({ data: [] })]);
    sections.push({ heading: "reports.sections.activities", columns: ["activity", "type", "due", "submitted", "late", "graded", "avg_score"],
      rows: (acts.data ?? []).map((a) => { const s = (subs.data ?? []).filter((x) => x.activity_id === a.id && x.status !== "draft"); const g = s.filter((x) => x.score !== null);
        return [at.get(a.id) ?? "", `@activities.types.${a.type}`, fmtDate(a.due_at, locale), `${s.length}/${students.length}`, s.filter((x) => x.is_late).length, g.length, r1(g.length ? g.reduce((x, y) => x + Number(y.score), 0) / g.length : null)]; }) });
  }
  if (type === "modules") {
    const [{ data: mods }, { data: lessons }, { data: lp }] = await Promise.all([
      supabase.from("modules").select("id,position,title_i18n").eq("course_id", course.id).is("deleted_at", null).order("position"),
      supabase.from("lessons").select("id,module_id").eq("course_id", course.id).is("deleted_at", null),
      supabase.from("lesson_progress").select("lesson_id,student_id,completed_at"),
    ]);
    const actGrades = (grades.data ?? []).filter((g) => g.activity_id);
    sections.push({ heading: "reports.sections.modules", columns: ["module", "lessons", "completion", "average"],
      rows: (mods ?? []).map((m) => {
        const ls = (lessons ?? []).filter((l) => l.module_id === m.id).map((l) => l.id);
        const done = (lp ?? []).filter((p) => ls.includes(p.lesson_id) && p.completed_at).length;
        const mActs = new Set((acts.data ?? []).filter((a) => a.module_id === m.id).map((a) => a.id));
        const gs = actGrades.filter((g) => mActs.has(g.activity_id!));
        return [`${m.position}. ${pick(m.title_i18n, locale)}`, ls.length, r1(ls.length && students.length ? (100 * done) / (ls.length * students.length) : null), r1(gs.length ? gs.reduce((a, g) => a + Number(g.grade ?? 0), 0) / gs.length : null)];
      }) });
  }
  let student = null;
  if (type === "student" && studentId) {
    const d = await loadStudent360(supabase, studentId, locale);
    const p = d.progress.find((x) => x.course_id === course.id);
    const a = attFor(studentId);
    student = { name: fullName(d.profile), email: d.profile.email, code: d.profile.internal_code };
    sections.push({ heading: "reports.sections.summary", columns: ["metric", "value"], rows: [
      ["@reports.cols.lessons", `${p?.lessons_completed ?? 0}/${p?.lessons_total ?? 0}`], ["@reports.cols.activities", `${p?.activities_done ?? 0}/${p?.activities_total ?? 0}`],
      ["@reports.cols.average", r1(p?.grade_avg)], ["@reports.cols.attendance", r1(a.pct)], ["@reports.cols.downloads", p?.downloads ?? 0]] });
    sections.push({ heading: "reports.sections.grades", columns: ["item", "score", "grade", "observation"], rows: d.grades.filter((g) => g.course_id === course.id).map((g) => [g.title, `${g.score}/${g.max_score}`, r1(g.grade), g.observation]) });
    sections.push({ heading: "reports.sections.attendance", columns: ["sessions", "present", "absent", "late", "excused", "percentage"], rows: [[a.total, a.present, a.absent, a.late, a.excused, r1(a.pct)]] });
    sections.push({ heading: "reports.sections.notes", columns: ["date", "observation"], rows: d.notes.map((n) => [fmtDate(n.created_at, locale), n.body]) });
  }
  return { ...base, sections, student };
}

export default function Reports({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const { sections, type } = loaderData;
  const col = (c: string) => (c.startsWith("#") ? c.slice(1) : t(`reports.cols.${c}`));
  const cell = (v: Cell) => (typeof v === "string" && v.startsWith("@") ? t(v.slice(1)) : v === null ? "—" : typeof v === "number" ? v.toLocaleString(i18n.language) : v);
  const excel = () => {
    const rows: Cell[][] = [];
    for (const s of sections) { rows.push([t(s.heading)]); rows.push(s.columns.map(col)); for (const r of s.rows) rows.push(r.map((v) => (typeof v === "string" && v.startsWith("@") ? t(v.slice(1)) : v))); rows.push([]); }
    void downloadXlsx(rows, `informe-${type}-${loaderData.course}`);
  };
  return (
    <>
      <PageHeader title={t("nav.reports")} actions={<>
        <Button variant="outline" onClick={excel}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" />{t("reports.pdf")}</Button>
      </>} />
      <Card className="no-print mb-6 p-5">
        <Form method="get" className="flex flex-wrap items-end gap-3">
          <Field label={t("reports.type")} htmlFor="type"><Select id="type" name="type" defaultValue={type}>{TYPES.map((x) => <option key={x} value={x}>{t(`reports.types.${x}`)}</option>)}</Select></Field>
          <Field label={t("students.name")} htmlFor="student"><Select id="student" name="student" defaultValue={params.get("student") ?? ""}><option value="">—</option>{loaderData.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Button type="submit" variant="secondary">{t("reports.generate")}</Button>
        </Form>
        <p className="mt-2 text-xs text-slate-500">{t("reports.pdf_hint")}</p>
      </Card>
      <div className="space-y-6">
        <div className="hidden print:block">
          <h1 className="text-2xl font-bold">{t(`reports.types.${type}`)} — {loaderData.course}</h1>
          {loaderData.student && <p>{loaderData.student.name} · {loaderData.student.email}</p>}
          <p className="text-sm">{t("reports.generated")}: {new Date(loaderData.generated).toLocaleString(i18n.language)}</p>
        </div>
        {loaderData.student && <Card className="p-5 print:hidden"><p className="text-lg font-semibold">{loaderData.student.name}</p><p className="text-sm text-slate-500">{loaderData.student.email}{loaderData.student.code && ` · ${loaderData.student.code}`}</p></Card>}
        {type === "student" && !loaderData.student && <Card className="p-5 text-sm text-slate-500">{t("reports.choose_student")}</Card>}
        {sections.map((s, i) => (
          <Card key={i}>
            <div className="border-b border-slate-100 px-5 py-3 font-semibold dark:border-white/10">{t(s.heading)}</div>
            <Table><thead><tr>{s.columns.map((c) => <Th key={c}>{col(c)}</Th>)}</tr></thead>
              <tbody>{s.rows.map((r, j) => <tr key={j}>{r.map((v, k) => <Td key={k}>{cell(v)}</Td>)}</tr>)}</tbody></Table>
          </Card>
        ))}
      </div>
    </>
  );
}
