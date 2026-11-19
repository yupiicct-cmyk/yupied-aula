import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../app");
const LANGS = ["es", "ht", "fr"] as const;

function flat(o: Record<string, unknown>, p = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === "object") Object.assign(out, flat(v as Record<string, unknown>, `${p}${k}.`));
    else out[`${p}${k}`] = String(v);
  }
  return out;
}
function load(lang: string) {
  const dir = join(root, "locales", lang);
  const all: Record<string, string> = {};
  for (const f of readdirSync(dir)) Object.assign(all, flat(JSON.parse(readFileSync(join(dir, f), "utf8")), `${f.replace(".json", "")}.`));
  return all;
}
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.(tsx?|ts)$/.test(e.name) ? [join(dir, e.name)] : []));
}

const dicts = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<(typeof LANGS)[number], Record<string, string>>;

describe("internacionalización ES / HT / FR", () => {
  it("los tres idiomas tienen exactamente las mismas claves", () => {
    const es = Object.keys(dicts.es).sort();
    expect(Object.keys(dicts.ht).sort()).toEqual(es);
    expect(Object.keys(dicts.fr).sort()).toEqual(es);
  });

  it("no hay textos vacíos", () => {
    for (const l of LANGS) for (const [k, v] of Object.entries(dicts[l])) expect(v.trim(), `${l}:${k}`).not.toBe("");
  });

  it("las variables {{x}} coinciden entre idiomas", () => {
    const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
    for (const k of Object.keys(dicts.es)) {
      expect(vars(dicts.ht[k]!), `ht:${k}`).toBe(vars(dicts.es[k]!));
      expect(vars(dicts.fr[k]!), `fr:${k}`).toBe(vars(dicts.es[k]!));
    }
  });

  it("toda clave literal usada en el código existe (interfaz 100 % traducida)", () => {
    const missing: string[] = [];
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([a-z0-9_]+(?:\.[a-z0-9_]+)+)"/g)) if (!dicts.es[m[1]!]) missing.push(`${m[1]} (${file})`);
    }
    expect(missing).toEqual([]);
  });

  it("las familias dinámicas (estados, tipos, errores de la BD) están completas", () => {
    const need = [
      ...["draft", "scheduled", "published", "archived", "submitted", "graded", "returned", "in_progress", "present", "absent", "late", "excused", "pending", "approved", "ai_proposed"].map((s) => `status.${s}`),
      ...["multiple_choice", "true_false", "open_question", "fill_blanks", "matching", "ordering", "research", "practical", "file_upload", "group"].map((s) => `activities.types.${s}`),
      ...["already_graded", "deadline_passed", "no_attempts_left", "not_open", "closed", "time_over", "forbidden", "activity_closed", "attempt_closed", "profile_field_locked"].map((s) => `errors.${s}`),
    ];
    for (const k of need) expect(dicts.es[k], k).toBeTruthy();
  });

  it("ejemplos del requerimiento", () => {
    expect(dicts.ht["nav.my_courses"]).toBe("Kou mwen yo");
    expect(dicts.fr["nav.my_grades"]).toBe("Mes notes");
    expect(dicts.ht["activities.submit"]).toBe("Remèt devwa");
    expect(dicts.fr["activities.submit"]).toBe("Remettre le devoir");
  });
});
