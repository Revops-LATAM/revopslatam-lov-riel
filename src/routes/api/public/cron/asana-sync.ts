import { createFileRoute } from "@tanstack/react-router";

// Cron: sync every linked Asana project. Called by pg_cron.
export const Route = createFileRoute("/api/public/cron/asana-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const auth = request.headers.get("Authorization");
        if (!serviceKey || !auth?.startsWith("Bearer ") || auth.slice(7).trim() !== serviceKey) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { syncProjectFromAsana } = await import("@/lib/api/asana.server");

        const { data: projects, error } = await supabaseAdmin
          .from("projects")
          .select("id, name")
          .not("asana_project_gid", "is", null)
          .eq("archived", false);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const results: Array<{ projectId: string; name: string; created?: number; updated?: number; total?: number; error?: string }> = [];
        for (const p of projects ?? []) {
          try {
            const r = await syncProjectFromAsana(supabaseAdmin, p.id, { createdBy: null });
            results.push({ projectId: p.id, name: p.name, ...r });
          } catch (e) {
            results.push({ projectId: p.id, name: p.name, error: (e as Error).message });
          }
        }
        return Response.json({ ok: true, syncedProjects: results.length, results });
      },
    },
  },
});
