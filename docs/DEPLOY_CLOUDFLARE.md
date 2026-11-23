# Despliegue en Cloudflare

Dos proyectos independientes:

| Proyecto | Tipo | Host | Contenido |
|---|---|---|---|
| `yupied-portal` | Pages (estático) | `yupied.yupicct.com` | carpeta `portal/` |
| `yupiii` | Worker | `aulavirtual.yupicct.com` | la app (`npm run deploy:production`) |

> Nunca modificar los registros MX, SPF, DKIM ni DMARC de `yupicct.com`.

## 0. Requisito pendiente: activar R2
Dashboard de Cloudflare → **R2 Object Storage** → *Enable / Purchase R2* (pide un medio de pago; el plan gratuito incluye 10 GB). Sin esto el despliegue de la app falla con el código 10042.

## 1. Base de datos (una vez, con autorización)
Aplicar `supabase/migrations/20261122000007_international.sql` en el proyecto `yupiii` (ver `docs/INTEGRACION_HAITI.md`).

## 2. App (Worker)
En Windows: doble clic en `DESPLEGAR.bat` (instala, inicia sesión con token, crea el bucket, despliega y guarda la clave secreta).
Manual:
```bash
npm install
npx wrangler r2 bucket create yupiii-files-prod
npm run deploy:production
npx wrangler secret put SUPABASE_SECRET_KEY --env production
```
Dominio: si `yupicct.com` está en la misma cuenta, descomentar `routes` en `wrangler.jsonc` (`aulavirtual.yupicct.com`, `custom_domain: true`) y volver a desplegar. Cloudflare emite el certificado del host de segundo nivel automáticamente.

## 3. Portal (Pages)
```bash
npx wrangler pages project create yupied-portal --production-branch main
npx wrangler pages deploy portal --project-name yupied-portal
```
Luego Pages → `yupied-portal` → Custom domains → `yupied.yupicct.com`. Si la app usa otro host, cambiar solo `portal/config.js` y los `href` de los botones de `portal/chile/` y `portal/haiti/`.

## 4. Supabase Auth
Authentication → URL Configuration: Site URL `https://aulavirtual.yupicct.com`; Redirect URLs `https://aulavirtual.yupicct.com/auth/callback` y `/auth/confirm`. Desactivar "Allow new users to sign up". Configurar SMTP.

## 5. Primer administrador
`npm run create-admin` (pide correo; usa la clave secreta localmente).

## 6. Verificación después del despliegue
- `https://yupied.yupicct.com` → elegir Chile → botón → login "YupiEd Chile" en español.
- `https://aulavirtual.yupicct.com/haiti/login` → login en Kreyòl.
- `/cambiar-pais` vuelve al portal.
- Con el superadmin: Administración → crear una institución chilena con RUT válido; probar RUT inválido (debe rechazarse).
