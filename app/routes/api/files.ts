import { cloudflareContext } from "~/services/context";
import type { Route } from "./+types/files";
import { requireUser } from "~/services/auth.server";
import { getEnv } from "~/services/env.server";
import { streamObject } from "~/services/storage/r2.server";
import { AppError } from "~/utils/errors";

/** Descarga/visualización protegida: los metadatos se leen con RLS antes de tocar R2. */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const env = getEnv(context);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const id = params.id;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new AppError("not_found", 404);

  switch (params.kind) {
    case "material": {
      const { data: m } = await supabase.from("materials").select("id,object_key,original_name,mime_type,status").eq("id", id).maybeSingle();
      if (!m || m.status !== "ready") throw new AppError("not_found", 404);
      if (!request.headers.get("Range") || request.headers.get("Range")?.startsWith("bytes=0-")) {
        context.get(cloudflareContext).ctx.waitUntil(
          Promise.resolve(supabase.from("material_access_logs").insert({ material_id: m.id, user_id: user.id, action: download ? "download" : "view" })).then(() => undefined),
        );
      }
      return streamObject(env, request, m.object_key, m.original_name, { download, mime: m.mime_type });
    }
    case "submission": {
      const { data: f } = await supabase.from("submission_files").select("object_key,original_name,mime_type").eq("id", id).maybeSingle();
      if (!f) throw new AppError("not_found", 404);
      return streamObject(env, request, f.object_key, f.original_name, { download, mime: f.mime_type });
    }
    case "cover": {
      const { data: c } = await supabase.from("courses").select("cover_key").eq("id", id).maybeSingle();
      if (!c?.cover_key) throw new AppError("not_found", 404);
      return streamObject(env, request, c.cover_key, "cover");
    }
    case "avatar": {
      const { data: p } = await supabase.from("profiles").select("avatar_key").eq("id", id).maybeSingle();
      if (!p?.avatar_key) throw new AppError("not_found", 404);
      return streamObject(env, request, p.avatar_key, "avatar");
    }
    default:
      throw new AppError("not_found", 404);
  }
}
