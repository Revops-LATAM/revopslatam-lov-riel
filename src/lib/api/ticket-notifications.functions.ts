import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function resolveAssigneeReplyTo(
  supabase: any,
  assigneeId: string | null | undefined,
): Promise<string | undefined> {
  if (!assigneeId) return undefined;
  const { data } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", assigneeId)
    .maybeSingle();
  return data?.email ?? undefined;
}

export const notifyTicketResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        resolutionNote: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: task, error } = await supabase
      .from("tasks")
      .select("id, title, submitter_email, assignee_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task?.submitter_email) {
      throw new Error("Este ticket no tiene email del solicitante.");
    }
    const replyTo = await resolveAssigneeReplyTo(supabase, task.assignee_id);
    const { sendTransactionalEmailServer } = await import("@/lib/email/transactional.server");
    await sendTransactionalEmailServer({
      templateName: "ticket-resolved",
      to: task.submitter_email,
      idempotencyKey: `ticket-resolved-${task.id}`,
      replyTo,
      templateData: {
        ticket_id: task.id,
        title: task.title,
        resolution_note: data.resolutionNote,
      },
    });
    return { ok: true };
  });

export const notifyTicketQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        question: z.string().trim().min(1).max(3000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("tasks")
      .select("id, title, submitter_email, assignee_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task?.submitter_email) {
      throw new Error("Este ticket no tiene email del solicitante.");
    }

    // Persist as a client-visible comment
    const { error: cErr } = await supabase.from("task_comments").insert({
      task_id: task.id,
      author_id: userId,
      body: data.question,
      is_client_visible: true,
    } as never);
    if (cErr) throw new Error(cErr.message);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    // Prefer the assignee's email as Reply-To; otherwise let enqueue fall back to victor@.
    const replyTo = await resolveAssigneeReplyTo(supabase, task.assignee_id);

    const { sendTransactionalEmailServer } = await import("@/lib/email/transactional.server");
    await sendTransactionalEmailServer({
      templateName: "ticket-question",
      to: task.submitter_email,
      idempotencyKey: `ticket-question-${task.id}-${Date.now()}`,
      replyTo,
      templateData: {
        ticket_id: task.id,
        title: task.title,
        question: data.question,
        author_name: profile?.full_name ?? undefined,
      },
    });
    return { ok: true };
  });
