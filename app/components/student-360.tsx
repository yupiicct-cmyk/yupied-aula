import { useTranslation } from "react-i18next";
import { Award, BookOpen, CheckCircle2, ClipboardCheck, Download, FileCheck2, NotebookPen } from "lucide-react";
import type { loadStudent360 } from "~/services/student360.server";
import { Avatar, Badge, Card, CardHeader, EmptyState, Progress, StatCard, Table, Td, Th } from "~/components/ui";
import { StatusBadge } from "~/components/status-badge";
import { fmtDate, fmtNumber, fullName, initials } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";

type Data = Awaited<ReturnType<typeof loadStudent360>> & { pending: number };

const timelineIcon = { lesson: BookOpen, submission: FileCheck2, assessment: NotebookPen, attendance: ClipboardCheck, download: Download };

export function Student360({ data, teacherView }: { data: Data; teacherView: boolean }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const p = data.profile;
  const prog = data.progress[0];
  const total = (prog?.lessons_total ?? 0) + (prog?.activities_total ?? 0);
  const pct = total ? (100 * ((prog?.lessons_completed ?? 0) + (prog?.activities_done ?? 0))) / total : 0;
  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-5 p-5">
        <Avatar name={initials(p)} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-navy-900 dark:text-white">{fullName(p)}</h2>
          <p className="text-sm text-slate-500">{p.email}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
            <StatusBadge status={p.status} />
            {p.internal_code && <Badge>{t("students.internal_code")}: {p.internal_code}</Badge>}
            <Badge>{t("students.joined_on")}: {fmtDate(p.joined_on, locale)}</Badge>
            <Badge tone="blue">{p.locale.toUpperCase()}</Badge>
          </div>
          <p className="mt-2 text-sm">
            {data.courses.map((c) => <span key={c.id} className="mr-3"><strong>{c.name}</strong>{c.teachers.length > 0 && <> · {t("students.teacher")}: {c.teachers.join(", ")}</>}</span>)}
          </p>
        </div>
        <div className="w-full sm:w-56">
          <div className="mb-1 flex justify-between text-sm"><span>{t("dashboard.my_progress")}</span><span>{Math.round(pct)} %</span></div>
          <Progress value={pct} />
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("students.360.modules_done")} value={`${data.modules.filter((m) => m.complete).length}/${data.modules.length}`} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <StatCard label={t("students.360.lessons_viewed")} value={data.lessonsViewed} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard label={t("students.360.downloads")} value={data.downloads} icon={<Download className="h-5 w-5" />} tone="navy" />
        <StatCard label={t("students.360.pending")} value={data.pending} icon={<FileCheck2 className="h-5 w-5" />} tone="amber" />
        <StatCard label={t("students.360.activities_done")} value={data.submissions.filter((s) => s.status !== "draft").length} icon={<FileCheck2 className="h-5 w-5" />} />
        <StatCard label={t("nav.assessments")} value={data.attempts.length} icon={<NotebookPen className="h-5 w-5" />} tone="navy" />
        <StatCard label={t("grades.average")} value={fmtNumber(prog?.grade_avg ?? null, locale)} icon={<Award className="h-5 w-5" />} tone="green" />
        <StatCard label={t("attendance.title")} value={prog?.attendance_pct == null ? "—" : `${fmtNumber(prog.attendance_pct, locale)} %`}
          hint={t("attendance.summary", { present: data.attendance.present, late: data.attendance.late, absent: data.attendance.absent, excused: data.attendance.excused })}
          icon={<ClipboardCheck className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("nav.grades")} />
          {data.grades.length === 0 ? <EmptyState title={t("grades.none")} /> : (
            <Table><thead><tr><Th>{t("common.title")}</Th><Th>{t("grades.score")}</Th><Th>{t("grades.grade")}</Th></tr></thead>
              <tbody>{data.grades.map((g) => (
                <tr key={g.id}><Td><span className="font-medium">{g.title || "—"}</span>{g.observation && <span className="block text-xs text-slate-500">{g.observation}</span>}</Td>
                  <Td>{fmtNumber(g.score, locale)} / {fmtNumber(g.max_score, locale)}</Td>
                  <Td><span className={(g.grade ?? 0) >= 4 ? "font-bold text-emerald-600" : "font-bold text-red-600"}>{fmtNumber(g.grade, locale)}</span></Td></tr>
              ))}</tbody></Table>
          )}
        </Card>
        <Card>
          <CardHeader title={t("students.360.modules")} />
          {data.modules.length === 0 ? <EmptyState title={t("modules.empty")} /> : (
            <ul className="space-y-3 p-5">{data.modules.map((m) => (
              <li key={m.id}><div className="mb-1 flex justify-between text-sm"><span>{m.title || t("modules.untitled")}</span><span>{m.done}/{m.total}</span></div>
                <Progress value={m.total ? (100 * m.done) / m.total : 0} /></li>
            ))}</ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t("students.360.activities")} />
          {data.submissions.length === 0 ? <EmptyState title={t("activities.none_submitted")} /> : (
            <Table><thead><tr><Th>{t("common.title")}</Th><Th>{t("common.status")}</Th><Th>{t("grades.score")}</Th></tr></thead>
              <tbody>{data.submissions.map((s) => (
                <tr key={s.id}><Td>{s.title || t("activities.untitled")}</Td><Td><StatusBadge status={s.status} /></Td><Td>{fmtNumber(s.score, locale)}</Td></tr>
              ))}</tbody></Table>
          )}
        </Card>
        <Card>
          <CardHeader title={t("students.360.notes")} />
          {data.notes.length === 0 ? <EmptyState title={t("students.360.no_notes")} /> : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">{data.notes.map((n) => (
              <li key={n.id} className="px-5 py-3 text-sm"><p>{n.body}</p>
                <p className="mt-1 text-xs text-slate-500">{fmtDate(n.created_at, locale, true)}{teacherView && <> · {n.visible_to_student ? t("students.360.visible") : t("students.360.private")}</>}</p></li>
            ))}</ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title={t("students.360.timeline")} />
        {data.timeline.length === 0 ? <EmptyState title={t("students.360.no_activity")} /> : (
          <ol className="relative space-y-4 border-l-2 border-brand-100 py-5 pl-6 pr-5 ml-6 dark:border-white/10">
            {data.timeline.map((e, i) => {
              const Icon = timelineIcon[e.kind];
              return (
                <li key={i} className="relative">
                  <span className="absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white"><Icon className="h-3.5 w-3.5" /></span>
                  <p className="text-sm"><span className="font-medium">{t(`students.timeline.${e.kind}`)}</span>: {e.kind === "attendance" ? t(`status.${e.label}`) : e.label || "—"}
                    {e.detail && e.kind !== "attendance" && <span className="text-slate-500"> · {t(`status.${e.detail}`)}</span>}</p>
                  <p className="text-xs text-slate-500">{fmtDate(e.at, locale, e.kind !== "attendance")}</p>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}
