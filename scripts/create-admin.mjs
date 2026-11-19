#!/usr/bin/env node
/**
 * Crea la primera cuenta (superadmin o profesor) en Supabase.
 * Uso:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SECRET_KEY=sb_secret_... \
 *   node scripts/create-admin.mjs correo@dominio.cl "Nombre" "Apellido" superadmin
 * Rol: superadmin | teacher. Imprime una contraseña temporal que debe cambiarse al ingresar.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const [email, first = "", last = "", role = "superadmin"] = process.argv.slice(2);
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!email || !SUPABASE_URL || !SUPABASE_SECRET_KEY || !["superadmin", "teacher"].includes(role)) {
  console.error("Uso: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/create-admin.mjs correo nombre apellido [superadmin|teacher]");
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const password = randomBytes(9).toString("base64url") + "7a";
const { data, error } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
  user_metadata: { first_name: first, last_name: last, locale: "es" },
  app_metadata: { initial_role: role },
});
if (error) { console.error("Error:", error.message); process.exit(1); }
// Superadmin también puede enseñar
if (role === "superadmin") await admin.from("user_roles").upsert({ user_id: data.user.id, role_key: "teacher" });
await admin.from("profiles").update({ must_change_password: true }).eq("id", data.user.id);
console.log(`Cuenta creada: ${email} (${role})\nContraseña temporal: ${password}\nSe pedirá cambiarla en el primer ingreso.`);
