# Conexión con Supabase

Riel se conecta a Supabase solo por variables de entorno; no hay ninguna URL de proyecto fija.

## Variables

| Variable                                             | Dónde se usa                                                                           | Se obtiene en          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Navegador (se fijan al compilar)                                                       | Project Settings → API |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`           | Servidor (middleware de autenticación)                                                 | igual                  |
| `SUPABASE_SERVICE_ROLE_KEY`                          | Solo servidor (cron, webhooks, portal). Da acceso total: nunca al navegador ni al repo | igual                  |

Copiar `.env.example` a `.env` y completarlo. `.env` está en `.gitignore`.

## Login con Google (Supabase nativo)

1. En Google Cloud Console crear un _OAuth Client ID_ (tipo Web). En _Authorized redirect URIs_
   poner `https://qqvxwggngmuveptytybf.supabase.co/auth/v1/callback`.
2. En Supabase → Authentication → Providers → Google: activarlo y pegar Client ID y Client Secret.
3. En Supabase → Authentication → URL Configuration: _Site URL_ = la URL de la app y, en
   _Redirect URLs_, agregar `https://<app>/login` y `http://localhost:8080/login`.
4. Acceso restringido: solo entran correos invitados (`workspace_invitations`). Si alguien no
   autorizado intenta entrar, la pantalla muestra "Acceso restringido".

Las 13 identidades de Google vienen en el respaldo (`auth.identities`), así que cada persona entra
con la misma cuenta y conserva su historial.

## CLI de Supabase

`supabase/config.toml` apunta al proyecto nuevo (`qqvxwggngmuveptytybf`). Para enlazar la CLI:

```sh
supabase link --project-ref qqvxwggngmuveptytybf
```

Si se usa la CLI, regenerar los tipos con `supabase gen types typescript --project-id qqvxwggngmuveptytybf > src/integrations/supabase/types.ts`.

## Pendiente de Lovable

El servidor MCP (`@lovable.dev/mcp-js`), Slack y HubSpot (`connector-gateway.lovable.dev`) siguen usando
servicios de Lovable.
