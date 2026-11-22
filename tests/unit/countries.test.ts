import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COUNTRIES, countryByCode, countryBySlug, formatCountryDate, formatMoney } from "~/countries/registry";
import { formatRut, normalizeRut, validateRut } from "~/countries/chile/validation";
import { LOCALES } from "~/services/i18n";

describe("RUT chileno", () => {
  it("valida dígito verificador", () => {
    expect(validateRut("76.086.428-5")).toBe(true);
    expect(validateRut("11111111-1")).toBe(true);
    expect(validateRut("10.000.013-k")).toBe(true);
    expect(validateRut("76.086.428-4")).toBe(false);
    expect(validateRut("0-0")).toBe(false);
    expect(validateRut("")).toBe(false);
    expect(validateRut("123456789-0")).toBe(false);
  });
  it("normaliza y formatea", () => {
    expect(normalizeRut("76.086.428-5")).toBe("76086428-5");
    expect(normalizeRut("10000013k")).toBe("10000013-K");
    expect(formatRut("76086428-5")).toBe("76.086.428-5");
  });
});

describe("registro de países", () => {
  it("Chile y Haití con su configuración", () => {
    const cl = countryByCode("CL")!;
    expect(cl.localization).toMatchObject({ timezone: "America/Santiago", currencies: ["CLP"], defaultLocale: "es" });
    expect(cl.academic.levels.map((l) => l.key)).toEqual(["parvularia", "basica", "media"]);
    expect(cl.academic.grading).toMatchObject({ min: 1, max: 7, pass: 4, exigency: 0.6 });
    const ht = countryBySlug("haiti")!;
    expect(ht.localization).toMatchObject({ timezone: "America/Port-au-Prince", currencies: ["HTG", "USD"], locales: ["ht", "fr", "es"] });
    expect(countryBySlug("peru")).toBeNull();
  });
  it("todos los nombres de niveles y grados existen en los tres idiomas", () => {
    for (const c of COUNTRIES)
      for (const l of c.academic.levels) {
        for (const lng of LOCALES) expect(l.name[lng], `${c.code}/${l.key}/${lng}`).toBeTruthy();
        for (const g of l.grades) for (const lng of LOCALES) expect(g.name[lng]).toBeTruthy();
      }
  });
  it("coincide con la siembra de public.countries en la migración", () => {
    const sql = readFileSync("supabase/migrations/20261122000007_international.sql", "utf8");
    for (const c of COUNTRIES) {
      const row = sql.match(new RegExp(`\\('${c.code}',[\\s\\S]*?'(\\{"levels":\\[[^\\]]*\\][^']*)'\\)`));
      expect(row, c.code).toBeTruthy();
      const cfg = JSON.parse(row![1]!) as { levels: string[]; periods: string[] };
      expect(cfg.levels).toEqual(c.academic.levels.map((l) => l.key));
      expect(cfg.periods).toEqual(c.academic.periods.map((p) => p.key));
      expect(sql).toContain(`'${c.localization.timezone}'`);
    }
  });
  it("formatea fecha DD/MM/YYYY en la zona del país y moneda local", () => {
    const cl = countryByCode("CL")!;
    // 02:00 UTC del 1 de marzo = 28/29 feb en Santiago (UTC-3)
    expect(formatCountryDate(cl, "2026-03-01T02:00:00Z")).toBe("28/02/2026");
    expect(formatMoney(cl, 15000)).toMatch(/15\.000/);
  });
});
