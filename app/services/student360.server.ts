import type { DB } from "~/services/supabase/server";
import type { Locale } from "~/services/i18n";
import { pick } from "~/services/i18n";
import { activityTitles, lessonTitles } from "~/services/content.server";
import { AppError } from "~/utils/errors";

export type TimelineItem = { at: string; kind: "lesson" | "submission" | "assessment" | "attendance" | "download"; label: string; detail?: string };

/** Perfil 360° de un estudiante. Todo pasa por RLS: un estudiante solo puede cargar el suyo. */
export async function loadStudent360(supabase: DB, studentId: string, locale: Locale) {
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", studentId).maybeSingle();
  if (!profile) throw new AppError("not_found", 404);

  const [members, progress, lp, subs, attempts, att, logs, grades, notes] = await Promise.all([
    supabase.from("course_members").select("course_id,status,enrolled_at").eq("student_id", studentId),
    supabase.from("student_progress").select("*").eq("student_id", studentId),
    supabase.from("lesson_progress").select("lesson_id,last_viewed_at,completed_at,view_count").eq("student_id", studentId).order("last_viewed_at", { ascending: false }).limit(100),
    supabase.from("submissions").select("id,activity_id,status,submitted_at,score,feedback").eq("student_id", studentId).order("submitted_at", { ascending: false }).limit(100),
    supabase.from("assessment_attempts").select("id,assessment_id,status,submitted_at,score,max_score").eq("student_id", studentId).order("started_at", { ascending: false }).limit(50),
    supabase.from("attendance_records").select("session_id,status,note").eq("student_id", studentId),
    supabase.from("material_access_logs").select("material_id,action,created_at").eq("user_id", studentId).order("created_at", { ascending: false }).limit(50),
    supabase.from("grades").select("id,course_id,title,score,max_score,grade,weight,observation,created_at").eq("student_id", studentId).order("created_at"),
    supabase.from("student_notes").select("id,body,created_at,visible_to_student,course_id").eq("student_id", studentId).order("created_at", { ascending: false }),
  ]);

  const courseIds = (members.data ?? []).map((m) => m.course_id);
  const sessionIds = (att.data ?? []).map((a) => a.session_id);
  const materialIds = [...new Set((logs.data ?? []).map((l) => l.material_id))];
  const assessmentIds = [...new Set((attempts.data ?? []).map((a) => a.assessment_id))];
  const [courses, sessions, materials, assessments, teachers, lt, at, modules] = await Promise.all([
    courseIds.length ? supabase.from("courses").select("id,name,owner_teacher_id").in("id", courseIds) : Promise.resolve({ data: [] }),
    sessionIds.length ? supabase.from("attendance_sessions").select("id,session_date").in("id", sessionIds) : Promise.resolve({ data: [] }),
    materialIds.length ? supabase.from("materials").select("id,title").in("id", materialIds) : Promise.resolve({ data: [] }),
    assessmentIds.length ? supabase.from("assessments").select("id,title_i18n").in("id", assessmentIds) : Promise.resolve({ data: [] }),
    courseIds.length ? supabase.from("teacher_assignments").select("course_id,teacher_id").in("course_id", courseIds) : Promise.resolve({ data: [] }),
    lessonTitles(supabase, (lp.data ?? []).map((l) => l.lesson_id), locale),
    activityTitles(supabase, (subs.data ?? []).map((s) => s.activity_id), locale),
    courseIds.length ? supabase.from("modules").select("id,course_id,title_i18n,position").in("course_id", courseIds).is("deleted_at", null).order("position") : Promise.resolve({ data: [] }),
  ]);
  const teacherIds = [...new Set((teachers.data ?? []).map((t) => t.teacher_id))];
  const { data: teacherProfiles } = teacherIds.length ? await supabase.from("profiles").select("id,first_name,last_name").in("id", teacherIds) : { data: [] };

  // Módulos completados: todas sus sesiones visibles completadas
  const moduleIds = (modules.data ?? []).map((m) => m.id);
  const { data: lessonsOfModules } = moduleIds.length ? await supabase.from("lessons").select("id,module_id").in("module_id", moduleIds).is("deleted_at", null) : { data: [] };
  const completed = new Set((lp.data ?? []).filter((l) => l.completed_at).map((l) => l.lesson_id));
  const moduleStatus = (modules.data ?? []).map((m) => {
    const ls = (lessonsOfModules ?? []).filter((l) => l.module_id === m.id);
    const done = ls.filter((l) => completed.has(l.id)).length;
    return { id: m.id, title: pick(m.title_i18n, locale), total: ls.length, done, complete: ls.length > 0 && done === ls.length };
  });

  const sessionDate = new Map((sessions.data ?? []).map((s) => [s.id, s.session_date]));
  const matTitle = new Map((materials.data ?? []).map((m) => [m.id, m.title]));
  const asTitle = new Map((assessments.data ?? []).map((a) => [a.id, pick(a.title_i18n, locale)]));

  const timeline: TimelineItem[] = [
    ...(lp.data ?? []).map((l) => ({ at: l.last_viewed_at, kind: "lesson" as const, label: lt.get(l.lesson_id) ?? "", detail: l.completed_at ? "completed" : "viewed" })),
    ...(subs.data ?? []).filter((s) => s.submitted_at).map((s) => ({ at: s.submitted_at!, kind: "submission" as const, label: at.get(s.activity_id) ?? "", detail: s.status })),
    ...(attempts.data ?? []).filter((a) => a.submitted_at).map((a) => ({ at: a.submitted_at!, kind: "assessment" as const, label: asTitle.get(a.assessment_id) ?? "", detail: a.status })),
    ...(att.data ?? []).map((a) => ({ at: `${sessionDate.get(a.session_id) ?? "1970-01-01"}T12:00:00Z`, kind: "attendance" as const, label: a.status, detail: a.note })),
    ...(logs.data ?? []).filter((l) => l.action === "download").map((l) => ({ at: l.created_at, kind: "download" as const, label: matTitle.get(l.material_id) ?? "" })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);

  const attRows = att.data ?? [];
  const attSummary = {
    total: attRows.length,
    present: attRows.filter((a) => a.status === "present").length,
    late: attRows.filter((a) => a.status === "late").length,
    excused: attRows.filter((a) => a.status === "excused").length,
    absent: attRows.filter((a) => a.status === "absent").length,
  };

  return {
    profile,
    courses: (courses.data ?? []).map((c) => ({
      id: c.id, name: c.name,
      teachers: (teachers.data ?? []).filter((t) => t.course_id === c.id).map((t) => (teacherProfiles ?? []).find((p) => p.id === t.teacher_id)).filter(Boolean)
        .map((p) => `${p!.first_name} ${p!.last_name}`.trim()),
      status: (members.data ?? []).find((m) => m.course_id === c.id)?.status ?? "active",
    })),
    progress: progress.data ?? [],
    modules: moduleStatus,
    submissions: (subs.data ?? []).map((s) => ({ ...s, title: at.get(s.activity_id) ?? "" })),
    attempts: (attempts.data ?? []).map((a) => ({ ...a, title: asTitle.get(a.assessment_id) ?? "" })),
    grades: grades.data ?? [],
    attendance: attSummary,
    downloads: (logs.data ?? []).filter((l) => l.action === "download").length,
    lessonsViewed: (lp.data ?? []).length,
    notes: notes.data ?? [],
    timeline,
  };
}

/** Actividades publicadas aún no entregadas por el estudiante (vista del profesor o propia). */
export async function pendingActivities(supabase: DB, studentId: string, courseIds: string[]) {
  if (courseIds.length === 0) return 0;
  const [acts, subs] = await Promise.all([
    supabase.from("activities").select("id,status,publish_at").in("course_id", courseIds).is("deleted_at", null).in("status", ["published", "scheduled"]),
    supabase.from("submissions").select("activity_id,status").eq("student_id", studentId),
  ]);
  const done = new Set((subs.data ?? []).filter((s) => s.status !== "draft").map((s) => s.activity_id));
  return (acts.data ?? []).filter((a) => !done.has(a.id)).length;
}
