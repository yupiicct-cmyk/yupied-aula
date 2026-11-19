import type { DB } from "~/services/supabase/server";
import type { Json } from "~/types/database";
import type { PublicQuestion, QuestionInput, Kind } from "~/schemas/questions";
import { AppError, check, toAppError } from "~/utils/errors";

function shuffled<T>(arr: T[], seed: string): T[] {
  // Barajado determinista por estudiante/pregunta (estable entre recargas).
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/** Para el estudiante: oculta el orden correcto en "ordenar" y baraja la columna derecha en "relacionar". */
export function toPublic(q: { id: string; kind: Kind; points: number; prompt_i18n: Json; meta: Json }, options: PublicQuestion["options"], seed: string): PublicQuestion {
  const meta = (q.meta ?? {}) as PublicQuestion["meta"];
  return {
    id: q.id, kind: q.kind, points: Number(q.points), prompt: (q.prompt_i18n ?? {}) as Record<string, string>, options,
    meta: { ...meta, items: meta.items ? shuffled(meta.items, seed + q.id) : undefined, right: meta.right ? shuffled(meta.right, seed + q.id) : undefined },
  };
}

function trueFalseOptions() {
  return [{ key: "true", label: { es: "Verdadero", ht: "Vre", fr: "Vrai" } }, { key: "false", label: { es: "Falso", ht: "Fo", fr: "Faux" } }];
}

function normalizeCorrect(q: QuestionInput): Json | null {
  switch (q.kind) {
    case "open": return null;
    case "true_false": return q.correct as boolean;
    case "single_choice": return String(q.correct);
    case "multiple_choice": return (q.correct as string[]).map(String);
    case "fill_blanks": return (q.correct as string[][]).map((alts) => alts.map((s) => String(s).trim()).filter(Boolean));
    case "matching": return q.correct as Json;
    case "ordering": return (q.correct as string[]).map(String);
  }
}

// ---------------- Actividades ----------------
export async function loadActivityQuestions(supabase: DB, activityId: string, withKeys: boolean) {
  const { data: qs } = await supabase.from("activity_questions").select("*").eq("activity_id", activityId).order("position");
  const ids = (qs ?? []).map((q) => q.id);
  const [{ data: opts }, keys] = await Promise.all([
    ids.length ? supabase.from("activity_options").select("*").in("question_id", ids).order("position") : Promise.resolve({ data: [] }),
    withKeys && ids.length ? supabase.from("activity_question_keys").select("*").in("question_id", ids) : Promise.resolve({ data: [] }),
  ]);
  return (qs ?? []).map((q) => ({
    ...q,
    options: (opts ?? []).filter((o) => o.question_id === q.id).map((o) => ({ key: o.key, label: o.label_i18n as Record<string, string> })),
    correct: (keys.data ?? []).find((k) => k.question_id === q.id)?.correct ?? null,
  }));
}

export async function saveActivityQuestions(supabase: DB, activityId: string, questions: QuestionInput[]) {
  const { count } = await supabase.from("submissions").select("id", { count: "exact", head: true }).eq("activity_id", activityId).neq("status", "draft");
  if ((count ?? 0) > 0) throw new AppError("questions_locked", 409);
  check(await supabase.from("activity_questions").delete().eq("activity_id", activityId));
  for (const [i, q] of questions.entries()) {
    const { data: row, error } = await supabase.from("activity_questions").insert({
      activity_id: activityId, position: i + 1, kind: q.kind, points: q.points, prompt_i18n: q.prompt, meta: q.meta as Json,
    }).select("id").single();
    if (error) throw toAppError(error);
    const options = q.kind === "true_false" ? trueFalseOptions() : q.options;
    if (options.length) check(await supabase.from("activity_options").insert(options.map((o, j) => ({ question_id: row.id, key: o.key, position: j + 1, label_i18n: o.label }))));
    const correct = normalizeCorrect(q);
    if (correct !== null) check(await supabase.from("activity_question_keys").insert({ question_id: row.id, correct }));
  }
}

// ---------------- Evaluaciones ----------------
export async function loadAssessmentQuestions(supabase: DB, assessmentId: string, withKeys: boolean) {
  const { data: qs } = await supabase.from("assessment_questions").select("*").eq("assessment_id", assessmentId).order("position");
  const ids = (qs ?? []).map((q) => q.id);
  const keys = withKeys && ids.length ? await supabase.from("assessment_question_keys").select("*").in("question_id", ids) : { data: [] };
  return (qs ?? []).map((q) => ({
    ...q,
    options: ((q.options ?? []) as unknown as PublicQuestion["options"]),
    correct: (keys.data ?? []).find((k) => k.question_id === q.id)?.correct ?? null,
  }));
}

export async function saveAssessmentQuestions(supabase: DB, assessmentId: string, questions: QuestionInput[]) {
  const { count } = await supabase.from("assessment_attempts").select("id", { count: "exact", head: true }).eq("assessment_id", assessmentId);
  if ((count ?? 0) > 0) throw new AppError("questions_locked", 409);
  check(await supabase.from("assessment_questions").delete().eq("assessment_id", assessmentId));
  for (const [i, q] of questions.entries()) {
    const options = q.kind === "true_false" ? trueFalseOptions() : q.options;
    const { data: row, error } = await supabase.from("assessment_questions").insert({
      assessment_id: assessmentId, position: i + 1, kind: q.kind, points: q.points, prompt_i18n: q.prompt, options: options as Json, meta: q.meta as Json,
    }).select("id").single();
    if (error) throw toAppError(error);
    const correct = normalizeCorrect(q);
    if (correct !== null) check(await supabase.from("assessment_question_keys").insert({ question_id: row.id, correct }));
  }
}
