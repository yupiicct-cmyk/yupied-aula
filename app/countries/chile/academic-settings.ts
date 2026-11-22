import type { AcademicSettings, I18nText } from "../types";

const t = (es: string, fr = es, ht = es): I18nText => ({ es, fr, ht });
const n = (i: number, suffix: string) => t(`${i}° ${suffix}`);

/**
 * Niveles del sistema escolar chileno. Cada establecimiento habilita los que imparte
 * (institutions.levels); los grados dentro de cada nivel son fijos por ley.
 */
export const academic: AcademicSettings = {
  levels: [
    {
      key: "parvularia",
      name: t("Educación Parvularia", "Éducation préscolaire", "Edikasyon prechkolè"),
      grades: [
        { key: "sala_cuna_menor", name: t("Sala Cuna Menor") },
        { key: "sala_cuna_mayor", name: t("Sala Cuna Mayor") },
        { key: "medio_menor", name: t("Nivel Medio Menor") },
        { key: "medio_mayor", name: t("Nivel Medio Mayor") },
        { key: "nt1", name: t("Pre-kínder (NT1)") },
        { key: "nt2", name: t("Kínder (NT2)") },
      ],
    },
    {
      key: "basica",
      name: t("Educación Básica", "Enseignement de base", "Edikasyon debaz"),
      grades: Array.from({ length: 8 }, (_, i) => ({ key: `basica_${i + 1}`, name: n(i + 1, "Básico") })),
    },
    {
      key: "media",
      name: t("Educación Media", "Enseignement secondaire", "Edikasyon segondè"),
      grades: Array.from({ length: 4 }, (_, i) => ({ key: `media_${i + 1}`, name: n(i + 1, "Medio") })),
    },
  ],
  periods: [
    { key: "semestral", name: t("Semestral", "Semestriel", "Semès"), parts: 2 },
    { key: "trimestral", name: t("Trimestral", "Trimestriel", "Trimès"), parts: 3 },
  ],
  // Escala 1,0–7,0, aprobación 4,0 con 60 % de exigencia (misma que app.scale_grade).
  grading: { min: 1, max: 7, pass: 4, exigency: 0.6, decimals: 1 },
  // Referencia de promoción por asistencia (85 %); cada establecimiento puede ajustarla.
  minAttendancePct: 85,
};
