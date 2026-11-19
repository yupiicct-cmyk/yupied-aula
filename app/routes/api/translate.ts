import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/translate";
import { requireUser } from "~/services/auth.server";
import { getEnv } from "~/services/env.server";
import { rateLimit } from "~/services/cloudflare/ratelimit.server";
import { translateTexts, translationAvailable } from "~/services/translate.server";
import { toAppError } from "~/utils/errors";

const schema = z.object({ target: z.enum(["ht", "fr"]), texts: z.array(z.string().max(20000)).max(20) });

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { teacher: true });
  return { available: translationAvailable(getEnv(context)) };
}

/** Devuelve PROPUESTAS de traducción (estado ai_proposed). El profesor decide. */
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  try {
    const { user } = await requireUser(request, context, { teacher: true });
    await rateLimit(env, "api", `translate:${user.id}`);
    const body = schema.parse(await request.json());
    if (!translationAvailable(env)) return data({ ok: false, error: "translation_unavailable" }, { status: 501 });
    return { ok: true, texts: await translateTexts(env, body.texts, body.target) };
  } catch (e) {
    const err = e instanceof Error && e.message === "translation_unavailable" ? { code: e.message, status: 501 } : toAppError(e);
    return data({ ok: false, error: err.code }, { status: err.status });
  }
}
