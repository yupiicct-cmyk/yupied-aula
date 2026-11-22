import { useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { Building2, Plus } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/index";
import { requireUser } from "~/services/auth.server";
import { getMyInstitutions, managesRoles } from "~/services/institutions.server";
import { fail, failCode, parseForm } from "~/services/forms.server";
import { COUNTRIES, countryByCode } from "~/countries/registry";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Table, Td, Th } from "~/components/ui";
import { AppError, must, toAppError } from "~/utils/errors";
import { useLocale } from "~/hooks/use-locale";

export const meta: Route.MetaFunction = () => [{ title: "Admin · YupiEd" }];

async function adminScope(request: Request, context: Route.LoaderArgs["context"]) {
  const { user, supabase } = await requireUser(request, context);
  const list = await getMyInstitutions(supabase);
  const { data: ca } = await supabase.from("country_admins").select("country_code").eq("user_id", user.id);
  const creatable = user.isAdmin ? COUNTRIES.map((c) => c.code as string) : (ca ?? []).map((c) => c.country_code as string);
  if (!user.isAdmin && creatable.length === 0 && !list.some((i) => managesRoles(i.roles))) throw new AppError("forbidden", 403);
  return { user, supabase, list, creatable };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase, creatable } = await adminScope(request, context);
  const [countries, institutions] = await Promise.all([
    supabase.from("countries").select("code,active").order("code"),
    supabase.from("institutions").select("id,name,short_name,country_code,status,levels,official_code").order("country_code").order("name"),
  ]);
  if (institutions.error) throw toAppError(institutions.error);
  return {
    isSuperadmin: user.isAdmin,
    creatable,
    countries: (countries.data ?? []).map((c) => ({ code: c.code as string, active: c.active })),
    institutions: institutions.data ?? [],
  };
}

const createSchema = z.object({
  intent: z.literal("create"),
  country_code: z.string().length(2),
  name: z.string().trim().min(2, "validation.required").max(200, "validation.too_long"),
  short_name: z.string().trim().max(60).optional().default(""),
  legal_id: z.string().trim().max(20).optional().default(""),
  official_code: z.string().trim().max(30).optional().default(""),
  levels: z.array(z.string()).optional().default([]),
  period: z.string().optional().default(""),
});

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase, creatable } = await adminScope(request, context);
  const fd = await request.formData();
  if (fd.get("intent") === "country") {
    if (!user.isAdmin) return failCode("forbidden", 403);
    const code = String(fd.get("code") ?? "");
    const { error } = await supabase.from("countries").update({ active: fd.get("active") === "1" }).eq("code", code);
    if (error) throw toAppError(error);
    return { ok: true as const };
  }
  const p = parseForm(fd, createSchema);
  if (!p.success) return fail(p.fieldErrors);
  const country = countryByCode(p.data.country_code);
  if (!country || !creatable.includes(country.code)) return failCode("forbidden", 403);
  const levels = p.data.levels.filter((l) => country.academic.levels.some((x) => x.key === l));
  if (p.data.legal_id && country.nationalId.kind === "rut" && !country.nationalId.validate(p.data.legal_id)) return fail({ legal_id: "validation.invalid_rut" });
  const period = country.academic.periods.find((x) => x.key === p.data.period)?.key ?? country.academic.periods[0]!.key;
  const inst = must(await supabase.from("institutions").insert({
    country_code: country.code, name: p.data.name, short_name: p.data.short_name,
    legal_id: p.data.legal_id ? country.nationalId.normalize(p.data.legal_id) : null,
    official_code: p.data.official_code || null, levels,
    settings: { period, min_attendance_pct: country.academic.minAttendancePct },
  }).select("id").single());
  throw redirect(`/app/admin/institutions/${inst.id}`);
}

export default function AdminHome({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(loaderData.creatable[0] ?? "");
  const country = countryByCode(code);
  const fe = a && "fieldErrors" in a ? a.fieldErrors ?? {} : {};
  const err = a && "error" in a ? a.error : null;

  return (
    <>
      <PageHeader title={t("admin.title")} description={t("admin.intro")}
        actions={loaderData.creatable.length > 0 && <Button onClick={() => setOpen((o) => !o)}><Plus className="h-4 w-4" />{t("admin.new_institution")}</Button>} />
      {err && <div className="mb-4"><Alert>{t(`errors.${err}`, { defaultValue: t("errors.unexpected") })}</Alert></div>}

      {open && country && (
        <Card className="mb-6 p-5">
          <Form method="post" className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="intent" value="create" />
            <Field label={t("admin.country")} htmlFor="cc">
              <Select id="cc" name="country_code" value={code} onChange={(e) => setCode(e.target.value)}>
                {loaderData.creatable.map((c) => <option key={c} value={c}>{countryByCode(c)?.name[locale] ?? c}</option>)}
              </Select>
            </Field>
            <Field label={t("admin.institution_name")} htmlFor="in" error={fe.name && t(fe.name)}><Input id="in" name="name" required /></Field>
            <Field label={t("admin.short_name")} htmlFor="sn"><Input id="sn" name="short_name" /></Field>
            {country.nationalId.kind === "rut" && (
              <Field label={t("admin.legal_id_rut")} htmlFor="li" error={fe.legal_id && t(fe.legal_id)} hint="76.086.428-5"><Input id="li" name="legal_id" /></Field>
            )}
            <Field label={country.code === "CL" ? t("admin.rbd") : t("admin.official_code")} htmlFor="oc"><Input id="oc" name="official_code" /></Field>
            <Field label={t("admin.period")} htmlFor="pe">
              <Select id="pe" name="period">{country.academic.periods.map((p) => <option key={p.key} value={p.key}>{p.name[locale]}</option>)}</Select>
            </Field>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium">{t("admin.levels")}</legend>
              <div className="flex flex-wrap gap-4">
                {country.academic.levels.map((l) => (
                  <label key={l.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="levels[]" value={l.key} defaultChecked className="h-4 w-4 rounded border-slate-300" /> {l.name[locale]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div><Button type="submit" loading={nav.state === "submitting"}>{t("common.create")}</Button></div>
          </Form>
        </Card>
      )}

      {loaderData.isSuperadmin && (
        <Card className="mb-6">
          <CardHeader title={t("admin.countries")} description={t("admin.countries_hint")} />
          <Table>
            <thead><tr><Th>{t("admin.country")}</Th><Th>{t("admin.timezone")}</Th><Th>{t("admin.currencies")}</Th><Th>{t("admin.languages")}</Th><Th>{t("common.status")}</Th><Th /></tr></thead>
            <tbody>
              {loaderData.countries.map((c) => {
                const cfg = countryByCode(c.code);
                return (
                  <tr key={c.code}>
                    <Td className="font-medium">{cfg?.name[locale] ?? c.code}</Td>
                    <Td>{cfg?.localization.timezone}</Td>
                    <Td>{cfg?.localization.currencies.join(", ")}</Td>
                    <Td>{cfg?.localization.locales.map((l) => l.toUpperCase()).join(" / ")}</Td>
                    <Td><Badge tone={c.active ? "green" : "slate"}>{c.active ? t("admin.active") : t("admin.inactive")}</Badge></Td>
                    <Td>
                      <Form method="post">
                        <input type="hidden" name="intent" value="country" /><input type="hidden" name="code" value={c.code} />
                        <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                        <Button size="sm" variant="outline" type="submit">{c.active ? t("admin.deactivate") : t("admin.activate")}</Button>
                      </Form>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader title={t("admin.institutions")} />
        {loaderData.institutions.length === 0 ? <EmptyState icon={<Building2 />} title={t("admin.no_institutions")} /> : (
          <Table>
            <thead><tr><Th>{t("admin.institution_name")}</Th><Th>{t("admin.country")}</Th><Th>{t("admin.levels")}</Th><Th>{t("common.status")}</Th></tr></thead>
            <tbody>
              {loaderData.institutions.map((i) => {
                const cfg = countryByCode(i.country_code);
                return (
                  <tr key={i.id}>
                    <Td><Link to={`/app/admin/institutions/${i.id}`} className="font-medium text-brand-600 hover:underline">{i.name}</Link></Td>
                    <Td>{cfg?.name[locale] ?? i.country_code}</Td>
                    <Td>{i.levels.map((l) => cfg?.academic.levels.find((x) => x.key === l)?.name[locale] ?? l).join(", ") || "—"}</Td>
                    <Td><Badge tone={i.status === "active" ? "green" : "slate"}>{i.status === "active" ? t("admin.active") : t("admin.inactive")}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
