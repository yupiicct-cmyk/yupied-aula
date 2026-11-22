import type { AcademicSettings, I18nText } from "../types";

const t = (ht: string, fr: string, es: string): I18nText => ({ ht, fr, es });

/** Estructura escolar haitiana (préscolaire, fondamental en 3 ciclos, nouveau secondaire). */
export const academic: AcademicSettings = {
  levels: [
    {
      key: "prescolaire",
      name: t("Prechkolè", "Préscolaire", "Preescolar"),
      grades: [1, 2, 3].map((i) => ({ key: `prescolaire_${i}`, name: t(`Prechkolè ${i}`, `Préscolaire ${i}`, `Preescolar ${i}`) })),
    },
    {
      key: "fondamental",
      name: t("Fondamantal", "Fondamental", "Fundamental"),
      grades: Array.from({ length: 9 }, (_, i) => ({
        key: `fondamental_${i + 1}`,
        name: t(`${i + 1}e ane fondamantal`, `${i + 1}${i === 0 ? "re" : "e"} année fondamentale`, `${i + 1}.º año fundamental`),
      })),
    },
    {
      key: "secondaire",
      name: t("Nouvo segondè", "Nouveau secondaire", "Nuevo secundario"),
      grades: [1, 2, 3, 4].map((i) => ({ key: `ns${i}`, name: t(`NS${i}`, `NS${i}`, `NS${i}`) })),
    },
  ],
  periods: [{ key: "trimestriel", name: t("Trimès", "Trimestriel", "Trimestral"), parts: 3 }],
  // Escala 0–10 ya existente en YupiEd Haití (grade_scales 'HT').
  grading: { min: 0, max: 10, pass: 5, exigency: 0.5, decimals: 1 },
  minAttendancePct: null,
};
