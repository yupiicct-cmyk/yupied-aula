import { useState } from "react";
import { Form, Link, useActionData, useFetcher, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { FileText, Pencil, Send, Save, Trash2, Users } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/view";
import { requireUser } from "~/services/auth.server";
import { detectLocale } from "~/services/i18n";
import { activityTranslation } from "~/services/activities.server";
import { usesFiles, usesQuestions } from "~/utils/activity-types";
import { loadActivityQuestions, toPublic } from "~/services/questions.server";
import { failCode } from "~/services/forms.server";
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, PageHeader, Textarea } from "~/components/ui";
import { RichView } from "~/components/rich-text";
import { QuestionRunner, type Answers } from "~/components/questions";
import { FileUpload } from "~/components/file-upload";
import { StatusBadge } from "~/components/status-badge";
import { Comments } from "~/components/comments";
import { fmtBytes, fmtDate, fmtNumber } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, must, toAppError } from "~/utils/errors";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const locale = detectLocale(request, user.profile.locale);
  const activity = must(await supabase.from("activities").select("*").eq("id", params.id).maybeSingle());
  const [{ chosen }, questions, sub] = await Promise.all([
    activityTranslation(supabase, activity.id, locale, activity.original_locale),
    usesQuestions(activity.type) ? loadActivityQuestions(supabase, activity.id, false) : Promise.resolve([]),
    supabase.from("submissions").select("*").eq("activity_id", activity.id).eq("student_id", user.id).maybeSingle(),
  ]);
  const submission = sub.data;
  const [answers, files, comments, group] = submission ? await Promise.all([
    supabase.from("submission_answers").select("question_id,answer").eq("submission_id", submission.id),
    supabase.from("submission_files").select("id,original_name,size_bytes,mime_type").eq("submission_id", submission.id),
    supabase.from("submission_comments").select("id,author_id,body,created_at").eq("submission_id", submission.id).order("created_at"),
    supabase.from("activity_assignments").select("group_name").eq("activity_id", activity.id).eq("student_id", user.id).maybeSingle(),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, await supabase.from("activity_assignments").select("group_name").eq("activity_id", activity.id).eq("student_id", user.id).maybeSingle()];
  return {
    isTeacher: user.isTeacher, userId: user.id,
    activity, tr: chosen,
    questions: questions.map((q) => toPublic(q, q.options, user.id)),
    submission,
    answers: Object.fromEntries((answers.data ?? []).map((a) => [a.question_id, a.answer])) as Answers,
    files: files.data ?? [],
    comments: comments.data ?? [],
    group: group.data?.group_name ?? null,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { student: true });
  const fd = await request.formData();
  const intent = fd.get("intent");
  try {
    if (intent === "delete-file") {
      check(await supabase.from("submission_files").delete().eq("id", z.string().uuid().parse(fd.get("id"))));
      return { ok: true as const, message: "common.deleted" };
    }
    if (intent === "comment") {
      const body = z.string().trim().min(1).max(4000).parse(fd.get("body"));
      const sid = z.string().uuid().parse(fd.get("submission"));
      check(await supabase.from("submission_comments").insert({ submission_id: sid, author_id: user.id, body }));
      return { ok: true as const, message: "common.sent" };
    }
    const answers = JSON.parse(String(fd.get("answers") ?? "{}")) as Record<string, unknown>;
    const text = String(fd.get("text") ?? "").slice(0, 50000);
    // La corrección y validación de plazos ocurren en PostgreSQL (submit_activity).
    check(await supabase.rpc("submit_activity", { p_activity: params.id, p_answers: answers as never, p_text: text, p_final: intent === "submit" }));
    return { ok: true as const, message: intent === "submit" ? "activities.submitted" : "lessons.saved_draft" };
  } catch (e) {
    return failCode(toAppError(e).code);
  }
}

export default function ActivityView({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const fileFetcher = useFetcher();
  const { activity, tr, submission, questions, isTeacher } = loaderData;
  const [answers, setAnswers] = useState<Answers>(loaderData.answers);
  const graded = submission?.status === "graded";
  const closed = activity.status === "archived" || (!!activity.due_at && Date.parse(activity.due_at) < Date.now() && !activity.allow_late);
  const readOnly = isTeacher || graded || closed;

  return (
    <>
      <PageHeader title={tr?.title || t("activities.untitled")}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone="blue">{t(`activities.types.${activity.type}`)}</Badge>
          {activity.due_at && <span>{t("activities.due", { date: fmtDate(activity.due_at, locale, true) })}</span>}
          <span>· {t("activities.max_score")}: {fmtNumber(activity.max_score, locale)}</span>
          {loaderData.group && <Badge tone="navy">{t("activities.group")}: {loaderData.group}</Badge>}
          {submission && <StatusBadge status={submission.status} />}</span>}
        actions={isTeacher && <><ButtonLink to={`/app/activities/${activity.id}/submissions`} variant="outline"><Users className="h-4 w-4" />{t("activities.submissions")}</ButtonLink><ButtonLink to={`/app/activities/${activity.id}/edit`}><Pencil className="h-4 w-4" />{t("common.edit")}</ButtonLink></>} />
      {a && a.ok && <div className="mb-4"><Alert tone="green">{t(a.message ?? "common.saved")}</Alert></div>}
      {a && !a.ok && <div className="mb-4"><Alert>{t(`errors.${a.error}`)}</Alert></div>}
      {closed && !graded && !isTeacher && <div className="mb-4"><Alert tone="amber">{t("activities.closed_notice")}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {(tr?.description || tr?.instructions) && (
            <Card className="space-y-4 p-6">
              <RichView html={tr?.description ?? ""} />
              {tr?.instructions && <div><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-600">{t("activities.instructions")}</h2><RichView html={tr.instructions} /></div>}
            </Card>
          )}
          <Form method="post" className="space-y-6">
            <input type="hidden" name="answers" value={JSON.stringify(answers)} />
            {questions.length > 0 && <QuestionRunner questions={questions} answers={answers} onChange={setAnswers} locale={locale} disabled={readOnly} />}
            {usesFiles(activity.type) && (
              <Card className="p-5">
                <label htmlFor="text" className="mb-2 block text-sm font-medium">{t("activities.your_answer")}</label>
                <Textarea id="text" name="text" defaultValue={submission?.text_answer ?? ""} disabled={readOnly} className="min-h-40" maxLength={50000} />
              </Card>
            )}
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="intent" value="draft" variant="outline" loading={nav.state === "submitting" && nav.formData?.get("intent") === "draft"}><Save className="h-4 w-4" />{t("lessons.save_draft")}</Button>
                <Button type="submit" name="intent" value="submit" loading={nav.state === "submitting" && nav.formData?.get("intent") === "submit"}
                  onClick={(e) => { if (!confirm(t("activities.confirm_submit"))) e.preventDefault(); }}><Send className="h-4 w-4" />{t("activities.submit")}</Button>
              </div>
            )}
          </Form>
        </div>

        <div className="space-y-6">
          {submission && (graded || submission.status === "returned") && (
            <Card className="p-5">
              <p className="text-sm text-slate-500">{t("grades.score")}</p>
              <p className="text-3xl font-bold text-navy-900 dark:text-white">{fmtNumber(submission.score, locale)} <span className="text-base text-slate-500">/ {fmtNumber(activity.max_score, locale)}</span></p>
              {submission.feedback && <p className="mt-3 rounded-lg bg-brand-50 p-3 text-sm dark:bg-brand-500/10">{submission.feedback}</p>}
            </Card>
          )}
          {usesFiles(activity.type) && !isTeacher && (
            <Card>
              <CardHeader title={t("activities.files")} />
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {loaderData.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 px-5 py-2 text-sm">
                    <FileText className="h-4 w-4 text-brand-500" />
                    <a href={`/files/submission/${f.id}`} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">{f.original_name}</a>
                    <span className="text-xs text-slate-500">{fmtBytes(f.size_bytes)}</span>
                    {!readOnly && <fileFetcher.Form method="post"><input type="hidden" name="intent" value="delete-file" /><input type="hidden" name="id" value={f.id} />
                      <button className="p-1 text-slate-400 hover:text-red-600" aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></button></fileFetcher.Form>}
                  </li>
                ))}
              </ul>
              {!readOnly && <div className="p-4"><FileUpload purpose="submission_file" activityId={activity.id} multiple label={t("activities.attach")} /></div>}
            </Card>
          )}
          {submission && !isTeacher && <Comments submissionId={submission.id} comments={loaderData.comments} userId={loaderData.userId} />}
          {isTeacher && <Alert tone="blue">{t("activities.teacher_preview")}</Alert>}
          {!isTeacher && <Link to="/app/activities" className="block text-center text-sm text-brand-600 hover:underline">{t("common.back")}</Link>}
        </div>
      </div>
    </>
  );
}
