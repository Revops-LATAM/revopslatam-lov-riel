import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

type WebhookEvent = {
  resource?: { gid: string; resource_type?: string };
  action?: string;
  parent?: { gid: string; resource_type?: string } | null;
};

// Asana webhook receiver.
// Handshake: Asana sends an X-Hook-Secret header on the first POST when creating
// a webhook. We must echo the same header back AND store the secret to validate
// future events via X-Hook-Signature (HMAC-SHA256 of the raw body).
export const Route = createFileRoute("/api/public/webhooks/asana")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const projectId = url.searchParams.get("project");
        if (!projectId) {
          return new Response("Missing project param", { status: 400 });
        }

        const handshakeSecret = request.headers.get("x-hook-secret");
        const signature = request.headers.get("x-hook-signature");
        const rawBody = await request.text();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Handshake
        if (handshakeSecret) {
          const { data: project } = await supabaseAdmin
            .from("projects")
            .select("workspace_id, asana_project_gid")
            .eq("id", projectId)
            .maybeSingle();
          const p = project as { workspace_id: string; asana_project_gid: string | null } | null;
          if (!p?.asana_project_gid) {
            return new Response("Project not linked", { status: 404 });
          }
          await supabaseAdmin.from("asana_webhook_subscriptions").upsert(
            {
              project_id: projectId,
              workspace_id: p.workspace_id,
              asana_resource_gid: p.asana_project_gid,
              secret: handshakeSecret,
              active: false,
            } as never,
            { onConflict: "project_id" },
          );
          return new Response("", {
            status: 200,
            headers: { "X-Hook-Secret": handshakeSecret },
          });
        }

        // Verify signature for real events
        const { data: sub } = await supabaseAdmin
          .from("asana_webhook_subscriptions")
          .select("secret")
          .eq("project_id", projectId)
          .maybeSingle();
        const secret = (sub as { secret?: string } | null)?.secret;
        if (!secret || !signature) {
          return new Response("Unauthorized", { status: 401 });
        }
        const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
        try {
          const a = Buffer.from(signature);
          const b = Buffer.from(expected);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response("Invalid signature", { status: 401 });
          }
        } catch {
          return new Response("Invalid signature", { status: 401 });
        }

        // Process events asynchronously — Asana wants a fast 200
        let payload: { events?: WebhookEvent[] } = {};
        try {
          payload = JSON.parse(rawBody) as { events?: WebhookEvent[] };
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        await supabaseAdmin
          .from("asana_webhook_subscriptions")
          .update({ last_event_at: new Date().toISOString() } as never)
          .eq("project_id", projectId);

        // Enqueue each event for the worker (fire-and-forget pattern)
        const { data: project } = await supabaseAdmin
          .from("projects")
          .select("workspace_id")
          .eq("id", projectId)
          .maybeSingle();
        const workspaceId = (project as { workspace_id?: string } | null)?.workspace_id;
        if (workspaceId && payload.events?.length) {
          const rows = payload.events.map((e) => ({
            workspace_id: workspaceId,
            direction: "pull",
            resource_kind: e.resource?.resource_type ?? "unknown",
            asana_gid: e.resource?.gid ?? null,
            payload: e,
          }));
          await supabaseAdmin.from("asana_sync_queue").insert(rows as never);
        }

        return new Response("ok");
      },
    },
  },
});
