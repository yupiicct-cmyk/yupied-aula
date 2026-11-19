# Publicar Yupiii: pasos que debes hacer tú (unos 20 minutos)

La base de datos ya está lista en Supabase (proyecto **yupiii**). Falta publicar la aplicación en Cloudflare con tu cuenta. Abre una terminal (PowerShell) en esta carpeta.

## 1. Supabase: copiar la clave secreta y ajustar el acceso
1. Entra a https://supabase.com/dashboard/project/ifbmxalfqiyqlqdpenbo/settings/api-keys y copia la **Secret key** (`sb_secret_...`). No la compartas.
2. **Authentication → Sign In / Providers → Email:** desactiva *Allow new users to sign up*.
3. **Authentication → URL Configuration:** en Site URL pon `https://yupiii.<tu-subdominio>.workers.dev` (lo verás en el paso 3), y en Redirect URLs agrega esa misma dirección con `/**` al final.
4. **Authentication → Email Templates:** pega el contenido de `supabase/templates/recovery.html` en "Reset password" y el de `invite.html` en "Invite user".

## 2. Cloudflare: activar R2
En https://dash.cloudflare.com → **R2 Object Storage** → *Enable*. Pide un medio de pago, pero los primeros 10 GB son gratuitos.

## 3. Instalar y publicar
```powershell
npm install
npx wrangler login
npx wrangler r2 bucket create yupiii-files-prod
npx wrangler secret put SUPABASE_SECRET_KEY --env production   # pega la Secret key del paso 1
npm run deploy:production
```
Al terminar, Wrangler muestra la dirección pública (`https://yupiii.<subdominio>.workers.dev`). Úsala en el paso 1.3.

## 4. Crear tu cuenta de administrador
```powershell
$env:SUPABASE_URL="https://ifbmxalfqiyqlqdpenbo.supabase.co"
$env:SUPABASE_SECRET_KEY="sb_secret_..."
npm run create-admin -- tu@correo.cl "Tu Nombre" "Tu Apellido" superadmin
```
El script imprime una contraseña temporal. Al entrar por primera vez, la plataforma te pedirá cambiarla.

## Opcional
- **Videos de más de 100 MB:** crea un token de API de R2 (Object Read & Write) y ejecuta `npx wrangler secret put R2_ACCESS_KEY_ID --env production` y `npx wrangler secret put R2_SECRET_ACCESS_KEY --env production`. Pon tu Account ID en `wrangler.jsonc` (`R2_ACCOUNT_ID`) y aplica `docs/r2-cors.json`.
- **Correos de invitación:** configura un SMTP en Supabase (Resend o Brevo tienen plan gratuito).
- **Dominio propio, despliegue automático con GitHub y vuelta a una versión anterior:** ver `docs/DESPLIEGUE.md`.
