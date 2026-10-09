import { createFileRoute } from "@tanstack/react-router";
import { requirePortalSession } from "@/lib/portal/session.server";

export const Route = createFileRoute("/api/public/portal/$slug/tickets")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requirePortalSession(request, params.slug);
        if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: form } = await supabaseAdmin
          .from("client_ticket_forms")
          .select("project_id, workspace_id")
          .eq("id", session.formId)
          .maybeSingle();
        if (!form) return Response.json({ error: "not_found" }, { status: 404 });

        let ticketsQuery = supabaseAdmin
          .from("tasks")
          .select(
            "id, title, priority, request_type, severity, submitter_email, sla_target_response_at, sla_target_resolution_at, created_at, updated_at, status_id, sprint_id, task_statuses(name, category, color), sprints(id, sprint_number, start_date, end_date)",
          )
          .eq("project_id", form.project_id)
          .not("submitter_email", "is", null)
          .order("created_at", { ascending: false })
          .limit(500);
        // Los miembros sólo ven sus propios tickets; el líder ve todos los de su empresa.
        if (session.role !== "leader") {
          ticketsQuery = ticketsQuery.eq("submitter_email", session.email);
        }
        const { data: tickets, error } = await ticketsQuery;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const { data: project } = await supabaseAdmin
          .from("projects")
          .select("name, accounts(name)")
          .eq("id", form.project_id)
          .maybeSingle();

        return Response.json({
          email: session.email,
          role: session.role,
          project: {
            name: project?.name ?? null,
            account: (project as { accounts?: { name?: string } } | null)?.accounts?.name ?? null,
          },
          tickets: tickets ?? [],
        });
      },
    },
  },
});
