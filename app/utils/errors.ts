/** Error de aplicación con código traducible (clave i18n `errors.<code>`). */
export class AppError extends Error {
  constructor(public code: string, public status = 400, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const PG_CODES: Record<string, string> = {
  "42501": "forbidden",
  "23505": "duplicate",
  "23503": "in_use",
  "23514": "invalid_data",
  "22001": "too_long",
  "28000": "not_authenticated",
};

/** Traduce errores de PostgREST/Postgres a códigos de la app sin filtrar detalles internos. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err && typeof err === "object" && "code" in err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "P0001" && e.message) return new AppError(e.message, 409);
    if (e.code && PG_CODES[e.code]) return new AppError(PG_CODES[e.code]!, e.code === "42501" ? 403 : 400);
    if (e.code === "PGRST116") return new AppError("not_found", 404);
  }
  console.error("[unexpected]", err);
  return new AppError("unexpected", 500);
}

/** Lanza si una respuesta de supabase-js trae error. */
export function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw toAppError(res.error);
  if (res.data === null || res.data === undefined) throw new AppError("not_found", 404);
  return res.data as NonNullable<T>;
}

export function check(res: { error: unknown }) {
  if (res.error) throw toAppError(res.error);
}
