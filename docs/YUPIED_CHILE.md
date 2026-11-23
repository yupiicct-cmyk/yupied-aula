# YupiEd Chile

Entrada: `https://aulavirtual.yupicct.com/chile/login`. Mismo aula que Haití, con configuración chilena.

## Configuración
- País `CL`, español, CLP, `America/Santiago`, fechas DD/MM/YYYY.
- Escala 1,0–7,0, nota de aprobación 4,0 con 60 % de exigencia (`app.scale_grade`, ya existente).
- Asistencia mínima de referencia 85 %, ajustable por establecimiento; la pantalla de Supervisión marca en rojo los cursos bajo el mínimo.

## Niveles (habilitables por establecimiento)
| Nivel | Grados |
|---|---|
| Educación Parvularia | Sala Cuna Menor, Sala Cuna Mayor, Medio Menor, Medio Mayor, Pre-kínder (NT1), Kínder (NT2) |
| Educación Básica | 1° a 8° Básico |
| Educación Media | 1° a 4° Medio |

Un curso puede marcarse con su nivel; la base de datos rechaza niveles que el establecimiento no tiene habilitados.

## RUT
- Validación módulo 11 en el navegador/servidor (`app/countries/chile/validation.ts`) y en la base (`app.valid_rut`).
- Se guarda normalizado `12345678-5` y se muestra `12.345.678-5`.
- Único por país en `profiles` (`national_id`, `national_id_country`). Se usa para el RUT del establecimiento y, opcionalmente, de cada persona.

## Puesta en marcha de un colegio
1. Superadmin (o admin de país Chile) → **Administración → Nueva institución**: nombre, RUT, RBD, régimen semestral/trimestral, niveles.
2. En la institución → **Agregar persona**: director, inspector, profesores, asistentes, estudiantes, apoderados (invitación por correo o contraseña temporal).
3. Vincular apoderados con sus pupilos.
4. Los profesores crean sus cursos (quedan en la institución activa) e inscriben estudiantes como siempre.

## No incluido (no se simula)
Integraciones con SIGE, Libro de Clases Digital del Mineduc o Junaeb: no existen en el código.
