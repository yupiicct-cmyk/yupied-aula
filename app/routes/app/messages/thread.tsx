import { useEffect, useRef } from "react";
import { Form, Link, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Send } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/thread";
import { requireUser } from "~/services/auth.server";
import { failCode } from "~/services/forms.server";
import { Button, Card, Textarea } from "~/components/ui";
import { fmtDate, fullName } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, must, toAppError } from "~/utils/errors";
import { cn } from "~/utils/cn";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const conv = must(await supabase.from("conversations").select("*").eq("id", params.id).maybeSingle()); // RLS: solo participantes
  const otherId = conv.teacher_id === user.id ? conv.student_id : conv.teacher_id;
  const [{ data: msgs }, { data: other }] = await Promise.all([
    supabase.from("messages").select("id,sender_id,body,created_at,read_at").eq("conversation_id", conv.id).order("created_at").limit(500),
    supabase.from("profiles").select("first_name,last_name").eq("id", otherId).maybeSingle(),
  ]);
  await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("conversation_id", conv.id).neq("sender_id", user.id).is("read_at", null);
  return { userId: user.id, other: fullName(other), messages: msgs ?? [] };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user, supabase } = await requireUser(request, context);
  try {
    const body = z.string().trim().min(1).max(4000).parse((await request.formData()).get("body"));
    check(await supabase.from("messages").insert({ conversation_id: params.id, sender_id: user.id, body }));
    return { ok: true as const };
  } catch (e) {
    return failCode(toAppError(e).code);
  }
}

export default function Thread({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView(); if (nav.state === "idle") formRef.current?.reset(); }, [loaderData.messages.length, nav.state]);
  return (
    <Card className="flex h-[calc(100vh-10rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 dark:border-white/10">
        <Link to="/app/messages" aria-label={t("common.back")}><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="font-semibold">{loaderData.other}</h1>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-5">
        {loaderData.messages.map((m) => (
          <div key={m.id} className={cn("max-w-[75%] rounded-2xl px-4 py-2 text-sm", m.sender_id === loaderData.userId ? "ml-auto bg-brand-500 text-white" : "bg-slate-100 dark:bg-white/10")}>
            <p className="whitespace-pre-wrap">{m.body}</p><p className="mt-1 text-[10px] opacity-70">{fmtDate(m.created_at, locale, true)}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <Form method="post" ref={formRef} className="flex gap-2 border-t border-slate-100 p-3 dark:border-white/10">
        <Textarea name="body" required maxLength={4000} className="min-h-11" placeholder={t("messages.write")} aria-label={t("messages.write")}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        <Button loading={nav.state === "submitting"} aria-label={t("common.send")}><Send className="h-4 w-4" /></Button>
      </Form>
    </Card>
  );
}
