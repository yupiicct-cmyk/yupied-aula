import { redirect } from "react-router";
import type { Route } from "./+types/change";
import { countryCookie } from "~/countries/registry";
import { getEnv } from "~/services/env.server";
import { INSTITUTION_COOKIE } from "~/services/institutions.server";

/** Olvida la preferencia de país e institución y vuelve al portal internacional. */
export async function loader({ context }: Route.LoaderArgs) {
  const portal = getEnv(context).PORTAL_URL || "/login";
  const headers = new Headers();
  headers.append("Set-Cookie", countryCookie(null));
  headers.append("Set-Cookie", `${INSTITUTION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  throw redirect(`${portal.replace(/\/$/, "")}/?cambiar=1`, { headers });
}
