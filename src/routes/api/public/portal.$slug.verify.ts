import { createFileRoute } from "@tanstack/react-router";
import {
  SESSION_TTL_MS,
  buildSessionCookie,
  generateToken,
  hashToken,
} from "@/lib/portal/session.server";

export const Route = createFileRoute("/api/public/portal/$slug/verify")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const raw = url.searchParams.get("t");
        const failRedirect = (reason: string) =>
          Response.redirect(
            `${url.origin}/tickets/${params.slug}?error=${encodeURIComponent(reason)}`,
            302,
          );
        if (!raw) return failRedirect("missing");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: form } = await supabaseAdmin
          .from("client_ticket_forms")
          .select("id, active")
          .eq("slug", params.slug)
          .maybeSingle();
        if (!form || !form.active) return failRedirect("not_found");

        const hash = hashToken(raw);
        const { data: token } = await supabaseAdmin
          .from("client_portal_tokens")
          .select("id, email, expires_at, consumed_at, form_id")
          .eq("token_hash", hash)
          .eq("kind", "magic")
          .eq("form_id", form.id)
          .maybeSingle();
        if (!token) return failRedirect("invalid");
        if (token.consumed_at) return failRedirect("used");
        if (new Date(token.expires_at).getTime() < Date.now()) return failRedirect("expired");

        // consume + create session
        await supabaseAdmin
          .from("client_portal_tokens")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", token.id);

        const { raw: sessionRaw, hash: sessionHash } = generateToken();
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
        const { error } = await supabaseAdmin.from("client_portal_tokens").insert({
          form_id: form.id,
          email: token.email,
          kind: "session",
          token_hash: sessionHash,
          expires_at: expiresAt,
        } as never);
        if (error) return failRedirect("session");

        return new Response(null, {
          status: 302,
          headers: {
            Location: `${url.origin}/tickets/${params.slug}/portal/inbox`,
            "Set-Cookie": buildSessionCookie(
              params.slug,
              sessionRaw,
              Math.floor(SESSION_TTL_MS / 1000),
            ),
          },
        });
      },
    },
  },
});
