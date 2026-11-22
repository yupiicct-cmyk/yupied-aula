import type { DB } from "~/services/supabase/server";
import { countryByCode, preferredCountry } from "~/countries/registry";
import { AppError } from "~/utils/errors";

export const INSTITUTION_COOKIE = "yupied_inst";

export interface MyInstitution {
  institution_id: string;
  name: string;
  short_name: string;
  country_code: string;
  status: string;
  roles: string[];
}

const MANAGER_ROLES = ["superadmin", "country_admin", "institution_admin"];
const SUPERVISOR_ROLES = [...MANAGER_ROLES, "director", "inspector"];

/** Instituciones del usuario según la base de datos (RPC con RLS); nunca según el cliente. */
export async function getMyInstitutions(supabase: DB): Promise<MyInstitution[]> {
  const { data, error } = await supabase.rpc("my_institutions");
  if (error) throw error;
  return (data ?? []) as unknown as MyInstitution[];
}

/**
 * Institución activa: la cookie solo se acepta si su id está entre las del usuario.
 * Sin cookie válida, se prefiere una del país elegido explícitamente en el portal.
 */
export function pickActiveInstitution(request: Request, list: MyInstitution[]) {
  const cookieId = (request.headers.get("Cookie") ?? "").match(new RegExp(`${INSTITUTION_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const pref = preferredCountry(request);
  return list.find((i) => i.institution_id === cookieId)
    ?? (pref ? list.find((i) => i.country_code === pref.code) : undefined)
    ?? list[0] ?? null;
}

export async function getInstitutionContext(request: Request, supabase: DB) {
  const list = await getMyInstitutions(supabase);
  const active = pickActiveInstitution(request, list);
  return { list, active, country: countryByCode(active?.country_code) };
}

export const managesRoles = (roles: string[]) => roles.some((r) => MANAGER_ROLES.includes(r));
export const supervisesRoles = (roles: string[]) => roles.some((r) => SUPERVISOR_ROLES.includes(r));

/** Exige que el usuario administre la institución (verificado contra la BD). */
export async function requireManagedInstitution(supabase: DB, institutionId: string) {
  const list = await getMyInstitutions(supabase);
  const inst = list.find((i) => i.institution_id === institutionId);
  if (!inst || !managesRoles(inst.roles)) throw new AppError("forbidden", 403);
  return inst;
}

/** Roles de institución que puede asignar quien tiene estos roles. */
export function assignableRoles(roles: string[]) {
  const base = ["director", "inspector", "teacher", "assistant", "student", "guardian"] as const;
  return roles.includes("superadmin") || roles.includes("country_admin") ? (["institution_admin", ...base] as const) : base;
}

export const INSTITUTION_ROLES = ["institution_admin", "director", "inspector", "teacher", "assistant", "student", "guardian"] as const;
export type InstitutionRole = (typeof INSTITUTION_ROLES)[number];
