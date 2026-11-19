import type { AppEnv } from "~/services/env.server";
import { AppError } from "~/utils/errors";

/** Limita solicitudes por clave (IP o usuario) usando el binding de Rate Limiting de Workers. */
export async function rateLimit(env: AppEnv, kind: "auth" | "api", key: string) {
  const limiter = kind === "auth" ? env.AUTH_LIMITER : env.API_LIMITER;
  if (!limiter) return;
  const { success } = await limiter.limit({ key });
  if (!success) throw new AppError("rate_limited", 429);
}

export function clientIp(request: Request) {
  return request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? "local";
}
