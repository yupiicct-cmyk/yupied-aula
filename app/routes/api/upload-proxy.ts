import { data } from "react-router";
import type { Route } from "./+types/upload-proxy";
import { requireUser } from "~/services/auth.server";
import { getEnv } from "~/services/env.server";
import { assertFileAllowed, authorizeKey } from "~/services/storage/r2.server";
import { toAppError } from "~/utils/errors";

/**
 * Subida a través del Worker (cuando no hay credenciales S3 de R2 configuradas,
 * p. ej. en desarrollo local). Límite práctico: 100 MB por petición en Workers.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
  if (request.method !== "PUT") return data({ ok: false }, { status: 405 });
  const env = getEnv(context);
  try {
    const { user, supabase } = await requireUser(request, context);
    const key = decodeURIComponent(params.id);
    const target = await authorizeKey(supabase, user, key);
    const mime = request.headers.get("Content-Type") ?? "application/octet-stream";
    const size = Number(request.headers.get("Content-Length") ?? "0");
    assertFileAllowed(env, mime, key.split("/").pop() ?? "", size, target.kind);
    if (!request.body) return data({ ok: false, error: "invalid_data" }, { status: 400 });
    await env.FILES.put(key, request.body, { httpMetadata: { contentType: mime } });
    return { ok: true };
  } catch (e) {
    const err = toAppError(e);
    return data({ ok: false, error: err.code }, { status: err.status });
  }
}
