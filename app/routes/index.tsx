import { redirect } from "react-router";
import type { Route } from "./+types/index";
import { getOptionalUser } from "~/services/auth.server";

export async function loader({ context }: Route.LoaderArgs) {
  const user = await getOptionalUser(context);
  throw redirect(user ? "/app" : "/login");
}
