import { useTranslation } from "react-i18next";
import { Download, X } from "lucide-react";
import { Button, ButtonLink } from "~/components/ui";

/** Visor integrado: PDF (visor del navegador), imagen, video y audio. Office → descarga. */
export function FileViewer({ id, mime, title, kind = "material", onClose }: { id: string; mime: string; title: string; kind?: "material" | "submission"; onClose: () => void }) {
  const { t } = useTranslation();
  const src = `/files/${kind}/${id}`;
  let body: React.ReactNode;
  if (mime === "application/pdf") body = <iframe src={src} title={title} className="h-[75vh] w-full rounded-lg bg-white" />;
  else if (mime.startsWith("image/")) body = <img src={src} alt={title} className="mx-auto max-h-[75vh] rounded-lg" />;
  else if (mime.startsWith("video/")) body = <video src={src} controls preload="metadata" className="max-h-[75vh] w-full rounded-lg bg-black" />;
  else if (mime.startsWith("audio/")) body = <audio src={src} controls className="w-full" />;
  else body = <p className="py-10 text-center text-sm text-slate-500">{t("library.no_preview")}</p>;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="card w-full max-w-5xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="truncate font-semibold">{title}</h2>
          <div className="flex gap-2">
            <ButtonLink to={`${src}?download=1`} reloadDocument variant="outline" size="sm"><Download className="h-4 w-4" />{t("library.download")}</ButtonLink>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("common.close")}><X className="h-5 w-5" /></Button>
          </div>
        </div>
        {body}
      </div>
    </div>
  );
}
