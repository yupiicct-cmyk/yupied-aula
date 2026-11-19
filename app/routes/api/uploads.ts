import { cloudflareContext } from "~/services/context";
import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/uploads";
import { requireUser } from "~/services/auth.server";
import { getEnv } from "~/services/env.server";
import { rateLimit } from "~/services/cloudflare/ratelimit.server";
import { assertFileAllowed, authorizeKey, canPresign, presignPut, safeFileName } from "~/services/storage/r2.server";
import { AppError, toAppError } from "~/utils/errors";

const initSchema = z.object({
  intent: z.literal("init"),
  purpose: z.enum(["material", "submission_file", "course_cover", "avatar"]),
  name: z.string().min(1).max(255),
  mime: z.string().min(3).max(150),
  size: z.coerce.number().int().positive(),
  courseId: z.string().uuid().optional(),
  activityId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  replaceId: z.string().uuid().optional(),
});
const completeSchema = z.object({ intent: z.literal("complete"), key: z.string().min(5).max(600), replaceId: z.string().uuid().optional() });

/**
 * Subidas seguras a R2 en dos pasos:
 *  1) init: valida permisos/tipo/tamaño y entrega una URL (prefirmada o proxy).
 *  2) complete: verifica que el objeto exista en R2 y registra los metadatos en PostgreSQL.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  try {
    const { user, supabase } = await requireUser(request, context);
    await rateLimit(env, "api", `upload:${user.id}`);
    const body = await request.json();
    const { data: lim } = await supabase.from("system_settings").select("value").eq("key", "max_upload_mb").maybeSingle();
    const maxMb = Number(lim?.value) || undefined;

    if ((body as { intent?: string }).intent === "complete") {
      const c = completeSchema.parse(body);
      const target = await authorizeKey(supabase, user, c.key);
      const head = await env.FILES.head(c.key);
      if (!head) throw new AppError("upload_missing", 400);
      const mime = head.httpMetadata?.contentType ?? "application/octet-stream";
      const name = c.key.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "");
      assertFileAllowed(env, mime, name, head.size, target.kind, maxMb);
      if (target.kind === "material") {
        const { data: prev } = await supabase.from("materials").select("object_key,status").eq("id", target.materialId).single();
        const { error } = await supabase.from("materials").update({ status: "ready", size_bytes: head.size, mime_type: mime, object_key: c.key, original_name: name }).eq("id", target.materialId);
        if (error) throw error;
        if (prev && prev.object_key !== c.key && prev.status === "ready") context.get(cloudflareContext).ctx.waitUntil(env.FILES.delete(prev.object_key));
        return { ok: true, id: target.materialId };
      }
      if (target.kind === "submission_file") {
        const { data: row, error } = await supabase.from("submission_files")
          .insert({ submission_id: target.submissionId, object_key: c.key, original_name: name, mime_type: mime, size_bytes: head.size }).select("id").single();
        if (error) throw error;
        return { ok: true, id: row.id };
      }
      if (target.kind === "course_cover") {
        const { error } = await supabase.from("courses").update({ cover_key: c.key }).eq("id", target.courseId);
        if (error) throw error;
        return { ok: true };
      }
      const { error } = await supabase.from("profiles").update({ avatar_key: c.key }).eq("id", user.id);
      if (error) throw error;
      return { ok: true };
    }

    const p = initSchema.parse(body);
    assertFileAllowed(env, p.mime, p.name, p.size, p.purpose, maxMb);
    const file = `${crypto.randomUUID()}-${safeFileName(p.name)}`;
    let key: string;

    if (p.purpose === "material") {
      if (!user.isTeacher || !p.courseId) throw new AppError("forbidden", 403);
      if (p.replaceId) {
        const { data: m } = await supabase.from("materials").select("id,course_id").eq("id", p.replaceId).maybeSingle();
        if (!m) throw new AppError("forbidden", 403);
        key = `courses/${m.course_id}/materials/${m.id}/${file}`;
      } else {
        const { data: m, error } = await supabase.from("materials").insert({
          course_id: p.courseId, folder_id: p.folderId ?? null, title: (p.title || p.name).slice(0, 200), description: p.description ?? "",
          object_key: `pending/${crypto.randomUUID()}`, original_name: p.name, mime_type: p.mime, size_bytes: p.size, uploaded_by: user.id,
        }).select("id").single();
        if (error) throw error; // RLS: solo el profesor del curso
        key = `courses/${p.courseId}/materials/${m.id}/${file}`;
      }
    } else if (p.purpose === "submission_file") {
      if (!p.activityId) throw new AppError("invalid_data", 400);
      const { data: existing } = await supabase.from("submissions").select("id,status").eq("activity_id", p.activityId).eq("student_id", user.id).maybeSingle();
      if (!existing) {
        const { error } = await supabase.rpc("submit_activity", { p_activity: p.activityId, p_answers: {}, p_text: "", p_final: false });
        if (error) throw error;
      } else if (existing.status === "graded") throw new AppError("already_graded", 409);
      key = `submissions/${p.activityId}/${user.id}/${file}`;
    } else if (p.purpose === "course_cover") {
      if (!p.courseId) throw new AppError("invalid_data", 400);
      key = `courses/${p.courseId}/covers/${file}`;
    } else {
      key = `avatars/${user.id}/${file}`;
    }
    await authorizeKey(supabase, user, key);

    if (canPresign(env)) {
      return { ok: true, key, method: "PUT", url: await presignPut(env, key, p.mime), headers: { "Content-Type": p.mime } };
    }
    return { ok: true, key, method: "PUT", url: `/api/uploads/proxy/${encodeURIComponent(key)}`, headers: { "Content-Type": p.mime } };
  } catch (e) {
    const err = e instanceof z.ZodError ? new AppError("invalid_data", 400) : toAppError(e);
    return data({ ok: false, error: err.code }, { status: err.status });
  }
}
