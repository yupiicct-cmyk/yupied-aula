# Arquitectura internacional de YupiEd

YupiEd es el producto; **YUPICCT — Conciencia Tecnológica** es la empresa. Un solo código y una sola base de datos atienden a varios países; cada colegio/escuela es una **institución** aislada.

## Piezas

```mermaid
flowchart LR
  U[Usuario] --> P["Portal estático<br/>yupied.yupicct.com<br/>(Cloudflare Pages)"]
  P -- "/chile/login · /haiti/login" --> W["App YupiEd<br/>aulavirtual.yupicct.com<br/>(Cloudflare Worker, React Router SSR)"]
  W -- "JWT del usuario · RLS" --> DB[("Supabase Postgres<br/>países · instituciones · académico")]
  W -- "clave secreta (solo backend, tras verificar permisos)" --> AUTH[Supabase Auth admin]
  W --> R2[("R2: archivos")]
  C["Web corporativa<br/>yupicct.com"] -. enlace .-> P
```

## Capas

| Capa | Dónde | Qué decide |
|---|---|---|
| Registro de países | `app/countries/<pais>/{config,academic-settings,localization,validation}.ts` + `public.countries` | Idiomas, moneda, zona horaria, formato de fecha, niveles, periodos, escala de notas, identificador nacional |
| Institución | `public.institutions` | Niveles que imparte, régimen de periodos, asistencia mínima, RUT/RBD |
| Pertenencia y rol | `public.institution_members`, `country_admins`, `guardian_links`, `user_roles` | Qué ve y qué puede hacer cada persona |
| Datos académicos | `courses.institution_id` → todo lo demás cuelga del curso | Aislamiento por herencia |

## Modelo de datos nuevo

```mermaid
erDiagram
  countries ||--o{ institutions : "country_code"
  countries ||--o{ country_admins : ""
  institutions ||--o{ institution_members : ""
  institutions ||--o{ courses : "institution_id (NOT NULL, inmutable)"
  institutions ||--o{ guardian_links : ""
  profiles ||--o{ institution_members : "user_id + role"
  profiles ||--o{ guardian_links : "guardian_id / student_id"
  courses ||--o{ course_members : ""
  courses ||--o{ teacher_assignments : ""
```

## Flujo de entrada

```mermaid
sequenceDiagram
  participant U as Usuario
  participant P as Portal (Pages)
  participant A as App (Worker)
  participant D as Postgres
  U->>P: elige Chile (opcional: recordar)
  P->>A: GET /chile/login
  A-->>U: login "YupiEd Chile" + cookie yupied_country=chile (preferencia)
  U->>A: email + contraseña
  A->>D: my_institutions() con el JWT del usuario
  D-->>A: instituciones y roles reales
  A-->>U: /app con institución activa validada
```

La cookie de país solo es una **preferencia de interfaz** (marca, idioma por defecto, institución preferida). La autorización sale siempre de la base de datos.

## Roles

| Rol | Ámbito | Puede |
|---|---|---|
| superadmin | global (`user_roles`) | todo, activar/desactivar países |
| country_admin | país (`country_admins`) | crear/editar instituciones del país, nombrar admins de institución |
| institution_admin | institución | editar la institución, agregar personas (no otros admins), vincular apoderados, ver todo lo de su institución |
| director, inspector | institución | ver cursos, notas, asistencia y personas de su institución (solo lectura) |
| teacher | institución + cursos asignados | crear cursos en su institución y gestionar los suyos (como antes) |
| assistant | institución | asignable a cursos como apoyo |
| student | institución + cursos inscritos | como antes |
| guardian (apoderado) | institución + pupilos vinculados | ver notas y asistencia solo de sus pupilos |

## Rutas de la app

`/chile`, `/haiti` → guardan el país y llevan al login · `/chile/login`, `/haiti/login` → login con marca del país · `/chile/app`, `/haiti/app` → entrada directa · `/cambiar-pais` → borra la preferencia y vuelve al portal · `/app/admin`, `/app/admin/institutions/:id`, `/app/supervision`, `/app/guardian`.
