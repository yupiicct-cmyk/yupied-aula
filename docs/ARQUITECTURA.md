# Manual técnico · Arquitectura

**Yupiii**: una plataforma educativa privada en tres idiomas (ES · HT · FR) para Chile y Haití.

## 1. Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Framework | React Router **v8** (Framework Mode, SSR) + React 19 + TypeScript estricto | Integración oficial con Cloudflare. Los loaders y actions validan y autorizan en el servidor antes de responder. |
| Ejecución | Cloudflare Workers + `@cloudflare/vite-plugin` + Wrangler | Desarrollo y producción usan el mismo runtime (workerd). |
| Estilos / UI | Tailwind CSS v4 y componentes propios con el estilo de shadcn/ui; íconos Lucide | Componentes en `app/components/ui`, sin dependencias de terceros. |
| Formularios | Zod (servidor y cliente) | Todo lo que llega del navegador se valida en el servidor. |
| Gráficos | Recharts | |
| i18n | i18next + react-i18next | Los archivos de traducción están en `app/locales/{es,ht,fr}/*.json`, uno por módulo. |
| Autenticación | **Supabase Auth** (correo y contraseña, Google, recuperación, verificación) | Sustituye a Firebase con aprobación del usuario: `auth.uid()` nativo en RLS, sin Cloud Functions de pago y sin un segundo proveedor que mantener. |
| Base de datos | Supabase PostgreSQL 17 + RLS en **todas** las tablas | Migraciones versionadas en `supabase/migrations`. |
| Archivos | Cloudflare R2 | URLs PUT prefirmadas (aws4fetch). Las descargas pasan siempre por el Worker, que antes comprueba permisos. |
| Pruebas | Vitest, más pruebas SQL de RLS sobre PostgreSQL real | Corren en CI (GitHub Actions). |

## 2. Componentes

```
Navegador ──HTTPS──▶ Cloudflare Worker (workers/app.ts)
                       ├─ cabeceras de seguridad (nosniff, frame, HSTS…)
                       ├─ middleware raíz: cliente Supabase por petición (cookies httpOnly)
                       │    └─ getClaims(): verifica la firma del JWT
                       ├─ loaders/actions de app/routes/**  (validación Zod)
                       │    └─ supabase-js con la identidad del usuario → RLS en PostgreSQL
                       ├─ cliente admin (clave secreta) SOLO para crear/bloquear cuentas
                       ├─ /api/uploads  → valida permiso/tipo/tamaño → URL prefirmada R2
                       ├─ /files/:kind/:id → RLS sobre metadatos → stream desde R2 (Range)
                       └─ rate limiting (binding de Workers) en login y API
Supabase PostgreSQL ── RLS + funciones SECURITY DEFINER (corrección, notas, notificaciones)
Cloudflare R2 ──────── bucket privado; nunca hay URLs públicas
```

## 3. Seguridad

- **Toda la autorización real ocurre en PostgreSQL (RLS).** Las comprobaciones de rol en el Worker solo evitan mostrar pantallas inútiles. Ver `supabase/migrations/*_security_rls.sql`.
- **Solo hay registro por invitación.** `enable_signup = false` en Auth y las cuentas las crea el profesor. El rol inicial viaja en `app_metadata`, que solo puede escribir el backend.
- **El estudiante no puede alterar resultados.** No tiene permisos de escritura sobre `submissions`, `grades` ni `assessment_*`. Entrega a través de las RPC `submit_activity`, `start_assessment` y `submit_assessment`, que validan plazos, intentos y tiempo, y corrigen en la base de datos. Las respuestas correctas están en las tablas `*_question_keys`, que solo el profesor puede leer.
- **Protección de columnas.** Un trigger impide que un estudiante cambie su `status`, su código o su correo.
- **Borrado lógico.** `profiles` tiene `ON DELETE RESTRICT` y el historial académico nunca se borra en cascada.
- **Auditoría.** Hay triggers sobre notas, asistencia, inscripciones, roles y estados. Solo el superadmin puede leer `audit_logs`.
- **HTML enriquecido.** Se sanea en el servidor con una lista blanca (`xss`).
- **Secretos.** Se guardan solo en `wrangler secret` y en `.dev.vars` (fuera de git). El navegador nunca recibe la clave secreta de Supabase.
- **Pruebas automáticas** (`supabase/tests/rls_test.sql`). Comprueban, entre otras cosas, que un estudiante no ve datos de otro, que no puede leer claves, que no puede calificarse ni autoasignarse roles, que un profesor no administra cursos ajenos y que un usuario desactivado pierde el acceso.

## 4. Modelo de datos

43 tablas y 2 vistas. Las principales relaciones:

```
profiles ─< user_roles >─ roles
courses ─< teacher_assignments, course_members >─ profiles
courses ─< modules ─< lessons ─< lesson_translations (es|ht|fr, draft|ai_proposed|approved)
lessons ─< lesson_materials >─ materials (metadatos; binario en R2) ─ material_folders
activities ─< activity_translations, activity_questions ─< activity_options, activity_question_keys
activities ─< submissions ─< submission_answers, submission_files, submission_comments
assessments ─< assessment_questions ─ assessment_question_keys ; assessment_attempts ─< assessment_answers
grades (actividad | evaluación | manual) ─ grade_scales (Chile 1,0–7,0 · 60 %)
attendance_sessions ─< attendance_records
lesson_progress, material_access_logs, student_notes
announcements ─< announcement_translations ; conversations ─< messages ; notifications
user_preferences, system_settings, academic_calendar, audit_logs
vistas: student_progress, calendar_events (security_invoker → respetan RLS)
```

**Nota chilena con exigencia E.** Si el puntaje p es menor que E·máx, la nota es `1 + 3·p/(E·máx)`. En caso contrario es `4 + 3·(p − E·máx)/(máx − E·máx)` (`app.scale_grade`).

**Diferencias con el documento original.** `activity_options` se usa en actividades. En evaluaciones, las opciones van en `assessment_questions.options` (JSON), porque se sortean por intento. `student_progress` es una vista y no una tabla, para no duplicar datos.

## 5. Estructura

```
app/
  root.tsx, routes.ts          raíz, middleware de sesión, tabla de rutas
  routes/auth/*                acceso, recuperación, confirmación de enlaces
  routes/api/*                 subidas, descargas, preferencias, traducción
  routes/app/**                pantallas (profesor y estudiante)
  layouts/app-layout.tsx       menú lateral + barra superior
  components/ui, components/*  sistema de componentes
  services/**                  auth, supabase, storage (R2), i18n, cursos, preguntas…
  schemas/*                    Zod
  locales/{es,ht,fr}/*.json    traducción de la interfaz
  types/database.ts            tipos generados de la BD
workers/app.ts                 entrada del Worker
supabase/migrations            SQL versionado · supabase/tests: pruebas RLS
tests/unit                     Vitest (i18n, utilidades, validaciones)
scripts/                       create-admin.mjs, gen-db-types.py
```

## 6. Traducción

- **La interfaz y el contenido académico se traducen por separado.** La interfaz usa los archivos JSON. El contenido usa las tablas `*_translations`, con estado por idioma.
- **La traducción asistida es opcional.** Usa Workers AI (`@cf/meta/m2m100-1.2b`) solo si se agrega el binding `AI` en `wrangler.jsonc`. Produce propuestas con estado `ai_proposed`, que los estudiantes no ven hasta que el profesor las marca como `approved`.
- Una prueba automática verifica que los tres idiomas tengan las mismas claves y que cada texto usado en el código exista.

## 7. Rendimiento y costos (20 estudiantes)

- Las consultas están paginadas e indexadas. No hay listeners permanentes: las notificaciones se cargan al navegar. Excel y PDF se generan en el navegador.
- **Cloudflare Workers:** el plan gratuito sirve para empezar. Con renderizado en el servidor puede superar los 10 ms de CPU por petición; si eso ocurre, el plan Workers Paid cuesta 5 USD/mes.
- **R2:** 10 GB gratuitos y sin costo por transferencia de salida. Se activa en el panel de Cloudflare, que pide un medio de pago.
- **Supabase Free:** 500 MB de base de datos y 50.000 usuarios activos al mes. Los proyectos gratuitos se pausan tras 7 días sin actividad.
- **Correo:** el SMTP integrado de Supabase solo envía a miembros del equipo. Para invitaciones reales se necesita un SMTP propio, por ejemplo Resend o Brevo, ambos con plan gratuito. Mientras tanto, el modo **contraseña temporal** funciona sin correo.
