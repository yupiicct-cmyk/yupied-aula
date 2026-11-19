import { z } from "zod";

export const LESSON_TEXT_FIELDS = [
  "general_objective", "specific_objectives", "competencies", "expected_learning", "contents",
  "introduction", "development", "closing", "practical_activity", "evaluation", "complementary",
] as const;
export type LessonTextField = (typeof LESSON_TEXT_FIELDS)[number];

/** Lee un campo multilingüe enviado como name_es / name_ht / name_fr */
export function i18nFromForm(fd: FormData, name: string, max = 300) {
  const out: Record<string, string> = {};
  for (const l of ["es", "ht", "fr"]) {
    const v = String(fd.get(`${name}_${l}`) ?? "").trim().slice(0, max);
    if (v) out[l] = v;
  }
  return out;
}

export const moduleSchema = z.object({
  position: z.coerce.number().int().min(1).max(999),
  status: z.enum(["draft", "published", "archived"]),
});
