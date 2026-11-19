import { AwsClient } from "aws4fetch";
import type { AppEnv } from "~/services/env.server";
import type { DB } from "~/services/supabase/server";
import type { SessionInfo } from "~/services/auth.server";
import { AppError } from "~/utils/errors";

export const ALLOWED_MIME: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "video/mp4": ["mp4"],
  "audio/mpeg": ["mp3"],
};

export type UploadPurpose = "material" | "submission_file" | "course_cover" | "avatar";

export function safeFileName(name: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^[._]+/, "");
  return base.slice(-120) || "archivo";
}

export function assertFileAllowed(env: AppEnv, mime: string, name: string, size: number, purpose: UploadPurpose, maxMb?: number) {
  const exts = ALLOWED_MIME[mime];
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!exts || !exts.includes(ext)) throw new AppError("file_type_not_allowed", 415);
  if ((purpose === "course_cover" || purpose === "avatar") && !mime.startsWith("image/")) throw new AppError("file_type_not_allowed", 415);
  const max = (maxMb ?? Number(env.MAX_UPLOAD_MB || "200")) * 1024 * 1024;
  if (!Number.isFinite(size) || size <= 0 || size > max) throw new AppError("file_too_large", 413);
}

export function canPresign(env: AppEnv) {
  return Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ACCOUNT_ID && env.R2_ACCOUNT_ID !== "REEMPLAZAR");
}

/** URL PUT prefirmada (15 min) para subir directo a R2 sin pasar por el Worker (videos grandes). */
export async function presignPut(env: AppEnv, key: string, mime: string) {
  const client = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, service: "s3", region: "auto" });
  const url = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key.split("/").map(encodeURIComponent).join("/")}`);
  url.searchParams.set("X-Amz-Expires", "900");
  const signed = await client.sign(new Request(url, { method: "PUT", headers: { "Content-Type": mime } }), { aws: { signQuery: true } });
  return signed.url;
}

/**
 * Autoriza una clave de objeto según su prefijo. La misma regla protege la
 * subida por proxy y la confirmación. Las consultas pasan por RLS.
 */
export async function authorizeKey(supabase: DB, user: SessionInfo, key: string) {
  const parts = key.split("/");
  if (parts.some((p) => p === ".." || p === "")) throw new AppError("forbidden", 403);
  const [root, a, b, c] = parts;
  if (root === "courses" && b === "materials" && a && c) {
    const { data } = await supabase.from("materials").select("id,course_id,object_key").eq("id", c).maybeSingle();
    if (!data || data.course_id !== a || !user.isTeacher) throw new AppError("forbidden", 403);
    return { kind: "material" as const, materialId: c, courseId: a };
  }
  if (root === "courses" && b === "covers" && a) {
    const { data } = await supabase.from("teacher_assignments").select("course_id").eq("course_id", a).eq("teacher_id", user.id).maybeSingle();
    if (!data && !user.isAdmin) throw new AppError("forbidden", 403);
    return { kind: "course_cover" as const, courseId: a };
  }
  if (root === "submissions" && a && b) {
    if (b !== user.id) throw new AppError("forbidden", 403);
    const { data } = await supabase.from("submissions").select("id,status").eq("activity_id", a).eq("student_id", user.id).maybeSingle();
    if (!data || data.status === "graded") throw new AppError("forbidden", 403);
    return { kind: "submission_file" as const, submissionId: data.id, activityId: a };
  }
  if (root === "avatars" && a === user.id) return { kind: "avatar" as const };
  throw new AppError("forbidden", 403);
}

/** Respuesta de descarga con soporte de Range (videos/audio). */
export async function streamObject(env: AppEnv, request: Request, key: string, fileName: string, opts: { download?: boolean; mime?: string } = {}) {
  const range = request.headers.get("Range")?.match(/^bytes=(\d*)-(\d*)$/);
  let obj: R2ObjectBody | R2Object | null;
  if (range) {
    const head = await env.FILES.head(key);
    if (!head) throw new AppError("not_found", 404);
    const start = range[1] ? Number(range[1]) : Math.max(0, head.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), head.size - 1) : head.size - 1;
    if (start >= head.size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${head.size}` } });
    obj = await env.FILES.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!obj || !("body" in obj)) throw new AppError("not_found", 404);
    const h = baseHeaders(obj, fileName, opts);
    h.set("Content-Range", `bytes ${start}-${end}/${head.size}`);
    h.set("Content-Length", String(end - start + 1));
    return new Response(obj.body, { status: 206, headers: h });
  }
  obj = await env.FILES.get(key);
  if (!obj || !("body" in obj)) throw new AppError("not_found", 404);
  const h = baseHeaders(obj, fileName, opts);
  h.set("Content-Length", String(obj.size));
  return new Response(obj.body, { headers: h });
}

function baseHeaders(obj: R2Object, fileName: string, opts: { download?: boolean; mime?: string }) {
  const h = new Headers();
  h.set("Content-Type", opts.mime ?? obj.httpMetadata?.contentType ?? "application/octet-stream");
  h.set("Content-Disposition", `${opts.download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  h.set("Accept-Ranges", "bytes");
  h.set("Cache-Control", "private, max-age=300");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("ETag", obj.httpEtag);
  return h;
}
