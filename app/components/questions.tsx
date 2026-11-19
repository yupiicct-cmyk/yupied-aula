import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { KINDS, type Kind, type PublicQuestion } from "~/schemas/questions";
import { Badge, Button, Card, Input, Select, Textarea } from "~/components/ui";
import { LOCALES, pick, type Locale } from "~/services/i18n";
import { cn } from "~/utils/cn";

type L = Record<string, string>;
type Item = { key: string; label: L };
export type EditableQuestion = {
  id?: string; kind: Kind; points: number; prompt: L; options: Item[];
  meta: { left?: Item[]; right?: Item[]; items?: Item[]; blanks?: number };
  correct: unknown;
};

const newKey = () => Math.random().toString(36).slice(2, 8);
const emptyL = (): L => ({ es: "", ht: "", fr: "" });

function blank(kind: Kind): EditableQuestion {
  const base = { kind, points: 1, prompt: emptyL(), options: [] as Item[], meta: {}, correct: null as unknown };
  if (kind === "single_choice" || kind === "multiple_choice") base.options = [{ key: "a", label: emptyL() }, { key: "b", label: emptyL() }];
  if (kind === "multiple_choice") base.correct = [];
  if (kind === "true_false") base.correct = true;
  if (kind === "fill_blanks") base.correct = [[""]];
  if (kind === "matching") return { ...base, meta: { left: [{ key: "l1", label: emptyL() }, { key: "l2", label: emptyL() }], right: [{ key: "r1", label: emptyL() }, { key: "r2", label: emptyL() }] }, correct: { l1: "r1", l2: "r2" } };
  if (kind === "ordering") return { ...base, meta: { items: [{ key: "i1", label: emptyL() }, { key: "i2", label: emptyL() }] }, correct: ["i1", "i2"] };
  return base;
}

/** Campos ES/HT/FR compactos */
function TriInput({ value, onChange, placeholder, multiline }: { value: L; onChange: (v: L) => void; placeholder: string; multiline?: boolean }) {
  return (
    <div className="grid gap-1 sm:grid-cols-3">
      {LOCALES.map((l) => multiline ? (
        <Textarea key={l} value={value[l] ?? ""} onChange={(e) => onChange({ ...value, [l]: e.target.value })} placeholder={`${placeholder} (${l.toUpperCase()})`} className="min-h-16 text-xs" aria-label={`${placeholder} ${l}`} />
      ) : (
        <Input key={l} value={value[l] ?? ""} onChange={(e) => onChange({ ...value, [l]: e.target.value })} placeholder={`${placeholder} (${l.toUpperCase()})`} className="h-8 text-xs" aria-label={`${placeholder} ${l}`} />
      ))}
    </div>
  );
}

/** Constructor de preguntas (actividades y evaluaciones). Se envía como JSON en `name`. */
export function QuestionEditor({ name, initial, locked }: { name: string; initial: EditableQuestion[]; locked?: boolean }) {
  const { t } = useTranslation();
  const [qs, setQs] = useState<EditableQuestion[]>(initial);
  const [kind, setKind] = useState<Kind>("single_choice");
  const update = (i: number, patch: Partial<EditableQuestion>) => setQs((all) => all.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: number) => setQs((all) => { const a = [...all]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x!); return a; });
  const total = qs.reduce((s, q) => s + Number(q.points || 0), 0);

  return (
    <div className="space-y-4">
      <input type="hidden" name={name} value={JSON.stringify(qs)} />
      {locked && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{t("questions.locked")}</p>}
      {qs.map((q, i) => (
        <Card key={i} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="navy">{i + 1}</Badge>
            <Badge tone="blue">{t(`questions.kinds.${q.kind}`)}</Badge>
            <label className="ml-auto flex items-center gap-1 text-xs">{t("questions.points")}
              <Input type="number" min={0} step="0.5" value={q.points} onChange={(e) => update(i, { points: Number(e.target.value) })} className="h-8 w-20" disabled={locked} /></label>
            <Button type="button" size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0 || locked} aria-label={t("common.move_up")}><ArrowUp className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === qs.length - 1 || locked} aria-label={t("common.move_down")}><ArrowDown className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="ghost" className="text-red-600" onClick={() => setQs((a) => a.filter((_, j) => j !== i))} disabled={locked} aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></Button>
          </div>
          <TriInput value={q.prompt} onChange={(prompt) => update(i, { prompt })} placeholder={q.kind === "fill_blanks" ? t("questions.prompt_blanks") : t("questions.prompt")} multiline />

          {(q.kind === "single_choice" || q.kind === "multiple_choice") && (
            <div className="space-y-2">
              {q.options.map((o, oi) => {
                const isCorrect = q.kind === "single_choice" ? q.correct === o.key : Array.isArray(q.correct) && (q.correct as string[]).includes(o.key);
                return (
                  <div key={o.key} className="flex items-start gap-2">
                    <input type={q.kind === "single_choice" ? "radio" : "checkbox"} name={`c-${i}`} checked={isCorrect} disabled={locked} className="mt-2" title={t("questions.mark_correct")}
                      onChange={() => update(i, { correct: q.kind === "single_choice" ? o.key : isCorrect ? (q.correct as string[]).filter((k) => k !== o.key) : [...((q.correct as string[]) ?? []), o.key] })} />
                    <div className="flex-1"><TriInput value={o.label} placeholder={`${t("questions.option")} ${String.fromCharCode(65 + oi)}`}
                      onChange={(label) => update(i, { options: q.options.map((x, k) => (k === oi ? { ...x, label } : x)) })} /></div>
                    <Button type="button" size="icon" variant="ghost" disabled={locked || q.options.length <= 2} onClick={() => update(i, { options: q.options.filter((_, k) => k !== oi) })} aria-label={t("common.delete")}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                );
              })}
              <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => update(i, { options: [...q.options, { key: newKey(), label: emptyL() }] })}><Plus className="h-3.5 w-3.5" />{t("questions.add_option")}</Button>
            </div>
          )}

          {q.kind === "true_false" && (
            <div className="flex gap-4 text-sm">
              {[true, false].map((v) => (
                <label key={String(v)} className="flex items-center gap-2"><input type="radio" name={`tf-${i}`} checked={q.correct === v} disabled={locked} onChange={() => update(i, { correct: v })} />{v ? t("questions.true") : t("questions.false")}</label>
              ))}
            </div>
          )}

          {q.kind === "fill_blanks" && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">{t("questions.blanks_help")}</p>
              {(q.correct as string[][]).map((alts, bi) => (
                <div key={bi} className="flex items-center gap-2">
                  <span className="w-20 text-xs font-medium">{t("questions.blank_n", { n: bi + 1 })}</span>
                  <Input value={alts.join(" | ")} disabled={locked} placeholder={t("questions.accepted_answers")} className="h-8 text-xs"
                    onChange={(e) => update(i, { correct: (q.correct as string[][]).map((x, k) => (k === bi ? e.target.value.split("|").map((s) => s.trim()) : x)) })} />
                  <Button type="button" size="icon" variant="ghost" disabled={locked} onClick={() => { const c = (q.correct as string[][]).filter((_, k) => k !== bi); update(i, { correct: c, meta: { blanks: c.length } }); }} aria-label={t("common.delete")}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => { const c = [...(q.correct as string[][]), [""]]; update(i, { correct: c, meta: { blanks: c.length } }); }}><Plus className="h-3.5 w-3.5" />{t("questions.add_blank")}</Button>
            </div>
          )}

          {q.kind === "matching" && (
            <div className="space-y-2">
              {(q.meta.left ?? []).map((l, li) => {
                const r = (q.meta.right ?? [])[li];
                return (
                  <div key={l.key} className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
                    <TriInput value={l.label} placeholder={t("questions.concept")} onChange={(label) => update(i, { meta: { ...q.meta, left: q.meta.left!.map((x, k) => (k === li ? { ...x, label } : x)) } })} />
                    <span className="self-center text-center text-slate-400">↔</span>
                    {r && <TriInput value={r.label} placeholder={t("questions.match")} onChange={(label) => update(i, { meta: { ...q.meta, right: q.meta.right!.map((x, k) => (k === li ? { ...x, label } : x)) } })} />}
                    <Button type="button" size="icon" variant="ghost" disabled={locked || (q.meta.left ?? []).length <= 2} aria-label={t("common.delete")} onClick={() => {
                      const left = q.meta.left!.filter((_, k) => k !== li); const right = q.meta.right!.filter((_, k) => k !== li);
                      update(i, { meta: { left, right }, correct: Object.fromEntries(left.map((x, k) => [x.key, right[k]!.key])) });
                    }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                );
              })}
              <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => {
                const left = [...(q.meta.left ?? []), { key: `l${newKey()}`, label: emptyL() }]; const right = [...(q.meta.right ?? []), { key: `r${newKey()}`, label: emptyL() }];
                update(i, { meta: { left, right }, correct: Object.fromEntries(left.map((x, k) => [x.key, right[k]!.key])) });
              }}><Plus className="h-3.5 w-3.5" />{t("questions.add_pair")}</Button>
            </div>
          )}

          {q.kind === "ordering" && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">{t("questions.ordering_help")}</p>
              {(q.meta.items ?? []).map((it, ii) => (
                <div key={it.key} className="flex items-start gap-2">
                  <span className="mt-1.5 w-6 text-xs font-bold">{ii + 1}.</span>
                  <div className="flex-1"><TriInput value={it.label} placeholder={t("questions.step")} onChange={(label) => update(i, { meta: { items: q.meta.items!.map((x, k) => (k === ii ? { ...x, label } : x)) } })} /></div>
                  <Button type="button" size="icon" variant="ghost" disabled={locked || (q.meta.items ?? []).length <= 2} aria-label={t("common.delete")} onClick={() => { const items = q.meta.items!.filter((_, k) => k !== ii); update(i, { meta: { items }, correct: items.map((x) => x.key) }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => { const items = [...(q.meta.items ?? []), { key: `i${newKey()}`, label: emptyL() }]; update(i, { meta: { items }, correct: items.map((x) => x.key) }); }}><Plus className="h-3.5 w-3.5" />{t("questions.add_step")}</Button>
            </div>
          )}
          {q.kind === "open" && <p className="text-xs text-slate-500">{t("questions.open_help")}</p>}
        </Card>
      ))}
      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="w-auto" aria-label={t("questions.kind")}>
            {KINDS.map((k) => <option key={k} value={k}>{t(`questions.kinds.${k}`)}</option>)}
          </Select>
          <Button type="button" variant="outline" onClick={() => setQs((a) => [...a, blank(kind)])}><Plus className="h-4 w-4" />{t("questions.add")}</Button>
          <span className="ml-auto text-sm text-slate-500">{t("questions.total_points", { n: total })}</span>
        </div>
      )}
    </div>
  );
}

export type Answers = Record<string, unknown>;

/** Formulario de respuesta del estudiante. */
export function QuestionRunner({ questions, answers, onChange, locale, disabled }:
  { questions: PublicQuestion[]; answers: Answers; onChange: (a: Answers) => void; locale: Locale; disabled?: boolean }) {
  const { t } = useTranslation();
  const set = (id: string, v: unknown) => onChange({ ...answers, [id]: v });
  return (
    <ol className="space-y-5">
      {questions.map((q, i) => {
        const prompt = pick(q.prompt, locale);
        const a = answers[q.id];
        return (
          <li key={q.id} className="card p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="font-medium"><span className="mr-2 text-brand-600">{i + 1}.</span>{q.kind === "fill_blanks" ? prompt.replace(/_{3,}/g, "____") : prompt}</p>
              <Badge>{t("questions.points_n", { n: q.points })}</Badge>
            </div>
            {(q.kind === "single_choice" || q.kind === "true_false") && (
              <div className="space-y-2">{q.options.map((o) => (
                <label key={o.key} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm", a === o.key ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-slate-200 dark:border-white/10")}>
                  <input type="radio" name={`q-${q.id}`} checked={a === o.key} disabled={disabled} onChange={() => set(q.id, o.key)} />{pick(o.label, locale)}
                </label>
              ))}</div>
            )}
            {q.kind === "multiple_choice" && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">{t("questions.select_all")}</p>
                {q.options.map((o) => {
                  const arr = Array.isArray(a) ? (a as string[]) : [];
                  const on = arr.includes(o.key);
                  return (
                    <label key={o.key} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm", on ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-slate-200 dark:border-white/10")}>
                      <input type="checkbox" checked={on} disabled={disabled} onChange={() => set(q.id, on ? arr.filter((k) => k !== o.key) : [...arr, o.key])} />{pick(o.label, locale)}
                    </label>
                  );
                })}
              </div>
            )}
            {q.kind === "open" && <Textarea value={String(a ?? "")} disabled={disabled} onChange={(e) => set(q.id, e.target.value)} maxLength={10000} aria-label={prompt} />}
            {q.kind === "fill_blanks" && (
              <div className="grid gap-2 sm:grid-cols-2">{Array.from({ length: q.meta.blanks ?? 1 }, (_, bi) => {
                const arr = Array.isArray(a) ? (a as string[]) : [];
                return <Input key={bi} value={arr[bi] ?? ""} disabled={disabled} placeholder={t("questions.blank_n", { n: bi + 1 })} aria-label={t("questions.blank_n", { n: bi + 1 })}
                  onChange={(e) => { const next = [...arr]; next[bi] = e.target.value; set(q.id, next); }} />;
              })}</div>
            )}
            {q.kind === "matching" && (
              <div className="space-y-2">{(q.meta.left ?? []).map((l) => {
                const obj = (a && typeof a === "object" && !Array.isArray(a) ? a : {}) as Record<string, string>;
                return (
                  <div key={l.key} className="grid items-center gap-2 sm:grid-cols-2">
                    <span className="text-sm">{pick(l.label, locale)}</span>
                    <Select value={obj[l.key] ?? ""} disabled={disabled} onChange={(e) => set(q.id, { ...obj, [l.key]: e.target.value })} aria-label={pick(l.label, locale)}>
                      <option value="">—</option>{(q.meta.right ?? []).map((r) => <option key={r.key} value={r.key}>{pick(r.label, locale)}</option>)}
                    </Select>
                  </div>
                );
              })}</div>
            )}
            {q.kind === "ordering" && <OrderingInput q={q} value={Array.isArray(a) ? (a as string[]) : (q.meta.items ?? []).map((x) => x.key)} disabled={disabled} locale={locale} onChange={(v) => set(q.id, v)} />}
          </li>
        );
      })}
    </ol>
  );
}

function OrderingInput({ q, value, onChange, locale, disabled }: { q: PublicQuestion; value: string[]; onChange: (v: string[]) => void; locale: Locale; disabled?: boolean }) {
  const { t } = useTranslation();
  const items = value.map((k) => (q.meta.items ?? []).find((x) => x.key === k)).filter(Boolean) as Item[];
  const move = (i: number, d: number) => { const a = [...value]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x!); onChange(a); };
  return (
    <ul className="space-y-2">{items.map((it, i) => (
      <li key={it.key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-white/10">
        <span className="font-bold text-brand-600">{i + 1}</span><span className="flex-1">{pick(it.label, locale)}</span>
        <Button type="button" size="icon" variant="ghost" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={t("common.move_up")}><ArrowUp className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" disabled={disabled || i === items.length - 1} onClick={() => move(i, 1)} aria-label={t("common.move_down")}><ArrowDown className="h-4 w-4" /></Button>
      </li>
    ))}</ul>
  );
}

/** Revisión de una respuesta (profesor). */
export function AnswerReview({ q, answer, correct, score, locale }: { q: PublicQuestion; answer: unknown; correct: unknown; score: number | null; locale: Locale }) {
  const { t } = useTranslation();
  const label = (key: string, list?: Item[]) => pick((list ?? q.options).find((o) => o.key === key)?.label, locale, key);
  const show = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (q.kind === "single_choice" || q.kind === "true_false") return label(String(v));
    if (q.kind === "multiple_choice" && Array.isArray(v)) return v.map((k) => label(String(k))).join(", ");
    if (q.kind === "ordering" && Array.isArray(v)) return v.map((k) => label(String(k), q.meta.items)).join(" → ");
    if (q.kind === "matching" && typeof v === "object") return Object.entries(v as Record<string, string>).map(([l, r]) => `${label(l, q.meta.left)} = ${label(r, q.meta.right)}`).join("; ");
    if (Array.isArray(v)) return v.map((x) => (Array.isArray(x) ? x.join(" / ") : String(x))).join(" | ");
    return String(v);
  };
  const full = score !== null && score >= q.points;
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">{pick(q.prompt, locale)}</p>
      <p className="flex items-start gap-1">{score === null ? null : full ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 text-red-500" />}
        <span><span className="text-slate-500">{t("questions.answer")}:</span> {show(answer)}</span></p>
      {correct !== null && correct !== undefined && <p className="text-slate-500">{t("questions.correct_answer")}: {show(correct)}</p>}
    </div>
  );
}
