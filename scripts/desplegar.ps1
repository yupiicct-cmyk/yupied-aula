# Despliegue de Yupiii en Cloudflare Workers (Windows / PowerShell).
# Ejecutar con doble clic en DESPLEGAR.bat
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)
Start-Transcript -Path (Join-Path (Get-Location) "desplegar.log") -Force | Out-Null
trap { Write-Host "ERROR INESPERADO: $_" -ForegroundColor Red; Stop-Transcript | Out-Null; Read-Host "Presiona Enter para cerrar"; exit 1 }
function Paso($n, $t) { Write-Host ""; Write-Host "=== Paso $n · $t ===" -ForegroundColor Cyan }
function Falla($t) { Write-Host ""; Write-Host "ERROR: $t" -ForegroundColor Red; Stop-Transcript | Out-Null; Read-Host "Presiona Enter para cerrar"; exit 1 }

Paso 1 "Comprobando Node.js"
try { $v = (node --version) } catch { Falla "Node.js no está instalado. Descarga la versión LTS en https://nodejs.org y vuelve a ejecutar DESPLEGAR.bat" }
$parts = $v.TrimStart('v').Split('.')
if ([int]$parts[0] -lt 22 -or ([int]$parts[0] -eq 22 -and [int]$parts[1] -lt 22)) { Falla "Se necesita Node 22.22 o superior (tienes $v). Instala la versión LTS desde https://nodejs.org" }
Write-Host "Node $v OK" -ForegroundColor Green

Paso 2 "Instalando dependencias (puede tardar unos minutos)"
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Falla "npm install falló" }

Paso 3 "Iniciando sesión en Cloudflare"
Write-Host "Se abrirá el navegador: pulsa 'Allow' para autorizar Wrangler."
$who = (npx wrangler whoami 2>&1) -join "`n"
if ($who -notmatch "logged in") { npx wrangler login; if ($LASTEXITCODE -ne 0) { Falla "No se pudo iniciar sesión en Cloudflare" } }
npx wrangler whoami

Paso 4 "Almacenamiento de archivos (R2)"
$buckets = (npx wrangler r2 bucket list 2>&1) -join "`n"
if ($buckets -match "10042|enable R2|Please enable") {
  Write-Host "R2 no está activado en tu cuenta." -ForegroundColor Yellow
  Write-Host "Abre https://dash.cloudflare.com -> R2 Object Storage -> Enable (pide medio de pago; 10 GB gratis)."
  Start-Process "https://dash.cloudflare.com/?to=/:account/r2/overview"
  Read-Host "Cuando lo hayas activado, presiona Enter para continuar"
  $buckets = (npx wrangler r2 bucket list 2>&1) -join "`n"
}
if ($buckets -notmatch "yupiii-files-prod") {
  npx wrangler r2 bucket create yupiii-files-prod
  if ($LASTEXITCODE -ne 0) { Falla "No se pudo crear el bucket R2 'yupiii-files-prod'. ¿Activaste R2?" }
} else { Write-Host "Bucket yupiii-files-prod ya existe" -ForegroundColor Green }

Paso 5 "Compilando y publicando Yupiii"
npm run deploy:production
if ($LASTEXITCODE -ne 0) { Falla "La publicación falló (revisa el mensaje anterior)" }

Paso 6 "Clave secreta de Supabase"
Write-Host "Abre: https://supabase.com/dashboard/project/ifbmxalfqiyqlqdpenbo/settings/api-keys"
Write-Host "Copia la 'Secret key' (empieza con sb_secret_) y pégala aquí (no se mostrará)."
Start-Process "https://supabase.com/dashboard/project/ifbmxalfqiyqlqdpenbo/settings/api-keys"
$sec = Read-Host "Secret key" -AsSecureString
$secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
if (-not $secret.StartsWith("sb_secret_") -and -not $secret.StartsWith("eyJ")) { Falla "Eso no parece una Secret key de Supabase" }
$secret | npx wrangler secret put SUPABASE_SECRET_KEY --env production
if ($LASTEXITCODE -ne 0) { Falla "No se pudo guardar el secreto en Cloudflare" }

Paso 7 "Cuenta de administrador"
$crear = Read-Host "¿Crear ahora tu cuenta de administrador? (s/n)"
if ($crear -match "^[sS]") {
  $email = Read-Host "Tu correo"
  $nombre = Read-Host "Tu nombre"
  $apellido = Read-Host "Tu apellido"
  $env:SUPABASE_URL = "https://ifbmxalfqiyqlqdpenbo.supabase.co"
  $env:SUPABASE_SECRET_KEY = $secret
  node scripts/create-admin.mjs $email $nombre $apellido superadmin
  Remove-Item Env:SUPABASE_SECRET_KEY
}
$secret = $null

Write-Host ""
Write-Host "Yupiii está publicado. La dirección aparece arriba (https://yupiii.<subdominio>.workers.dev)." -ForegroundColor Green
Write-Host "Copia esa dirección y envíasela a Claude para terminar la configuración de Supabase y revisar las pantallas."
Stop-Transcript | Out-Null
Read-Host "Presiona Enter para cerrar"
