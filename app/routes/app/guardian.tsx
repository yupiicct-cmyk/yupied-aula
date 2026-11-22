import { useTranslation } from "react-i18next";
import { HeartHandshake } from "lucide-react";
import type { Route } from "./+types/guardian";
import { requireUser } from "~/services/auth.server";
import { Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "~/components/ui";
import { toAppError } from "~/utils/errors";
import { fmtNumber } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";

type Row = {
  student_id: string; student_name: string; institution_name: string; course_id: string; course_name: string;
  grade_avg: number | null; grade_count: number; sessions: number; attended: number; absences: number;
};

export const meta: Route.MetaFunction = () => [{ title: "YupiEd" }];

/** Vista del apoderado: solo sus pupilos (la función de BD verifica el vínculo). */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = await requireUser(request, context, { guardian: true });
  const { data, error } = await supabase.rpc("guardian_overview");
  if (error) throw toAppError(error);
  const rows = (data ?? []) as unknown as Row[];
  const students = new Map<string, { name: string; institution: string; courses: Row[] }>();
  for (const r of rows) {
    const s = students.get(r.student_id) ?? { name: r.student_name, institution: r.institution_name, courses: [] };
    s.courses.push(r);
    students.set(r.student_id, s);
  }
  return { students: [...students.entries()].map(([id, s]) => ({ id, ...s })) };
}

export default function Guardian({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <>
      <PageHeader title={t("nav.guardian")} description={t("admin.guardian_intro")} />
      {loaderData.students.length === 0 ? (
        <Card><EmptyState icon={<HeartHandshake />} title={t("admin.guardian_empty")} /></Card>
      ) : (
        <div className="space-y-6">
          {loaderData.students.map((s) => (
            <Card key={s.id}>
              <CardHeader title={s.name} description={s.institution} />
              <Table>
                <thead><tr><Th>{t("nav.courses")}</Th><Th>{t("admin.grade_avg")}</Th><Th>{t("admin.grade_count")}</Th><Th>{t("admin.attendance_pct")}</Th><Th>{t("admin.absences")}</Th></tr></thead>
                <tbody>
                  {s.courses.map((c) => (
                    <tr key={c.course_id}>
                      <Td className="font-medium">{c.course_name}</Td>
                      <Td>{c.grade_avg === null ? "—" : fmtNumber(Number(c.grade_avg), locale)}</Td>
                      <Td>{c.grade_count}</Td>
                      <Td>{c.sessions ? `${fmtNumber((100 * c.attended) / c.sessions, locale, 0)} %` : "—"}</Td>
                      <Td>{c.absences}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
