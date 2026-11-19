import { Form, Link, useActionData, useNavigation, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/results";
import { requireUser } from "~/services/auth.server";
import { detectLocale, pick } from "~/services/i18n";
import { loadAssessmentQuestions, toPublic } from "~/services/questions.server";
import { failCode } from "~/services/forms.server";
import type { Kind } from "~/schemas/questions";
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Textarea } from "~/components/ui";
import { AnswerReview } from "~/components/questions";
import { StatusBadge } from "~/components/status-badge";
import { fmtDate, fmtNumber, fullName } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, must, toAppError } from "~/utils/errors";
import { cn } from "~/utils/cn";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const locale = detectLocale(request, user.profile.locale);
  const a = must(await supabase.from("assessments").select("id,title_i18n,course_id").eq("id", params.id).maybeSingle());
  const { data: attempts } = await supabase.from("assessment_attempts").select("*").eq("assessment_id", a.id).order("submitted_at", { ascending: false });
  const ids = [...new Set((attempts ?? []).map((x) => x.student_id))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id,first_name,last_name").in("id", ids) : { data: [] };
  const sel = (attempts ?? []).find((x) => x.id === new URL(request.url).searchParams.get("a")) ?? null;
  let detail = null;
  if (sel) {
    const [qs, ans] = await Promise.all([loadAssessmentQuestions(supabase, a.id, true), supabase.from("assessment_answers").select("*").eq("attempt_id", sel.id)]);
    detail = sel.question_ids.map((qid) => qs.find((q) => q.id === qid)).filter(Boolean).map((q) => ({
      pub: toPublic({ ...q!, kind: q!.kind as Kind }, q!.options, "teacher"), correct: q!.correct, ans: (ans.data ?? []).find((x) => x.question_id === q!.id) ?? null,
    }));
  }
  return {
    title: pick(a.title_i18n, locale),
    attempts: (attempts ?? []).map((x) => ({ ...x, name: fullName((people ?? []).find((p) => p.id === x.student_id)) })),
    sel, detail,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase } = await requireUser(request, context, { teacher: true });
  const fd = await request.formData();
  try {
    const attempt = z.string().uuid().parse(fd.get("attempt"));
    const scores: Record<string, number> = {};
    for (const [k, v] of fd.entries()) { const m = k.match(/^q_([0-9a-f-]{36})$/); if (m && v !== "") scores[m[1]!] = Number(v); }
    check(await supabase.rpc("grade_attempt", { p_attempt: attempt, p_scores: scores, p_feedback: String(fd.get("feedback") ?? "").slice(0, 4000) }));
    return { ok: true as const };
  } catch (e) {
    return failCode(toAppError(e).code);
  }
}

export default function Results({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const r = useActionData<typeof action>();
  const nav = useNavigation();
  const [params] = useSearchParams();
  const { attempts, sel, detail } = loaderData;
  return (
    <>
      <PageHeader title={t("assessments.results")} description={loaderData.title} />
      {r && r.ok && <div className="mb-4"><Alert tone="green">{t("grades.saved")}</Alert></div>}
      {r && !r.ok && <div className="mb-4"><Alert>{t(`errors.${r.error}`)}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader title={t("assessments.attempts")} />
          {attempts.length === 0 ? <EmptyState title={t("assessments.no_attempts")} /> : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">{attempts.map((x) => (
              <li key={x.id}><Link to={`?a=${x.id}`} className={cn("flex items-center gap-2 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-white/5", params.get("a") === x.id && "bg-brand-50 dark:bg-brand-500/10")}>
                <span className="flex-1 truncate">{x.name} <span className="text-xs text-slate-500">#{x.attempt_no}</span></span>
                <span className="text-xs">{x.score !== null ? `${fmtNumber(x.score, locale)}/${fmtNumber(x.max_score, locale)}` : ""}</span>
                <StatusBadge status={x.status} /></Link></li>
            ))}</ul>
          )}
        </Card>
        {!sel || !detail ? <Card><EmptyState title={t("activities.select_submission")} /></Card> : (
          <Card className="p-5">
            <p className="mb-4 text-sm text-slate-500">{fmtDate(sel.submitted_at, locale, true)}</p>
            <Form method="post" className="space-y-3">
              <input type="hidden" name="attempt" value={sel.id} />
              {detail.map((d, i) => (
                <div key={d.pub.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-white/10">
                  <span className="font-bold text-brand-600">{i + 1}.</span>
                  <div className="min-w-0 flex-1"><AnswerReview q={d.pub} answer={d.ans?.answer ?? null} correct={d.correct} score={d.ans?.auto_score === null || d.ans?.auto_score === undefined ? null : Number(d.ans.auto_score)} locale={locale} /></div>
                  <label className="flex items-center gap-1 text-xs">{t("questions.points")}
                    <Input name={`q_${d.pub.id}`} type="number" step="0.25" min={0} max={d.pub.points} defaultValue={d.ans?.manual_score ?? d.ans?.auto_score ?? ""} className="h-8 w-20" /> / {d.pub.points}</label>
                </div>
              ))}
              <Field label={t("activities.feedback")} htmlFor="feedback"><Textarea id="feedback" name="feedback" defaultValue={sel.feedback} /></Field>
              <Button loading={nav.state === "submitting"} disabled={sel.status === "in_progress"}><CheckCircle2 className="h-4 w-4" />{t("grades.save_grade")}</Button>
            </Form>
          </Card>
        )}
      </div>
    </>
  );
}
