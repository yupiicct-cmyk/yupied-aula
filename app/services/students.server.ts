import { createClient } from "@supabase/supabase-js";
import type { AppEnv } from "~/services/env.server";
import type { DB } from "~/services/supabase/server";
import { createAdminClient } from "~/services/supabase/admin.server";
import type { StudentInput } from "~/schemas/students";
import { AppError, toAppError } from "~/utils/errors";

/** Genera una contraseña temporal legible (sin caracteres ambiguos). */
export function tempPassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  if (!/\d/.test(out)) out = out.slice(0, -1) + "7";
  return out;
}

/** Comprueba con RLS que el usuario es profesor del curso. */
export async function assertCourseTeacher(supabase: DB, userId: string, courseId: string) {
  const { data } = await supabase.from("teacher_assignments").select("course_id").eq("course_id", courseId).eq("teacher_id", userId).maybeSingle();
  const { data: admin } = await supabase.from("user_roles").select("role_key").eq("user_id", userId).eq("role_key", "superadmin").maybeSingle();
  if (!data && !admin) throw new AppError("forbidden", 403);
}

export async function sendAccessEmail(env: AppEnv, email: string, origin: string) {
  const anon = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, flowType: "implicit" } });
  const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm?next=/reset-password` });
  if (error) throw new AppError(error.status === 429 ? "rate_limited" : "email_failed", 502);
}

/**
 * Crea (o reutiliza, sin duplicar) la cuenta de un estudiante y lo inscribe en el curso.
 * La cuenta se crea con la clave secreta SOLO después de verificar que quien llama es profesor del curso.
 */
export async function createStudent(env: AppEnv, supabase: DB, teacherId: string, courseId: string, input: StudentInput, origin: string) {
  await assertCourseTeacher(supabase, teacherId, courseId);
  const admin = createAdminClient(env);
  const password = input.access_mode === "password" ? input.temp_password : tempPassword(24);

  let userId: string | null = null;
  let existed = false;
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: { first_name: input.first_name, last_name: input.last_name, internal_code: input.internal_code || null, locale: input.locale },
    app_metadata: { initial_role: "student" },
  });
  if (error) {
    if (error.code !== "email_exists" && error.status !== 422) throw new AppError("account_failed", 502, error.message);
    // Ya existe: no se duplica. Se reutiliza solo si es estudiante.
    const { data: prof } = await admin.from("profiles").select("id").eq("email", input.email).maybeSingle();
    if (!prof) throw new AppError("duplicate", 409);
    const { data: roles } = await admin.from("user_roles").select("role_key").eq("user_id", prof.id);
    if (!(roles ?? []).some((r) => r.role_key === "student")) throw new AppError("duplicate_not_student", 409);
    userId = prof.id;
    existed = true;
  } else {
    userId = data.user.id;
  }

  if (!existed) {
    const patch: { must_change_password: boolean; joined_on?: string } = { must_change_password: input.access_mode === "password" };
    if (input.joined_on) patch.joined_on = input.joined_on;
    const { error: pe } = await admin.from("profiles").update(patch).eq("id", userId);
    if (pe) throw toAppError(pe);
  }

  // Inscripción con la identidad del profesor (RLS verifica permisos otra vez).
  const { error: me } = await supabase.from("course_members").upsert({ course_id: courseId, student_id: userId, status: "active" });
  if (me) throw toAppError(me);

  if (!existed && input.access_mode === "invite") await sendAccessEmail(env, input.email, origin);
  return { id: userId, existed };
}

export async function resetStudentAccess(env: AppEnv, supabase: DB, studentId: string, mode: "invite" | "password", origin: string) {
  // RLS: el profesor solo ve perfiles de sus estudiantes.
  const { data: prof } = await supabase.from("profiles").select("id,email").eq("id", studentId).maybeSingle();
  if (!prof) throw new AppError("forbidden", 403);
  const { data: roles } = await supabase.from("user_roles").select("role_key").eq("user_id", studentId);
  if ((roles ?? []).some((r) => r.role_key !== "student")) throw new AppError("forbidden", 403);
  if (mode === "invite") {
    await sendAccessEmail(env, prof.email, origin);
    return { password: null };
  }
  const admin = createAdminClient(env);
  const password = tempPassword();
  const { error } = await admin.auth.admin.updateUserById(studentId, { password });
  if (error) throw new AppError("account_failed", 502);
  await admin.from("profiles").update({ must_change_password: true }).eq("id", studentId);
  return { password };
}

/** Bloquea/desbloquea también el inicio de sesión en Supabase Auth. */
export async function setLoginBlocked(env: AppEnv, userId: string, blocked: boolean) {
  if (!env.SUPABASE_SECRET_KEY) return;
  const admin = createAdminClient(env);
  await admin.auth.admin.updateUserById(userId, { ban_duration: blocked ? "876000h" : "none" });
}
