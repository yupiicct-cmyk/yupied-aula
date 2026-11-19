import { useEffect, useRef, useState } from "react";
import { Form, redirect, useActionData, useFetcher, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { Clock, PlayCircle, Send } from "lucide-react";
import type { Route } from "./+types/view";
import { requireUser } from "~/services/auth.server";
import { detectLocale, pick } from "~/services/i18n";
import { toPublic } from "~/services/questions.server";
import { failCode } from "~/services/forms.server";
import type { Kind, PublicQuestion } from "~/schemas/questions";
import { Alert, Badge, Button, Card, CardHeader, PageHeader, Table, Td, Th } from "~/components/ui";
import { QuestionRunner, type Answers } from "~/components/questions";
import { StatusBadge } from "~/components/status-badge";
import { fmtDate, fmtNumber } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, must, toAppError } from "~/utils/errors";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  if (user.isTeacher) throw redirect(`/app/assessments/${params.id}/edit`);
  const locale = detectLocale(request, user.profile.locale);
  const a = must(await supabase.from("assessments").select("*").eq("id", params.id).maybeSingle());
  const { data: attempts } = await supabase.from("assessment_attempts").select("*").eq("assessment_id", a.id).eq("student_id", user.id).order("attempt_no");
  const current = (attempts ?? []).find((x) => x.status === "in_progress" && (!x.deadline_at || Date.parse(x.deadline_at) > Date.now() - 30000)) ?? null;
  let questions: PublicQuestion[] = [];
  let saved: Answers = {};
  if (current) {
    const [{ data: qs }, { data: ans }] = await Promise.all([
      supabase.from("assessment_questions").select("*").in("id", current.question_ids),
      supabase.from("assessment_answers").select("question_id,answer").eq("attempt_id", current.id),
    ]);
    const byId = new Map((qs ?? []).map((q) => [q.id, q]));
    questions = current.question_ids.map((id) => byId.get(id)).filter(Boolean).map((q) => toPublic({ ...q!, kind: q!.kind as Kind }, (q!.options ?? []) as PublicQuestion["options"], current.id));
    saved = Object.fromEntries((ans ?? []).map((x) => [x.question_id, x.answer]));
  }
  const now = Date.now();
  const open = (!a.opens_at || Date.parse(a.opens_at) <= now) && (!a.closes_at || Date.parse(a.closes_at) > now);
  return {
    a: { ...a, title: pick(a.title_i18n, locale), description: pick(a.description_i18n, locale) },
    attempts: attempts ?? [], current, questions, saved, open,
    remaining: a.max_attempts - (attempts ?? []).length,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase } = await requireUser(request, context, { student: true });
  const fd = await request.formData();
  const intent = fd.get("intent");
  try {
    if (intent === "start") {
      check(await supabase.rpc("start_assessment", { p_assessment: params.id }));
      return { ok: true as const, message: "assessments.started" };
    }
    const attempt = String(fd.get("attempt"));
    const answers = JSON.parse(String(fd.get("answers") ?? "{}"));
    if (intent === "save") {
      check(await supabase.rpc("save_assessment_answers", { p_attempt: attempt, p_answers: answers }));
      return { ok: true as const, message: "lessons.autosaved" };
    }
    check(await supabase.rpc("submit_assessment", { p_attempt: attempt, p_answers: answers }));
    return { ok: true as const, message: "assessments.submitted" };
  } catch (e) {
    return failCode(toAppError(e).code);
  }
}

function Countdown({ deadline, onExpire }: { deadline: string; onExpire: () => void }) {
  const [left, setLeft] = useState(() => Date.parse(deadline) - Date.now());
  const fired = useRef(false);
  useEffect(() => {
    const id = setInterval(() => {
      const l = Date.parse(deadline) - Date.now();
      setLeft(l);
      if (l <= 0 && !fired.current) { fired.current = true; onExpire(); }
    }, 1000);
    return () => clearInterval(id);
  }, [deadline, onExpire]);
  const s = Math.max(0, Math.floor(left / 1000));
  return <span className={`font-mono text-lg font-bold ${s < 120 ? "text-red-600" : ""}`}>{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>;
}

export default function AssessmentTake({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const r = useActionData<typeof action>();
  const nav = useNavigation();
  const saver = useFetcher();
  const { a, current, attempts } = loaderData;
  const [answers, setAnswers] = useState<Answers>(loaderData.saved);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => setAnswers(loaderData.saved), [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guardado automático cada 30 s durante el intento
  useEffect(() => {
    if (!current) return;
    const id = setInterval(() => {
      void saver.submit({ intent: "save", attempt: current.id, answers: JSON.stringify(answersRef.current) }, { method: "post" });
    }, 30000);
    return () => clearInterval(id);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const answersRef = useRef(answers);
  answersRef.current = answers;

  return (
    <>
      <PageHeader title={a.title || t("assessments.untitled")} description={<span className="flex flex-wrap gap-3">
        {a.opens_at && <span>{t("assessments.opens")}: {fmtDate(a.opens_at, locale, true)}</span>}
        {a.closes_at && <span>{t("assessments.closes")}: {fmtDate(a.closes_at, locale, true)}</span>}
        {a.time_limit_minutes && <span>{t("assessments.minutes", { n: a.time_limit_minutes })}</span>}</span>} />
      {r && r.ok && <div className="mb-4"><Alert tone="green">{t(r.message ?? "common.saved")}</Alert></div>}
      {r && !r.ok && <div className="mb-4"><Alert>{t(`errors.${r.error}`)}</Alert></div>}

      {current ? (
        <Form method="post" ref={formRef} className="space-y-6">
          <input type="hidden" name="attempt" value={current.id} />
          <input type="hidden" name="answers" value={JSON.stringify(answers)} />
          <div className="sticky top-16 z-10 flex items-center justify-between rounded-xl bg-navy-900 px-5 py-3 text-white shadow">
            <span>{t("assessments.attempt_n", { n: current.attempt_no })}</span>
            {current.deadline_at ? <span className="flex items-center gap-2"><Clock className="h-5 w-5" /><Countdown deadline={current.deadline_at} onExpire={() => {
              const fd = new FormData(); fd.set("intent", "submit"); fd.set("attempt", current.id); fd.set("answers", JSON.stringify(answersRef.current));
              void saver.submit(fd, { method: "post" });
            }} /></span> : <Badge tone="blue">{t("assessments.no_time_limit")}</Badge>}
            {saver.state !== "idle" && <span className="text-xs text-slate-300">{t("lessons.saving")}</span>}
          </div>
          <QuestionRunner questions={loaderData.questions} answers={answers} onChange={setAnswers} locale={locale} />
          <Button type="submit" name="intent" value="submit" size="lg" loading={nav.state === "submitting"} onClick={(e) => { if (!confirm(t("assessments.confirm_submit"))) e.preventDefault(); }}>
            <Send className="h-4 w-4" />{t("assessments.submit")}</Button>
        </Form>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card className="p-6">
            {a.description ? <p className="whitespace-pre-wrap text-sm">{a.description}</p> : <p className="text-sm text-slate-500">{t("assessments.no_instructions")}</p>}
            <div className="mt-6">
              {!loaderData.open ? <Alert tone="amber">{t("assessments.not_open_now")}</Alert> : loaderData.remaining <= 0 ? <Alert tone="blue">{t("assessments.no_attempts_left")}</Alert> : (
                <Form method="post"><input type="hidden" name="intent" value="start" />
                  <Button size="lg" loading={nav.state === "submitting"} onClick={(e) => { if (!confirm(t("assessments.confirm_start"))) e.preventDefault(); }}><PlayCircle className="h-5 w-5" />{t("assessments.start")}</Button>
                  <p className="mt-2 text-xs text-slate-500">{t("assessments.attempts_left", { n: loaderData.remaining })}</p>
                </Form>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title={t("assessments.my_attempts")} />
            <Table><thead><tr><Th>#</Th><Th>{t("common.status")}</Th><Th>{t("grades.score")}</Th></tr></thead>
              <tbody>{attempts.map((x) => (
                <tr key={x.id}><Td>{x.attempt_no}</Td><Td><StatusBadge status={x.status} /></Td><Td>{x.score !== null ? `${fmtNumber(x.score, locale)} / ${fmtNumber(x.max_score, locale)}` : "—"}</Td></tr>
              ))}</tbody></Table>
            {attempts.some((x) => x.feedback) && <div className="space-y-2 p-4 text-sm">{attempts.filter((x) => x.feedback).map((x) => <p key={x.id} className="rounded-lg bg-brand-50 p-3 dark:bg-brand-500/10">{x.feedback}</p>)}</div>}
          </Card>
        </div>
      )}
    </>
  );
}
