import { Form, Link, useActionData, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { Save } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/detail";
import { requireUser } from "~/services/auth.server";
import { courseStudents } from "~/services/courses.server";
import { fail, parseForm } from "~/services/forms.server";
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea, Table, Td, Th } from "~/components/ui";
import { FileUpload } from "~/components/file-upload";
import { LOCALES, LOCALE_LABELS } from "~/services/i18n";
import { optionalDate } from "~/schemas/common";
import { check, must } from "~/utils/errors";
import { fullName } from "~/utils/format";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase } = await requireUser(request, context, { teacher: true });
  const course = must(await supabase.from("courses").select("*").eq("id", params.id).maybeSingle());
  const [students, scales, teachers] = await Promise.all([
    courseStudents(supabase, course.id),
    supabase.from("grade_scales").select("id,name").order("name"),
    supabase.from("teacher_assignments").select("teacher_id").eq("course_id", course.id),
  ]);
  const tIds = (teachers.data ?? []).map((t) => t.teacher_id);
  const { data: tp } = tIds.length ? await supabase.from("profiles").select("id,first_name,last_name").in("id", tIds) : { data: [] };
  return { course, students, scales: scales.data ?? [], teachers: (tp ?? []).map(fullName) };
}

const schema = z.object({
  name: z.string().trim().min(2, "validation.required").max(160),
  description: z.string().trim().max(5000).optional().default(""),
  start_date: optionalDate,
  end_date: optionalDate,
  status: z.enum(["draft", "active", "archived"]),
  grade_scale_id: z.string().uuid(),
  languages: z.array(z.enum(["es", "ht", "fr"])).min(1, "validation.required"),
});

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase } = await requireUser(request, context, { teacher: true });
  const p = parseForm(await request.formData(), schema);
  if (!p.success) return fail(p.fieldErrors);
  if (p.data.start_date && p.data.end_date && p.data.end_date < p.data.start_date) return fail({ end_date: "validation.date_order" });
  check(await supabase.from("courses").update(p.data).eq("id", params.id));
  return { ok: true as const };
}

export default function CourseDetail({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const c = loaderData.course;
  const fe = a && !a.ok ? a.fieldErrors ?? {} : {};
  return (
    <>
      <PageHeader title={c.name} description={`${t("courses.responsible")}: ${loaderData.teachers.join(", ")}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("courses.settings")} />
          <Form method="post" className="grid gap-4 p-5 sm:grid-cols-2">
            {a?.ok && <div className="sm:col-span-2"><Alert tone="green">{t("common.saved")}</Alert></div>}
            <Field label={t("courses.name")} htmlFor="name" error={fe.name && t(fe.name)} className="sm:col-span-2"><Input id="name" name="name" defaultValue={c.name} required /></Field>
            <Field label={t("common.description")} htmlFor="desc" className="sm:col-span-2"><Textarea id="desc" name="description" defaultValue={c.description} /></Field>
            <Field label={t("courses.start_date")} htmlFor="sd"><Input id="sd" name="start_date" type="date" defaultValue={c.start_date ?? ""} /></Field>
            <Field label={t("courses.end_date")} htmlFor="ed" error={fe.end_date && t(fe.end_date)}><Input id="ed" name="end_date" type="date" defaultValue={c.end_date ?? ""} /></Field>
            <Field label={t("common.status")} htmlFor="st"><Select id="st" name="status" defaultValue={c.status}>
              {(["draft", "active", "archived"] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Field>
            <Field label={t("grades.scale")} htmlFor="gs"><Select id="gs" name="grade_scale_id" defaultValue={c.grade_scale_id ?? ""}>
              {loaderData.scales.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-sm font-medium">{t("courses.languages")}</legend>
              <div className="flex gap-4">{LOCALES.map((l) => (
                <label key={l} className="flex items-center gap-2 text-sm"><input type="checkbox" name="languages[]" value={l} defaultChecked={c.languages.includes(l)} />{LOCALE_LABELS[l]}</label>
              ))}</div>
              {fe.languages && <p className="text-xs text-red-600">{t(fe.languages)}</p>}
            </fieldset>
            <div><Button type="submit" loading={nav.state === "submitting"}><Save className="h-4 w-4" />{t("common.save")}</Button></div>
          </Form>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("courses.cover")} />
            <div className="space-y-3 p-5">
              {c.cover_key && <img src={`/files/cover/${c.id}`} alt="" className="h-32 w-full rounded-lg object-cover" />}
              <FileUpload purpose="course_cover" courseId={c.id} accept="image/png,image/jpeg" label={t("courses.upload_cover")} />
            </div>
          </Card>
          <Card>
            <CardHeader title={t("courses.enrolled", { count: loaderData.students.length })} action={<Link to="/app/students" className="text-sm text-brand-600 hover:underline">{t("students.add")}</Link>} />
            <Table className="max-h-96 overflow-y-auto"><thead><tr><Th>{t("students.name")}</Th></tr></thead>
              <tbody>{loaderData.students.map((s) => <tr key={s.id}><Td><Link className="hover:underline" to={`/app/students/${s.id}`}>{fullName(s)}</Link></Td></tr>)}</tbody></Table>
          </Card>
        </div>
      </div>
    </>
  );
}
