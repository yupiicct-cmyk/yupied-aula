# Instrucciones de despliegue (desarrollo y producción)

Los entornos están separados: **desarrollo** usa Supabase local y un bucket R2 de desarrollo; **producción** usa un proyecto Supabase propio y el bucket `yupiii-files-prod`. Ninguna clave secreta se guarda en git.

## 0. Requisitos
- Node.js 22.22 o superior y npm.
- Una cuenta de Cloudflare (Workers y R2) y una de Supabase.
- Opcional: Docker, para levantar Supabase en local.

## 1. Desarrollo local
```bash
npm install
npx supabase start                 # PostgreSQL + Auth + correo de prueba (Docker)
npx supabase db reset              # aplica supabase/migrations
cp .dev.vars.example .dev.vars     # pega la "secret key" que muestra `supabase start`
# en wrangler.jsonc → vars: SUPABASE_PUBLISHABLE_KEY = la "publishable key" local
npm run dev                        # http://localhost:5173
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=... npm run create-admin -- tu@correo.cl Nombre Apellido superadmin
```
Los correos de prueba se ven en http://127.0.0.1:54324. Sin credenciales S3 de R2, las subidas pasan por el Worker, con un límite de 100 MB por archivo.

## 2. Supabase (producción)
1. Crea un proyecto. Para Chile y Haití se recomienda la región `sa-east-1` (São Paulo).
2. Aplica las migraciones: `npx supabase link --project-ref <ref>` y luego `npx supabase db push`.
3. En **Authentication → Providers → Email**, desactiva *Allow new users to sign up*. El aula es privada.
4. En **Authentication → URL Configuration**:
   - Site URL: `https://tu-dominio`.
   - Redirect URLs: `https://tu-dominio/**`.
5. En **Authentication → Email Templates**, pega `supabase/templates/recovery.html` e `invite.html`. Usan `token_hash`, que es necesario con renderizado en el servidor.
6. En **Authentication → SMTP**, configura un SMTP propio (Resend o Brevo). Sin él, usa el modo "contraseña temporal" al crear estudiantes.
7. Opcional, para Google: crea un cliente OAuth en Google Cloud, actívalo en **Providers → Google** y agrega `https://<ref>.supabase.co/auth/v1/callback`.
8. Crea el primer administrador con `npm run create-admin` (paso 1, con la URL y la secret key de producción).

## 3. Cloudflare
```bash
npx wrangler login
npx wrangler r2 bucket create yupiii-files-prod
npx wrangler r2 bucket cors set yupiii-files-prod --file docs/r2-cors.json   # edita antes el dominio
# En wrangler.jsonc → env.production.vars: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, R2_ACCOUNT_ID
npx wrangler secret put SUPABASE_SECRET_KEY --env production
npx wrangler secret put R2_ACCESS_KEY_ID --env production        # token R2 (Object Read & Write) para URLs prefirmadas
npx wrangler secret put R2_SECRET_ACCESS_KEY --env production
npm run deploy:production
```
- **Dominio propio:** Workers → yupiii → Settings → Domains & Routes → *Add Custom Domain*. Cloudflare gestiona el certificado HTTPS.
- **Traducción asistida (opcional):** agrega `"ai": { "binding": "AI" }` en `env.production` de `wrangler.jsonc`.

## 4. Despliegue automático (GitHub)
`.github/workflows/ci.yml` ejecuta los tipos, las pruebas unitarias, las pruebas RLS y la compilación en cada push. Si todo pasa en `main`, despliega solo. Antes debes cargar en GitHub → Settings → Secrets → Actions:
- `CLOUDFLARE_API_TOKEN`, con la plantilla "Edit Cloudflare Workers".
- `CLOUDFLARE_ACCOUNT_ID`.

Como alternativa sin Actions: Cloudflare **Workers Builds**, conectando el repositorio y usando como comando de despliegue `npm run deploy:production`.

## 5. Volver a una versión anterior
- **Código:** `npx wrangler deployments list --env production` y luego `npx wrangler rollback <version-id> --env production`. También se puede desde el panel: Workers → Deployments → *Rollback*.
- **Base de datos:** las migraciones solo avanzan. Para revertir, escribe una migración nueva que deshaga el cambio; nunca edites una ya aplicada. Supabase hace copias diarias (7 días en el plan gratuito). En el plan Pro existe *Point-in-time recovery*.
- **Archivos R2:** reemplazar un material borra el binario anterior. Para conservar versiones, activa *Object versioning* o lifecycle rules en el bucket.

## 6. Copias de seguridad
- **Supabase:** copias automáticas diarias. Además se recomienda un `npx supabase db dump --linked > backup-$(date +%F).sql` semanal, guardado fuera del proyecto.
- **R2:** `rclone sync r2:yupiii-files-prod ./respaldo-r2` con las mismas credenciales S3.
