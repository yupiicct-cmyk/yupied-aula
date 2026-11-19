import { useTranslation } from "react-i18next";
import { Input, Textarea } from "~/components/ui";
import { LOCALES } from "~/services/i18n";

/** Tres campos (ES/HT/FR) para un texto corto multilingüe. */
export function I18nInputs({ name, label, values, required = false, multiline = false }:
  { name: string; label: string; values?: Record<string, string> | null; required?: boolean; multiline?: boolean }) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {LOCALES.map((l) => (
        <div key={l} className="flex items-start gap-2">
          <span className="mt-2 w-8 shrink-0 text-xs font-bold uppercase text-slate-500">{l}</span>
          {multiline
            ? <Textarea name={`${name}_${l}`} defaultValue={values?.[l] ?? ""} aria-label={`${label} (${l})`} className="min-h-16" />
            : <Input name={`${name}_${l}`} defaultValue={values?.[l] ?? ""} required={required && l === "es"} aria-label={`${label} (${l})`}
                placeholder={l === "es" ? "" : t("translation.optional")} />}
        </div>
      ))}
    </fieldset>
  );
}
