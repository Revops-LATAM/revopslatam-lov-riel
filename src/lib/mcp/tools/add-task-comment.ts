import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sbForUser, notAuthed, ok, fail } from "../supabase";

export default defineTool({
  name: "add_task_comment",
  title: "Add task comment",
  description:
    "Add a comment to a Riel task. Internal by default; set clientVisible to true to make it visible in the client ticket portal.",
  inputSchema: {
    taskId: z.string().uuid().describe("Task id."),
    body: z.string().min(1).max(5000).describe("Comment text."),
    clientVisible: z
      .boolean()
      .optional()
      .describe("Make the comment visible to the client in the ticket portal (default false)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ taskId, body, clientVisible }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = sbForUser(ctx);
    const { data, error } = await sb
      .from("task_comments")
      .insert({
        task_id: taskId,
        body,
        is_client_visible: clientVisible ?? false,
        author_id: ctx.getUserId(),
      })
      .select("id, task_id, body, is_client_visible, created_at")
      .single();
    if (error) return fail(error.message);
    return ok({ comment: data }, { comment: data });
  },
});
