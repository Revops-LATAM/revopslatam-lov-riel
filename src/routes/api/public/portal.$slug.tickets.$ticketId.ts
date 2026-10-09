import { createFileRoute } from "@tanstack/react-router";
import { requirePortalSession } from "@/lib/portal/session.server";

export const Route = createFileRoute("/api/public/portal/$slug/tickets/$ticketId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requirePortalSession(request, params.slug);
        if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: form } = await supabaseAdmin
          .from("client_ticket_forms")
          .select("project_id")
          .eq("id", session.formId)
          .maybeSingle();
        if (!form) return Response.json({ error: "not_found" }, { status: 404 });

        let taskQuery = supabaseAdmin
          .from("tasks")
          .select(
            "id, title, description, priority, request_type, severity, submitter_email, sla_target_response_at, sla_target_resolution_at, created_at, updated_at, status_id, sprint_id, task_statuses(name, category, color), sprints(id, sprint_number, start_date, end_date)",
          )
          .eq("id", params.ticketId)
          .eq("project_id", form.project_id)
          .not("submitter_email", "is", null);
        if (session.role !== "leader") {
          taskQuery = taskQuery.eq("submitter_email", session.email);
        }
        const { data: task } = await taskQuery.maybeSingle();
        if (!task) return Response.json({ error: "not_found" }, { status: 404 });

        const { data: comments, error: commentsError } = await supabaseAdmin
          .from("task_comments")
          .select("id, body, created_at, author_id, client_author_email, is_client_visible")
          .eq("task_id", params.ticketId)
          .eq("is_client_visible", true)
          .order("created_at", { ascending: true });
        if (commentsError) {
          console.error("[portal-ticket-detail] comments lookup failed", commentsError);
          return Response.json({ error: "comments_lookup_failed" }, { status: 500 });
        }

        const authorIds = Array.from(
          new Set((comments ?? []).map((c) => c.author_id).filter((id): id is string => !!id)),
        );
        const profilesById = new Map<string, { full_name: string | null }>();
        if (authorIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabaseAdmin
            .from("profiles")
            .select("id, full_name")
            .in("id", authorIds);
          if (profilesError) {
            console.error("[portal-ticket-detail] profiles lookup failed", profilesError);
          }
          for (const profile of profiles ?? []) {
            profilesById.set(profile.id, { full_name: profile.full_name });
          }
        }

        return Response.json({
          role: session.role,
          viewer_email: session.email,
          task,
          comments: (comments ?? []).map((comment) => ({
            ...comment,
            profiles: comment.author_id ? (profilesById.get(comment.author_id) ?? null) : null,
          })),
        });
      },
    },
  },
});
