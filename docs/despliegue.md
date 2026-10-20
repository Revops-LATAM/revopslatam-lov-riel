# Despliegue de Riel 2.0 fuera de Lovable (GitHub + Vercel + Supabase)

Guía paso a paso: [`vercel-y-login.md`](./vercel-y-login.md).

Estado: el código ya compila para Vercel (`nitro: { preset: "vercel" }` en `vite.config.ts`, Node 22).
Cambiar de destino: `NITRO_PRESET=cloudflare-module npm run build`.

## 0. Versiones y prueba de humo

- TanStack Start 1.168.61 / Router 1.170.45. `package.json` fija una sola copia de `@tanstack/router-core`
  (`overrides`): con dos copias el enrutador se parte en dos contextos.
- Al subir TanStack, `npm run smoke` debe seguir pasando. Abre la app en un navegador real y comprueba que
  `/login` renderiza y que las rutas protegidas redirigen a `/login`. Corre también en el CI.
- Causa de la "pantalla en blanco" de Riel 1.0 al actualizar: `_authenticated.beforeLoad` llamaba a
  `signOut()` incluso sin sesión; eso emitía `SIGNED_OUT`, `AuthListener` invalidaba el router y la carga se
  reiniciaba en bucle antes de redirigir. Ahora solo cierra sesión si había una sesión caducada.

## 1. Vercel

1. Importar el repo de GitHub en Vercel. Framework: _Other_. Build: `npm run build` (la salida se
   genera sola en `.vercel/output`). Node 22.
2. Variables de entorno (Production y Preview). Los valores van solo en Vercel, nunca en el repo:

| Variable                                                                | Nota                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`                    | Navegador; se fijan al compilar                              |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Servidor                                                     |
| `PUBLIC_APP_URL`                                                        | URL final (p. ej. `https://riel.revopslatam.com`)            |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM_DOMAIN`          | Correos (ver `correos.md`)                                   |
| `OPENFACTURA_API_KEY`, `OPENFACTURA_AMBIENTE`                           | Facturación DTE                                              |
| `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`            | Calendario                                                   |
| `ASANA_PAT`                                                             | Solo si se usa Asana                                         |
| `HUBSPOT_API_KEY`, `SLACK_API_KEY`                                      | Hoy pasan por `connector-gateway` de Lovable: ver pendientes |
| `LEGACY_EXPORT_TOKEN`                                                   | Solo si se vuelve a importar del sistema heredado            |

3. Dominio: apuntar `riel.revopslatam.com` a Vercel (CNAME) cuando todo esté probado.
4. Plan: los trabajos programados y la emisión de DTE pueden superar el límite de 10 s del plan Hobby.
   Para uso real conviene Pro.

## 2. Supabase

1. Restaurar esquema y datos (`scripts/restore/README.md`) y copiar los archivos de Storage.
2. Login con Google: ver `supabase.md`.
3. Tareas programadas: ejecutar `supabase/cron/schedule.sql` (pasos al inicio del archivo). Las de
   Lovable llamaban a la URL de Lovable y las de Asana ni siquiera enviaban clave.

## 3. Cambiar en servicios externos al pasar al dominio nuevo

- **Google Cloud (Calendar):** agregar `https://<dominio>/api/public/oauth/google-calendar/callback`
  como URI de redirección autorizada.
- **Asana:** recrear los webhooks (apuntan al dominio anterior).
- **Resend:** dominios y webhook (ver `correos.md`).
- **OpenFactura/Haulmer:** solo la clave; sin cambios de URL.

## 4. Pendientes de código (siguen atados a Lovable)

- **Slack y HubSpot** usan `connector-gateway.lovable.dev` con `LOVABLE_API_KEY`: hay que llamar a las
  APIs de Slack y HubSpot directamente.
- **Servidor MCP** (`@lovable.dev/mcp-js`, `.lovable/mcp/manifest.json`, `/.lovable/oauth/consent`).
- **Logo de los correos** (`invoice-sent.tsx`) está en la CDN de Lovable: agregar
  `public/logo-revopslatam-blanco.png` y apuntar la plantilla a `${PUBLIC_APP_URL}/...`.
  La imagen `og:image` de `__root.tsx` también.
- **`@lovable.dev/vite-tanstack-config`** sigue como envoltorio de Vite (es un paquete público y funciona
  fuera de Lovable). Reemplazarlo es opcional.
- `src/lib/lovable-error-reporting.ts` es inocuo fuera de Lovable.
