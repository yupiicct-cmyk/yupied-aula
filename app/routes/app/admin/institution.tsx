import { Form, Link, useActionData, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, UserPlus } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/institution";
import { requireUser } from "~/services/auth.server";
import { getEnv } from "~/services/env.server";
import { assignableRoles, INSTITUTION_ROLES, requireManagedInstitution } from "~/services/institutions.server";
import { addMember } from "~/services/members.server";
import { fail, failCode, parseForm } from "~/services/forms.server";
import { countryByCode } from "~/countries/registry";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Table, Td, Th } from "~/components/ui";
import { AppError, must, toAppError } from "~/utils/errors";
import { fullName } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";

export const meta: Route.MetaFunction = () => [{ title: "Admin · YupiEd" }];

const uuid = z.string().uuid();

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase } = await requireUser(request, context);
  if (!uuid.safeParse(params.id).success) throw new AppError("not_found", 404);
  const mine = await requireManagedInstitution(supabase, params.id);
  const inst = must(await supabase.from("institutions").select("*").eq("id", params.id).single());
  const [{ data: members, error }, { data: links }] = await Promise.all([
    supabase.from("institution_members").select("user_id,role,status,created_at").eq("institution_id", params.id).order("role"),
    supabase.from("guardian_links").select("guardian_id,student_id,relationship").eq("institution_id", params.id),
  ]);
  if (error) throw toAppError(error);
  const ids = [...new Set((members ?? []).map((m) => m.user_id))];
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("id,first_name,last_name,email,national_id").in("id", ids)
    : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  return {
    inst,
    roles: assignableRoles(mine.roles) as readonly string[],
    members: (members ?? []).map((m) => ({ ...m, name: fullName(byId.get(m.user_id)), email: byId.get(m.user_id)?.email ?? "", national_id: byId.get(m.user_id)?.national_id ?? null })),
    links: (links ?? []).map((l) => ({ ...l, guardian: fullName(byId.get(l.guardian_id)), student: fullName(byId.get(l.student_id)) })),
  };
}

const updateSchema = z.object({
  intent: z.literal("update"),
  name: z.string().trim().min(2, "validation.required").max(200),
  short_name: z.string().trim().max(60).optional().default(""),
  legal_id: z.string().trim().max(20).optional().default(""),
  official_code: z.string().trim().max(30).optional().default(""),
  levels: z.array(z.string()).optional().default([]),
  period: z.string().optional().default(""),
  min_attendance_pct: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(["active", "inactive"]),
});
const memberSchema = z.object({
  intent: z.literal("add_member"),
  email: z.string().trim().toLowerCase().email("validation.email"),
  first_name: z.string().trim().min(1, "validation.required").max(120),
  last_name: z.string().trim().max(120).optional().default(""),
  role: z.enum(INSTITUTION_ROLES),
  national_id: z.string().trim().max(20).optional().default(""),
  access_mode: z.enum(["invite", "password"]),
});

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase } = await requireUser(request, context);
  if (!uuid.safeParse(params.id).success) throw new AppError("not_found", 404);
  const mine = await requireManagedInstitution(supabase, params.id);
  const country = countryByCode(mine.country_code)!;
  const fd = await request.formData();
  const intent = fd.get("intent");
  try {
    if (intent === "update") {
      const p = parseForm(fd, updateSchema);
      if (!p.success) return fail(p.fieldErrors);
      if (p.data.legal_id && country.nationalId.kind === "rut" && !country.nationalId.validate(p.data.legal_id)) return fail({ legal_id: "validation.invalid_rut" });
      const period = country.academic.periods.find((x) => x.key === p.data.period)?.key ?? country.academic.periods[0]!.key;
      const { error } = await supabase.from("institutions").update({
        name: p.data.name, short_name: p.data.short_name,
        legal_id: p.data.legal_id ? country.nationalId.normalize(p.data.legal_id) : null,
        official_code: p.data.official_code || null,
        levels: p.data.levels.filter((l) => country.academic.levels.some((x) => x.key === l)),
        settings: { period, min_attendance_pct: p.data.min_attendance_pct ?? country.academic.minAttendancePct },
        status: p.data.status,
      }).eq("id", params.id);
      if (error) throw toAppError(error);
      return { ok: true as const, message: "saved" };
    }
    if (intent === "add_member") {
      const p = parseForm(fd, memberSchema);
      if (!p.success) return fail(p.fieldErrors);
      const r = await addMember(getEnv(context), supabase, params.id, p.data, new URL(request.url).origin);
      return { ok: true as const, message: r.existed ? "member_linked" : "member_created", password: r.password, email: p.data.email };
    }
    if (intent === "member_status") {
      const userId = uuid.parse(fd.get("user_id"));
      const role = z.enum(INSTITUTION_ROLES).parse(fd.get("role"));
      const { error } = await supabase.from("institution_members").update({ status: fd.get("status") === "active" ? "active" : "inactive" })
        .eq("institution_id", params.id).eq("user_id", userId).eq("role", role);
      if (error) throw toAppError(error);
      return { ok: true as const, message: "saved" };
    }
    if (intent === "link_guardian" || intent === "unlink_guardian") {
      const guardian = uuid.parse(fd.get("guardian_id"));
      const student = uuid.parse(fd.get("student_id"));
      const q = intent === "link_guardian"
        ? supabase.from("guardian_links").insert({ institution_id: params.id, guardian_id: guardian, student_id: student, relationship: String(fd.get("relationship") ?? "").slice(0, 60) })
        : supabase.from("guardian_links").delete().eq("institution_id", params.id).eq("guardian_id", guardian).eq("student_id", student);
      const { error } = await q;
      if (error) throw toAppError(error);
      return { ok: true as const, message: "saved" };
    }
  } catch (e) {
    if (e instanceof AppError) return failCode(e.code, e.status);
    if (e instanceof z.ZodError) return failCode("invalid_data", 400);
    throw e;
  }
  return failCode("invalid_data", 400);
}

export default function InstitutionAdmin({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const { inst, members, links, roles } = loaderData;
  const country = countryByCode(inst.country_code)!;
  const settings = (inst.settings ?? {}) as { period?: string; min_attendance_pct?: number | null };
  const fe = a && "fieldErrors" in a ? a.fieldErrors ?? {} : {};
  const busy = (i: string) => nav.state !== "idle" && nav.formData?.get("intent") === i;
  const guardians = members.filter((m) => m.role === "guardian" && m.status === "active");
  const students = members.filter((m) => m.role === "student" && m.status === "active");

  return (
    <>
      <Link to="/app/admin" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />{t("admin.title")}</Link>
      <PageHeader title={inst.name} description={`${country.name[locale]} · ${country.localization.timezone} · ${country.localization.currencies.join("/")}`} />
      {a && "error" in a && a.error && <div className="mb-4"><Alert>{t(`errors.${a.error}`, { defaultValue: t("errors.unexpected") })}</Alert></div>}
      {a && a.ok && (
        <div className="mb-4"><Alert tone="green">
          {t(`admin.${"message" in a ? a.message : "saved"}`, { defaultValue: t("common.saved") })}
          {"password" in a && a.password && <> — {t("admin.temp_password_for", { email: a.email })}: <code className="font-mono font-semibold">{a.password}</code></>}
        </Alert></div>
      )}

      <Card className="mb-6">
        <CardHeader title={t("admin.settings")} />
        <Form method="post" className="grid gap-4 p-5 sm:grid-cols-2">
          <input type="hidden" name="intent" value="update" />
          <Field label={t("admin.institution_name")} htmlFor="n" error={fe.name && t(fe.name)}><Input id="n" name="name" defaultValue={inst.name} required /></Field>
          <Field label={t("admin.short_name")} htmlFor="s"><Input id="s" name="short_name" defaultValue={inst.short_name} /></Field>
          {country.nationalId.kind === "rut" && (
            <Field label={t("admin.legal_id_rut")} htmlFor="l" error={fe.legal_id && t(fe.legal_id)}><Input id="l" name="legal_id" defaultValue={inst.legal_id ? country.nationalId.format(inst.legal_id) : ""} /></Field>
          )}
          <Field label={country.code === "CL" ? t("admin.rbd") : t("admin.official_code")} htmlFor="o"><Input id="o" name="official_code" defaultValue={inst.official_code ?? ""} /></Field>
          <Field label={t("admin.period")} htmlFor="p">
            <Select id="p" name="period" defaultValue={settings.period}>{country.academic.periods.map((p) => <option key={p.key} value={p.key}>{p.name[locale]}</option>)}</Select>
          </Field>
          <Field label={t("admin.min_attendance")} htmlFor="ma"><Input id="ma" name="min_attendance_pct" type="number" min={0} max={100} defaultValue={settings.min_attendance_pct ?? ""} /></Field>
          <Field label={t("common.status")} htmlFor="st">
            <Select id="st" name="status" defaultValue={inst.status}><option value="active">{t("admin.active")}</option><option value="inactive">{t("admin.inactive")}</option></Select>
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">{t("admin.levels")}</legend>
            <div className="flex flex-wrap gap-4">
              {country.academic.levels.map((l) => (
                <label key={l.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="levels[]" value={l.key} defaultChecked={inst.levels.includes(l.key)} className="h-4 w-4 rounded border-slate-300" />
                  {l.name[locale]} <span className="text-xs text-slate-400">({l.grades.length})</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div><Button type="submit" loading={busy("update")}>{t("common.save")}</Button></div>
        </Form>
      </Card>

      <Card className="mb-6">
        <CardHeader title={t("admin.add_member")} description={t("admin.add_member_hint")} />
        <Form method="post" className="grid gap-4 p-5 sm:grid-cols-3">
          <input type="hidden" name="intent" value="add_member" />
          <Field label={t("auth.email")} htmlFor="me" error={fe.email && t(fe.email)}><Input id="me" name="email" type="email" required /></Field>
          <Field label={t("students.first_name")} htmlFor="mf" error={fe.first_name && t(fe.first_name)}><Input id="mf" name="first_name" required /></Field>
          <Field label={t("students.last_name")} htmlFor="ml"><Input id="ml" name="last_name" /></Field>
          <Field label={t("admin.role")} htmlFor="mr">
            <Select id="mr" name="role" defaultValue="teacher">{roles.map((r) => <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>)}</Select>
          </Field>
          {country.nationalId.kind === "rut" && (
            <Field label="RUT" htmlFor="mn" hint={t("admin.optional")}><Input id="mn" name="national_id" placeholder="12.345.678-5" /></Field>
          )}
          <Field label={t("admin.access")} htmlFor="ma2">
            <Select id="ma2" name="access_mode" defaultValue="invite"><option value="invite">{t("admin.access_invite")}</option><option value="password">{t("admin.access_password")}</option></Select>
          </Field>
          <div><Button type="submit" loading={busy("add_member")}><UserPlus className="h-4 w-4" />{t("admin.add")}</Button></div>
        </Form>
      </Card>

      <Card className="mb-6">
        <CardHeader title={t("admin.members")} description={t("admin.members_count", { count: members.length })} />
        <Table>
          <thead><tr><Th>{t("admin.name")}</Th><Th>{t("auth.email")}</Th><Th>{t("admin.role")}</Th>{country.nationalId.kind === "rut" && <Th>RUT</Th>}<Th>{t("common.status")}</Th><Th /></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={`${m.user_id}-${m.role}`}>
                <Td className="font-medium">{m.name || "—"}</Td><Td>{m.email}</Td><Td>{t(`admin.roles.${m.role}`)}</Td>
                {country.nationalId.kind === "rut" && <Td>{m.national_id ? country.nationalId.format(m.national_id) : "—"}</Td>}
                <Td><Badge tone={m.status === "active" ? "green" : "slate"}>{m.status === "active" ? t("admin.active") : t("admin.inactive")}</Badge></Td>
                <Td>
                  {(m.role !== "institution_admin" || roles.includes("institution_admin")) && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="member_status" /><input type="hidden" name="user_id" value={m.user_id} />
                      <input type="hidden" name="role" value={m.role} /><input type="hidden" name="status" value={m.status === "active" ? "inactive" : "active"} />
                      <Button size="sm" variant="outline" type="submit">{m.status === "active" ? t("admin.deactivate") : t("admin.activate")}</Button>
                    </Form>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title={t("admin.guardians")} description={t("admin.guardians_hint")} />
        {guardians.length > 0 && students.length > 0 && (
          <Form method="post" className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-4 dark:border-white/10">
            <input type="hidden" name="intent" value="link_guardian" />
            <Field label={t("admin.roles.guardian")} htmlFor="g"><Select id="g" name="guardian_id">{guardians.map((g) => <option key={g.user_id} value={g.user_id}>{g.name || g.email}</option>)}</Select></Field>
            <Field label={t("admin.roles.student")} htmlFor="gs"><Select id="gs" name="student_id">{students.map((g) => <option key={g.user_id} value={g.user_id}>{g.name || g.email}</option>)}</Select></Field>
            <Field label={t("admin.relationship")} htmlFor="gr"><Input id="gr" name="relationship" maxLength={60} /></Field>
            <div className="self-end"><Button type="submit" loading={busy("link_guardian")}>{t("admin.link")}</Button></div>
          </Form>
        )}
        <Table>
          <thead><tr><Th>{t("admin.roles.guardian")}</Th><Th>{t("admin.roles.student")}</Th><Th>{t("admin.relationship")}</Th><Th /></tr></thead>
          <tbody>
            {links.length === 0 && <tr><Td colSpan={4} className="text-slate-500">{t("admin.no_links")}</Td></tr>}
            {links.map((l) => (
              <tr key={`${l.guardian_id}-${l.student_id}`}>
                <Td>{l.guardian}</Td><Td>{l.student}</Td><Td>{l.relationship || "—"}</Td>
                <Td>
                  <Form method="post">
                    <input type="hidden" name="intent" value="unlink_guardian" /><input type="hidden" name="guardian_id" value={l.guardian_id} /><input type="hidden" name="student_id" value={l.student_id} />
                    <Button size="sm" variant="outline" type="submit">{t("admin.unlink")}</Button>
                  </Form>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
