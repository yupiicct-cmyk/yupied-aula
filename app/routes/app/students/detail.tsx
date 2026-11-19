import { useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { KeyRound, Mail, Power, Save, StickyNote } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/detail";
import { requireUser } from "~/services/auth.server";
import { getCourses } from "~/services/courses.server";
import { getEnv } from "~/services/env.server";
import { detectLocale } from "~/services/i18n";
import { loadStudent360, pendingActivities } from "~/services/student360.server";
import { resetStudentAccess, setLoginBlocked } from "~/services/students.server";
import { fail, failCode, parseForm } from "~/services/forms.server";
import { Student360 } from "~/components/student-360";
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "~/components/ui";
import { localeEnum } from "~/schemas/common";
import { LOCALES, LOCALE_LABELS } from "~/services/i18n";
import { toAppError } from "~/utils/errors";
import { fullName } from "~/utils/format";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const locale = detectLocale(request, user.profile.locale);
  const data = await loadStudent360(supabase, params.id, locale);
  const { courses } = await getCourses(request, supabase);
  const pending = await pendingActivities(supabase, params.id, data.courses.map((c) => c.id));
  return { data: { ...data, pending }, myCourses: courses.map((c) => ({ id: c.id, name: c.name })) };
}

const editSchema = z.object({
  first_name: z.string().trim().min(1, "validation.required").max(120),
  last_name: z.string().trim().min(1, "validation.required").max(120),
  internal_code: z.string().trim().max(40).optional().transform((v) => v || null),
  joined_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date"),
  locale: localeEnum,
});

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const env = getEnv(context);
  const fd = await request.formData();
  const intent = fd.get("intent");
  try {
    if (intent === "update") {
      const p = parseForm(fd, editSchema);
      if (!p.success) return fail(p.fieldErrors);
      const { error, count } = await supabase.from("profiles").update(p.data, { count: "exact" }).eq("id", params.id);
      if (error) throw error;
      if (!count) return failCode("forbidden", 403);
      return { ok: true as const, message: "common.saved" };
    }
    if (intent === "toggle") {
      const status = fd.get("status") === "active" ? "inactive" : "active";
      const { error, count } = await supabase.from("profiles").update({ status }, { count: "exact" }).eq("id", params.id);
      if (error) throw error;
      if (!count) return failCode("forbidden", 403);
      await setLoginBlocked(env, params.id, status === "inactive");
      return { ok: true as const, message: status === "active" ? "students.activated" : "students.deactivated" };
    }
    if (intent === "reset") {
      const mode = fd.get("mode") === "invite" ? "invite" : "password";
      const r = await resetStudentAccess(env, supabase, params.id, mode, new URL(request.url).origin);
      return { ok: true as const, message: mode === "invite" ? "students.reset_sent" : "students.reset_password_done", password: r.password };
    }
    if (intent === "enroll") {
      const course = z.string().uuid().parse(fd.get("course"));
      const { error } = await supabase.from("course_members").upsert({ course_id: course, student_id: params.id, status: "active" });
      if (error) throw error;
      return { ok: true as const, message: "students.enrolled" };
    }
    if (intent === "unenroll") {
      const course = z.string().uuid().parse(fd.get("course"));
      const { error } = await supabase.from("course_members").update({ status: "removed" }).eq("course_id", course).eq("student_id", params.id);
      if (error) throw error;
      return { ok: true as const, message: "students.unenrolled" };
    }
    if (intent === "note") {
      const body = z.string().trim().min(1).max(4000).safeParse(fd.get("body"));
      const course = z.string().uuid().safeParse(fd.get("course"));
      if (!body.success || !course.success) return fail({ body: "validation.required" });
      const { error } = await supabase.from("student_notes").insert({ course_id: course.data, student_id: params.id, author_id: user.id, body: body.data, visible_to_student: fd.get("visible") === "on" });
      if (error) throw error;
      return { ok: true as const, message: "common.saved" };
    }
    return failCode("invalid_data");
  } catch (e) {
    const err = toAppError(e);
    return failCode(err.code, err.status);
  }
}

export default function StudentDetail({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const [tab, setTab] = useState<"view" | "edit">("view");
  const { data, myCourses } = loaderData;
  const p = data.profile;
  const enrolled = new Set(data.courses.filter((c) => c.status === "active").map((c) => c.id));
  const fe = a && !a.ok && "fieldErrors" in a ? a.fieldErrors ?? {} : {};
  const busy = nav.state === "submitting";

  return (
    <>
      <PageHeader title={fullName(p)} description={t("students.profile_360")}
        actions={<>
          <Button variant={tab === "view" ? "secondary" : "outline"} onClick={() => setTab("view")}>{t("students.profile_360")}</Button>
          <Button variant={tab === "edit" ? "secondary" : "outline"} onClick={() => setTab("edit")}>{t("students.manage")}</Button>
        </>} />
      {a && a.ok && <div className="mb-4"><Alert tone="green">{t(a.message ?? "common.saved")}{"password" in a && a.password && <> — <code className="rounded bg-white px-2 py-0.5 font-mono text-base font-bold text-navy-900">{a.password}</code></>}</Alert></div>}
      {a && !a.ok && "error" in a && a.error && <div className="mb-4"><Alert>{t(`errors.${a.error}`)}</Alert></div>}

      {tab === "view" ? <Student360 data={data} teacherView /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title={t("students.edit_info")} />
            <Form method="post" className="grid gap-4 p-5 sm:grid-cols-2">
              <input type="hidden" name="intent" value="update" />
              <Field label={t("students.first_name")} htmlFor="fn" error={fe.first_name && t(fe.first_name)}><Input id="fn" name="first_name" defaultValue={p.first_name} required /></Field>
              <Field label={t("students.last_name")} htmlFor="ln" error={fe.last_name && t(fe.last_name)}><Input id="ln" name="last_name" defaultValue={p.last_name} required /></Field>
              <Field label={t("students.internal_code")} htmlFor="ic"><Input id="ic" name="internal_code" defaultValue={p.internal_code ?? ""} /></Field>
              <Field label={t("students.joined_on")} htmlFor="jo"><Input id="jo" name="joined_on" type="date" defaultValue={p.joined_on} /></Field>
              <Field label={t("common.language")} htmlFor="lc"><Select id="lc" name="locale" defaultValue={p.locale}>{LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}</Select></Field>
              <Field label={t("auth.email")} htmlFor="em" hint={t("students.email_locked")}><Input id="em" value={p.email} disabled readOnly /></Field>
              <div className="sm:col-span-2"><Button type="submit" loading={busy}><Save className="h-4 w-4" />{t("common.save")}</Button></div>
            </Form>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title={t("students.access")} />
              <div className="flex flex-wrap gap-2 p-5">
                <Form method="post"><input type="hidden" name="intent" value="reset" /><input type="hidden" name="mode" value="password" />
                  <Button type="submit" variant="outline" loading={busy}><KeyRound className="h-4 w-4" />{t("students.new_temp_password")}</Button></Form>
                <Form method="post"><input type="hidden" name="intent" value="reset" /><input type="hidden" name="mode" value="invite" />
                  <Button type="submit" variant="outline" loading={busy}><Mail className="h-4 w-4" />{t("students.send_reset_email")}</Button></Form>
                <Form method="post" onSubmit={(e) => { if (!confirm(t("common.are_you_sure"))) e.preventDefault(); }}>
                  <input type="hidden" name="intent" value="toggle" /><input type="hidden" name="status" value={p.status} />
                  <Button type="submit" variant={p.status === "active" ? "danger" : "primary"} loading={busy}><Power className="h-4 w-4" />{p.status === "active" ? t("students.deactivate") : t("students.activate")}</Button>
                </Form>
              </div>
            </Card>
            <Card>
              <CardHeader title={t("students.assign_courses")} />
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {myCourses.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span>{c.name}</span>
                    <Form method="post"><input type="hidden" name="course" value={c.id} />
                      {enrolled.has(c.id)
                        ? <Button name="intent" value="unenroll" size="sm" variant="ghost">{t("students.unenroll")}</Button>
                        : <Button name="intent" value="enroll" size="sm" variant="outline">{t("students.enroll")}</Button>}
                    </Form>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title={t("students.360.add_note")} />
              <Form method="post" className="space-y-3 p-5">
                <input type="hidden" name="intent" value="note" />
                <Select name="course" aria-label={t("nav.courses")} defaultValue={data.courses[0]?.id}>{data.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                <Textarea name="body" required maxLength={4000} aria-label={t("students.360.notes")} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible" /> {t("students.360.visible_to_student")}</label>
                <Button type="submit" loading={busy} disabled={data.courses.length === 0}><StickyNote className="h-4 w-4" />{t("common.save")}</Button>
              </Form>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
