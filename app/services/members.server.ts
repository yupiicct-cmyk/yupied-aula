import type { AppEnv } from "~/services/env.server";
import type { DB } from "~/services/supabase/server";
import { createAdminClient } from "~/services/supabase/admin.server";
import { sendAccessEmail, tempPassword } from "~/services/students.server";
import { assignableRoles, requireManagedInstitution, type InstitutionRole } from "~/services/institutions.server";
import { countryByCode } from "~/countries/registry";
import { AppError, toAppError } from "~/utils/errors";

export interface MemberInput {
  email: string;
  first_name: string;
  last_name: string;
  role: InstitutionRole;
  national_id: string;
  access_mode: "invite" | "password";
}

/**
 * Agrega una persona a una institución. Orden de seguridad:
 * 1) se verifica con la identidad del usuario (RLS/RPC) que administra la institución;
 * 2) solo entonces se usa la clave secreta para crear o buscar la cuenta;
 * 3) la membresía se inserta con la identidad del usuario, así RLS vuelve a verificar
 *    (p. ej. un admin de institución no puede nombrar otro admin).
 */
export async function addMember(env: AppEnv, supabase: DB, institutionId: string, input: MemberInput, origin: string) {
  const inst = await requireManagedInstitution(supabase, institutionId);
  if (!(assignableRoles(inst.roles) as readonly string[]).includes(input.role)) throw new AppError("forbidden", 403);
  const country = countryByCode(inst.country_code);
  if (!country) throw new AppError("invalid_data", 400);
  let nationalId: string | null = null;
  if (input.national_id) {
    if (!country.nationalId.validate(input.national_id)) throw new AppError("invalid_rut", 400);
    nationalId = country.nationalId.normalize(input.national_id);
  }

  const admin = createAdminClient(env);
  const { data: existing } = await admin.from("profiles").select("id").eq("email", input.email).maybeSingle();
  let userId = existing?.id ?? null;
  let password: string | null = null;

  if (!userId) {
    password = input.access_mode === "password" ? tempPassword() : tempPassword(24);
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      password,
      email_confirm: true,
      user_metadata: { first_name: input.first_name, last_name: input.last_name, locale: country.localization.defaultLocale },
      // app_metadata solo lo escribe el backend: el trigger crea rol global y membresía.
      app_metadata: { initial_role: input.role, institution_id: institutionId, institution_role: input.role },
    });
    if (error) throw new AppError("account_failed", 502, error.message);
    userId = data.user.id;
    const patch: { must_change_password: boolean; national_id?: string; national_id_country?: string } = { must_change_password: input.access_mode === "password" };
    if (nationalId && country.nationalId.kind !== "none") Object.assign(patch, { national_id: nationalId, national_id_country: country.code });
    const { error: pe } = await admin.from("profiles").update(patch).eq("id", userId);
    if (pe) throw toAppError(pe);
    if (input.access_mode === "invite") { await sendAccessEmail(env, input.email, origin); password = null; }
  } else {
    // Cuenta existente: membresía con la identidad del administrador (RLS) y rol global.
    const { error: me } = await supabase.from("institution_members")
      .upsert({ institution_id: institutionId, user_id: userId, role: input.role, status: "active" });
    if (me) throw toAppError(me);
    const { error: re } = await admin.from("user_roles").upsert({ user_id: userId, role_key: input.role }, { ignoreDuplicates: true });
    if (re) throw toAppError(re);
  }
  return { id: userId, existed: !!existing, password };
}
