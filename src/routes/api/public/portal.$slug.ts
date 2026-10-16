import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  MAGIC_TTL_MS,
  buildSessionCookie,
  clearSessionCookie,
  generateToken,
  hashToken,
  readSessionCookie,
  requirePortalSession,
} from "@/lib/portal/session.server";

const RequestLinkSchema = z.object({
  action: z.literal("request-link"),
  email: z
    .string()
    .email()
    .max(255)
    .transform((s) => s.toLowerCase().trim()),
});
const LogoutSchema = z.object({ action: z.literal("logout") });

export const Route = createFileRoute("/api/public/portal/$slug")({
  server: {
    handlers: {
      // GET returns whether there's an active session for this slug (used by the UI).
      GET: async ({ request, params }) => {
        const session = await requirePortalSession(request, params.slug);
        return Response.json({ authenticated: !!session, email: session?.email ?? null });
      },
      POST: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

        // Load form once
        const { data: form } = await supabaseAdmin
          .from("client_ticket_forms")
          .select("id, project_id, workspace_id, active")
          .eq("slug", params.slug)
          .maybeSingle();
        if (!form || !form.active) {
          return Response.json({ error: "Portal no disponible." }, { status: 404 });
        }

        // ---- logout ----
        if ((body as { action?: string }).action === "logout") {
          LogoutSchema.parse(body);
          const raw = readSessionCookie(request, params.slug);
          if (raw) {
            await supabaseAdmin
              .from("client_portal_tokens")
              .update({ revoked_at: new Date().toISOString() })
              .eq("token_hash", hashToken(raw));
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": clearSessionCookie(params.slug),
            },
          });
        }

        // ---- request magic link ----
        const parsed = RequestLinkSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Datos inválidos" }, { status: 400 });
        }
        const email = parsed.data.email;

        // Must be an authorized email for this form (case-insensitive),
        // or an email that already submitted a ticket through this form.
        const { data: allowedRows } = await supabaseAdmin
          .from("client_ticket_authorized_emails")
          .select("id, email")
          .eq("form_id", form.id)
          .ilike("email", email);
        let allowed = (allowedRows ?? []).length > 0;

        if (!allowed) {
          const { count: submissions } = await supabaseAdmin
            .from("client_ticket_submissions")
            .select("id", { count: "exact", head: true })
            .eq("form_id", form.id)
            .ilike("submitter_email", email);
          if ((submissions ?? 0) > 0) {
            allowed = true;
            await supabaseAdmin
              .from("client_ticket_authorized_emails")
              .insert({ form_id: form.id, email } as never);
          }
        }

        if (!allowed) {
          console.warn("[portal] magic link requested by unauthorized email", {
            slug: params.slug,
            email,
          });
          // Same-shape 200 response to avoid enumerating authorized emails.
          return Response.json({ ok: true });
        }

        // Rate limit: max 5 magic links per email per 15 min
        const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin
          .from("client_portal_tokens")
          .select("id", { count: "exact", head: true })
          .eq("form_id", form.id)
          .eq("email", email)
          .eq("kind", "magic")
          .gte("created_at", cutoff);
        if ((count ?? 0) >= 5) {
          return Response.json(
            { error: "Demasiadas solicitudes. Intenta más tarde." },
            { status: 429 },
          );
        }

        const { raw, hash } = generateToken();
        const expiresAt = new Date(Date.now() + MAGIC_TTL_MS).toISOString();
        const { error: insErr } = await supabaseAdmin.from("client_portal_tokens").insert({
          form_id: form.id,
          email,
          kind: "magic",
          token_hash: hash,
          expires_at: expiresAt,
        } as never);
        if (insErr) {
          return Response.json({ error: "No se pudo generar el acceso." }, { status: 500 });
        }

        const origin = new URL(request.url).origin;
        const magicUrl = `${origin}/api/public/portal/${params.slug}/verify?t=${encodeURIComponent(raw)}`;

        const { data: projectInfo } = await supabaseAdmin
          .from("projects")
          .select("name")
          .eq("id", form.project_id)
          .maybeSingle();

        try {
          const { sendTransactionalEmailServer } = await import("@/lib/email/transactional.server");
          await sendTransactionalEmailServer({
            templateName: "portal-magic-link",
            to: email,
            idempotencyKey: `portal-magic-${hash}`,
            templateData: {
              magic_url: magicUrl,
              project_name: projectInfo?.name,
              expires_in_minutes: 30,
            },
          });
        } catch (e) {
          console.error("[portal] magic link email failed", e);
        }

        return Response.json({ ok: true });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: { "Access-Control-Allow-Methods": "GET, POST, OPTIONS" },
        }),
    },
  },
});
