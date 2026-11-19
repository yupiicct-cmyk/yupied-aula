import type { AppEnv } from "~/services/env.server";

/**
 * Traducción asistida OPCIONAL. Usa Workers AI (modelo m2m100, incluye criollo
 * haitiano) solo si el binding AI está configurado. Nunca publica: devuelve
 * propuestas que el profesor revisa y aprueba. Sin binding → función desactivada.
 */
export function translationAvailable(env: AppEnv) {
  return typeof env.AI?.run === "function";
}

const MODEL = "@cf/meta/m2m100-1.2b";

export async function translateTexts(env: AppEnv, texts: string[], target: "ht" | "fr", source = "es"): Promise<string[]> {
  if (!translationAvailable(env)) throw new Error("translation_unavailable");
  const out: string[] = [];
  for (const text of texts) {
    if (!text.trim()) { out.push(""); continue; }
    // Se traducen bloques de texto conservando etiquetas HTML simples.
    const parts = text.split(/(<[^>]+>)/g);
    const translated: string[] = [];
    for (const part of parts) {
      if (!part.trim() || part.startsWith("<")) { translated.push(part); continue; }
      const res = (await env.AI!.run(MODEL, { text: part, source_lang: source, target_lang: target })) as { translated_text?: string };
      translated.push(res.translated_text ?? part);
    }
    out.push(translated.join(""));
  }
  return out;
}
