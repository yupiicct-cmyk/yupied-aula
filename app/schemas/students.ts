import { z } from "zod";
import { email, localeEnum } from "~/schemas/common";

export const studentSchema = z.object({
  first_name: z.string().trim().min(1, "validation.required").max(120, "validation.too_long"),
  last_name: z.string().trim().min(1, "validation.required").max(120, "validation.too_long"),
  email,
  internal_code: z.string().trim().max(40, "validation.too_long").optional().default(""),
  locale: localeEnum.default("es"),
  joined_on: z.string().trim().optional().default(""),
  access_mode: z.enum(["invite", "password"]).default("password"),
  temp_password: z.string().optional().default(""),
}).superRefine((v, ctx) => {
  if (v.access_mode === "password" && v.temp_password.length < 8) {
    ctx.addIssue({ code: "custom", path: ["temp_password"], message: "validation.password_min" });
  }
});
export type StudentInput = z.infer<typeof studentSchema>;
