import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { getSupabase } from "~/services/auth.server";

export async function action({ context }: Route.ActionArgs) {
  await getSupabase(context).auth.signOut();
  throw redirect("/login");
}
export async function loader() {
  throw redirect("/app");
}
