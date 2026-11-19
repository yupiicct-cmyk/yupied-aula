import { useState } from "react";
import { Form, useActionData, useFetcher, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { Megaphone, Pin, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/announcements";
import { requireUser } from "~/services/auth.server";
import { getCourses } from "~/services/courses.server";
import { detectLocale } from "~/services/i18n";
import { pickTranslation } from "~/services/content.server";
import { failCode } from "~/services/forms.server";
import { optionalDateTime, checkbox } from "~/schemas/common";
import { sanitizeHtml } from "~/utils/sanitize.server";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select } from "~/components/ui";
import { I18nInputs } from "~/components/i18n-inputs";
import { RichText, RichView } from "~/components/rich-text";
import { StatusBadge } from "~/components/status-badge";
import { fmtDate } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, must, toAppError } from "~/utils/errors";
import { LOCALES, LOCALE_LABELS } from "~/services/i18n";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const locale = detectLocale(request, user.profile.locale);
  const { courses, course } = await getCourses(request, supabase);
  const { data: anns } = await supabase.from("announcements").select("*").is("deleted_at", null).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(50);
  const ids = (anns ?? []).map((a) => a.id);
  const { data: trs } = ids.length ? await supabase.from("announcement_translations").select("*").in("announcement_id", ids) : { data: [] };
  const names = new Map(courses.map((c) => [c.id, c.name]));
  return {
    isTeacher: user.isTeacher, userId: user.id, courses: courses.map((c) => ({ id: c.id, name: c.name })), activeCourse: course?.id ?? "",
    items: (anns ?? []).map((a) => {
      const tr = pickTranslation((trs ?? []).filter((x) => x.announcement_id === a.id), locale, a.original_locale);
      return { ...a, title: tr?.title ?? "", body: tr?.body ?? "", course: a.course_id ? names.get(a.course_id) ?? "" : null };
    }),
  };
}

const schema = z.object({ course_id: z.string().uuid().or(z.literal("")), publish_at: optionalDateTime, pinned: checkbox });

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const fd = await request.formData();
  try {
    const id = z.string().uuid().safeParse(fd.get("id"));
    if (fd.get("intent") === "delete" && id.success) { check(await supabase.from("announcements").update({ deleted_at: new Date().toISOString() }).eq("id", id.data)); return { ok: true as const }; }
    if (fd.get("intent") === "pin" && id.success) { check(await supabase.from("announcements").update({ pinned: fd.get("pinned") === "true" }).eq("id", id.data)); return { ok: true as const }; }
    const p = schema.parse(Object.fromEntries(fd));
    const trs = LOCALES.map((l) => ({ locale: l, title: String(fd.get(`title_${l}`) ?? "").trim().slice(0, 200), body: sanitizeHtml(String(fd.get(`body_${l}`) ?? "")) })).filter((x) => x.title || x.body);
    if (!trs.some((x) => x.title)) return failCode("title_required");
    const scheduled = p.publish_at && Date.parse(p.publish_at) > Date.now();
    const ann = must(await supabase.from("announcements").insert({
      course_id: p.course_id || null, author_id: user.id, pinned: p.pinned, publish_at: p.publish_at, status: scheduled ? "scheduled" : "published", original_locale: trs[0]!.locale,
    }).select("id").single());
    check(await supabase.from("announcement_translations").insert(trs.map((x) => ({ ...x, announcement_id: ann.id, status: "approved" as const }))));
    return { ok: true as const, message: scheduled ? "lessons.scheduled" : "announcements.published" };
  } catch (e) {
    return failCode(e instanceof z.ZodError ? "invalid_data" : toAppError(e).code);
  }
}

export default function Announcements({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const a = useActionData<typeof action>();
  const nav = useNavigation();
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("es");
  return (
    <>
      <PageHeader title={loaderData.isTeacher ? t("nav.communications") : t("nav.announcements")}
        actions={loaderData.isTeacher && <Button onClick={() => setOpen((o) => !o)}><Plus className="h-4 w-4" />{t("announcements.create")}</Button>} />
      {a && a.ok && <div className="mb-4"><Alert tone="green">{t(a.message ?? "common.saved")}</Alert></div>}
      {a && !a.ok && <div className="mb-4"><Alert>{t(`errors.${a.error}`)}</Alert></div>}
      {open && (
        <Card className="mb-6 p-5">
          <Form method="post" className="space-y-4" onSubmit={() => setOpen(false)}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("announcements.audience")} htmlFor="course_id"><Select id="course_id" name="course_id" defaultValue={loaderData.activeCourse}>
                <option value="">{t("announcements.general")}</option>{loaderData.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label={t("lessons.publish_at")} htmlFor="publish_at" hint={t("announcements.now_if_empty")}><Input id="publish_at" name="publish_at" type="datetime-local" /></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="pinned" />{t("announcements.pin")}</label>
            </div>
            <div className="flex gap-1">{LOCALES.map((l) => <button type="button" key={l} onClick={() => setTab(l)} className={`rounded-md px-3 py-1 text-sm ${tab === l ? "bg-brand-500 text-white" : "bg-slate-100 dark:bg-white/10"}`}>{LOCALE_LABELS[l]}</button>)}</div>
            {LOCALES.map((l) => (
              <div key={l} hidden={tab !== l} className="space-y-3">
                <Input name={`title_${l}`} placeholder={`${t("common.title")} (${l.toUpperCase()})`} aria-label={`${t("common.title")} ${l}`} />
                <RichText name={`body_${l}`} label={`${t("announcements.message")} (${l.toUpperCase()})`} />
              </div>
            ))}
            <Button loading={nav.state === "submitting"}><Megaphone className="h-4 w-4" />{t("announcements.publish")}</Button>
          </Form>
        </Card>
      )}
      {loaderData.items.length === 0 ? <Card><EmptyState icon={<Megaphone />} title={t("announcements.none")} /></Card> : (
        <div className="space-y-4">{loaderData.items.map((n) => (
          <Card key={n.id} className="p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {n.pinned && <Pin className="h-4 w-4 text-brand-500" />}
              <h2 className="flex-1 font-semibold text-navy-900 dark:text-white">{n.title}</h2>
              <Badge tone={n.course ? "blue" : "navy"}>{n.course ?? t("announcements.general")}</Badge>
              {loaderData.isTeacher && n.status !== "published" && <StatusBadge status={n.status} />}
              <span className="text-xs text-slate-500">{fmtDate(n.publish_at ?? n.created_at, locale, true)}</span>
              {loaderData.isTeacher && n.author_id === loaderData.userId && (<>
                <fetcher.Form method="post"><input type="hidden" name="intent" value="pin" /><input type="hidden" name="id" value={n.id} /><input type="hidden" name="pinned" value={String(!n.pinned)} />
                  <Button size="icon" variant="ghost" aria-label={t("announcements.pin")}><Pin className="h-4 w-4" /></Button></fetcher.Form>
                <fetcher.Form method="post" onSubmit={(e) => { if (!confirm(t("common.are_you_sure"))) e.preventDefault(); }}><input type="hidden" name="intent" value="delete" /><input type="hidden" name="id" value={n.id} />
                  <Button size="icon" variant="ghost" className="text-red-600" aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></Button></fetcher.Form>
              </>)}
            </div>
            <RichView html={n.body} />
          </Card>
        ))}</div>
      )}
    </>
  );
}
