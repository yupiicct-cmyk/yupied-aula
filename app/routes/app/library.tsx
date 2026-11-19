import { useState } from "react";
import { Form, Link, useFetcher, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Download, Eye, EyeOff, FileText, Film, Folder, FolderPlus, Image as ImageIcon, Music, Presentation, RefreshCw, Search, Sheet, Trash2 } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/library";
import { requireUser } from "~/services/auth.server";
import { requireCourse } from "~/services/courses.server";
import { getEnv } from "~/services/env.server";
import { failCode } from "~/services/forms.server";
import { Badge, Button, ButtonLink, Card, EmptyState, Input, PageHeader, Select } from "~/components/ui";
import { FileUpload, uploadFile } from "~/components/file-upload";
import { FileViewer } from "~/components/file-viewer";
import { StatusBadge } from "~/components/status-badge";
import { fmtBytes, fmtDate } from "~/utils/format";
import { useLocale } from "~/hooks/use-locale";
import { check, toAppError } from "~/utils/errors";
import { cn } from "~/utils/cn";

const TYPE_FILTERS: Record<string, string[]> = {
  pdf: ["application/pdf"],
  doc: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ppt: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  xls: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  image: ["image/png", "image/jpeg"],
  video: ["video/mp4"],
  audio: ["audio/mpeg"],
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const { course } = await requireCourse(request, supabase);
  const url = new URL(request.url);
  const folder = url.searchParams.get("folder");
  const q = url.searchParams.get("q")?.trim() ?? "";
  const type = url.searchParams.get("type") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const PER = 30;

  let query = supabase.from("materials").select("id,title,description,mime_type,size_bytes,original_name,visibility,status,folder_id,created_at", { count: "exact" })
    .eq("course_id", course.id).is("deleted_at", null);
  if (!user.isTeacher) query = query.eq("status", "ready");
  if (folder) query = query.eq("folder_id", folder);
  if (q) query = query.or(`title.ilike.%${q.replace(/[%,()]/g, "")}%,description.ilike.%${q.replace(/[%,()]/g, "")}%,original_name.ilike.%${q.replace(/[%,()]/g, "")}%`);
  if (TYPE_FILTERS[type]) query = query.in("mime_type", TYPE_FILTERS[type]!);
  const [mats, folders] = await Promise.all([
    query.order("created_at", { ascending: false }).range((page - 1) * PER, page * PER - 1),
    supabase.from("material_folders").select("id,name,position").eq("course_id", course.id).order("position"),
  ]);
  if (mats.error) throw toAppError(mats.error);
  return { isTeacher: user.isTeacher, courseId: course.id, materials: mats.data ?? [], total: mats.count ?? 0, page, per: PER,
    folders: folders.data ?? [], maxMb: getEnv(context).MAX_UPLOAD_MB };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase } = await requireUser(request, context, { teacher: true });
  const { course } = await requireCourse(request, supabase);
  const env = getEnv(context);
  const fd = await request.formData();
  const intent = fd.get("intent");
  const id = z.string().uuid().safeParse(fd.get("id"));
  try {
    if (intent === "folder") {
      const name = z.string().trim().min(1).max(120).parse(fd.get("name"));
      check(await supabase.from("material_folders").insert({ course_id: course.id, name, position: 100 }));
    } else if (intent === "delete-folder" && id.success) {
      check(await supabase.from("material_folders").delete().eq("id", id.data));
    } else if (intent === "visibility" && id.success) {
      const visibility = fd.get("visibility") === "teachers" ? "teachers" : "course";
      check(await supabase.from("materials").update({ visibility }).eq("id", id.data));
    } else if (intent === "move" && id.success) {
      const folder = z.string().uuid().nullable().parse(fd.get("folder") || null);
      check(await supabase.from("materials").update({ folder_id: folder }).eq("id", id.data));
    } else if (intent === "rename" && id.success) {
      const title = z.string().trim().min(1).max(200).parse(fd.get("title"));
      check(await supabase.from("materials").update({ title }).eq("id", id.data));
    } else if (intent === "delete" && id.success) {
      const { data: m } = await supabase.from("materials").select("object_key").eq("id", id.data).maybeSingle();
      if (!m) return failCode("not_found", 404);
      // Borrado lógico del registro (conserva historial de accesos) y eliminación del binario en R2.
      check(await supabase.from("materials").update({ deleted_at: new Date().toISOString(), status: "pending" }).eq("id", id.data));
      check(await supabase.from("lesson_materials").delete().eq("material_id", id.data));
      await env.FILES.delete(m.object_key);
    } else return failCode("invalid_data");
    return { ok: true as const };
  } catch (e) {
    return failCode(toAppError(e).code);
  }
}

function MimeIcon({ mime }: { mime: string }) {
  const cls = "h-5 w-5";
  if (mime.startsWith("image/")) return <ImageIcon className={cls} />;
  if (mime.startsWith("video/")) return <Film className={cls} />;
  if (mime.startsWith("audio/")) return <Music className={cls} />;
  if (mime.includes("presentation")) return <Presentation className={cls} />;
  if (mime.includes("sheet")) return <Sheet className={cls} />;
  return <FileText className={cls} />;
}

export default function Library({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [params, setParams] = useSearchParams();
  const fetcher = useFetcher();
  const [viewing, setViewing] = useState<{ id: string; mime: string; title: string } | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const folder = params.get("folder");
  const { materials, folders, isTeacher, courseId } = loaderData;
  const pages = Math.ceil(loaderData.total / loaderData.per);
  const setParam = (k: string, v: string | null) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); n.delete("page"); setParams(n); };

  return (
    <>
      <PageHeader title={isTeacher ? t("nav.library") : t("nav.my_materials")} description={t("library.count", { count: loaderData.total })} />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-4">
          <Card className="p-2">
            <button onClick={() => setParam("folder", null)} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm", !folder ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-100" : "hover:bg-slate-50 dark:hover:bg-white/5")}>
              <Folder className="h-4 w-4" />{t("library.all")}
            </button>
            {folders.map((f) => (
              <div key={f.id} className="group flex items-center">
                <button onClick={() => setParam("folder", f.id)} className={cn("flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm", folder === f.id ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-100" : "hover:bg-slate-50 dark:hover:bg-white/5")}>
                  <Folder className="h-4 w-4" />{f.name}
                </button>
                {isTeacher && <fetcher.Form method="post" onSubmit={(e) => { if (!confirm(t("library.delete_folder_confirm"))) e.preventDefault(); }}>
                  <input type="hidden" name="intent" value="delete-folder" /><input type="hidden" name="id" value={f.id} />
                  <button className="hidden p-1 text-slate-400 hover:text-red-600 group-hover:block" aria-label={t("common.delete")}><Trash2 className="h-3.5 w-3.5" /></button>
                </fetcher.Form>}
              </div>
            ))}
            {isTeacher && (
              <fetcher.Form method="post" className="mt-2 flex gap-1 border-t border-slate-100 p-1 pt-2 dark:border-white/10">
                <input type="hidden" name="intent" value="folder" />
                <Input name="name" placeholder={t("library.new_folder")} className="h-8 text-xs" required aria-label={t("library.new_folder")} />
                <Button size="icon" variant="outline" className="h-8 w-8" aria-label={t("library.new_folder")}><FolderPlus className="h-4 w-4" /></Button>
              </fetcher.Form>
            )}
          </Card>
          {isTeacher && <FileUpload purpose="material" courseId={courseId} folderId={folder ?? undefined} multiple label={t("library.upload")} />}
          {isTeacher && <p className="text-xs text-slate-500">{t("library.limits", { mb: loaderData.maxMb })}</p>}
        </aside>

        <div>
          <Card className="mb-4 p-3">
            <Form method="get" className="flex flex-wrap gap-2">
              {folder && <input type="hidden" name="folder" value={folder} />}
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input name="q" defaultValue={params.get("q") ?? ""} placeholder={t("library.search")} className="pl-9" aria-label={t("library.search")} />
              </div>
              <Select name="type" defaultValue={params.get("type") ?? ""} className="w-auto" aria-label={t("library.type")}>
                <option value="">{t("library.all_types")}</option>
                {Object.keys(TYPE_FILTERS).map((k) => <option key={k} value={k}>{t(`library.types.${k}`)}</option>)}
              </Select>
              <Button type="submit" variant="outline">{t("common.search")}</Button>
            </Form>
          </Card>

          <Card>
            {materials.length === 0 ? <EmptyState icon={<FolderPlus />} title={t("library.empty")} /> : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {materials.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="rounded-lg bg-brand-50 p-2 text-brand-600 dark:bg-brand-500/15"><MimeIcon mime={m.mime_type} /></div>
                    <div className="min-w-0 flex-1">
                      <button className="block max-w-full truncate text-left font-medium hover:text-brand-600" onClick={() => m.status === "ready" && setViewing({ id: m.id, mime: m.mime_type, title: m.title })}>{m.title}</button>
                      <p className="text-xs text-slate-500">{m.original_name} · {fmtBytes(m.size_bytes)} · {fmtDate(m.created_at, locale)}</p>
                    </div>
                    {m.status !== "ready" && <StatusBadge status={m.status} />}
                    {isTeacher && m.visibility === "teachers" && <Badge tone="amber">{t("library.teachers_only")}</Badge>}
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setViewing({ id: m.id, mime: m.mime_type, title: m.title })} aria-label={t("library.view")} disabled={m.status !== "ready"}><Eye className="h-4 w-4" /></Button>
                      <ButtonLink to={`/files/material/${m.id}?download=1`} reloadDocument variant="ghost" size="icon"><Download className="h-4 w-4" /><span className="sr-only">{t("library.download")}</span></ButtonLink>
                      {isTeacher && <>
                        <fetcher.Form method="post"><input type="hidden" name="intent" value="visibility" /><input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="visibility" value={m.visibility === "course" ? "teachers" : "course"} />
                          <Button size="icon" variant="ghost" title={m.visibility === "course" ? t("library.hide") : t("library.show")}>{m.visibility === "course" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 text-amber-600" />}</Button>
                        </fetcher.Form>
                        <label className="cursor-pointer rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-white/10" title={t("library.replace")}>
                          <RefreshCw className={cn("h-4 w-4", replacing === m.id && "animate-spin")} />
                          <input type="file" className="sr-only" onChange={async (e) => {
                            const f = e.target.files?.[0]; if (!f) return; setReplacing(m.id);
                            try { await uploadFile(f, "material", { courseId, replaceId: m.id }); } catch (err) { alert(t(`errors.${(err as Error).message}`, { defaultValue: t("errors.unexpected") })); }
                            setReplacing(null); window.location.reload();
                          }} />
                        </label>
                        <fetcher.Form method="post" className="hidden sm:block">
                          <input type="hidden" name="intent" value="move" /><input type="hidden" name="id" value={m.id} />
                          <Select name="folder" defaultValue={m.folder_id ?? ""} className="h-8 w-36 py-0 text-xs" aria-label={t("library.move")} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                            <option value="">{t("library.no_folder")}</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </Select>
                        </fetcher.Form>
                        <fetcher.Form method="post" onSubmit={(e) => { if (!confirm(t("common.are_you_sure"))) e.preventDefault(); }}>
                          <input type="hidden" name="intent" value="delete" /><input type="hidden" name="id" value={m.id} />
                          <Button size="icon" variant="ghost" className="text-red-600" aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></Button>
                        </fetcher.Form>
                      </>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {pages > 1 && (
              <div className="flex justify-center gap-1 border-t border-slate-100 p-3 dark:border-white/10">
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => {
                  const n = new URLSearchParams(params); n.set("page", String(p));
                  return <Link key={p} to={`?${n.toString()}`} className={cn("rounded-md px-3 py-1 text-sm", p === loaderData.page ? "bg-brand-500 text-white" : "hover:bg-slate-100 dark:hover:bg-white/10")}>{p}</Link>;
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
      {viewing && <FileViewer {...viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
