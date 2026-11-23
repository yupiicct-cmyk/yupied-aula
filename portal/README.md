# YupiEd — Portal internacional

Portal estático para `yupied.yupicct.com`, separado de la web corporativa YUPICCT.

## Rutas
- `/` — selector de país.
- `/chile/` — entrada regional YupiEd Chile.
- `/haiti/` — entrada regional YupiEd Haití.

El selector recuerda la última elección mediante `localStorage` (si el usuario deja activada la opción). El usuario siempre puede volver y cambiar de país.

## Publicación en Cloudflare Pages
1. Crear un proyecto Pages independiente, por ejemplo `yupied-portal`.
2. Usar Direct Upload / Upload assets y cargar el contenido de esta carpeta (no la carpeta contenedora).
3. Comprobar que `index.html`, `assets/`, `chile/` y `haiti/` queden en la raíz del proyecto.
4. En Custom domains, agregar `yupied.yupicct.com`.
5. Seguir la validación DNS que muestre Cloudflare.

No reemplazar los registros MX, SPF, DKIM ni DMARC del dominio.

## Conexión con la app
Los botones de `/chile/` y `/haiti/` llevan a la aplicación YupiEd (`/chile/login`, `/haiti/login`).
La dirección de la app está en `config.js` (`window.YUPIED_URLS`: Chile → aulavirtual.yupicct.com, Haití → yupied.ht.yupicct.com) y, como respaldo sin JavaScript, en el `href` de cada botón.
Al usar "Cambiar país" dentro de la app se vuelve a `/?cambiar=1`, que olvida el país guardado.

Publicación por línea de comandos: `npx wrangler pages deploy portal --project-name yupied-portal` (desde la raíz del repositorio). Ver `docs/DEPLOY_CLOUDFLARE.md`.
