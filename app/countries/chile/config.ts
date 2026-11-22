import type { CountryConfig } from "../types";
import { academic } from "./academic-settings";
import { localization } from "./localization";
import { formatRut, normalizeRut, validateRut } from "./validation";

export const chile: CountryConfig = {
  code: "CL",
  slug: "chile",
  name: { es: "Chile", fr: "Chili", ht: "Chili" },
  productName: "YupiEd Chile",
  localization,
  academic,
  nationalId: {
    kind: "rut",
    label: { es: "RUT", fr: "RUT", ht: "RUT" },
    validate: validateRut,
    normalize: normalizeRut,
    format: formatRut,
  },
};
