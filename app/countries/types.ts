import type { Locale } from "~/services/i18n";

/** Texto en los tres idiomas de la interfaz. */
export type I18nText = Record<Locale, string>;

export interface LevelDef {
  key: string;
  name: I18nText;
  /** Cursos/grados del nivel, en orden. */
  grades: { key: string; name: I18nText }[];
}

export interface AcademicSettings {
  levels: LevelDef[];
  /** Esquemas de periodo admitidos; el primero es el predeterminado. */
  periods: { key: string; name: I18nText; parts: number }[];
  grading: { min: number; max: number; pass: number; exigency: number; decimals: number };
  /** Asistencia mínima de referencia (porcentaje) o null si el país no la define. */
  minAttendancePct: number | null;
}

export interface Localization {
  defaultLocale: Locale;
  locales: Locale[];
  currencies: string[];
  timezone: string;
  dateFormat: "DD/MM/YYYY";
  /** Etiqueta BCP-47 para formatear números/monedas. */
  numberLocale: string;
}

export interface NationalIdRules {
  kind: "rut" | "none";
  label: I18nText | null;
  validate: (value: string) => boolean;
  normalize: (value: string) => string;
  format: (value: string) => string;
}

export interface CountryConfig {
  code: "CL" | "HT";
  slug: string;
  name: I18nText;
  productName: string;
  localization: Localization;
  academic: AcademicSettings;
  nationalId: NationalIdRules;
}
