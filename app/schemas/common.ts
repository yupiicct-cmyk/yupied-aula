import { z } from "zod";
import { fromLocalInput } from "~/utils/time";

export const localeEnum = z.enum(["es", "ht", "fr"]);
export const uuid = z.string().uuid("validation.invalid");
export const requiredText = (max = 200) => z.string().trim().min(1, "validation.required").max(max, "validation.too_long");
export const optionalText = (max = 5000) => z.string().trim().max(max, "validation.too_long").optional().default("");
export const email = z.string().trim().toLowerCase().email("validation.email");
export const optionalDate = z.string().trim().optional().transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "validation.date");
/** <input type="datetime-local"> en hora de Chile → ISO UTC */
export const optionalDateTime = z.string().trim().optional().transform((v) => (v ? fromLocalInput(v) : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "validation.date");
export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const num = (min = 0, max = 100000) => z.coerce.number({ message: "validation.number" }).min(min, "validation.min").max(max, "validation.max");
export const optionalInt = z.string().optional().transform((v) => (v ? Number.parseInt(v, 10) : null))
  .refine((v) => v === null || (Number.isFinite(v) && v > 0), "validation.number");
export const contentStatus = z.enum(["draft", "scheduled", "published", "archived"]);
