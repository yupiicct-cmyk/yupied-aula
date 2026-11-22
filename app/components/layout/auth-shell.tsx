import type { ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "~/components/layout/language-switcher";
import { useLocale } from "~/hooks/use-locale";
import type { I18nText } from "~/countries/types";

type CountryBadge = { slug: string; code: string; name: I18nText } | null | undefined;

export function AuthShell({ title, subtitle, children, appName, country }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; appName: string; country?: CountryBadge }) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <div className="relative flex min-h-screen flex-col bg-navy-900 bg-[radial-gradient(ellipse_at_top_right,rgba(8,120,255,0.35),transparent_55%)]">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2 text-white">
          <GraduationCap className="h-7 w-7 text-brand-500" aria-hidden />
          <span className="font-semibold">{appName}</span>
        </div>
        <LanguageSwitcher dark />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center text-white">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <GraduationCap className="h-9 w-9 text-white" aria-hidden />
            </div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-300">{subtitle}</p>}
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8 dark:bg-navy-900 dark:ring-1 dark:ring-white/10">{children}</div>
          {country && (
            <p className="mt-4 text-center text-sm text-slate-300">
              {t("countries.current", { country: country.name[locale] })} ·{" "}
              <a href="/cambiar-pais" className="font-medium text-white underline-offset-2 hover:underline">{t("countries.change")}</a>
            </p>
          )}
          <p className="mt-6 text-center text-xs text-slate-400">{t("auth.languages_footer")}</p>
          <p className="mt-2 text-center text-[11px] text-slate-500">{t("countries.company")}</p>
        </div>
      </main>
    </div>
  );
}
