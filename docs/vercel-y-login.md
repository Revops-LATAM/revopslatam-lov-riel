# Puesta en marcha: Vercel + login con Google

Orden recomendado. Los valores secretos se escriben solo en Vercel y en el panel de Google/Supabase: **nunca en el repo,
en chats ni en archivos**. Proyecto de Supabase: `db_riel` (`qqvxwggngmuveptytybf`, región us-east-1).

## 1. Google Cloud: credenciales OAuth (una vez)

1. console.cloud.google.com → proyecto de Revops LATAM → _APIs y servicios_ → _Pantalla de consentimiento de OAuth_.
   Tipo **Interno** si todos usan correo del mismo Google Workspace; si no, _Externo_ y agregar los 13 correos como usuarios de prueba.
2. _Credenciales_ → _Crear credenciales_ → _ID de cliente de OAuth_ → tipo **Aplicación web**.
3. _URIs de redirección autorizados_: `https://qqvxwggngmuveptytybf.supabase.co/auth/v1/callback`
4. Copiar el **ID de cliente** y el **secreto** (se usan en el paso 2).

## 2. Supabase: activar Google

1. Supabase → proyecto `db_riel` → _Authentication_ → _Sign In / Providers_ → **Google** → activar y pegar ID de cliente y secreto.
2. _Authentication_ → _URL Configuration_:
   - **Site URL**: la URL final (p. ej. `https://riel.revopslatam.com`; al inicio, la de Vercel `https://<proyecto>.vercel.app`).
   - **Redirect URLs** (una por línea):
     `https://<proyecto>.vercel.app/login`, `https://riel.revopslatam.com/login`, `http://localhost:8080/login`
     y, para las vistas previas de Vercel, `https://*-<tu-equipo>.vercel.app/login`.
3. _Authentication_ → _Sign In / Providers_ → desactivar **"Allow new users to sign up"** solo si el acceso se maneja siempre por
   invitación (`workspace_invitations`); las 13 personas existentes ya tienen su cuenta y entran igual.

## 3. Vercel: importar el repo

1. vercel.com → _Add New_ → _Project_ → importar el repo de GitHub → rama `main` (o la rama de trabajo para probar).
2. _Framework Preset_: **Other**. No cambiar comandos: `vercel.json` ya fija `npm ci`, `npm run build` y la región `iad1`
   (cerca de Supabase). Node 22.
3. _Environment Variables_ (Production y Preview). Los valores salen de Supabase → _Project Settings_ → _API_:

| Variable                                                       | De dónde sale                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `VITE_SUPABASE_URL` y `SUPABASE_URL`                           | `https://qqvxwggngmuveptytybf.supabase.co`                              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_PUBLISHABLE_KEY`   | clave _publishable_ (anon)                                              |
| `SUPABASE_SERVICE_ROLE_KEY`                                    | clave _service_role_. **Secreta**: solo aquí; marcarla como _Sensitive_ |
| `PUBLIC_APP_URL`                                               | la URL final de la app, sin `/` al final                                |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM_DOMAIN` | ver `correos.md` (pueden esperar)                                       |
| `OPENFACTURA_API_KEY`, `OPENFACTURA_AMBIENTE`                  | facturación DTE (puede esperar)                                         |
| `GOOGLE_CALENDAR_CLIENT_ID/SECRET`, `ASANA_PAT`                | solo si usas Calendar o Asana                                           |

Las `VITE_*` se fijan al compilar: si las cambias, hay que **redesplegar**. 4. _Deploy_.

## 4. Verificar (en este orden)

1. `https://<app>/api/public/health` debe responder `{"ok":true,"missing":[],"supabase":"ok"}`.
   - `missing` lista las variables obligatorias que faltan (por nombre). Corregir y redesplegar.
   - `supabase: "inalcanzable"`: revisar `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`.
2. `https://<app>/login` muestra el botón "Continuar con Google". Entrar con una cuenta de las 13: debe llevar a `/` y mostrar el espacio.
3. Recorrido de 5 minutos con una cuenta real: abrir un proyecto, una tarea, registrar horas, ver un contrato y una factura.
4. Con un correo que **no** esté invitado: debe mostrar "Acceso restringido".

## 5. Si algo falla

| Síntoma                                                      | Causa probable                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Tras Google vuelve a `/login` sin entrar                     | La URL no está en _Redirect URLs_ de Supabase, o `Site URL` apunta a otro dominio |
| Error `redirect_uri_mismatch` de Google                      | Falta la URI `.../auth/v1/callback` en las credenciales de Google                 |
| Pantalla en blanco o "Missing Supabase environment variable" | Falta una variable `VITE_*` o se cambió sin redesplegar                           |
| Entra pero ve "No tienes acceso a ningún espacio"            | Su correo no está en `workspace_members`; invitarlo desde Ajustes                 |
| `permission denied for function ...`                         | Una función quedó cerrada por el endurecimiento: avisar con el mensaje exacto     |
| Funciones que tardan y se cortan                             | Límite de 60 s; plan Hobby de Vercel. Considerar Pro                              |

## 6. Después

- Dominio propio: _Settings_ → _Domains_ y apuntar el CNAME; luego actualizar `PUBLIC_APP_URL`, _Site URL_ y _Redirect URLs_.
- Tareas programadas: `supabase/cron/schedule.sql` (necesita la URL final).
- Pendientes: Storage (`storage-pendiente.md`), Slack y HubSpot, logo de los correos.
