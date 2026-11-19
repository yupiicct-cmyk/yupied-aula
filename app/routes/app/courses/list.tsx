import { useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { GraduationCap, Plus } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/list";
import { requireUser } from "~/services/auth.server";
import { COURSE_COOKIE } from "~/services/courses.server";
import { fail, parseForm } from "~/services/forms.server";
import { Button, Card, EmptyState, Field, Input, PageHeader, Textarea } from "~/components/ui";
import { StatusBadge } from "~/components/status-badge";
import { optionalDate } from "~/schemas/common";
import { fmtDate } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { must } from "~/utils/errors";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const { data } = await supabase.from("courses").select("id,name,description,status,start_date,end_date,cover_key,languages").is("deleted_at", null).order("created_at");
  const ids = (data ?? []).map((c) => c.id);
  const { data: members } = user.isTeacher && ids.length
    ? await supabase.from("course_members").select("course_id").in("course_id", ids).eq("status", "active") : { data: [] };
  const counts = new Map<string, number>();
  for (const m of members ?? []) counts.set(m.course_id, (counts.get(m.course_id) ?? 0) + 1);
  return { isTeacher: user.isTeacher, courses: (data ?? []).map((c) => ({ ...c, students: counts.get(c.id) ?? 0 })) };
}

const schema = z.object({
  name: z.string().trim().min(2, "validation.required").max(160, "validation.too_long"),
  description: z.string().trim().max(5000).optional().default(""),
  start_date: optionalDate,
  end_date: optionalDate,
});

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const p = parseForm(await request.formData(), schema);
  if (!p.success) return fail(p.fieldErrors);
  const course = must(await supabase.from("courses").insert({ ...p.data, owner_teacher_id: user.id, status: "active" }).select("id").single());
  throw redirect(`/app/courses/${course.id}`, { headers: { "Set-Cookie": `${COURSE_COOKIE}=${course.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` } });
}

export default function Courses({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const [open, setOpen] = useState(false);
  const fe = a && !a.ok ? a.fieldErrors ?? {} : {};
  return (
    <>
      <PageHeader title={loaderData.isTeacher ? t("nav.courses") : t("nav.my_courses")}
        actions={loaderData.isTeacher && <Button onClick={() => setOpen((o) => !o)}><Plus className="h-4 w-4" />{t("courses.create")}</Button>} />
      {open && (
        <Card className="mb-6 p-5">
          <Form method="post" className="grid gap-4 sm:grid-cols-2">
            <Field label={t("courses.name")} htmlFor="name" error={fe.name && t(fe.name)} className="sm:col-span-2"><Input id="name" name="name" required /></Field>
            <Field label={t("common.description")} htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" /></Field>
            <Field label={t("courses.start_date")} htmlFor="sd"><Input id="sd" name="start_date" type="date" /></Field>
            <Field label={t("courses.end_date")} htmlFor="ed"><Input id="ed" name="end_date" type="date" /></Field>
            <div><Button type="submit" loading={nav.state === "submitting"}>{t("common.create")}</Button></div>
          </Form>
        </Card>
      )}
      {loaderData.courses.length === 0 ? (
        <Card><EmptyState icon={<GraduationCap />} title={loaderData.isTeacher ? t("dashboard.no_course") : t("dashboard.no_enrollment")} /></Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {loaderData.courses.map((c) => (
            <Link key={c.id} to={loaderData.isTeacher ? `/app/courses/${c.id}` : `/app/modules?course=${c.id}`} className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="h-32 bg-navy-900 bg-cover bg-center bg-[radial-gradient(ellipse_at_top_right,rgba(8,120,255,0.5),transparent_60%)]"
                style={c.cover_key ? { backgroundImage: `url(/files/cover/${c.id})` } : undefined} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2"><h2 className="font-semibold text-navy-900 group-hover:text-brand-600 dark:text-white">{c.name}</h2><StatusBadge status={c.status} /></div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{c.description}</p>
                <p className="mt-3 text-xs text-slate-500">{fmtDate(c.start_date, locale)} – {fmtDate(c.end_date, locale)}
                  {loaderData.isTeacher && <> · {t("students.count_short", { count: c.students })}</>} · {c.languages.map((l) => l.toUpperCase()).join(" / ")}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
