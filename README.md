# Yupiii · Aula virtual trilingüe (ES · Kreyòl Ayisyen · FR)

Una plataforma educativa privada para un profesor y unos 20 estudiantes, preparada para crecer a varios cursos e instituciones en Chile y Haití.

**Stack:** React Router v8 (SSR) · TypeScript estricto · Tailwind · Cloudflare Workers + R2 · Supabase (PostgreSQL + Auth + RLS) · i18next.

## Estado (fase actual)

| Módulo | Estado |
|---|---|
| Autenticación: acceso, recordar sesión, recuperación, Google, primer cambio de contraseña, roles | ✅ código + pruebas |
| Modelo de datos (43 tablas), RLS en todas, auditoría, borrado lógico | ✅ migraciones + 60+ aserciones RLS |
| Panel del profesor con indicadores y gráficos; panel del estudiante | ✅ |
| Estudiantes: alta, importación CSV/Excel, perfil 360°, activar/desactivar, restablecer acceso | ✅ |
| Cursos, módulos, constructor de sesiones (autoguardado, programación, duplicar, archivar) | ✅ |
| Biblioteca R2 (subida prefirmada o por proxy, visor, carpetas, búsqueda, permisos) | ✅ |
| Actividades (10 tipos), entregas, corrección automática y manual, comentarios | ✅ |
| Evaluaciones (tiempo, intentos, preguntas aleatorias, corrección automática y manual) | ✅ |
| Calificaciones (escala chilena 1,0–7,0 con exigencia, ponderación, exportación) | ✅ |
| Asistencia, comunicación (anuncios, mensajes, notificaciones), calendario, informes PDF/Excel | ✅ |
| Interfaz 100 % trilingüe; contenidos trilingües con flujo de aprobación; traducción IA opcional | ✅ (HT pendiente de revisión nativa) |
| Despliegue en producción | ⏳ requiere las cuentas y credenciales indicadas en `docs/DESPLIEGUE.md` |

## Comandos
```bash
npm install
npm run dev            # desarrollo (ver docs/DESPLIEGUE.md §1)
npm run typecheck      # TypeScript estricto
npm test               # pruebas unitarias e i18n
npm run test:db        # pruebas de seguridad RLS y lógica académica en PostgreSQL
npm run build          # compilación para Workers
npm run deploy:production
```

## Documentación
- Manual técnico: `docs/ARQUITECTURA.md`, `docs/DESPLIEGUE.md` (resúmenes en `docs/manuales/tecnico.{fr,ht}.md`).
- Manuales de uso: `docs/manuales/profesor.{es,ht,fr}.md` y `docs/manuales/estudiante.{es,ht,fr}.md`.
