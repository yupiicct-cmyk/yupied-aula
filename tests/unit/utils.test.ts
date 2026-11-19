import { describe, expect, it } from "vitest";
import { fromLocalInput } from "~/utils/time";
import { parseCsv, normalizeHeader, toCsv } from "~/utils/csv";
import { sanitizeHtml } from "~/utils/sanitize.server";
import { questionsSchema } from "~/schemas/questions";
import { studentSchema } from "~/schemas/students";
import { safeFileName } from "~/services/storage/r2.server";
import { pick, detectLocale } from "~/services/i18n";

describe("fechas en hora de Chile", () => {
  it("convierte hora local a UTC considerando horario de verano", () => {
    expect(fromLocalInput("2026-01-15T10:00")).toBe("2026-01-15T13:00:00.000Z"); // verano UTC-3
    expect(fromLocalInput("2026-07-15T10:00")).toBe("2026-07-15T14:00:00.000Z"); // invierno UTC-4
  });
});

describe("CSV", () => {
  it("lee comas, punto y coma, comillas y BOM", () => {
    expect(parseCsv('﻿nombre;correo\n"Pierre, Jean";jean@x.cl\n')).toEqual([["nombre", "correo"], ["Pierre, Jean", "jean@x.cl"]]);
    expect(parseCsv('a,b\r\n1,"x ""y"""')).toEqual([["a", "b"], ["1", 'x "y"']]);
  });
  it("normaliza encabezados con acentos", () => {
    expect(normalizeHeader("Correo Electrónico")).toBe("correo_electronico");
  });
  it("escapa valores al exportar", () => {
    expect(toCsv([["a,b", 'c"d']])).toBe('﻿"a,b","c""d"');
  });
});

describe("sanitización de HTML", () => {
  it("elimina scripts, eventos y URLs peligrosas", () => {
    const out = sanitizeHtml('<p onclick="x()">Hola<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><img src="data:x" onerror="y">');
    expect(out).not.toMatch(/script|onclick|javascript|onerror|data:/i);
    expect(out).toContain("<p>Hola</p>");
  });
  it("conserva el formato permitido", () => {
    expect(sanitizeHtml('<h2>T</h2><ul><li><strong>a</strong></li></ul><a href="https://x.org">l</a>')).toBe('<h2>T</h2><ul><li><strong>a</strong></li></ul><a href="https://x.org">l</a>');
  });
});

describe("validación de preguntas", () => {
  const base = { points: 1, prompt: { es: "¿?" }, options: [], meta: {} };
  it("exige marcar la respuesta correcta", () => {
    expect(questionsSchema.safeParse([{ ...base, kind: "single_choice", options: [{ key: "a", label: { es: "A" } }, { key: "b", label: { es: "B" } }] }]).success).toBe(false);
    expect(questionsSchema.safeParse([{ ...base, kind: "single_choice", options: [{ key: "a", label: { es: "A" } }, { key: "b", label: { es: "B" } }], correct: "b" }]).success).toBe(true);
  });
  it("valida verdadero/falso, espacios y ordenar", () => {
    expect(questionsSchema.safeParse([{ ...base, kind: "true_false", correct: false }]).success).toBe(true);
    expect(questionsSchema.safeParse([{ ...base, kind: "fill_blanks", correct: [["Pòtoprens", "Port-au-Prince"]] }]).success).toBe(true);
    expect(questionsSchema.safeParse([{ ...base, kind: "ordering", meta: { items: [{ key: "1", label: {} }] }, correct: ["1"] }]).success).toBe(false);
  });
});

describe("alta de estudiantes", () => {
  it("normaliza el correo y exige contraseña temporal segura", () => {
    const ok = studentSchema.safeParse({ first_name: "Jean", last_name: "Pierre", email: " JEAN@Correo.CL ", access_mode: "password", temp_password: "abc12345" });
    expect(ok.success && ok.data.email).toBe("jean@correo.cl");
    expect(studentSchema.safeParse({ first_name: "J", last_name: "P", email: "j@x.cl", access_mode: "password", temp_password: "123" }).success).toBe(false);
  });
});

describe("archivos e idioma", () => {
  it("nombres de archivo seguros", () => {
    expect(safeFileName("../Guía de clase #1.pdf")).toBe("Guia_de_clase_1.pdf");
  });
  it("elige traducción con respaldo", () => {
    expect(pick({ es: "Hola", ht: "Bonjou" }, "ht")).toBe("Bonjou");
    expect(pick({ es: "Hola" }, "fr")).toBe("Hola");
  });
  it("detecta idioma por cookie y por navegador", () => {
    expect(detectLocale(new Request("https://x", { headers: { Cookie: "aula_lang=ht" } }))).toBe("ht");
    expect(detectLocale(new Request("https://x", { headers: { "Accept-Language": "fr-FR,fr;q=0.9" } }))).toBe("fr");
    expect(detectLocale(new Request("https://x"), "fr")).toBe("fr");
  });
});
