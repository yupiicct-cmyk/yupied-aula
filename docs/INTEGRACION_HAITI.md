# Integración de YupiEd Haití

## Qué es YupiEd Haití
La plataforma académica que antes se llamaba "Yupiii" (trilingüe Kreyòl / Français / Español). Se conserva completa: ninguna tabla, módulo, ruta ni política existente se eliminó.

## Qué hace la migración 7 con lo existente
- Crea la institución `a0000000-0000-4000-8000-000000000001` — **"YupiEd Haïti — Institution initiale"** (país HT, niveles préscolaire/fondamental/secondaire, régimen trimestriel).
- Asigna a esa institución todos los cursos sin institución y agrega como miembros a los profesores, estudiantes y asistentes existentes (los `academic_admin` pasan a `institution_admin`).
- Cambia el nombre visible `app_name` de "Yupiii" a "YupiEd" solo si seguía siendo "Yupiii".
- Las notas existentes mantienen su escala (la escala de cada curso no se toca). Los cursos **nuevos** de instituciones haitianas usan la escala 0–10.

Nada se borra; la migración se puede aplicar sobre datos reales.

## Rutas
- Entrada: `https://aulavirtual.yupicct.com/haiti/login` (idioma por defecto: Kreyòl).
- Todas las pantallas del aula siguen en `/app/...`.

## Qué falta para Haití (no existe aún en el código)
- *Carnet de Leçons* como documento propio (hoy: planificación de clases en "Clases/Leçons").
- Vista de asistencia mensual (hoy: asistencia por sesión y reporte por curso).
- Zona horaria por institución en las fechas programadas (hoy se interpretan en hora de Chile).
- Revisión nativa de los textos en Kreyòl.

## Aplicar en producción (requiere autorización)
1. Respaldo: Supabase → Database → Backups (o `pg_dump`).
2. Aplicar `supabase/migrations/20261122000007_international.sql` (SQL Editor o `supabase db push`).
3. Verificar: `select count(*) from public.courses where institution_id is null;` → 0.
4. Ejecutar los asesores de seguridad de Supabase.
