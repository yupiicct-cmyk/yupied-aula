import { FilterXSS } from "xss";

// Lista blanca de HTML permitido en contenidos enriquecidos (sesiones, actividades, anuncios).
const filter = new FilterXSS({
  whiteList: {
    h2: [], h3: [], h4: [], p: [], br: [], strong: [], b: [], em: [], i: [], u: [], s: [],
    ul: [], ol: [], li: [], blockquote: [], code: [], pre: [], hr: [],
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "width", "height"],
    table: [], thead: [], tbody: [], tr: [], th: [], td: [],
    span: [], div: [],
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style", "iframe", "object"],
  onTagAttr(tag, name, value) {
    if ((tag === "a" && name === "href") || (tag === "img" && name === "src")) {
      const v = value.trim().toLowerCase();
      const okUrl = v.startsWith("https://") || v.startsWith("http://") || v.startsWith("/files/") || v.startsWith("mailto:");
      if (!okUrl) return "";
    }
    return undefined;
  },
});

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return filter.process(html).trim();
}
