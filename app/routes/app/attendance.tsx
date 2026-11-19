import { Form, Link, useActionData, useNavigation, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CalendarPlus, ClipboardCheck, Save } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/attendance";
import { requireUser } from "~/services/auth.server";
import { courseStudents, requireCourse } from "~/services/courses.server";
import { detectLocale } from "~/services/i18n";
import { lessonTitles } from "~/services/content.server";
import { failCode } from "~/services/forms.server";
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, StatCard, Table, Td, Th } from "~/components/ui";
import { StatusBadge } from "~/components/status-badge";
import { fmtDate, fmtNumber, fullName } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, must, toAppError } from "~/utils/errors";
import { cn } from "~/utils/cn";

const STATUSES = ["present", "absent", "late", "excused"] as const;
type St = (typeof STATUSES)[number];

function summarize(records: { student_id: string; status: St }[], studentId?: string) {
  const r = studentId ? records.filter((x) => x.student_id === studentId) : records;
  const c = { total: r.length, present: 0, absent: 0, late: 0, excused: 0 } as Record<"total" | St, number>;
  for (const x of r) c[x.status]++;
  return { ...c, pct: c.total ? (100 * (c.present + c.late + c.excused)) / c.total : null };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const locale = detectLocale(request, user.profile.locale);
  const { course } = await requireCourse(request, supabase);
  const { data: sessions } = await supabase.from("attendance_sessions").select("id,session_date,lesson_id,notes").eq("course_id", course.id).order("session_date", { ascending: false });
  const ids = (sessions ?? []).map((s) => s.id);
  const { data: records } = ids.length ? await supabase.from("attendance_records").select("session_id,student_id,status,note").in("session_id", ids) : { data: [] };
  const lt = await lessonTitles(supabase, (sessions ?? []).map((s) => s.lesson_id).filter(Boolean) as string[], locale);
  const sess = (sessions ?? []).map((s) => ({ ...s, lesson: s.lesson_id ? lt.get(s.lesson_id) ?? "" : "" }));

  if (!user.isTeacher) {
    const mine = (records ?? []).filter((r) => r.student_id === user.id) as { session_id: string; student_id: string; status: St; note: string }[];
    return { role: "student" as const, summary: summarize(mine), rows: mine.map((r) => ({ ...r, session: sess.find((s) => s.id === r.session_id) })) };
  }
  const [students, lessons] = await Promise.all([
    courseStudents(supabase, course.id),
    supabase.from("lessons").select("id,number,scheduled_date").eq("course_id", course.id).is("deleted_at", null).order("number"),
  ]);
  const lt2 = await lessonTitles(supabase, (lessons.data ?? []).map((l) => l.id), locale);
  const selected = new URL(request.url).searchParams.get("session") ?? sess[0]?.id ?? null;
  const recs = (records ?? []) as { session_id: string; student_id: string; status: St; note: string }[];
  return {
    role: "teacher" as const,
    sessions: sess, selected,
    students: students.map((s) => ({ id: s.id, name: fullName(s), summary: summarize(recs, s.id), current: recs.find((r) => r.session_id === selected && r.student_id === s.id) ?? null })),
    lessons: (lessons.data ?? []).map((l) => ({ id: l.id, label: `${l.number}. ${lt2.get(l.id) ?? ""}`, date: l.scheduled_date })),
    general: summarize(recs),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const { course } = await requireCourse(request, supabase);
  const fd = await request.formData();
  try {
    if (fd.get("intent") === "create") {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(fd.get("date"));
      const lesson = z.string().uuid().or(z.literal("")).parse(fd.get("lesson") ?? "") || null;
      const s = must(await supabase.from("attendance_sessions").insert({ course_id: course.id, session_date: date, lesson_id: lesson }).select("id").single());
      return { ok: true as const, session: s.id, message: "attendance.session_created" };
    }
    const session = z.string().uuid().parse(fd.get("session"));
    const rows = [];
    for (const [k, v] of fd.entries()) {
      const m = k.match(/^st_([0-9a-f-]{36})$/);
      if (m && STATUSES.includes(v as St)) rows.push({ session_id: session, student_id: m[1]!, status: v as St, note: String(fd.get(`note_${m[1]}`) ?? "").slice(0, 500), recorded_by: user.id });
    }
    if (rows.length) check(await supabase.from("attendance_records").upsert(rows));
    return { ok: true as const, session, message: "common.saved" };
  } catch (e) {
    return failCode(e instanceof z.ZodError ? "invalid_data" : toAppError(e).code);
  }
}

export default function Attendance({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const [params] = useSearchParams();

  if (loaderData.role === "student") {
    const s = loaderData.summary;
    return (
      <>
        <PageHeader title={t("nav.my_attendance")} />
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label={t("attendance.percentage")} value={s.pct === null ? "—" : `${fmtNumber(s.pct, locale)} %`} icon={<ClipboardCheck className="h-5 w-5" />} tone="green" />
          <StatCard label={t("attendance.total_sessions")} value={s.total} tone="navy" />
          <StatCard label={t("status.present")} value={s.present} />
          <StatCard label={t("status.absent")} value={s.absent} tone="amber" />
          <StatCard label={t("status.late")} value={s.late} tone="amber" />
        </div>
        <Card>{loaderData.rows.length === 0 ? <EmptyState title={t("attendance.none")} /> : (
          <Table><thead><tr><Th>{t("common.date")}</Th><Th>{t("nav.lessons")}</Th><Th>{t("common.status")}</Th><Th>{t("attendance.note")}</Th></tr></thead>
            <tbody>{loaderData.rows.map((r) => <tr key={r.session_id}><Td>{fmtDate(r.session?.session_date, locale)}</Td><Td>{r.session?.lesson || "—"}</Td><Td><StatusBadge status={r.status} /></Td><Td className="text-slate-500">{r.note}</Td></tr>)}</tbody></Table>
        )}</Card>
      </>
    );
  }

  const d = loaderData;
  const selected = (a && a.ok && "session" in a ? a.session : null) ?? params.get("session") ?? d.selected;
  const g = d.general;
  return (
    <>
      <PageHeader title={t("attendance.title")} />
      {a && a.ok && <div className="mb-4"><Alert tone="green">{t(a.message ?? "common.saved")}</Alert></div>}
      {a && !a.ok && <div className="mb-4"><Alert>{t(`errors.${a.error}`)}</Alert></div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("attendance.percentage")} value={g.pct === null ? "—" : `${fmtNumber(g.pct, locale)} %`} tone="green" icon={<ClipboardCheck className="h-5 w-5" />} />
        <StatCard label={t("attendance.total_sessions")} value={d.sessions.length} tone="navy" />
        <StatCard label={t("status.absent")} value={g.absent} tone="amber" />
        <StatCard label={t("status.late")} value={g.late} tone="amber" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("attendance.new_session")} />
            <Form method="post" className="space-y-3 p-5">
              <input type="hidden" name="intent" value="create" />
              <Field label={t("common.date")} htmlFor="date"><Input id="date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
              <Field label={t("nav.lessons")} htmlFor="lesson"><Select id="lesson" name="lesson"><option value="">—</option>{d.lessons.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</Select></Field>
              <Button className="w-full"><CalendarPlus className="h-4 w-4" />{t("common.create")}</Button>
            </Form>
          </Card>
          <Card>
            <CardHeader title={t("attendance.sessions")} />
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-white/5">{d.sessions.map((s) => (
              <li key={s.id}><Link to={`?session=${s.id}`} className={cn("block px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5", selected === s.id && "bg-brand-50 font-semibold dark:bg-brand-500/10")}>
                {fmtDate(s.session_date, locale)}{s.lesson && <span className="block truncate text-xs font-normal text-slate-500">{s.lesson}</span>}</Link></li>
            ))}</ul>
          </Card>
        </div>
        <Card>
          {!selected ? <EmptyState title={t("attendance.create_first")} /> : (
            <Form method="post" key={selected}>
              <input type="hidden" name="session" value={selected} />
              <CardHeader title={fmtDate(d.sessions.find((s) => s.id === selected)?.session_date, locale)} action={<Button size="sm" loading={nav.state === "submitting"}><Save className="h-4 w-4" />{t("common.save")}</Button>} />
              <Table>
                <thead><tr><Th>{t("students.name")}</Th><Th>{t("common.status")}</Th><Th>{t("attendance.note")}</Th><Th>%</Th></tr></thead>
                <tbody>{d.students.map((s) => (
                  <tr key={s.id}>
                    <Td className="font-medium">{s.name}</Td>
                    <Td><div className="flex flex-wrap gap-1">{STATUSES.map((st) => (
                      <label key={st} className="cursor-pointer">
                        <input type="radio" name={`st_${s.id}`} value={st} defaultChecked={(s.current?.status ?? "present") === st} className="peer sr-only" />
                        <span className={cn("inline-block rounded-md border px-2 py-1 text-xs font-medium transition peer-checked:text-white peer-focus-visible:ring-2",
                          st === "present" && "border-emerald-300 text-emerald-700 peer-checked:bg-emerald-600",
                          st === "absent" && "border-red-300 text-red-700 peer-checked:bg-red-600",
                          st === "late" && "border-amber-300 text-amber-700 peer-checked:bg-amber-500",
                          st === "excused" && "border-brand-100 text-brand-700 peer-checked:bg-brand-500")}>{t(`status.${st}`)}</span>
                      </label>
                    ))}</div></Td>
                    <Td><Input name={`note_${s.id}`} defaultValue={s.current?.note ?? ""} className="h-8 text-xs" aria-label={t("attendance.note")} /></Td>
                    <Td>{s.summary.pct === null ? "—" : `${fmtNumber(s.summary.pct, locale, 0)}%`}</Td>
                  </tr>
                ))}</tbody>
              </Table>
            </Form>
          )}
        </Card>
      </div>
    </>
  );
}
