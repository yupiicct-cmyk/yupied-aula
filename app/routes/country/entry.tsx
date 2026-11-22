import { redirect } from "react-router";
import type { Route } from "./+types/entry";
import { countryBySlug, countryCookie } from "~/countries/registry";
import { getOptionalUser } from "~/services/auth.server";
import { AppError } from "~/utils/errors";

/**
 * /chile, /haiti, /chile/app, /haiti/app: guarda la elección explícita de país
 * (cookie de preferencia, no de autorización) y lleva al acceso o a la app.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const [slug, sub] = url.pathname.split("/").filter(Boolean);
  const country = countryBySlug(slug);
  if (!country) throw new AppError("not_found", 404);
  const user = await getOptionalUser(context);
  const target = user ? "/app" : `/${country.slug}/login${sub === "app" ? `?next=${encodeURIComponent("/app")}` : ""}`;
  throw redirect(target, { headers: { "Set-Cookie": countryCookie(country.slug) } });
}
