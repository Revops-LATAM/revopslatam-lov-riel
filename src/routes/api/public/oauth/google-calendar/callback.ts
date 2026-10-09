import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

function verifyState(state: string): {
  uid: string;
  ws: string;
  ru: string;
  exp: number;
} | null {
  try {
    const [b64, sig] = state.split(".");
    if (!b64 || !sig) return null;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const expected = createHmac("sha256", secret).update(b64).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function htmlPage(title: string, message: string, redirectUrl?: string) {
  const meta = redirectUrl ? `<meta http-equiv="refresh" content="2;url=${redirectUrl}" />` : "";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"/>${meta}<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b0c;color:#e7e7ea;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{max-width:420px;padding:32px;border:1px solid #2a2a2e;border-radius:12px;background:#141416}
h1{font-size:18px;margin:0 0 8px}p{margin:0;color:#9ca3af;font-size:14px;line-height:1.5}
a{color:#60a5fa}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p>
${redirectUrl ? `<p style="margin-top:12px"><a href="${redirectUrl}">Volver</a></p>` : ""}
</div></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/oauth/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          return htmlPage(
            "Conexión cancelada",
            `Google devolvió: ${error}. Puedes intentar de nuevo desde Riel.`,
          );
        }
        if (!code || !state) {
          return htmlPage("Faltan parámetros", "Solicitud OAuth inválida.");
        }
        const payload = verifyState(state);
        if (!payload) {
          return htmlPage(
            "Estado inválido",
            "El enlace expiró o fue manipulado. Vuelve a iniciar la conexión.",
          );
        }

        const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID!;
        const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET!;

        // Exchange code for tokens
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: payload.ru,
            grant_type: "authorization_code",
          }),
        });
        if (!tokenRes.ok) {
          const txt = await tokenRes.text();
          return htmlPage(
            "Error de Google",
            `No se pudieron canjear los tokens. ${txt.slice(0, 200)}`,
          );
        }
        const tokens = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
          scope: string;
        };

        // Get user email
        const uiRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!uiRes.ok) {
          return htmlPage("Error de Google", "No se pudo leer el email de la cuenta.");
        }
        const userInfo = (await uiRes.json()) as { email: string };

        const admin = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
        const scopes = tokens.scope.split(" ").filter(Boolean);

        // Upsert connection
        const { error: upErr } = await admin.from("user_calendar_connections").upsert(
          {
            user_id: payload.uid,
            workspace_id: payload.ws,
            provider: "google",
            google_account_email: userInfo.email,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? null,
            token_expires_at: expiresAt,
            scopes,
            status: "active",
            sync_token: null,
            last_synced_at: null,
          },
          { onConflict: "workspace_id,user_id,provider" },
        );

        if (upErr) {
          return htmlPage("Error al guardar", upErr.message);
        }

        // Back to settings — derive from redirect URI origin
        const origin = new URL(payload.ru).origin;
        const back = `${origin}/?calendar=connected`;
        return htmlPage(
          "Calendario conectado",
          `Conectamos ${userInfo.email}. Te llevamos de vuelta a Riel…`,
          back,
        );
      },
    },
  },
});
