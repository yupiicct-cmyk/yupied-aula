# Pruebas

| Suite | Comando | Qué cubre | Resultado (22/11/2026) |
|---|---|---|---|
| Tipos | `npm run typecheck` | TypeScript de app y pruebas | sin errores |
| Unitarias | `npm test` | utilidades, i18n (paridad de 711 claves × 3 idiomas), RUT, registro de países, coincidencia código ↔ migración, formato de fecha/moneda | 24/24 |
| Base de datos | `npm run test:db` | aplica las 7 migraciones en PostgreSQL 16 limpio y ejecuta `rls_test.sql` (71 aserciones) y `rls_international_test.sql` (58) | 129/129 |
| Build | `npm run build` | compilación cliente + Worker | correcto |
| Humo SSR | `vite preview` (workerd) | `/chile` → 302 a `/chile/login` con cookie; `/haiti/login` en Kreyòl con título "YupiEd Haïti"; `/cambiar-pais` → portal; `/app/admin` sin sesión → login | correcto |

## Casos multiinstitución verificados (`rls_international_test.sql`)
- RUT válido/inválido, con puntos, con K, normalización.
- Institución chilena con RUT inválido o nivel haitiano → rechazada.
- Escala por país: 60 % = 4,0 en Chile; 80 % = 8,0 en Haití.
- Profesor de A: no ve la institución B ni sus estudiantes; no crea cursos en B; no inscribe estudiantes de B; no mueve cursos; no se autopromueve.
- Admin de institución: ve y gestiona solo su institución; no nombra admins; no cambia el país; no crea instituciones.
- Director: lee notas y personas de su institución; no modifica notas ni membresías.
- Apoderado: solo notas/resumen de su pupilo; no ve otros estudiantes ni contenidos.
- Admin de país Chile: no ve Haití; crea instituciones solo en Chile; nombra admins; no desactiva países.
- Superadmin: ve todo y gestiona países.
- Anónimo: solo la configuración pública de países.

## No probado todavía
- Flujo completo en navegador con usuarios reales (requiere despliegue y la migración 7 en Supabase).
- Envío real de invitaciones por correo (depende del SMTP de Supabase).
- Portal publicado en Pages.

## Requisitos locales para `test:db`
PostgreSQL 16 escuchando en `/tmp/pg:54322` (variables `PGHOST`, `PGPORT`). El script `supabase/tests/run-local.sh` crea y destruye la base temporal.
