import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Award, BookOpen, CalendarClock, ClipboardCheck, ClipboardList, FolderOpen, GraduationCap, Layers, NotebookPen, PlayCircle, TrendingUp, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Route } from "./+types/dashboard";
import { requireUser } from "~/services/auth.server";
import { getCourses } from "~/services/courses.server";
import { activityTitles, lessonTitles } from "~/services/content.server";
import { detectLocale, pick } from "~/services/i18n";
import { Alert, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Progress, StatCard } from "~/components/ui";
import { fmtDate, fmtNumber, fullName } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { toAppError } from "~/utils/errors";

type Stats = {
  students: number; modules: number; lessons_published: number; materials: number; pending_submissions: number;
  assessments: number; attendance_avg: number | null; grade_avg: number | null; activities_completion: number | null;
  grades_by_item: { title: string; avg: number }[]; attendance_by_session: { date: string; pct: number }[];
  distribution: { bucket: number; n: number }[];
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const locale = detectLocale(request, user.profile.locale);
  const { courses, course } = await getCourses(request, supabase);
  const now = new Date().toISOString();

  if (user.isTeacher) {
    if (!course) return { role: "teacher" as const, course: null, stats: null, pending: [], courseCount: 0 };
    const [statsRes, pendingRes] = await Promise.all([
      supabase.rpc("course_stats", { p_course: course.id }),
      supabase.from("submissions").select("id,activity_id,student_id,submitted_at").eq("status", "submitted")
        .order("submitted_at", { ascending: true }).limit(8),
    ]);
    if (statsRes.error) throw toAppError(statsRes.error);
    const pending = pendingRes.data ?? [];
    const [titles, people] = await Promise.all([
      activityTitles(supabase, [...new Set(pending.map((p) => p.activity_id))], locale),
      pending.length ? supabase.from("profiles").select("id,first_name,last_name").in("id", [...new Set(pending.map((p) => p.student_id))]) : Promise.resolve({ data: [] }),
    ]);
    const names = new Map((people.data ?? []).map((p) => [p.id, fullName(p)]));
    return {
      role: "teacher" as const,
      course: { id: course.id, name: course.name },
      courseCount: courses.length,
      stats: statsRes.data as unknown as Stats,
      pending: pending.map((p) => ({ ...p, title: titles.get(p.activity_id) ?? "", student: names.get(p.student_id) ?? "" })),
    };
  }

  // ---------- Estudiante ----------
  if (!course) return { role: "student" as const, course: null, firstName: user.profile.first_name };
  const [lessonsRes, activitiesRes, subsRes, assessRes, materialsRes, progressRes, lastViewRes] = await Promise.all([
    supabase.from("lessons").select("id,number,scheduled_date,module_id").eq("course_id", course.id).is("deleted_at", null).order("scheduled_date", { ascending: true, nullsFirst: false }),
    supabase.from("activities").select("id,due_at,type").eq("course_id", course.id).is("deleted_at", null).order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("submissions").select("activity_id,status").eq("student_id", user.id),
    supabase.from("assessments").select("id,title_i18n,opens_at,closes_at").eq("course_id", course.id).is("deleted_at", null).or(`closes_at.is.null,closes_at.gte.${now}`).order("opens_at").limit(4),
    supabase.from("materials").select("id,title,mime_type,created_at").eq("course_id", course.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("student_progress").select("*").eq("course_id", course.id).maybeSingle(),
    supabase.from("lesson_progress").select("lesson_id,last_viewed_at,completed_at").eq("student_id", user.id).order("last_viewed_at", { ascending: false }).limit(1),
  ]);
  const lessons = lessonsRes.data ?? [];
  const done = new Set((subsRes.data ?? []).filter((s) => s.status !== "draft").map((s) => s.activity_id));
  const pendingActs = (activitiesRes.data ?? []).filter((a) => !done.has(a.id)).slice(0, 5);
  const today = new Date().toISOString().slice(0, 10);
  const next = lessons.find((l) => l.scheduled_date && l.scheduled_date >= today) ?? null;
  const lastId = lastViewRes.data?.[0]?.lesson_id ?? null;
  const last = lessons.find((l) => l.id === lastId) ?? null;
  const viewed = new Set<string>();
  const { data: allProgress } = await supabase.from("lesson_progress").select("lesson_id,completed_at").eq("student_id", user.id);
  for (const p of allProgress ?? []) if (p.completed_at) viewed.add(p.lesson_id);
  const continueLesson = lessons.find((l) => !viewed.has(l.id)) ?? last;
  const [lt, at] = await Promise.all([
    lessonTitles(supabase, [next?.id, last?.id, continueLesson?.id].filter(Boolean) as string[], locale),
    activityTitles(supabase, pendingActs.map((a) => a.id), locale),
  ]);
  const p = progressRes.data;
  const progressPct = p && (p.lessons_total ?? 0) + (p.activities_total ?? 0) > 0
    ? (100 * ((p.lessons_completed ?? 0) + (p.activities_done ?? 0))) / ((p.lessons_total ?? 0) + (p.activities_total ?? 0)) : 0;
  return {
    role: "student" as const,
    firstName: user.profile.first_name,
    course: { id: course.id, name: course.name },
    next: next ? { id: next.id, date: next.scheduled_date, title: lt.get(next.id) ?? "" } : null,
    last: last ? { id: last.id, title: lt.get(last.id) ?? "" } : null,
    continueLesson: continueLesson ? { id: continueLesson.id, title: lt.get(continueLesson.id) ?? "" } : null,
    pendingActs: pendingActs.map((a) => ({ id: a.id, due_at: a.due_at, title: at.get(a.id) ?? "" })),
    assessments: (assessRes.data ?? []).map((a) => ({ id: a.id, title: pick(a.title_i18n, locale), opens_at: a.opens_at })),
    materials: materialsRes.data ?? [],
    progressPct,
    attendance: p?.attendance_pct ?? null,
    gradeAvg: p?.grade_avg ?? null,
  };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  return loaderData.role === "teacher" ? <TeacherDashboard data={loaderData} /> : <StudentDashboard data={loaderData} />;
}

function TeacherDashboard({ data }: { data: Extract<Route.ComponentProps["loaderData"], { role: "teacher" }> }) {
  const { t } = useTranslation();
  const locale = useLocale();
  if (!data.course || !data.stats) {
    return (
      <>
        <PageHeader title={t("dashboard.title")} />
        <Card><EmptyState icon={<GraduationCap />} title={t("dashboard.no_course")} description={t("dashboard.no_course_hint")}
          action={<ButtonLink to="/app/courses">{t("courses.create")}</ButtonLink>} /></Card>
      </>
    );
  }
  const s = data.stats;
  return (
    <>
      <PageHeader title={t("dashboard.title")} description={data.course.name}
        actions={<><ButtonLink to="/app/lessons" variant="outline">{t("lessons.new")}</ButtonLink><ButtonLink to="/app/students">{t("students.add")}</ButtonLink></>} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label={t("dashboard.kpi.students")} value={s.students} icon={<Users className="h-5 w-5" />} />
        <StatCard label={t("dashboard.kpi.courses")} value={data.courseCount} icon={<GraduationCap className="h-5 w-5" />} tone="navy" />
        <StatCard label={t("dashboard.kpi.modules")} value={s.modules} icon={<Layers className="h-5 w-5" />} tone="navy" />
        <StatCard label={t("dashboard.kpi.lessons")} value={s.lessons_published} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard label={t("dashboard.kpi.materials")} value={s.materials} icon={<FolderOpen className="h-5 w-5" />} />
        <StatCard label={t("dashboard.kpi.pending")} value={s.pending_submissions} icon={<ClipboardList className="h-5 w-5" />} tone="amber" />
        <StatCard label={t("dashboard.kpi.assessments")} value={s.assessments} icon={<NotebookPen className="h-5 w-5" />} tone="navy" />
        <StatCard label={t("dashboard.kpi.attendance")} value={s.attendance_avg === null ? "—" : `${fmtNumber(s.attendance_avg, locale)} %`} icon={<ClipboardCheck className="h-5 w-5" />} tone="green" />
        <StatCard label={t("dashboard.kpi.performance")} value={fmtNumber(s.grade_avg, locale)} hint={s.activities_completion === null ? undefined : t("dashboard.completion", { pct: fmtNumber(s.activities_completion, locale, 0) })} icon={<Award className="h-5 w-5" />} tone="green" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title={t("dashboard.chart.grades")} empty={s.grades_by_item.length === 0}>
          <BarChart data={s.grades_by_item}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="title" tick={{ fontSize: 11 }} interval={0} /><YAxis domain={[0, 7]} /><Tooltip /><Bar dataKey="avg" fill="#0878FF" radius={[6, 6, 0, 0]} name={t("grades.average")} /></BarChart>
        </ChartCard>
        <ChartCard title={t("dashboard.chart.attendance")} empty={s.attendance_by_session.length === 0}>
          <LineChart data={s.attendance_by_session.map((a) => ({ ...a, label: fmtDate(a.date, locale) }))}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} /><Tooltip /><Line type="monotone" dataKey="pct" stroke="#08265E" strokeWidth={2} name="%" /></LineChart>
        </ChartCard>
        <ChartCard title={t("dashboard.chart.distribution")} empty={s.distribution.length === 0}>
          <BarChart data={s.distribution}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="bucket" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="n" fill="#08265E" radius={[6, 6, 0, 0]} name={t("dashboard.chart.students")} /></BarChart>
        </ChartCard>
        <Card>
          <CardHeader title={t("dashboard.pending_review")} action={<Link to="/app/activities" className="text-sm text-brand-600 hover:underline">{t("common.view_all")}</Link>} />
          {data.pending.length === 0 ? <EmptyState title={t("dashboard.nothing_pending")} /> : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {data.pending.map((p) => (
                <li key={p.id}>
                  <Link to={`/app/activities/${p.activity_id}/submissions?s=${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/5">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{p.title}</p><p className="text-xs text-slate-500">{p.student}</p></div>
                    <span className="shrink-0 text-xs text-slate-500">{fmtDate(p.submitted_at, locale, true)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function ChartCard({ title, children, empty }: { title: string; children: React.ReactElement; empty: boolean }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader title={title} />
      <div className="h-64 p-4">
        {empty ? <EmptyState title={t("dashboard.no_data")} /> : <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>}
      </div>
    </Card>
  );
}

function StudentDashboard({ data }: { data: Extract<Route.ComponentProps["loaderData"], { role: "student" }> }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [params] = useSearchParams();
  if (!data.course || !("pendingActs" in data)) {
    return (
      <>
        <PageHeader title={t("dashboard.hello", { name: data.firstName })} />
        <Card><EmptyState icon={<GraduationCap />} title={t("dashboard.no_enrollment")} description={t("dashboard.no_enrollment_hint")} /></Card>
      </>
    );
  }
  return (
    <>
      {params.get("welcome") && <div className="mb-4"><Alert tone="green">{t("auth.password_updated")}</Alert></div>}
      <div className="mb-6 overflow-hidden rounded-2xl bg-navy-900 bg-[radial-gradient(ellipse_at_top_right,rgba(8,120,255,0.45),transparent_60%)] p-6 text-white sm:p-8">
        <p className="text-sm text-slate-300">{data.course.name}</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{t("dashboard.hello", { name: data.firstName })}</h1>
        <div className="mt-5 max-w-md">
          <div className="mb-1 flex justify-between text-sm"><span>{t("dashboard.my_progress")}</span><span>{Math.round(data.progressPct)} %</span></div>
          <Progress value={data.progressPct} className="bg-white/20" />
        </div>
        {data.continueLesson && (
          <ButtonLink to={`/app/lessons/${data.continueLesson.id}`} className="mt-6" size="lg">
            <PlayCircle className="h-5 w-5" /> {t("dashboard.continue_learning")}
          </ButtonLink>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("dashboard.next_session")} value={<span className="text-base">{data.next ? data.next.title || t("lessons.untitled") : "—"}</span>} hint={data.next ? fmtDate(data.next.date, locale) : undefined} icon={<CalendarClock className="h-5 w-5" />} />
        <StatCard label={t("dashboard.last_class")} value={<span className="text-base">{data.last?.title || "—"}</span>} icon={<BookOpen className="h-5 w-5" />} tone="navy" />
        <StatCard label={t("dashboard.kpi.attendance")} value={data.attendance === null ? "—" : `${fmtNumber(data.attendance, locale)} %`} icon={<ClipboardCheck className="h-5 w-5" />} tone="green" />
        <StatCard label={t("grades.average")} value={fmtNumber(data.gradeAvg, locale)} icon={<TrendingUp className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("dashboard.pending_activities")} action={<Link to="/app/activities" className="text-sm text-brand-600 hover:underline">{t("common.view_all")}</Link>} />
          {data.pendingActs.length === 0 ? <EmptyState title={t("dashboard.all_done")} /> : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {data.pendingActs.map((a) => (
                <li key={a.id}><Link to={`/app/activities/${a.id}`} className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/5">
                  <p className="text-sm font-medium">{a.title || t("activities.untitled")}</p>
                  <p className="text-xs text-slate-500">{a.due_at ? t("activities.due", { date: fmtDate(a.due_at, locale, true) }) : t("activities.no_due")}</p>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t("dashboard.recent_materials")} action={<Link to="/app/library" className="text-sm text-brand-600 hover:underline">{t("common.view_all")}</Link>} />
          {data.materials.length === 0 ? <EmptyState title={t("library.empty")} /> : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {data.materials.map((m) => (
                <li key={m.id}><a href={`/files/material/${m.id}`} target="_blank" rel="noreferrer" className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/5">
                  <p className="truncate text-sm font-medium">{m.title}</p><p className="text-xs text-slate-500">{fmtDate(m.created_at, locale)}</p>
                </a></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t("dashboard.upcoming_assessments")} />
          {data.assessments.length === 0 ? <EmptyState title={t("assessments.none_upcoming")} /> : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {data.assessments.map((a) => (
                <li key={a.id}><Link to={`/app/assessments/${a.id}`} className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/5">
                  <p className="text-sm font-medium">{a.title}</p><p className="text-xs text-slate-500">{fmtDate(a.opens_at, locale, true)}</p>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
