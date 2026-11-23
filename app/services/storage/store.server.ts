import type { AppEnv } from "~/services/env.server";
import { AppError } from "~/utils/errors";

/**
 * Almacenamiento de archivos intercambiable:
 *  - R2 si el Worker tiene el binding FILES;
 *  - si no, Supabase Storage (bucket privado), accedido solo desde el Worker con la clave secreta.
 * Los permisos se verifican antes (RLS + authorizeKey); el navegador nunca habla con el almacenamiento.
 */
export interface StoredHead { size: number; contentType: string; etag: string }
export interface StoredObject extends StoredHead { body: ReadableStream | null; status: 200 | 206; contentRange?: string; length: number }

export interface FileStore {
  kind: "r2" | "supabase";
  put(key: string, body: ReadableStream | ArrayBuffer, contentType: string, size?: number): Promise<void>;
  head(key: string): Promise<StoredHead | null>;
  get(key: string, range?: string | null): Promise<StoredObject | null | "unsatisfiable">;
  delete(key: string): Promise<void>;
}

export const SUPABASE_BUCKET = "yupied-files";

export function getStore(env: AppEnv): FileStore {
  return env.FILES ? r2Store(env.FILES) : supabaseStore(env);
}

function r2Store(b: R2Bucket): FileStore {
  return {
    kind: "r2",
    async put(key, body, contentType) { await b.put(key, body, { httpMetadata: { contentType } }); },
    async head(key) {
      const h = await b.head(key);
      return h ? { size: h.size, contentType: h.httpMetadata?.contentType ?? "application/octet-stream", etag: h.httpEtag } : null;
    },
    async get(key, rangeHeader) {
      const range = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
      if (range) {
        const head = await b.head(key);
        if (!head) return null;
        const start = range[1] ? Number(range[1]) : Math.max(0, head.size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), head.size - 1) : head.size - 1;
        if (start >= head.size || start > end) return "unsatisfiable";
        const o = await b.get(key, { range: { offset: start, length: end - start + 1 } });
        if (!o || !("body" in o)) return null;
        return { body: o.body, size: head.size, length: end - start + 1, status: 206, contentRange: `bytes ${start}-${end}/${head.size}`,
          contentType: o.httpMetadata?.contentType ?? "application/octet-stream", etag: o.httpEtag };
      }
      const o = await b.get(key);
      if (!o || !("body" in o)) return null;
      return { body: o.body, size: o.size, length: o.size, status: 200, contentType: o.httpMetadata?.contentType ?? "application/octet-stream", etag: o.httpEtag };
    },
    async delete(key) { await b.delete(key); },
  };
}

function supabaseStore(env: AppEnv): FileStore {
  const secret = env.SUPABASE_SECRET_KEY;
  const base = `${env.SUPABASE_URL}/storage/v1/object`;
  const path = (key: string) => `${SUPABASE_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const auth = () => {
    if (!secret) throw new AppError("config_missing", 500, "SUPABASE_SECRET_KEY");
    return { apikey: secret, Authorization: `Bearer ${secret}` };
  };
  return {
    kind: "supabase",
    async put(key, body, contentType, size) {
      const headers: Record<string, string> = { ...auth(), "Content-Type": contentType, "x-upsert": "true" };
      if (size) headers["Content-Length"] = String(size);
      const r = await fetch(`${base}/${path(key)}`, { method: "POST", headers, body });
      if (!r.ok) throw new AppError(r.status === 413 ? "file_too_large" : "upload_failed", r.status === 413 ? 413 : 502, await r.text().catch(() => ""));
    },
    async head(key) {
      const r = await fetch(`${base}/info/${path(key)}`, { headers: auth() });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new AppError("upload_failed", 502);
      const j = (await r.json()) as { size?: number; content_type?: string; contentType?: string; etag?: string; metadata?: { size?: number; mimetype?: string; eTag?: string } };
      return {
        size: Number(j.size ?? j.metadata?.size ?? 0),
        contentType: j.content_type ?? j.contentType ?? j.metadata?.mimetype ?? "application/octet-stream",
        etag: j.etag ?? j.metadata?.eTag ?? "",
      };
    },
    async get(key, range) {
      const headers: Record<string, string> = auth();
      if (range) headers.Range = range;
      const r = await fetch(`${base}/authenticated/${path(key)}`, { headers });
      if (r.status === 416) return "unsatisfiable";
      if (r.status === 404 || r.status === 400) { await r.body?.cancel(); return null; }
      if (!r.ok) { await r.body?.cancel(); throw new AppError("not_found", 404); }
      const length = Number(r.headers.get("Content-Length") ?? "0");
      const cr = r.headers.get("Content-Range") ?? undefined;
      const total = cr ? Number(cr.split("/")[1]) : length;
      return { body: r.body, status: r.status === 206 ? 206 : 200, contentRange: cr, length, size: total,
        contentType: r.headers.get("Content-Type") ?? "application/octet-stream", etag: r.headers.get("ETag") ?? "" };
    },
    async delete(key) {
      const r = await fetch(`${base}/${SUPABASE_BUCKET}`, { method: "DELETE", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [key] }) });
      if (!r.ok && r.status !== 404) console.error("[storage] delete failed", r.status);
    },
  };
}
