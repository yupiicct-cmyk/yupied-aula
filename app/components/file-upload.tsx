import { useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { useTranslation } from "react-i18next";
import { CheckCircle2, UploadCloud } from "lucide-react";
import { Alert } from "~/components/ui";
import { cn } from "~/utils/cn";

export const ACCEPT_ALL = ".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.mp4,.mp3";

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", mp4: "video/mp4", mp3: "audio/mpeg",
};

type Extra = { courseId?: string; activityId?: string; folderId?: string; title?: string; description?: string; replaceId?: string };

/** Sube un archivo: init → PUT (con progreso) → complete. */
export async function uploadFile(file: File, purpose: string, extra: Extra, onProgress?: (pct: number) => void) {
  const mime = file.type || EXT_MIME[file.name.split(".").pop()?.toLowerCase() ?? ""] || "application/octet-stream";
  const init = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "init", purpose, name: file.name, mime, size: file.size, ...extra }) }).then((r) => r.json() as Promise<{ ok: boolean; error?: string; key?: string; url?: string; headers?: Record<string, string> }>);
  if (!init.ok || !init.url || !init.key) throw new Error(init.error ?? "unexpected");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", init.url!);
    for (const [k, v] of Object.entries(init.headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((100 * e.loaded) / e.total));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error("upload_failed")));
    xhr.onerror = () => reject(new Error("upload_failed"));
    xhr.send(file);
  });
  const done = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "complete", key: init.key, replaceId: extra.replaceId }) }).then((r) => r.json() as Promise<{ ok: boolean; error?: string; id?: string }>);
  if (!done.ok) throw new Error(done.error ?? "unexpected");
  return done;
}

export function FileUpload({ purpose, label, accept = ACCEPT_ALL, multiple = false, onDone, className, ...extra }:
  { purpose: string; label: string; accept?: string; multiple?: boolean; onDone?: () => void; className?: string } & Extra) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const revalidator = useRevalidator();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okCount, setOkCount] = useState(0);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setOkCount(0);
    for (const f of Array.from(files)) {
      try {
        setProgress(0);
        await uploadFile(f, purpose, extra, setProgress);
        setOkCount((n) => n + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "unexpected");
      }
    }
    setProgress(null);
    if (ref.current) ref.current.value = "";
    onDone?.();
    void revalidator.revalidate();
  }

  return (
    <div className={className}>
      <label className={cn("flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600 transition hover:border-brand-500 hover:bg-brand-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-brand-500/10",
        progress !== null && "pointer-events-none opacity-70")}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void handle(e.dataTransfer.files); }}>
        <UploadCloud className="h-7 w-7 text-brand-500" aria-hidden />
        <span className="font-medium">{label}</span>
        <span className="text-xs text-slate-400">{t("library.drop_hint")}</span>
        <input ref={ref} type="file" className="sr-only" accept={accept} multiple={multiple} onChange={(e) => void handle(e.target.files)} />
      </label>
      {progress !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} /></div>
      )}
      {okCount > 0 && progress === null && <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-4 w-4" />{t("library.uploaded", { count: okCount })}</p>}
      {error && <div className="mt-2"><Alert>{t(`errors.${error}`, { defaultValue: t("errors.unexpected") })}</Alert></div>}
    </div>
  );
}
