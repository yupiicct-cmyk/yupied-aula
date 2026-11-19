import { useEffect, useState } from "react";
import { Form, Link, useActionData, useNavigation, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { FileUp, Search, UserPlus, Users } from "lucide-react";
import type { Route } from "./+types/list";
import { requireUser } from "~/services/auth.server";
import { courseStudents, requireCourse } from "~/services/courses.server";
import { getEnv } from "~/services/env.server";
import { createStudent, tempPassword } from "~/services/students.server";
import { studentSchema } from "~/schemas/students";
import { fail, failCode, parseForm, type ActionResult } from "~/services/forms.server";
import { Alert, Avatar, Button, ButtonLink, Card, EmptyState, Field, Input, PageHeader, Progress, Select, Table, Td, Th } from "~/components/ui";
import { StatusBadge } from "~/components/status-badge";
import { LOCALES, LOCALE_LABELS } from "~/services/i18n";
import { fmtNumber, fullName, initials } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { toAppError } from "~/utils/errors";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = await requireUser(request, context, { teacher: true });
  const { course } = await requireCourse(request, supabase);
  const q = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase().trim();
  const [students, progress] = await Promise.all([
    courseStudents(supabase, course.id),
    supabase.from("student_progress").select("student_id,lessons_total,lessons_completed,activities_total,activities_done,grade_avg,attendance_pct").eq("course_id", course.id),
  ]);
  const pmap = new Map((progress.data ?? []).map((p) => [p.student_id, p]));
  const rows = students
    .filter((s) => !q || `${s.first_name} ${s.last_name} ${s.email} ${s.internal_code ?? ""}`.toLowerCase().includes(q))
    .map((s) => {
      const p = pmap.get(s.id);
      const total = (p?.lessons_total ?? 0) + (p?.activities_total ?? 0);
      return { ...s, progress: total ? (100 * ((p?.lessons_completed ?? 0) + (p?.activities_done ?? 0))) / total : 0, grade: p?.grade_avg ?? null, attendance: p?.attendance_pct ?? null };
    });
  return { course: { id: course.id, name: course.name }, rows, suggested: tempPassword() };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const { course } = await requireCourse(request, supabase);
  const fd = await request.formData();
  const parsed = parseForm(fd, studentSchema);
  if (!parsed.success) return fail(parsed.fieldErrors);
  try {
    const r = await createStudent(getEnv(context), supabase, user.id, course.id, parsed.data, new URL(request.url).origin);
    return { ok: true, message: r.existed ? "students.enrolled_existing" : "students.created", id: r.id,
      password: parsed.data.access_mode === "password" && !r.existed ? parsed.data.temp_password : null,
      email: parsed.data.email } as ActionResult & { password: string | null; email: string };
  } catch (e) {
    const err = toAppError(e);
    return failCode(err.code, err.status);
  }
}

export default function Students({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [params] = useSearchParams();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"password" | "invite">("password");
  const fe = a && !a.ok ? a.fieldErrors ?? {} : {};
  useEffect(() => { if (a && a.ok) setOpen(false); }, [a]);

  return (
    <>
      <PageHeader title={t("students.title")} description={t("students.count", { count: loaderData.rows.length, course: loaderData.course.name })}
        actions={<>
          <ButtonLink to="/app/students/import" variant="outline"><FileUp className="h-4 w-4" />{t("students.import")}</ButtonLink>
          <Button onClick={() => setOpen((o) => !o)}><UserPlus className="h-4 w-4" />{t("students.add")}</Button>
        </>} />

      {a && a.ok && "message" in a && (
        <div className="mb-4"><Alert tone="green">
          {t(a.message ?? "common.saved")}
          {"password" in a && a.password && <> — {t("students.temp_password_is", { email: a.email })} <code className="rounded bg-white px-2 py-0.5 font-mono text-base font-bold text-navy-900">{a.password}</code></>}
        </Alert></div>
      )}
      {a && !a.ok && a.error && <div className="mb-4"><Alert>{t(`errors.${a.error}`)}</Alert></div>}

      {open && (
        <Card className="mb-6 p-5">
          <Form method="post" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("students.first_name")} htmlFor="first_name" error={fe.first_name && t(fe.first_name)}><Input id="first_name" name="first_name" required /></Field>
            <Field label={t("students.last_name")} htmlFor="last_name" error={fe.last_name && t(fe.last_name)}><Input id="last_name" name="last_name" required /></Field>
            <Field label={t("auth.email")} htmlFor="email" error={fe.email && t(fe.email)}><Input id="email" name="email" type="email" required /></Field>
            <Field label={t("students.internal_code")} htmlFor="internal_code"><Input id="internal_code" name="internal_code" /></Field>
            <Field label={t("students.joined_on")} htmlFor="joined_on"><Input id="joined_on" name="joined_on" type="date" /></Field>
            <Field label={t("common.language")} htmlFor="locale">
              <Select id="locale" name="locale" defaultValue="es">{LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}</Select>
            </Field>
            <Field label={t("students.access_mode")} htmlFor="access_mode" className="sm:col-span-2 lg:col-span-1">
              <Select id="access_mode" name="access_mode" value={mode} onChange={(e) => setMode(e.target.value as "password" | "invite")}>
                <option value="password">{t("students.mode_password")}</option>
                <option value="invite">{t("students.mode_invite")}</option>
              </Select>
            </Field>
            {mode === "password" && (
              <Field label={t("students.temp_password")} htmlFor="temp_password" error={fe.temp_password && t(fe.temp_password)} hint={t("students.temp_password_hint")}>
                <Input id="temp_password" name="temp_password" defaultValue={loaderData.suggested} className="font-mono" />
              </Field>
            )}
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" loading={nav.state === "submitting"}>{t("common.save")}</Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            </div>
          </Form>
        </Card>
      )}

      <Card>
        <Form method="get" className="flex gap-2 border-b border-slate-100 p-4 dark:border-white/10">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input name="q" defaultValue={params.get("q") ?? ""} placeholder={t("students.search")} className="pl-9" aria-label={t("students.search")} />
          </div>
          <Button type="submit" variant="outline">{t("common.search")}</Button>
        </Form>
        {loaderData.rows.length === 0 ? (
          <EmptyState icon={<Users />} title={t("students.empty")} description={t("students.empty_hint")} />
        ) : (
          <Table>
            <thead><tr><Th>{t("students.name")}</Th><Th>{t("students.internal_code")}</Th><Th>{t("common.status")}</Th><Th>{t("dashboard.my_progress")}</Th><Th>{t("grades.average")}</Th><Th>{t("attendance.title")}</Th></tr></thead>
            <tbody>
              {loaderData.rows.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                  <Td><Link to={`/app/students/${s.id}`} className="flex items-center gap-3"><Avatar name={initials(s)} size={32} />
                    <span><span className="block font-medium text-navy-900 dark:text-white">{fullName(s)}</span><span className="text-xs text-slate-500">{s.email}</span></span></Link></Td>
                  <Td>{s.internal_code ?? "—"}</Td>
                  <Td><StatusBadge status={s.status} /></Td>
                  <Td className="w-40"><Progress value={s.progress} /></Td>
                  <Td>{fmtNumber(s.grade, locale)}</Td>
                  <Td>{s.attendance === null ? "—" : `${fmtNumber(s.attendance, locale)} %`}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
