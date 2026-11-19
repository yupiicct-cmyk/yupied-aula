import type { Route } from "./+types/progress";
import { useTranslation } from "react-i18next";
import { requireUser } from "~/services/auth.server";
import { detectLocale } from "~/services/i18n";
import { loadStudent360, pendingActivities } from "~/services/student360.server";
import { Student360 } from "~/components/student-360";
import { PageHeader } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context, { student: true });
  const data = await loadStudent360(supabase, user.id, detectLocale(request, user.profile.locale));
  const pending = await pendingActivities(supabase, user.id, data.courses.map((c) => c.id));
  return { data: { ...data, pending } };
}

export default function MyProgress({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (<><PageHeader title={t("nav.my_progress")} /><Student360 data={loaderData.data} teacherView={false} /></>);
}
