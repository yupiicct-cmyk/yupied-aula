# Auditoría del proyecto — YupiEd internacional

Fecha: 22/11/2026 · Alcance: repositorio `yupiii` (aula virtual), `YupiEd_Portal_Internacional_2.zip`, `YUPICCT_Corporativo_actualizado_4.zip`.

## 1. Qué existía

| Pieza | Estado encontrado | Tecnología |
|---|---|---|
| **Aula virtual (Yupiii)** | Plataforma académica completa: cursos, módulos, clases (sesiones), biblioteca, actividades con corrección automática, evaluaciones con intentos, libro de notas, asistencia, anuncios, mensajes, calendario, reportes, progreso. ES / Kreyòl / FR. | React Router v8 (SSR) en Cloudflare Workers · Supabase (Postgres + Auth) · R2 |
| Base de datos | 6 migraciones, 42 tablas, RLS forzada en todas, 71 aserciones de seguridad. | PostgreSQL 16 / Supabase |
| Proyecto Supabase de producción | `yupiii` (ref `ifbmxalfqiyqlqdpenbo`) con las migraciones 1–6 aplicadas. Sin usuarios ni datos reales. | — |
| Despliegue | `DESPLEGAR.bat` + `scripts/desplegar.ps1`. Bloqueado: **R2 no está activado** en la cuenta Cloudflare (código 10042). | Wrangler |
| **Portal internacional (ZIP)** | Sitio estático: selector Chile/Haití con "recordar país" (localStorage) y dos páginas regionales informativas, sin enlace a ninguna aplicación. | HTML/CSS/JS estático para Cloudflare Pages |
| **Web corporativa YUPICCT (ZIP)** | Sitio estático de la empresa (logo, favicons, foto del director, contacto). | HTML estático |

### "YupiEd Haití existente"
Los ZIP no contienen una plataforma haitiana con login, base de datos ni módulos. Confirmado con el usuario: **el aula Yupiii es YupiEd Haití**. Por eso se conserva entera y se extiende; no se reemplaza.

Estructuras haitianas pedidas que **no existían** en el código (no se inventan como "conservadas"):
- *Carnet de Leçons*: no existe. Lo más cercano es la planificación de clases (`lessons` con número, fecha, objetivos, contenido trilingüe).
- *Asistencia mensual*: existe la asistencia por sesión (`attendance_sessions/records`) y su reporte; no hay vista mensual específica.
- *Inscripciones*: existen como `course_members` (inscripción por curso).

## 2. Brechas frente al prompt maestro

| Requisito | Antes | Ahora |
|---|---|---|
| Multi-país | No (todo asumía Chile en notas y hora) | Tabla `countries` + registro `app/countries/*` (Chile, Haití) |
| Multi-institución con aislamiento | No (una sola organización) | `institutions`, `institution_members`, cursos ligados a una institución, RLS y triggers anti cruce |
| Roles: superadmin, admin país, admin institución, director, inspector, docente, asistente, estudiante, apoderado | Solo superadmin/profesor/estudiante en uso | Todos modelados; admin país (`country_admins`), roles por institución, apoderados (`guardian_links`) |
| Panel global | No | `/app/admin` (países, instituciones, personas, vínculos) |
| Rutas por país | No | `/chile`, `/haiti`, `/chile/login`, `/haiti/login`, `/chile/app`, `/haiti/app`, `/cambiar-pais` |
| RUT chileno | No | Validación módulo 11 en TS y en SQL (`app.valid_rut`) |
| Niveles Parvularia/Básica/Media configurables por establecimiento | No | `institutions.levels` validado contra el país |
| i18n independiente del país | Idioma del perfil | Igual, y si no hay preferencia se usa el idioma del país elegido |
| Marca YupiEd / YUPICCT | "Yupiii" | Nombre visible "YupiEd" + "YUPICCT — Conciencia Tecnológica"; los nombres técnicos (Worker `yupiii`, bucket `yupiii-files-prod`) no se cambian para no romper el despliegue ya preparado |

## 3. Decisiones

1. **Se reutiliza la plataforma existente como núcleo común** (no se crea una segunda app para Chile). Chile y Haití son configuraciones de país sobre el mismo código y la misma base de datos, separadas por institución.
2. **Portal estático aparte** (elección del usuario): el portal del ZIP se publica en Cloudflare Pages en `yupied.yupicct.com`; la app vive en `app.yupied.yupicct.com` (Worker). El portal enlaza a `/<país>/login` de la app.
3. **Migración 7 no destructiva**: agrega tablas/columnas/políticas; crea la institución inicial "YupiEd Haïti — Institution initiale" y le asigna los cursos y personas existentes. No borra ni reinicia nada.
4. **No se aplicó la migración 7 en producción** (regla: no modificar producción sin autorización). Está probada en PostgreSQL local con las 7 migraciones y 129 aserciones.
5. El país **nunca se decide por IP**: solo por elección explícita (portal → cookie `yupied_country`) y, dentro de la app, por la institución a la que el usuario pertenece según la base de datos.

## 4. Riesgos y pendientes conocidos

- **R2 sin activar** → no hay URL pública todavía. Requiere acción del titular de la cuenta (medio de pago en Cloudflare).
- **Hora local**: `app/utils/time.ts` convierte fechas con la zona de Chile. Para instituciones haitianas las fechas programadas se interpretan en hora de Chile (diferencia de 1–2 h según la estación). Pendiente: zona horaria por institución.
- **Supabase Auth**: falta desactivar registro público, fijar Site URL/Redirect URLs y SMTP propio.
- **Kreyòl**: traducciones nuevas sin revisión de un hablante nativo.
- **Sin pruebas E2E con usuarios reales** (no hay despliegue). Las pruebas SQL y unitarias sí corren.
- Los nombres de niveles chilenos en FR/HT se dejaron en español cuando son denominaciones oficiales (p. ej., "Sala Cuna", "3° Básico").
