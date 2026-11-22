import { redirect, type RouterContextProvider } from "react-router";
import type { Tables } from "~/types/database";
import type { DB } from "~/services/supabase/server";
import { createSupabase } from "~/services/supabase/server";
import { sessionContext } from "~/services/context";
import { getEnv } from "~/services/env.server";
import { AppError } from "~/utils/errors";

export type Role = "superadmin" | "teacher" | "student" | "academic_admin" | "assistant" | "tutor" | "coordinator"
  | "country_admin" | "institution_admin" | "director" | "inspector" | "guardian";

export interface SessionInfo {
  id: string;
  email: string;
  profile: Tables<"profiles">;
  roles: Role[];
  isAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  /** Dirección, inspectoría o administración (país/institución): lectura de supervisión. */
  isSupervisor: boolean;
  isGuardian: boolean;
}

type Ctx = Readonly<RouterContextProvider>;

async function loadSession(supabase: DB): Promise<SessionInfo | null> {
  // getClaims() verifica la firma del JWT (claves asimétricas) en vez de confiar en la cookie.
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  const [profileRes, rolesRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", sub).maybeSingle(),
    supabase.from("user_roles").select("role_key").eq("user_id", sub),
  ]);
  const profile = profileRes.data;
  if (!profile) return null;
  const roles = (rolesRes.data ?? []).map((r) => r.role_key as Role);
  const isAdmin = roles.includes("superadmin");
  return {
    id: sub,
    email: profile.email,
    profile,
    roles,
    isAdmin,
    isTeacher: isAdmin || roles.includes("teacher") || roles.includes("academic_admin"),
    isStudent: roles.includes("student"),
    isSupervisor: isAdmin || roles.some((r) => ["country_admin", "institution_admin", "director", "inspector", "academic_admin"].includes(r)),
    isGuardian: roles.includes("guardian"),
  };
}

/** Middleware raíz: crea el cliente por petición y propaga las cookies renovadas. */
export function sessionMiddleware() {
  return async (
    { request, context }: { request: Request; context: Readonly<RouterContextProvider> },
    next: () => Promise<Response>,
  ) => {
    const { supabase, headers, prefs } = createSupabase(request, getEnv(context));
    let pending: Promise<SessionInfo | null> | undefined;
    context.set(sessionContext, { supabase, headers, prefs, load: () => (pending ??= loadSession(supabase)) });
    const res = await next();
    const cookies = headers.getSetCookie();
    if (cookies.length === 0) return res;
    const out = new Response(res.body, res);
    for (const c of cookies) out.headers.append("Set-Cookie", c);
    out.headers.set("Cache-Control", "private, no-store");
    return out;
  };
}

export function setRememberSession(context: Ctx, remember: boolean) {
  context.get(sessionContext).prefs.remember = remember;
}

export function getSupabase(context: Ctx) {
  return context.get(sessionContext).supabase;
}

export async function getOptionalUser(context: Ctx) {
  return context.get(sessionContext).load();
}

/**
 * Exige sesión activa. Opcionalmente exige rol docente o estudiante.
 * Los permisos reales los aplica PostgreSQL (RLS); esto evita mostrar
 * pantallas que el usuario no puede usar.
 */
export async function requireUser(request: Request, context: Ctx, opts: { teacher?: boolean; student?: boolean; admin?: boolean; supervisor?: boolean; guardian?: boolean } = {}) {
  const s = context.get(sessionContext);
  const user = await s.load();
  const url = new URL(request.url);
  if (!user) {
    throw redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (user.profile.status !== "active" || user.profile.deleted_at) {
    await s.supabase.auth.signOut();
    throw redirect("/login?error=inactive");
  }
  if (user.profile.must_change_password && url.pathname !== "/reset-password") {
    throw redirect("/reset-password?first=1");
  }
  if (user.roles.length === 0) throw new AppError("no_role", 403);
  if (opts.admin && !user.isAdmin) throw new AppError("forbidden", 403);
  if (opts.teacher && !user.isTeacher) throw new AppError("forbidden", 403);
  if (opts.student && !user.isStudent) throw new AppError("forbidden", 403);
  if (opts.supervisor && !user.isSupervisor) throw new AppError("forbidden", 403);
  if (opts.guardian && !user.isGuardian) throw new AppError("forbidden", 403);
  return { user, supabase: s.supabase };
}

export function homeFor(user: SessionInfo) {
  return user.isTeacher ? "/app" : "/app";
}
