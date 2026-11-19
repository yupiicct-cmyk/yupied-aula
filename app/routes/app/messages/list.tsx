import { Form, Link, redirect } from "react-router";
import { useTranslation } from "react-i18next";
import { MessageSquare, Plus } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/list";
import { requireUser } from "~/services/auth.server";
import { courseStudents, requireCourse } from "~/services/courses.server";
import { failCode } from "~/services/forms.server";
import { Avatar, Button, Card, EmptyState, PageHeader, Select } from "~/components/ui";
import { fmtDate, fullName, initials } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { must, toAppError } from "~/utils/errors";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const { course } = await requireCourse(request, supabase);
  const { data: convs } = await supabase.from("conversations").select("*").order("last_message_at", { ascending: false, nullsFirst: false });
  const others = [...new Set((convs ?? []).map((c) => (c.teacher_id === user.id ? c.student_id : c.teacher_id)))];
  const [{ data: people }, { data: unread }] = await Promise.all([
    others.length ? supabase.from("profiles").select("id,first_name,last_name").in("id", others) : Promise.resolve({ data: [] }),
    supabase.from("messages").select("conversation_id").is("read_at", null).neq("sender_id", user.id),
  ]);
  let contacts: { id: string; name: string }[] = [];
  if (user.isTeacher) contacts = (await courseStudents(supabase, course.id)).map((s) => ({ id: s.id, name: fullName(s) }));
  else {
    const { data: ta } = await supabase.from("teacher_assignments").select("teacher_id").eq("course_id", course.id);
    const tids = (ta ?? []).map((x) => x.teacher_id);
    const { data: tp } = tids.length ? await supabase.from("profiles").select("id,first_name,last_name").in("id", tids) : { data: [] };
    contacts = (tp ?? []).map((p) => ({ id: p.id, name: fullName(p) }));
  }
  return {
    contacts,
    items: (convs ?? []).map((c) => {
      const other = (people ?? []).find((p) => p.id === (c.teacher_id === user.id ? c.student_id : c.teacher_id));
      return { id: c.id, name: fullName(other), initials: initials(other), last: c.last_message_at, unread: (unread ?? []).filter((u) => u.conversation_id === c.id).length };
    }),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context);
  const { course } = await requireCourse(request, supabase);
  try {
    const other = z.string().uuid().parse((await request.formData()).get("contact"));
    const pair = user.isTeacher ? { teacher_id: user.id, student_id: other } : { teacher_id: other, student_id: user.id };
    const { data: existing } = await supabase.from("conversations").select("id").eq("course_id", course.id).eq("teacher_id", pair.teacher_id).eq("student_id", pair.student_id).maybeSingle();
    const id = existing?.id ?? must(await supabase.from("conversations").insert({ course_id: course.id, ...pair }).select("id").single()).id;
    throw redirect(`/app/messages/${id}`);
  } catch (e) {
    if (e instanceof Response) throw e;
    return failCode(toAppError(e).code);
  }
}

export default function Messages({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <>
      <PageHeader title={t("nav.messages")} actions={loaderData.contacts.length > 0 && (
        <Form method="post" className="flex gap-2">
          <Select name="contact" aria-label={t("messages.new")} className="w-56">{loaderData.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Button><Plus className="h-4 w-4" />{t("messages.new")}</Button>
        </Form>
      )} />
      <Card>
        {loaderData.items.length === 0 ? <EmptyState icon={<MessageSquare />} title={t("messages.none")} description={t("messages.private_notice")} /> : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">{loaderData.items.map((c) => (
            <li key={c.id}><Link to={`/app/messages/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/5">
              <Avatar name={c.initials} /><span className="flex-1 font-medium">{c.name}</span>
              {c.unread > 0 && <span className="rounded-full bg-brand-500 px-2 text-xs font-bold text-white">{c.unread}</span>}
              <span className="text-xs text-slate-500">{fmtDate(c.last, locale, true)}</span></Link></li>
          ))}</ul>
        )}
      </Card>
    </>
  );
}
