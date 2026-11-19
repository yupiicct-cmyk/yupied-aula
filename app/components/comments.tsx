import { Form } from "react-router";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import { Button, Card, CardHeader, Textarea } from "~/components/ui";
import { fmtDate } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { cn } from "~/utils/cn";

/** Comentarios sobre una entrega (profesor ↔ estudiante). */
export function Comments({ submissionId, comments, userId }: { submissionId: string; comments: { id: string; author_id: string; body: string; created_at: string }[]; userId: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <Card>
      <CardHeader title={t("activities.comments")} />
      <div className="max-h-80 space-y-2 overflow-y-auto p-4">
        {comments.length === 0 && <p className="text-sm text-slate-500">{t("activities.no_comments")}</p>}
        {comments.map((c) => (
          <div key={c.id} className={cn("max-w-[85%] rounded-xl px-3 py-2 text-sm", c.author_id === userId ? "ml-auto bg-brand-500 text-white" : "bg-slate-100 dark:bg-white/10")}>
            <p className="whitespace-pre-wrap">{c.body}</p><p className="mt-1 text-[10px] opacity-70">{fmtDate(c.created_at, locale, true)}</p>
          </div>
        ))}
      </div>
      <Form method="post" className="flex gap-2 border-t border-slate-100 p-3 dark:border-white/10" onSubmit={(e) => setTimeout(() => (e.target as HTMLFormElement).reset(), 0)}>
        <input type="hidden" name="intent" value="comment" /><input type="hidden" name="submission" value={submissionId} />
        <Textarea name="body" required maxLength={4000} className="min-h-10" aria-label={t("activities.comments")} placeholder={t("activities.write_comment")} />
        <Button size="icon" aria-label={t("common.send")}><Send className="h-4 w-4" /></Button>
      </Form>
    </Card>
  );
}
