import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requirePortalSession } from "@/lib/portal/session.server";

const BodySchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const Route = createFileRoute("/api/public/portal/$slug/tickets/$ticketId/comment")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await requirePortalSession(request, params.slug);
          if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });

          const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const parsed = BodySchema.safeParse(raw);
          if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: form, error: formError } = await supabaseAdmin
            .from("client_ticket_forms")
            .select("project_id, workspace_id, slack_channel_id")
            .eq("id", session.formId)
            .maybeSingle();
          if (formError) {
            console.error("[portal-comment] form lookup failed", formError);
            return Response.json({ error: "form_lookup_failed" }, { status: 500 });
          }
          if (!form) return Response.json({ error: "not_found" }, { status: 404 });

          let taskQuery = supabaseAdmin
            .from("tasks")
            .select("id, title, project_id, assignee_id, submitter_email")
            .eq("id", params.ticketId)
            .eq("project_id", form.project_id)
          .not("submitter_email", "is", null);
          if (session.role !== "leader") {
            taskQuery = taskQuery.eq("submitter_email", session.email);
          }
          const { data: task, error: taskError } = await taskQuery.maybeSingle();
          if (taskError) {
            console.error("[portal-comment] task lookup failed", taskError);
            return Response.json({ error: "task_lookup_failed" }, { status: 500 });
          }
          if (!task) return Response.json({ error: "not_found" }, { status: 404 });

          const { error } = await supabaseAdmin.from("task_comments").insert({
            task_id: task.id,
            author_id: null,
            client_author_email: session.email,
            body: parsed.data.body,
            is_client_visible: true,
          } as never);
          if (error) {
            console.error("[portal-comment] insert failed", error);
            return Response.json({ error: "comment_insert_failed", detail: error.message }, { status: 500 });
          }

          // Best-effort: notify assignee via email
          try {
            let replyTo: string | undefined;
            if (task.assignee_id) {
              const { data: assignee } = await supabaseAdmin
                .from("profiles")
                .select("email")
                .eq("id", task.assignee_id)
                .maybeSingle();
              replyTo = assignee?.email ?? undefined;
            }
            const appBase = process.env.PUBLIC_APP_URL || "https://riel.revopslatam.com";
            const ticketUrl = `${appBase}/tasks/${task.id}`;

            const { enqueueTransactionalEmailServer } = await import("@/lib/email/enqueue.server");
            await enqueueTransactionalEmailServer({
              templateName: "ticket-client-reply",
              to: replyTo ?? "soporte@revopslatam.com",
              idempotencyKey: `ticket-client-reply-${task.id}-${Date.now()}`,
              templateData: {
                ticket_id: task.id,
                title: task.title,
                client_email: session.email,
                message: parsed.data.body,
                ticket_url: ticketUrl,
              },
            });
          } catch (e) {
            console.error("[portal-comment] notify assignee failed", e);
          }

          // Best-effort: post to Slack channel configured on the form
          if (form.slack_channel_id) {
            try {
              const { postTicketReplyToSlack } = await import("@/lib/slack/notify.server");
              const appBase = process.env.PUBLIC_APP_URL || "https://riel.revopslatam.com";
              await postTicketReplyToSlack({
                channelId: form.slack_channel_id,
                ticketId: task.id,
                title: task.title,
                clientEmail: session.email,
                message: parsed.data.body,
                ticketUrl: `${appBase}/tasks/${task.id}`,
              });

            } catch (e) {
              console.error("[portal-comment] slack reply notify failed", e);
            }
          }

          return Response.json({ ok: true });
        } catch (error) {
          console.error("[portal-comment] unexpected failure", error);
          return Response.json({ error: "unexpected_failure" }, { status: 500 });
        }
      },
    },
  },
});
