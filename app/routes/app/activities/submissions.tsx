import { Form, Link, useActionData, useNavigation, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CheckCircle2, FileText } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/submissions";
import { requireUser } from "~/services/auth.server";
import { courseStudents } from "~/services/courses.server";
import { detectLocale } from "~/services/i18n";
import { activityTranslation } from "~/services/activities.server";
import { loadActivityQuestions, toPublic } from "~/services/questions.server";
import { failCode } from "~/services/forms.server";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Textarea } from "~/components/ui";
import { StatusBadge } from "~/components/status-badge";
import { AnswerReview } from "~/components/questions";
import { Comments } from "~/components/comments";
import { fmtBytes, fmtDate, fmtNumber, fullName } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, must, toAppError } from "~/utils/errors";
import { cn } from "~/utils/cn";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const locale = detectLocale(request, user.profile.locale);
  const activity = must(await supabase.from("activities").select("*").eq("id", params.id).maybeSingle());
  const [{ chosen }, students, subs, assigned] = await Promise.all([
    activityTranslation(supabase, activity.id, locale, activity.original_locale),
    courseStudents(supabase, activity.course_id),
    supabase.from("submissions").select("*").eq("activity_id", activity.id),
    supabase.from("activity_assignments").select("student_id,group_name").eq("activity_id", activity.id),
  ]);
  const assignedIds = new Set((assigned.data ?? []).map((a) => a.student_id));
  const roster = students.filter((s) => assignedIds.size === 0 || assignedIds.has(s.id));
  const selectedId = new URL(request.url).searchParams.get("s");
  const selected = (subs.data ?? []).find((s) => s.id === selectedId) ?? null;
  let detail = null;
  if (selected) {
    const [questions, answers, files, comments] = await Promise.all([
      loadActivityQuestions(supabase, activity.id, true),
      supabase.from("submission_answers").select("*").eq("submission_id", selected.id),
      supabase.from("submission_files").select("id,original_name,size_bytes,mime_type").eq("submission_id", selected.id),
      supabase.from("submission_comments").select("id,author_id,body,created_at").eq("submission_id", selected.id).order("created_at"),
    ]);
    detail = {
      questions: questions.map((q) => ({ pub: toPublic(q, q.options, "teacher"), correct: q.correct, answer: (answers.data ?? []).find((a) => a.question_id === q.id) ?? null })),
      files: files.data ?? [], comments: comments.data ?? [],
    };
  }
  return {
    activity, title: chosen?.title ?? "", userId: user.id,
    rows: roster.map((s) => ({ student: s, group: (assigned.data ?? []).find((a) => a.student_id === s.id)?.group_name ?? null, sub: (subs.data ?? []).find((x) => x.student_id === s.id) ?? null })),
    selected, detail,
  };
}

const gradeSchema = z.object({
  submission: z.string().uuid(),
  score: z.coerce.number().min(0),
  feedback: z.string().trim().max(4000).optional().default(""),
  decision: z.enum(["graded", "returned"]),
});

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const fd = await request.formData();
  try {
    if (fd.get("intent") === "comment") {
      const body = z.string().trim().min(1).max(4000).parse(fd.get("body"));
      check(await supabase.from("submission_comments").insert({ submission_id: z.string().uuid().parse(fd.get("submission")), author_id: user.id, body }));
      return { ok: true as const, message: "common.sent" };
    }
    const g = gradeSchema.parse(Object.fromEntries(fd));
    const activity = must(await supabase.from("activities").select("max_score").eq("id", params.id).single());
    if (g.score > Number(activity.max_score)) return failCode("score_too_high");
    // Puntajes manuales por pregunta (opcional)
    for (const [k, v] of fd.entries()) {
      const m = k.match(/^q_([0-9a-f-]{36})$/);
      if (m && v !== "") check(await supabase.from("submission_answers").update({ manual_score: Number(v) }).eq("submission_id", g.submission).eq("question_id", m[1]!));
    }
    check(await supabase.from("submissions").update({
      score: g.score, feedback: g.feedback, status: g.decision, graded_by: user.id, graded_at: new Date().toISOString(),
    }).eq("id", g.submission).eq("activity_id", params.id));
    return { ok: true as const, message: g.decision === "graded" ? "grades.saved" : "activities.returned" };
  } catch (e) {
    return failCode(e instanceof z.ZodError ? "invalid_data" : toAppError(e).code);
  }
}

export default function Submissions({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const [params] = useSearchParams();
  const { activity, rows, selected, detail } = loaderData;
  const selRow = rows.find((r) => r.sub?.id === selected?.id);
  const autoTotal = detail?.questions.reduce((s, q) => s + Number(q.answer?.manual_score ?? q.answer?.auto_score ?? 0), 0) ?? 0;
  const maxPoints = detail?.questions.reduce((s, q) => s + q.pub.points, 0) ?? 0;
  const suggested = selected?.score ?? (maxPoints ? Math.round((autoTotal * Number(activity.max_score)) / maxPoints * 100) / 100 : "");

  return (
    <>
      <PageHeader title={t("activities.submissions")} description={loaderData.title || t("activities.untitled")} />
      {a && a.ok && <div className="mb-4"><Alert tone="green">{t(a.message ?? "common.saved")}</Alert></div>}
      {a && !a.ok && <div className="mb-4"><Alert>{t(`errors.${a.error}`)}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader title={t("students.title")} description={t("activities.submitted_count", { n: rows.filter((r) => r.sub && r.sub.status !== "draft").length, total: rows.length })} />
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {rows.map((r) => (
              <li key={r.student.id}>
                {r.sub && r.sub.status !== "draft" ? (
                  <Link to={`?s=${r.sub.id}`} className={cn("flex items-center gap-2 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-white/5", params.get("s") === r.sub.id && "bg-brand-50 dark:bg-brand-500/10")}>
                    <span className="flex-1 truncate">{fullName(r.student)}{r.group && <span className="text-xs text-slate-500"> · {r.group}</span>}</span>
                    {r.sub.is_late && <Badge tone="red">{t("activities.late")}</Badge>}
                    <StatusBadge status={r.sub.status} />
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400"><span className="flex-1 truncate">{fullName(r.student)}</span><Badge>{t("status.pending")}</Badge></div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {!selected || !detail ? <Card><EmptyState title={t("activities.select_submission")} /></Card> : (
          <div className="space-y-6">
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{selRow ? fullName(selRow.student) : ""}</h2>
                <span className="text-sm text-slate-500">{t("activities.submitted_at", { date: fmtDate(selected.submitted_at, locale, true) })}</span>
              </div>
              {selected.text_answer && <div className="mb-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm dark:bg-white/5">{selected.text_answer}</div>}
              {detail.files.length > 0 && (
                <ul className="mb-4 space-y-1">{detail.files.map((f) => (
                  <li key={f.id}><a href={`/files/submission/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-brand-600 hover:underline"><FileText className="h-4 w-4" />{f.original_name} ({fmtBytes(f.size_bytes)})</a></li>
                ))}</ul>
              )}
              <Form method="post" className="space-y-4">
                <input type="hidden" name="submission" value={selected.id} />
                {detail.questions.map((q, i) => (
                  <div key={q.pub.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-white/10">
                    <span className="font-bold text-brand-600">{i + 1}.</span>
                    <div className="min-w-0 flex-1"><AnswerReview q={q.pub} answer={q.answer?.answer ?? null} correct={q.correct} score={q.answer?.auto_score === null || q.answer?.auto_score === undefined ? null : Number(q.answer.auto_score)} locale={locale} /></div>
                    <label className="flex items-center gap-1 text-xs">{t("questions.points")}
                      <Input name={`q_${q.pub.id}`} type="number" step="0.25" min={0} max={q.pub.points} defaultValue={q.answer?.manual_score ?? q.answer?.auto_score ?? ""} className="h-8 w-20" />
                      / {q.pub.points}</label>
                  </div>
                ))}
                {maxPoints > 0 && <p className="text-sm text-slate-500">{t("activities.auto_total", { n: fmtNumber(autoTotal, locale), max: fmtNumber(maxPoints, locale) })}</p>}
                <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                  <Field label={`${t("grades.score")} (/${fmtNumber(activity.max_score, locale)})`} htmlFor="score"><Input id="score" name="score" type="number" step="0.01" min={0} max={activity.max_score} defaultValue={suggested} required /></Field>
                  <Field label={t("activities.feedback")} htmlFor="feedback"><Textarea id="feedback" name="feedback" defaultValue={selected.feedback} /></Field>
                </div>
                <div className="flex gap-2">
                  <Button name="decision" value="graded" loading={nav.state === "submitting"}><CheckCircle2 className="h-4 w-4" />{t("grades.save_grade")}</Button>
                  <Button name="decision" value="returned" variant="outline">{t("activities.return_for_changes")}</Button>
                </div>
              </Form>
            </Card>
            <Comments submissionId={selected.id} comments={detail.comments} userId={loaderData.userId} />
          </div>
        )}
      </div>
    </>
  );
}
