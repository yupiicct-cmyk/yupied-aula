import { Form, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Bell, CheckCheck } from "lucide-react";
import type { Route } from "./+types/notifications";
import { requireUser } from "~/services/auth.server";
import { Button, Card, EmptyState, PageHeader } from "~/components/ui";
import { fmtDate } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check } from "~/utils/errors";
import { cn } from "~/utils/cn";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = await requireUser(request, context);
  const { data } = await supabase.from("notifications").select("*").order("visible_at", { ascending: false }).limit(100);
  return { items: data ?? [] };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase } = await requireUser(request, context);
  check(await supabase.rpc("mark_notifications_read", {}));
  return { ok: true };
}

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <>
      <PageHeader title={t("nav.notifications")} actions={<Form method="post"><Button variant="outline"><CheckCheck className="h-4 w-4" />{t("notifications.mark_all")}</Button></Form>} />
      <Card>
        {loaderData.items.length === 0 ? <EmptyState icon={<Bell />} title={t("notifications.none")} /> : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">{loaderData.items.map((n) => (
            <li key={n.id}><Link to={n.link ?? "/app"} className={cn("flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/5", !n.read_at && "bg-brand-50/60 dark:bg-brand-500/10")}>
              {!n.read_at && <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden />}
              <span className="flex-1 text-sm">{t(`notifications.kinds.${n.kind}`, { defaultValue: n.kind })}{typeof n.payload === "object" && n.payload && "title" in n.payload && n.payload.title ? `: ${String(n.payload.title)}` : ""}</span>
              <span className="text-xs text-slate-500">{fmtDate(n.visible_at, locale, true)}</span></Link></li>
          ))}</ul>
        )}
      </Card>
    </>
  );
}
