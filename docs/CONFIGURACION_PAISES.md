# Configuración de países

Cada país tiene dos fuentes que deben coincidir (una prueba unitaria lo verifica):

1. **Código** — `app/countries/<pais>/`
   - `config.ts`: código ISO, slug de URL, nombre en ES/FR/HT, nombre de producto, reglas de identificador nacional.
   - `academic-settings.ts`: niveles y grados, periodos, escala de notas, asistencia mínima de referencia.
   - `localization.ts`: idioma por defecto, idiomas, monedas, zona horaria, formato de fecha, locale numérico.
   - `validation.ts`: validación del identificador nacional (si existe).
2. **Base de datos** — fila en `public.countries` (`config.levels`, `config.periods`, zona horaria…), usada por triggers para validar `institutions.levels`.

## Países actuales

| | Chile (`CL`, `/chile`) | Haití (`HT`, `/haiti`) |
|---|---|---|
| Idiomas | es | ht (por defecto), fr, es |
| Moneda | CLP | HTG, USD |
| Zona horaria | America/Santiago | America/Port-au-Prince |
| Fecha | DD/MM/YYYY | DD/MM/YYYY |
| Identificador | RUT (módulo 11) | ninguno validado |
| Niveles | parvularia, basica, media | prescolaire, fondamental, secondaire |
| Periodos | semestral, trimestral | trimestriel |
| Escala | 1,0–7,0 · aprueba 4,0 · exigencia 60 % | 0–10 · aprueba 5 |
| Asistencia mínima ref. | 85 % (ajustable por institución) | no definida |

Las escalas usan la tabla existente `grade_scales`; un curso nuevo toma la escala de su país.

## Agregar un tercer país (ej. Perú)

1. Crear `app/countries/peru/` con los cuatro archivos (copiar `haiti/` como base). `code: "PE"`, `slug: "peru"`.
2. Agregarlo a `COUNTRIES` en `app/countries/registry.ts` y ampliar el tipo `code` en `app/countries/types.ts`.
3. Nueva migración (no editar las anteriores):
   ```sql
   insert into public.countries (code, name_i18n, default_locale, locales, currencies, timezone, date_format, national_id_kind, config)
   values ('PE', '{"es":"Perú","fr":"Pérou","ht":"Pewou"}', 'es', array['es']::public.locale_code[], array['PEN'],
           'America/Lima', 'DD/MM/YYYY', 'none', '{"levels":["inicial","primaria","secundaria"],"periods":["bimestral"]}');
   insert into public.grade_scales (name, country, min_grade, max_grade, pass_grade, exigency, decimals)
   values ('Perú 0 – 20', 'PE', 0, 20, 11, 0.55, 0);
   ```
   Si el país necesita un idioma nuevo, agregar el valor a `public.locale_code` y la carpeta `app/locales/<idioma>/`.
4. Añadir el caso a `tests/unit/countries.test.ts` (la prueba de coincidencia código ↔ migración lee el archivo de migración; para el país nuevo, apuntar a su migración).
5. En el portal: tarjeta en `portal/index.html` y página `portal/peru/index.html` con el botón `data-app="/peru/login"`.
6. `npm run typecheck && npm test && npm run test:db`.

Las rutas `/peru`, `/peru/login`, `/peru/app` se generan solas a partir del registro.
