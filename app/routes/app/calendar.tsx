import { useState } from "react";
import { Form, Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/calendar";
import { requireUser } from "~/services/auth.server";
import { requireCourse } from "~/services/courses.server";
import { detectLocale, pick } from "~/services/i18n";
import { failCode } from "~/services/forms.server";
import { i18nFromForm } from "~/schemas/content";
import { optionalDateTime } from "~/schemas/common";
import { Button, Card, Field, Input, PageHeader, Select } from "~/components/ui";
import { I18nInputs } from "~/components/i18n-inputs";
import { check, toAppError } from "~/utils/errors";
import { TIME_ZONE } from "~/utils/time";
import { cn } from "~/utils/cn";

const KINDS = ["class", "lesson", "assessment", "deadline", "announcement", "event"] as const;
const COLORS: Record<string, string> = { class: "bg-navy-900 text-white", lesson: "bg-brand-500 text-white", assessment: "bg-amber-500 text-white", deadline: "bg-red-500 text-white", announcement: "bg-emerald-600 text-white", event: "bg-slate-500 text-white" };

function dayKey(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const locale = detectLocale(request, user.profile.locale);
  const { course } = await requireCourse(request, supabase);
  const m = new URL(request.url).searchParams.get("m");
  const base = m && /^\d{4}-\d{2}$/.test(m) ? m : dayKey(new Date().toISOString()).slice(0, 7);
  const [y, mo] = base.split("-").map(Number) as [number, number];
  const from = new Date(Date.UTC(y, mo - 1, 1) - 7 * 864e5).toISOString();
  const to = new Date(Date.UTC(y, mo, 1) + 7 * 864e5).toISOString();
  const { data } = await supabase.from("calendar_events").select("*").eq("course_id", course.id).gte("starts_at", from).lt("starts_at", to);
  return {
    isTeacher: user.isTeacher, month: base,
    events: (data ?? []).filter((e) => e.starts_at).map((e) => ({ kind: e.kind ?? "event", day: dayKey(e.starts_at!), at: e.starts_at!, title: pick(e.title_i18n, locale) || "—", link: e.link })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context, { teacher: true });
  const { course } = await requireCourse(request, supabase);
  const fd = await request.formData();
  try {
    const kind = z.enum(["class", "event", "deadline", "assessment"]).parse(fd.get("kind"));
    const starts = optionalDateTime.parse(fd.get("starts_at"));
    const title = i18nFromForm(fd, "title", 200);
    if (!starts || !title.es) return failCode("invalid_data");
    check(await supabase.from("academic_calendar").insert({ course_id: course.id, kind, starts_at: starts, title_i18n: title, created_by: user.id }));
    return { ok: true as const };
  } catch (e) {
    return failCode(toAppError(e).code);
  }
}

export default function Calendar({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const hidden = new Set((params.get("hide") ?? "").split(",").filter(Boolean));
  const [y, m] = loaderData.month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startOffset = (first.getUTCDay() + 6) % 7; // lunes primero
  const days = Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(y, m - 1, 1 - startOffset + i)));
  const shift = (d: number) => { const n = new Date(Date.UTC(y, m - 1 + d, 1)); const p = new URLSearchParams(params); p.set("m", n.toISOString().slice(0, 7)); setParams(p); };
  const toggle = (k: string) => { const s = new Set(hidden); if (s.has(k)) s.delete(k); else s.add(k); const p = new URLSearchParams(params); if (s.size) p.set("hide", [...s].join(",")); else p.delete("hide"); setParams(p); };
  const today = new Date().toISOString().slice(0, 10);
  const monthLabel = new Intl.DateTimeFormat(i18n.language === "ht" ? "fr" : i18n.language, { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(i18n.language === "ht" ? "fr" : i18n.language, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i))));

  return (
    <>
      <PageHeader title={t("nav.calendar")} actions={<>
        {loaderData.isTeacher && <Button variant="outline" onClick={() => setAdding((a) => !a)}><Plus className="h-4 w-4" />{t("calendar.add_event")}</Button>}
        <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label={t("calendar.previous")}><ChevronLeft className="h-5 w-5" /></Button>
        <span className="min-w-40 text-center font-semibold capitalize">{monthLabel}</span>
        <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label={t("calendar.next")}><ChevronRight className="h-5 w-5" /></Button>
      </>} />
      {adding && (
        <Card className="mb-6 p-5">
          <Form method="post" className="grid gap-4 lg:grid-cols-3" onSubmit={() => setAdding(false)}>
            <I18nInputs name="title" label={t("common.title")} required />
            <div className="space-y-4">
              <Field label={t("calendar.type")} htmlFor="kind"><Select id="kind" name="kind">{(["class", "event", "deadline", "assessment"] as const).map((k) => <option key={k} value={k}>{t(`calendar.kinds.${k}`)}</option>)}</Select></Field>
              <Field label={t("common.date")} htmlFor="starts_at"><Input id="starts_at" name="starts_at" type="datetime-local" required /></Field>
              <Button>{t("common.create")}</Button>
            </div>
          </Form>
        </Card>
      )}
      <div className="mb-4 flex flex-wrap gap-2">{KINDS.map((k) => (
        <button key={k} type="button" onClick={() => toggle(k)} className={cn("rounded-full px-3 py-1 text-xs font-medium", hidden.has(k) ? "bg-slate-100 text-slate-400 line-through dark:bg-white/5" : COLORS[k])}>{t(`calendar.kinds.${k}`)}</button>
      ))}</div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase text-slate-500 dark:border-white/10 dark:bg-white/5">
          {weekdays.map((w) => <div key={w} className="py-2">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = d.toISOString().slice(0, 10);
            const evs = loaderData.events.filter((e) => e.day === key && !hidden.has(e.kind));
            const outside = d.getUTCMonth() !== m - 1;
            return (
              <div key={key} className={cn("min-h-24 border-b border-r border-slate-100 p-1.5 text-xs dark:border-white/5", outside && "bg-slate-50/60 text-slate-400 dark:bg-white/[0.02]")}>
                <div className={cn("mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full", key === today && "bg-brand-500 font-bold text-white")}>{d.getUTCDate()}</div>
                <div className="space-y-1">{evs.slice(0, 4).map((e, i) => {
                  const cls = cn("block truncate rounded px-1.5 py-0.5", COLORS[e.kind]);
                  return e.link ? <Link key={i} to={e.link} className={cls} title={e.title}>{e.title}</Link> : <span key={i} className={cls} title={e.title}>{e.title}</span>;
                })}{evs.length > 4 && <span className="text-slate-500">+{evs.length - 4}</span>}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
