import { useTranslation } from "react-i18next";
import { isLocale, type Locale } from "~/services/i18n";

export function useLocale(): Locale {
  const { i18n } = useTranslation();
  return isLocale(i18n.language) ? i18n.language : "es";
}
