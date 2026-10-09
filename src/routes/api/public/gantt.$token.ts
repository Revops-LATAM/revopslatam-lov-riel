import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/gantt/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!token || token.length < 8) {
          return new Response("Invalid token", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: tokenRow, error: tErr } = await supabaseAdmin
          .from("project_share_tokens")
          .select("project_id, expires_at, revoked_at, scope")
          .eq("token", token)
          .maybeSingle();
        if (tErr) return new Response(tErr.message, { status: 500 });
        if (!tokenRow || tokenRow.scope !== "gantt") {
          return new Response("Not found", { status: 404 });
        }
        if (tokenRow.revoked_at) return new Response("Revoked", { status: 410 });
        if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
          return new Response("Expired", { status: 410 });
        }

        const projectId = tokenRow.project_id;
        const [projectQ, phasesQ, tasksQ, depsQ] = await Promise.all([
          supabaseAdmin
            .from("projects")
            .select("id, name, start_date, end_date")
            .eq("id", projectId)
            .maybeSingle(),
          supabaseAdmin
            .from("phases")
            .select("id, name, color, order_index")
            .eq("project_id", projectId)
            .order("order_index", { ascending: true }),
          supabaseAdmin
            .from("tasks")
            .select(
              "id, title, start_date, due_date, phase_id, task_statuses:status_id ( color, name )",
            )
            .eq("project_id", projectId),
          supabaseAdmin
            .from("task_dependencies")
            .select("id, predecessor_task_id, successor_task_id")
            .eq("project_id", projectId),
        ]);

        if (projectQ.error) return new Response(projectQ.error.message, { status: 500 });
        if (!projectQ.data) return new Response("Not found", { status: 404 });

        return Response.json(
          {
            project: projectQ.data,
            phases: phasesQ.data ?? [],
            tasks: tasksQ.data ?? [],
            dependencies: depsQ.data ?? [],
          },
          {
            headers: {
              "Cache-Control": "public, max-age=60",
            },
          },
        );
      },
    },
  },
});
