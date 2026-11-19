import { useState } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, Upload } from "lucide-react";
import type { Route } from "./+types/import";
import { requireUser } from "~/services/auth.server";
import { requireCourse } from "~/services/courses.server";
import { getEnv } from "~/services/env.server";
import { createStudent, tempPassword } from "~/services/students.server";
import { studentSchema } from "~/schemas/students";
import { Alert, Button, Card, CardHeader, PageHeader, Table, Td, Th } from "~/components/ui";
import { parseCsv, normalizeHeader } from "~/utils/csv";
import { toAppError } from "~/utils/errors";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = await requireUser(request, context, { teacher: true });
  const { course } = await requireCourse(request, supabase);
  return { course: { id: course.id, name: course.name } };
}

type Row = { first_name: string; last_name: string; email: string; internal_code?: string; locale?: string };
type Result = { email: string; ok: boolean; code: string; password?: string };

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const { course } = await requireCourse(request, supabase);
  const fd = await request.formData();
  let rows: Row[] = [];
  try { rows = JSON.parse(String(fd.get("rows") ?? "[]")) as Row[]; } catch { return { results: [] as Result[], error: "invalid_file" }; }
  if (!Array.isArray(rows) || rows.length === 0) return { results: [] as Result[], error: "invalid_file" };
  if (rows.length > 200) return { results: [] as Result[], error: "too_many_rows" };
  const env = getEnv(context);
  const origin = new URL(request.url).origin;
  const seen = new Set<string>();
  const results: Result[] = [];
  for (const raw of rows) {
    const pwd = tempPassword();
    const parsed = studentSchema.safeParse({ ...raw, locale: ["es", "ht", "fr"].includes(String(raw.locale)) ? raw.locale : "es", access_mode: "password", temp_password: pwd });
    const email = String(raw.email ?? "").toLowerCase().trim();
    if (!parsed.success) { results.push({ email, ok: false, code: parsed.error.issues[0]?.message ?? "validation.invalid" }); continue; }
    if (seen.has(parsed.data.email)) { results.push({ email, ok: false, code: "errors.duplicate_in_file" }); continue; }
    seen.add(parsed.data.email);
    try {
      const r = await createStudent(env, supabase, user.id, course.id, parsed.data, origin);
      results.push({ email, ok: true, code: r.existed ? "students.enrolled_existing" : "students.created", password: r.existed ? undefined : pwd });
    } catch (e) {
      results.push({ email, ok: false, code: `errors.${toAppError(e).code}` });
    }
  }
  return { results, error: null };
}

const HEADER_MAP: Record<string, keyof Row> = {
  nombre: "first_name", nombres: "first_name", first_name: "first_name", prenom: "first_name", non: "first_name",
  apellido: "last_name", apellidos: "last_name", last_name: "last_name", nom: "last_name", siyati: "last_name",
  correo: "email", email: "email", correo_electronico: "email", imel: "email", courriel: "email",
  codigo: "internal_code", identificador: "internal_code", internal_code: "internal_code", id: "internal_code", kod: "internal_code", code: "internal_code",
  idioma: "locale", locale: "locale", lang: "locale", lang_: "locale", langue: "locale",
};

export default function ImportStudents({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  const [rows, setRows] = useState<Row[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  async function onFile(file: File) {
    setFileError(null);
    try {
      let matrix: string[][];
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const sheet = await readSheet(file);
        matrix = sheet.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))));
      } else {
        matrix = parseCsv(await file.text());
      }
      const [header, ...body] = matrix;
      if (!header) throw new Error("empty");
      const keys = header.map((h) => HEADER_MAP[normalizeHeader(h)]);
      const parsed = body.filter((r) => r.some((c) => c.trim())).map((r) => {
        const o: Partial<Row> = {};
        keys.forEach((k, i) => { if (k) o[k] = (r[i] ?? "").trim(); });
        return o as Row;
      });
      if (!parsed.length || !keys.includes("email")) throw new Error("no_email");
      setRows(parsed);
    } catch {
      setRows([]);
      setFileError("errors.invalid_file");
    }
  }

  const results = fetcher.data?.results ?? [];
  return (
    <>
      <PageHeader title={t("students.import_title")} description={loaderData.course.name} />
      <Card className="mb-6 p-5">
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{t("students.import_help")}</p>
        <code className="mb-4 block rounded-lg bg-slate-100 p-3 text-xs dark:bg-white/5">nombre,apellido,correo,codigo,idioma<br />Jean,Pierre,jean@correo.cl,A-001,ht</code>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-brand-500 px-4 py-3 text-sm font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10">
          <FileSpreadsheet className="h-5 w-5" /> {t("students.choose_file")}
          <input type="file" accept=".csv,.xlsx,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        </label>
        {fileError && <div className="mt-3"><Alert>{t(fileError)}</Alert></div>}
        {fetcher.data?.error && <div className="mt-3"><Alert>{t(`errors.${fetcher.data.error}`)}</Alert></div>}
      </Card>

      {rows.length > 0 && results.length === 0 && (
        <Card>
          <CardHeader title={t("students.preview", { count: rows.length })}
            action={<fetcher.Form method="post"><input type="hidden" name="rows" value={JSON.stringify(rows)} />
              <Button type="submit" loading={fetcher.state !== "idle"}><Upload className="h-4 w-4" />{t("students.confirm_import")}</Button></fetcher.Form>} />
          <Table><thead><tr><Th>{t("students.first_name")}</Th><Th>{t("students.last_name")}</Th><Th>{t("auth.email")}</Th><Th>{t("students.internal_code")}</Th><Th>{t("common.language")}</Th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><Td>{r.first_name}</Td><Td>{r.last_name}</Td><Td>{r.email}</Td><Td>{r.internal_code}</Td><Td>{r.locale}</Td></tr>)}</tbody></Table>
        </Card>
      )}

      {results.length > 0 && (
        <Card>
          <CardHeader title={t("students.import_results")} description={t("students.import_passwords_note")} />
          <Table><thead><tr><Th>{t("auth.email")}</Th><Th>{t("common.status")}</Th><Th>{t("students.temp_password")}</Th></tr></thead>
            <tbody>{results.map((r) => (
              <tr key={r.email}><Td>{r.email}</Td><Td className={r.ok ? "text-emerald-700" : "text-red-600"}>{t(r.code)}</Td><Td className="font-mono font-semibold">{r.password ?? "—"}</Td></tr>
            ))}</tbody></Table>
        </Card>
      )}
    </>
  );
}
