# Seguridad — YupiEd

## Principios
1. **La base de datos decide.** Toda consulta de la app usa el JWT del usuario; Row Level Security está **activada y forzada** en todas las tablas (48).
2. **No se confía en el cliente.** `institution_id`, `country_id` o roles que llegan en formularios o cookies nunca otorgan acceso:
   - la cookie `yupied_inst` solo se acepta si su id aparece en `my_institutions()` (calculado en la BD);
   - la cookie `yupied_country` es preferencia visual;
   - el curso nuevo valida en RLS que el docente pertenece a la institución; la institución de un curso es inmutable.
3. **Clave secreta solo en el Worker** (`SUPABASE_SECRET_KEY`, `wrangler secret`). Se usa únicamente después de verificar, con la identidad del usuario, que administra la institución. Nunca llega al navegador.
4. **Contraseñas**: las gestiona Supabase Auth (hash bcrypt). Las temporales se muestran una sola vez y obligan a cambiarlas al entrar.
5. **País nunca por IP**: solo elección explícita o pertenencia real.

## Aislamiento entre instituciones (migración 7)
- `courses.institution_id` NOT NULL; todo el contenido académico cuelga del curso, así que hereda el aislamiento.
- Trigger `course_members_institution`: no se puede inscribir a alguien que pertenece a otra institución (`cross_institution`).
- Trigger `teacher_assignments_institution`: igual para docentes.
- `guardian_links`: el estudiante debe ser de la misma institución.
- `institution_members`: un admin de institución no puede nombrar admins (solo admin de país / superadmin).
- `institutions_guard`: país inmutable, niveles válidos para el país, RUT válido.
- Políticas `*_read_supervisor`: dirección/inspectoría leen solo su institución; apoderados solo a sus pupilos.
- Auditoría (`audit_logs`) de instituciones, membresías, admins de país y vínculos de apoderados.

## Cabeceras y límites (existentes)
HSTS, X-Frame-Options SAMEORIGIN, X-Content-Type-Options, Referrer-Policy y Permissions-Policy (en `workers/app.ts`; aún no hay Content-Security-Policy); limitador de intentos de login (`AUTH_LIMITER`) y de API; HTML enriquecido saneado en el servidor; descargas de archivos a través del Worker con verificación de permisos.

## Dominio y correo
El despliegue no toca registros MX, SPF, DKIM ni DMARC de `yupicct.com`. La app usa un Custom Domain de Worker (`aulavirtual.yupicct.com`), que crea solo el registro de ese host.

## Pendientes de configuración (Supabase Auth)
Desactivar registro público, Site URL y Redirect URLs al dominio final, SMTP propio, y revisar los asesores de seguridad tras aplicar la migración 7.
