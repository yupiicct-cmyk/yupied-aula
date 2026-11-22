import type { DB } from "~/services/supabase/server";
import type { SessionInfo } from "~/services/auth.server";
import type { Tables } from "~/types/database";
import { AppError } from "~/utils/errors";
import { INSTITUTION_COOKIE } from "~/services/institutions.server";

export const COURSE_COOKIE = "aula_course";
export type CourseLite = Pick<Tables<"courses">, "id" | "name" | "status" | "languages" | "grade_scale_id" | "owner_teacher_id" | "start_date" | "end_date" | "institution_id" | "level_key" | "grade_key">;

/**
 * Cursos visibles (RLS) de la institución activa y el curso activo elegido en la cookie.
 * La cookie de institución solo acota lo que RLS ya permite ver; no concede acceso.
 */
export async function getCourses(request: Request, supabase: DB) {
  const { data, error } = await supabase.from("courses")
    .select("id,name,status,languages,grade_scale_id,owner_teacher_id,start_date,end_date,institution_id,level_key,grade_key")
    .is("deleted_at", null).neq("status", "archived").order("created_at");
  if (error) throw error;
  const all = (data ?? []) as CourseLite[];
  const instId = (request.headers.get("Cookie") ?? "").match(new RegExp(`${INSTITUTION_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const scoped = instId ? all.filter((c) => c.institution_id === instId) : all;
  const courses = scoped.length > 0 ? scoped : all;
  const cookieId = (request.headers.get("Cookie") ?? "").match(new RegExp(`${COURSE_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const url = new URL(request.url);
  const qId = url.searchParams.get("course");
  const active = courses.find((c) => c.id === qId) ?? courses.find((c) => c.id === cookieId) ?? courses[0] ?? null;
  return { courses, course: active };
}

export async function requireCourse(request: Request, supabase: DB) {
  const r = await getCourses(request, supabase);
  if (!r.course) throw new AppError("no_course", 404);
  return { ...r, course: r.course };
}

/** Lista de estudiantes activos del curso (solo profesor: RLS lo garantiza). */
export async function courseStudents(supabase: DB, courseId: string) {
  const { data: members, error } = await supabase.from("course_members").select("student_id,status,enrolled_at")
    .eq("course_id", courseId).eq("status", "active");
  if (error) throw error;
  const ids = (members ?? []).map((m) => m.student_id);
  if (ids.length === 0) return [];
  const { data: profiles, error: e2 } = await supabase.from("profiles")
    .select("id,first_name,last_name,email,internal_code,status,avatar_key").in("id", ids).order("last_name");
  if (e2) throw e2;
  return profiles ?? [];
}

export function assertTeacher(user: SessionInfo) {
  if (!user.isTeacher) throw new AppError("forbidden", 403);
}
