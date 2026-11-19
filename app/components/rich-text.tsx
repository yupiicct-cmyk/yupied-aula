import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Bold, Heading2, Heading3, Image as ImageIcon, Italic, Link2, List, ListOrdered, Quote, Underline, Undo2 } from "lucide-react";

/**
 * Editor de texto enriquecido liviano (sin dependencias). El HTML se guarda en
 * un <input hidden> y se sanea SIEMPRE en el servidor con lista blanca.
 */
export function RichText({ name, defaultValue = "", label, onChange, minHeight = 120 }:
  { name: string; defaultValue?: string; label: string; onChange?: () => void; minHeight?: number }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== defaultValue) ref.current.innerHTML = defaultValue;
    if (hidden.current) hidden.current.value = defaultValue;
    // Solo al montar o cambiar de documento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const sync = () => {
    if (hidden.current && ref.current) hidden.current.value = ref.current.innerHTML;
    onChange?.();
  };
  const cmd = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    sync();
  };
  const tools = [
    { icon: Bold, label: t("editor.bold"), run: () => cmd("bold") },
    { icon: Italic, label: t("editor.italic"), run: () => cmd("italic") },
    { icon: Underline, label: t("editor.underline"), run: () => cmd("underline") },
    { icon: Heading2, label: t("editor.heading"), run: () => cmd("formatBlock", "h2") },
    { icon: Heading3, label: t("editor.subheading"), run: () => cmd("formatBlock", "h3") },
    { icon: List, label: t("editor.bullets"), run: () => cmd("insertUnorderedList") },
    { icon: ListOrdered, label: t("editor.numbered"), run: () => cmd("insertOrderedList") },
    { icon: Quote, label: t("editor.quote"), run: () => cmd("formatBlock", "blockquote") },
    { icon: Link2, label: t("editor.link"), run: () => { const u = prompt(t("editor.link_prompt"), "https://"); if (u && /^https?:\/\//.test(u)) cmd("createLink", u); } },
    { icon: ImageIcon, label: t("editor.image"), run: () => { const u = prompt(t("editor.image_prompt"), "/files/material/"); if (u && (/^https?:\/\//.test(u) || u.startsWith("/files/"))) cmd("insertImage", u); } },
    { icon: Undo2, label: t("editor.undo"), run: () => cmd("undo") },
  ];
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 dark:border-white/15 dark:bg-navy-950">
        <div className="flex flex-wrap gap-0.5 border-b border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/5" role="toolbar" aria-label={label}>
          {tools.map((tool) => (
            <button key={tool.label} type="button" onMouseDown={(e) => e.preventDefault()} onClick={tool.run} title={tool.label} aria-label={tool.label}
              className="rounded p-1.5 text-slate-600 hover:bg-white hover:text-navy-900 dark:text-slate-300 dark:hover:bg-white/10">
              <tool.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label}
          className="prose-content px-3 py-2 outline-none" style={{ minHeight }} onInput={sync} onBlur={sync} />
      </div>
      <input ref={hidden} type="hidden" name={name} defaultValue={defaultValue} />
    </div>
  );
}

/** Muestra HTML ya saneado en el servidor. */
export function RichView({ html, className }: { html: string; className?: string }) {
  if (!html) return null;
  return <div className={`prose-content ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
