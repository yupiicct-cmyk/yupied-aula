import { useEffect, useRef, useState } from "react";
import { Form, Link, redirect, useActionData, useFetcher, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { Archive, CalendarClock, Copy, Eye, Languages, Save, Send, Sparkles } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/edit";
import { requireUser } from "~/services/auth.server";
import { getEnv } from "~/services/env.server";
import { failCode } from "~/services/forms.server";
import { translationAvailable } from "~/services/translate.server";
import { detectLocale, LOCALES, LOCALE_LABELS, pick, type Locale } from "~/services/i18n";
import { LESSON_TEXT_FIELDS } from "~/schemas/content";
import { optionalDate, optionalDateTime, optionalInt } from "~/schemas/common";
import { sanitizeHtml } from "~/utils/sanitize.server";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Tabs, Textarea } from "~/components/ui";
import { RichText } from "~/components/rich-text";
import { StatusBadge } from "~/components/status-badge";
import { FileUpload } from "~/components/file-upload";
import { toLocalInput, fmtDate } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { AppError, check, must, toAppError } from "~/utils/errors";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const locale = detectLocale(request, user.profile.locale);
  const lesson = must(await supabase.from("lessons").select("*").eq("id", params.id).maybeSingle());
  const [tr, modules, mats, linked] = await Promise.all([
    supabase.from("lesson_translations").select("*").eq("lesson_id", lesson.id),
    supabase.from("modules").select("id,position,title_i18n").eq("course_id", lesson.course_id).is("deleted_at", null).order("position"),
    supabase.from("materials").select("id,title,mime_type").eq("course_id", lesson.course_id).eq("status", "ready").is("deleted_at", null).order("title"),
    supabase.from("lesson_materials").select("material_id").eq("lesson_id", lesson.id),
  ]);
  return {
    lesson,
    translations: tr.data ?? [],
    modules: (modules.data ?? []).map((m) => ({ id: m.id, label: `${m.position}. ${pick(m.title_i18n, locale)}` })),
    materials: mats.data ?? [],
    linked: (linked.data ?? []).map((l) => l.material_id),
    aiAvailable: translationAvailable(getEnv(context)),
  };
}

const metaSchema = z.object({
  version: z.coerce.number().int(),
  number: z.coerce.number().int().min(1).max(999),
  module_id: z.string().uuid(),
  scheduled_date: optionalDate,
  duration_minutes: optionalInt,
  original_locale: z.enum(["es", "ht", "fr"]),
  publish_at: optionalDateTime,
});

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "save");
  try {
    const lesson = must(await supabase.from("lessons").select("*").eq("id", params.id).maybeSingle());

    if (intent === "duplicate") {
      const copy = must(await supabase.from("lessons").insert({
        course_id: lesson.course_id, module_id: lesson.module_id, number: lesson.number + 1, duration_minutes: lesson.duration_minutes,
        original_locale: lesson.original_locale, created_by: user.id,
      }).select("id").single());
      const { data: trs } = await supabase.from("lesson_translations").select("*").eq("lesson_id", lesson.id);
      if (trs?.length) check(await supabase.from("lesson_translations").insert(trs.map(({ created_at: _c, updated_at: _u, ...r }) => ({ ...r, lesson_id: copy.id, title: `${r.title} (copia)`, status: "draft" as const }))));
      const { data: lm } = await supabase.from("lesson_materials").select("material_id,position").eq("lesson_id", lesson.id);
      if (lm?.length) check(await supabase.from("lesson_materials").insert(lm.map((m) => ({ ...m, lesson_id: copy.id }))));
      throw redirect(`/app/lessons/${copy.id}/edit`);
    }
    if (intent === "archive" || intent === "unpublish") {
      check(await supabase.from("lessons").update({ status: intent === "archive" ? "archived" : "draft" }).eq("id", lesson.id));
      return { ok: true as const, message: intent === "archive" ? "lessons.archived" : "lessons.unpublished", version: lesson.version };
    }

    const meta = metaSchema.safeParse(Object.fromEntries(fd));
    if (!meta.success) return failCode("invalid_data");
    // Bloqueo optimista: evita sobrescribir cambios hechos en otra pestaña.
    if (meta.data.version !== lesson.version) return failCode("edited_elsewhere", 409);

    const translations = LOCALES.map((l) => {
      const row: Record<string, string> = { title: String(fd.get(`t_${l}_title`) ?? "").trim().slice(0, 300) };
      for (const f of LESSON_TEXT_FIELDS) row[f] = sanitizeHtml(String(fd.get(`t_${l}_${f}`) ?? "")).slice(0, 100000);
      const status = String(fd.get(`t_${l}_status`) ?? "draft");
      return { locale: l, status: (["draft", "ai_proposed", "approved"].includes(status) ? status : "draft") as "draft" | "ai_proposed" | "approved", row,
        links: String(fd.get(`t_${l}_links`) ?? "").split("\n").map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)).slice(0, 30) };
    });
    const original = translations.find((tr) => tr.locale === meta.data.original_locale)!;
    let status = lesson.status;
    let publishAt = meta.data.publish_at;
    if (intent === "publish" || intent === "schedule") {
      if (!original.row.title) return failCode("title_required");
      original.status = "approved";
      if (intent === "schedule") {
        if (!publishAt || Date.parse(publishAt) <= Date.now()) return failCode("publish_at_future");
        status = "scheduled";
      } else { status = "published"; publishAt = null; }
    }

    const { data: updated, error } = await supabase.from("lessons").update({
      number: meta.data.number, module_id: meta.data.module_id, scheduled_date: meta.data.scheduled_date, duration_minutes: meta.data.duration_minutes,
      original_locale: meta.data.original_locale, status, publish_at: publishAt, version: lesson.version + 1,
    }).eq("id", lesson.id).eq("version", lesson.version).select("version").maybeSingle();
    if (error) throw error;
    if (!updated) return failCode("edited_elsewhere", 409);

    const rows = translations.filter((tr) => tr.locale === meta.data.original_locale || tr.row.title || Object.values(tr.row).some((v) => v))
      .map((tr) => ({ lesson_id: lesson.id, locale: tr.locale, status: tr.status, links: tr.links, updated_by: user.id, ...tr.row }));
    check(await supabase.from("lesson_translations").upsert(rows));

    if (fd.has("materials_present")) {
      const wanted = fd.getAll("materials[]").map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v));
      check(await supabase.from("lesson_materials").delete().eq("lesson_id", lesson.id));
      if (wanted.length) check(await supabase.from("lesson_materials").insert(wanted.map((material_id, i) => ({ lesson_id: lesson.id, material_id, position: i + 1 }))));
    }
    const message = intent === "publish" ? "lessons.published" : intent === "schedule" ? "lessons.scheduled" : intent === "autosave" ? "lessons.autosaved" : "common.saved";
    return { ok: true as const, message, version: updated.version };
  } catch (e) {
    if (e instanceof Response) throw e;
    const err = e instanceof AppError ? e : toAppError(e);
    return failCode(err.code, err.status);
  }
}

type Draft = Record<string, string>;

export default function LessonEdit({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const autosaver = useFetcher<typeof action>();
  const { lesson, modules, materials, linked, aiAvailable } = loaderData;
  const formRef = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<Locale>(lesson.original_locale);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(lesson.version);
  const [rev, setRev] = useState<Record<string, number>>({ es: 0, ht: 0, fr: 0 });
  const [translating, setTranslating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const initial = (l: Locale): Draft & { status: string; links: string } => {
    const row = loaderData.translations.find((x) => x.locale === l);
    const d: Draft = { title: row?.title ?? "" };
    for (const f of LESSON_TEXT_FIELDS) d[f] = row?.[f] ?? "";
    return { ...d, status: row?.status ?? "draft", links: ((row?.links as string[] | null) ?? []).join("\n") };
  };
  const [drafts, setDrafts] = useState(() => Object.fromEntries(LOCALES.map((l) => [l, initial(l)])) as Record<Locale, ReturnType<typeof initial>>);

  // Versión nueva tras guardar (manual o automático)
  useEffect(() => { if (a && a.ok && "version" in a) { setVersion(a.version); setDirty(false); } }, [a]);
  useEffect(() => { if (autosaver.data && autosaver.data.ok && "version" in autosaver.data) { setVersion(autosaver.data.version); setDirty(false); } }, [autosaver.data]);
  useEffect(() => { setVersion(lesson.version); }, [lesson.version]);

  // Guardado automático cada 20 s si hay cambios
  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(() => {
      if (!formRef.current || autosaver.state !== "idle") return;
      const fd = new FormData(formRef.current);
      fd.set("intent", "autosave");
      void autosaver.submit(fd, { method: "post" });
    }, 20000);
    return () => clearTimeout(id);
  }, [dirty, autosaver]);

  // Aviso al salir con cambios sin guardar
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  async function propose(target: "ht" | "fr") {
    if (!formRef.current) return;
    setTranslating(true); setAiError(null);
    const fd = new FormData(formRef.current);
    const src = lesson.original_locale;
    const keys = ["title", ...LESSON_TEXT_FIELDS];
    const texts = keys.map((k) => String(fd.get(`t_${src}_${k}`) ?? ""));
    try {
      const res = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, texts }) })
        .then((r) => r.json() as Promise<{ ok: boolean; texts?: string[]; error?: string }>);
      if (!res.ok || !res.texts) throw new Error(res.error ?? "unexpected");
      setDrafts((d) => ({ ...d, [target]: { ...d[target], ...Object.fromEntries(keys.map((k, i) => [k, res.texts![i] ?? ""])), status: "ai_proposed" } }));
      setRev((r) => ({ ...r, [target]: (r[target] ?? 0) + 1 }));
      setTab(target);
      setDirty(true);
    } catch (e) {
      setAiError((e as Error).message);
    } finally { setTranslating(false); }
  }

  const busy = nav.state === "submitting";
  const errorCode = a && !a.ok ? a.error : autosaver.data && !autosaver.data.ok ? autosaver.data.error : null;
  const lastMsg = a && a.ok ? a.message : null;

  return (
    <>
      <PageHeader title={t("lessons.builder")} description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={lesson.status} />
        {lesson.status === "scheduled" && lesson.publish_at && <span>{t("lessons.scheduled_for", { date: fmtDate(lesson.publish_at, locale, true) })}</span>}
        {autosaver.state !== "idle" ? <Badge tone="blue">{t("lessons.saving")}</Badge> : dirty ? <Badge tone="amber">{t("lessons.unsaved")}</Badge> : <Badge tone="green">{t("lessons.all_saved")}</Badge>}</span>}
        actions={<>
          <Link to={`/app/lessons/${lesson.id}?preview=1`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50 dark:border-white/15 dark:hover:bg-white/5"><Eye className="h-4 w-4" />{t("lessons.preview")}</Link>
          <Form method="post"><input type="hidden" name="intent" value="duplicate" /><Button variant="outline" loading={busy && nav.formData?.get("intent") === "duplicate"}><Copy className="h-4 w-4" />{t("lessons.duplicate")}</Button></Form>
          <Form method="post" onSubmit={(e) => { if (!confirm(t("common.are_you_sure"))) e.preventDefault(); }}><input type="hidden" name="intent" value="archive" /><Button variant="ghost"><Archive className="h-4 w-4" />{t("common.archive")}</Button></Form>
        </>} />

      {lastMsg && <div className="mb-4"><Alert tone="green">{t(lastMsg)}</Alert></div>}
      {errorCode && <div className="mb-4"><Alert>{t(`errors.${errorCode}`)}</Alert></div>}

      <Form method="post" ref={formRef} onChange={() => setDirty(true)} className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <input type="hidden" name="version" value={version} />
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
              <Tabs active={tab} onChange={(k) => setTab(k as Locale)} items={LOCALES.map((l) => ({ key: l, label: <span className="flex items-center gap-1.5">{LOCALE_LABELS[l]}{l === lesson.original_locale && <Badge tone="navy">{t("translation.original")}</Badge>}</span> }))} />
              {aiAvailable && (
                <div className="flex gap-1">
                  {(["ht", "fr"] as const).filter((l) => l !== lesson.original_locale).map((l) => (
                    <Button key={l} type="button" size="sm" variant="outline" loading={translating} onClick={() => void propose(l)}><Sparkles className="h-3.5 w-3.5" />{t("translation.propose", { lang: l.toUpperCase() })}</Button>
                  ))}
                </div>
              )}
            </div>
            {aiError && <div className="px-4 pt-3"><Alert>{t(`errors.${aiError}`, { defaultValue: t("errors.unexpected") })}</Alert></div>}
            {LOCALES.map((l) => (
              <div key={l} hidden={tab !== l} className="space-y-5 p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label={t("common.title")} htmlFor={`t_${l}_title`} className="min-w-64 flex-1">
                    <Input key={`${l}-title-${rev[l]}`} id={`t_${l}_title`} name={`t_${l}_title`} defaultValue={drafts[l].title} maxLength={300} />
                  </Field>
                  <Field label={t("translation.status")} htmlFor={`t_${l}_status`}>
                    <Select key={`${l}-st-${rev[l]}`} id={`t_${l}_status`} name={`t_${l}_status`} defaultValue={drafts[l].status}>
                      {(["draft", "ai_proposed", "approved"] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                    </Select>
                  </Field>
                </div>
                {drafts[l].status === "ai_proposed" && <Alert tone="amber"><Languages className="mr-1 inline h-4 w-4" />{t("translation.review_notice")}</Alert>}
                {LESSON_TEXT_FIELDS.map((f) => (
                  <RichText key={`${l}-${f}-${rev[l]}`} name={`t_${l}_${f}`} defaultValue={drafts[l][f]} label={t(`lessons.fields.${f}`)} onChange={() => setDirty(true)}
                    minHeight={["development", "contents"].includes(f) ? 180 : 90} />
                ))}
                <Field label={t("lessons.links")} htmlFor={`t_${l}_links`} hint={t("lessons.links_hint")}>
                  <Textarea key={`${l}-links-${rev[l]}`} id={`t_${l}_links`} name={`t_${l}_links`} defaultValue={drafts[l].links} className="font-mono text-xs" />
                </Field>
              </div>
            ))}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t("lessons.publication")} />
            <div className="space-y-3 p-5">
              <Button type="submit" name="intent" value="save" variant="outline" className="w-full" loading={busy && nav.formData?.get("intent") === "save"}><Save className="h-4 w-4" />{t("lessons.save_draft")}</Button>
              <Button type="submit" name="intent" value="publish" className="w-full" loading={busy && nav.formData?.get("intent") === "publish"}><Send className="h-4 w-4" />{t("lessons.publish")}</Button>
              <Field label={t("lessons.publish_at")} htmlFor="publish_at"><Input id="publish_at" name="publish_at" type="datetime-local" defaultValue={toLocalInput(lesson.publish_at)} /></Field>
              <Button type="submit" name="intent" value="schedule" variant="secondary" className="w-full"><CalendarClock className="h-4 w-4" />{t("lessons.schedule")}</Button>
              {lesson.status === "published" && <Button type="submit" name="intent" value="unpublish" variant="ghost" className="w-full">{t("lessons.unpublish")}</Button>}
            </div>
          </Card>
          <Card>
            <CardHeader title={t("lessons.details")} />
            <div className="space-y-4 p-5">
              <Field label={t("lessons.number")} htmlFor="number"><Input id="number" name="number" type="number" min={1} defaultValue={lesson.number} /></Field>
              <Field label={t("nav.modules")} htmlFor="module_id"><Select id="module_id" name="module_id" defaultValue={lesson.module_id}>{modules.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
              <Field label={t("lessons.date")} htmlFor="scheduled_date"><Input id="scheduled_date" name="scheduled_date" type="date" defaultValue={lesson.scheduled_date ?? ""} /></Field>
              <Field label={t("lessons.duration")} htmlFor="duration_minutes"><Input id="duration_minutes" name="duration_minutes" type="number" min={1} max={1440} defaultValue={lesson.duration_minutes ?? ""} /></Field>
              <Field label={t("translation.original_language")} htmlFor="original_locale"><Select id="original_locale" name="original_locale" defaultValue={lesson.original_locale}>{LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}</Select></Field>
            </div>
          </Card>
          <Card>
            <CardHeader title={t("lessons.fields.complementary")} description={t("lessons.materials_hint")} />
            <input type="hidden" name="materials_present" value="1" />
            <div className="max-h-72 space-y-1 overflow-y-auto p-4">
              {materials.length === 0 && <p className="text-sm text-slate-500">{t("library.empty")}</p>}
              {materials.map((m) => (
                <label key={m.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
                  <input type="checkbox" name="materials[]" value={m.id} defaultChecked={linked.includes(m.id)} />
                  <span className="truncate">{m.title}</span>
                </label>
              ))}
            </div>
            <div className="border-t border-slate-100 p-4 dark:border-white/10">
              <FileUpload purpose="material" courseId={lesson.course_id} label={t("library.upload")} multiple />
              <p className="mt-2 text-xs text-slate-500">{t("lessons.upload_then_check")}</p>
            </div>
          </Card>
        </div>
      </Form>
    </>
  );
}
