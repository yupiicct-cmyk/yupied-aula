import { data } from "react-router";
import type { z } from "zod";

export type FieldErrors = Record<string, string>;
export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error?: string; fieldErrors?: FieldErrors };

/** Valida FormData con Zod. Los mensajes son claves i18n (`validation.*`). */
export function parseForm<S extends z.ZodType>(fd: FormData, schema: S):
  { success: true; data: z.infer<S> } | { success: false; fieldErrors: FieldErrors } {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      ((obj[key] ??= []) as unknown[]).push(v);
    } else obj[k] = v;
  }
  const r = schema.safeParse(obj);
  if (r.success) return { success: true, data: r.data };
  const fieldErrors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message.startsWith("validation.") ? issue.message : "validation.invalid";
  }
  return { success: false, fieldErrors };
}

export function fail(fieldErrors: FieldErrors, status = 400) {
  return data<ActionResult>({ ok: false, fieldErrors }, { status });
}
export function failCode(error: string, status = 400) {
  return data<ActionResult>({ ok: false, error }, { status });
}
export function ok(message = "saved", extra: { id?: string } = {}) {
  return data<ActionResult>({ ok: true, message, ...extra });
}
