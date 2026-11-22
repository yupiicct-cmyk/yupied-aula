import type { CountryConfig } from "../types";
import { academic } from "./academic-settings";
import { localization } from "./localization";
import { validateOptionalId } from "./validation";

export const haiti: CountryConfig = {
  code: "HT",
  slug: "haiti",
  name: { es: "Haití", fr: "Haïti", ht: "Ayiti" },
  productName: "YupiEd Haïti",
  localization,
  academic,
  nationalId: {
    kind: "none",
    label: null,
    validate: validateOptionalId,
    normalize: (v) => v.trim(),
    format: (v) => v,
  },
};
