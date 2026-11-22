import { useTranslation } from "react-i18next";
import { Eye, GraduationCap, UserRound, Users } from "lucide-react";
import type { Route } from "./+types/supervision";
import { requireUser } from "~/services/auth.server";
import { getInstitutionContext, supervisesRoles } from "~/services/institutions.server";
import { levelName } from "~/countries/registry";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th } from "~/components/ui";
import { AppError, toAppError } from "~/utils/errors";
import { fmtNumber } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { detectLocale } from "~/services/i18n";

export const meta: Route.MetaFunction = () => [{ title: "YupiEd" }];

/**
 * Supervisión de la institución activa (dirección, inspectoría, administración).
 * Solo lectura: las políticas *_read_supervisor de la BD limitan los datos a la institución.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const { active, country } = await getInstitutionContext(request, supabase);
  if (!active || !supervisesRoles(active.roles)) throw new AppError("forbidden", 403);
  const locale = detectLocale(request, user.profile.locale);

  const { data: courses, error } = await supabase.from("courses").select("id,name,status,level_key")
    .eq("institution_id", active.institution_id).is("deleted_at", null).order("name");
  if (error) throw toAppError(error);
  const ids = (courses ?? []).map((c) => c.id);
  const none = Promise.resolve({ data: [] as never[], error: null });
  const [members, teachers, grades, sessions] = await Promise.all([
    ids.length ? supabase.from("course_members").select("course_id,student_id").in("course_id", ids).eq("status", "active") : none,
    ids.length ? supabase.from("teacher_assignments").select("course_id,teacher_id").in("course_id", ids) : none,
    ids.length ? supabase.from("grades").select("course_id,grade").in("course_id", ids) : none,
    ids.length ? supabase.from("attendance_sessions").select("id,course_id").in("course_id", ids) : none,
  ]);
  for (const r of [members, teachers, grades, sessions]) if (r.error) throw toAppError(r.error);
  const sessionIds = (sessions.data ?? []).map((s) => s.id);
  const records = sessionIds.length
    ? await supabase.from("attendance_records").select("session_id,status").in("session_id", sessionIds)
    : { data: [] as { session_id: string; status: string }[], error: null };
  if (records.error) throw toAppError(records.error);

  const sessionCourse = new Map((sessions.data ?? []).map((s) => [s.id, s.course_id]));
  const rows = (courses ?? []).map((c) => {
    const g = (grades.data ?? []).filter((x) => x.course_id === c.id && x.grade !== null).map((x) => Number(x.grade));
    const rec = (records.data ?? []).filter((r) => sessionCourse.get(r.session_id) === c.id);
    const attended = rec.filter((r) => r.status === "present" || r.status === "late").length;
    return {
      id: c.id, name: c.name, status: c.status,
      level: c.level_key && country ? levelName(country, c.level_key, locale) : "—",
      students: (members.data ?? []).filter((m) => m.course_id === c.id).length,
      teachers: (teachers.data ?? []).filter((m) => m.course_id === c.id).length,
      gradeAvg: g.length ? g.reduce((a, b) => a + b, 0) / g.length : null,
      attendancePct: rec.length ? (100 * attended) / rec.length : null,
    };
  });
  return {
    institution: active.name,
    minAttendance: country?.academic.minAttendancePct ?? null,
    totals: {
      courses: rows.length,
      students: new Set((members.data ?? []).map((m) => m.student_id)).size,
      teachers: new Set((teachers.data ?? []).map((m) => m.teacher_id)).size,
    },
    rows,
  };
}

export default function Supervision({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { totals, rows, minAttendance } = loaderData;
  return (
    <>
      <PageHeader title={t("nav.supervision")} description={loaderData.institution} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("nav.courses")} value={totals.courses} icon={<GraduationCap />} />
        <StatCard label={t("nav.students")} value={totals.students} icon={<Users />} />
        <StatCard label={t("admin.teachers")} value={totals.teachers} icon={<UserRound />} />
      </div>
      <Card>
        <CardHeader title={t("admin.courses_overview")} description={minAttendance ? t("admin.min_attendance_hint", { pct: minAttendance }) : undefined} />
        {rows.length === 0 ? <EmptyState icon={<Eye />} title={t("dashboard.no_course")} /> : (
          <Table>
            <thead><tr><Th>{t("courses.name")}</Th><Th>{t("admin.level")}</Th><Th>{t("nav.students")}</Th><Th>{t("admin.teachers")}</Th><Th>{t("admin.grade_avg")}</Th><Th>{t("admin.attendance_pct")}</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{r.name}</Td><Td>{r.level}</Td><Td>{r.students}</Td><Td>{r.teachers}</Td>
                  <Td>{r.gradeAvg === null ? "—" : fmtNumber(r.gradeAvg, locale)}</Td>
                  <Td className={minAttendance && r.attendancePct !== null && r.attendancePct < minAttendance ? "font-semibold text-red-600" : undefined}>
                    {r.attendancePct === null ? "—" : `${fmtNumber(r.attendancePct, locale, 0)} %`}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
