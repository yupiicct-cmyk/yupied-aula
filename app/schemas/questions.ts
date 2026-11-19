import { z } from "zod";

const i18n = z.object({ es: z.string().max(4000).optional().default(""), ht: z.string().max(4000).optional().default(""), fr: z.string().max(4000).optional().default("") });
const item = z.object({ key: z.string().min(1).max(20), label: i18n });

export const KINDS = ["single_choice", "multiple_choice", "true_false", "open", "fill_blanks", "matching", "ordering"] as const;
export type Kind = (typeof KINDS)[number];

export const questionSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(KINDS),
  points: z.coerce.number().min(0).max(1000),
  prompt: i18n,
  options: z.array(item).max(20).default([]),
  // matching: left/right ; ordering: items ; fill_blanks: blanks
  meta: z.object({ left: z.array(item).optional(), right: z.array(item).optional(), items: z.array(item).optional(), blanks: z.number().int().min(0).max(30).optional() }).default({}),
  correct: z.unknown().optional(),
}).superRefine((q, ctx) => {
  const keys = new Set(q.options.map((o) => o.key));
  if (!q.prompt.es && !q.prompt.fr && !q.prompt.ht) ctx.addIssue({ code: "custom", message: "validation.prompt_required" });
  if (q.kind === "single_choice") {
    if (q.options.length < 2 || typeof q.correct !== "string" || !keys.has(q.correct)) ctx.addIssue({ code: "custom", message: "validation.choose_correct" });
  }
  if (q.kind === "multiple_choice") {
    if (q.options.length < 2 || !Array.isArray(q.correct) || q.correct.length === 0 || !q.correct.every((k) => keys.has(String(k)))) ctx.addIssue({ code: "custom", message: "validation.choose_correct" });
  }
  if (q.kind === "true_false" && typeof q.correct !== "boolean") ctx.addIssue({ code: "custom", message: "validation.choose_correct" });
  if (q.kind === "fill_blanks") {
    if (!Array.isArray(q.correct) || q.correct.length === 0 || !q.correct.every((a) => Array.isArray(a) && a.length > 0)) ctx.addIssue({ code: "custom", message: "validation.blanks_required" });
  }
  if (q.kind === "matching") {
    const l = q.meta.left ?? [], r = q.meta.right ?? [];
    if (l.length < 2 || r.length < 2 || typeof q.correct !== "object" || q.correct === null) ctx.addIssue({ code: "custom", message: "validation.pairs_required" });
  }
  if (q.kind === "ordering" && ((q.meta.items ?? []).length < 2 || !Array.isArray(q.correct))) ctx.addIssue({ code: "custom", message: "validation.items_required" });
});
export type QuestionInput = z.infer<typeof questionSchema>;
export const questionsSchema = z.array(questionSchema).max(100);

/** Pregunta tal como la ve el estudiante (sin clave). */
export type PublicQuestion = {
  id: string; kind: Kind; points: number;
  prompt: Record<string, string>;
  options: { key: string; label: Record<string, string> }[];
  meta: { left?: { key: string; label: Record<string, string> }[]; right?: { key: string; label: Record<string, string> }[]; items?: { key: string; label: Record<string, string> }[]; blanks?: number };
};
