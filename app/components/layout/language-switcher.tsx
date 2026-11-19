import { useFetcher } from "react-router";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LOCALES, LOCALE_LABELS } from "~/services/i18n";
import { useLocale } from "~/hooks/use-locale";
import { cn } from "~/utils/cn";

export function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const fetcher = useFetcher();
  const locale = useLocale();
  const { t } = useTranslation();
  return (
    <fetcher.Form method="post" action="/api/preferences" className="flex items-center gap-1">
      <input type="hidden" name="intent" value="locale" />
      <Languages className={cn("h-4 w-4", dark ? "text-slate-300" : "text-slate-500")} aria-hidden />
      <span className="sr-only">{t("common.language")}</span>
      {LOCALES.map((l) => (
        <button key={l} name="locale" value={l} type="submit" title={LOCALE_LABELS[l]} aria-pressed={locale === l}
          className={cn("rounded-md px-2 py-1 text-xs font-semibold uppercase transition-colors",
            locale === l ? "bg-brand-500 text-white" : dark ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10")}>
          {l}
        </button>
      ))}
    </fetcher.Form>
  );
}
