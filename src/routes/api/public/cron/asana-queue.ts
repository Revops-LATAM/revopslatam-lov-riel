import { createFileRoute } from "@tanstack/react-router";

// Worker: process pending Asana sync queue jobs.
// Called by pg_cron every minute.
export const Route = createFileRoute("/api/public/cron/asana-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const auth = request.headers.get("Authorization");
        if (!serviceKey || !auth?.startsWith("Bearer ") || auth.slice(7).trim() !== serviceKey) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const {
          pushTaskToAsana,
          pushCommentToAsana,
          handleAsanaWebhookEvent,
        } = await import("@/lib/api/asana.server");

        const { data: jobs } = await supabaseAdmin
          .from("asana_sync_queue")
          .select("id, direction, resource_kind, riel_id, asana_gid, payload, attempts")
          .eq("status", "pending")
          .lte("next_attempt_at", new Date().toISOString())
          .order("created_at", { ascending: true })
          .limit(50);

        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const j of (jobs ?? []) as Array<{
          id: string;
          direction: string;
          resource_kind: string;
          riel_id: string | null;
          asana_gid: string | null;
          payload: unknown;
          attempts: number;
        }>) {
          try {
            if (j.direction === "push" && j.resource_kind === "task" && j.riel_id) {
              await pushTaskToAsana(supabaseAdmin, j.riel_id);
            } else if (j.direction === "push" && j.resource_kind === "comment" && j.riel_id) {
              await pushCommentToAsana(supabaseAdmin, j.riel_id);
            } else if (j.direction === "pull") {
              await handleAsanaWebhookEvent(supabaseAdmin, j.payload as Parameters<typeof handleAsanaWebhookEvent>[1]);
            }
            await supabaseAdmin
              .from("asana_sync_queue")
              .update({ status: "done" } as never)
              .eq("id", j.id);
            results.push({ id: j.id, ok: true });
          } catch (e) {
            const attempts = (j.attempts ?? 0) + 1;
            const failed = attempts >= 5;
            await supabaseAdmin
              .from("asana_sync_queue")
              .update({
                attempts,
                status: failed ? "failed" : "pending",
                last_error: (e as Error).message,
                next_attempt_at: new Date(Date.now() + attempts * 60_000).toISOString(),
              } as never)
              .eq("id", j.id);
            results.push({ id: j.id, ok: false, error: (e as Error).message });
          }
        }
        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
