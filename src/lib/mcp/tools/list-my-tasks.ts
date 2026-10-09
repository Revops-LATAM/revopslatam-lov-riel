import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_tasks",
  title: "List my tasks",
  description:
    "List tasks assigned to the signed-in user, optionally filtered by status or sprint. Includes the sprint of each task.",
  inputSchema: {
    status: z
      .enum([
        "nueva",
        "planificada",
        "en_curso",
        "en_pausa",
        "revision_interna",
        "revision_cliente",
        "en_correccion",
        "demorada",
        "completada",
        "cancelada",
      ])
      .optional()
      .describe("Optional task status filter (Spanish enum values from task_status)."),
    sprintId: z
      .string()
      .uuid()
      .optional()
      .describe("Optional sprint filter (use list_sprints first)."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, sprintId, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = sb(ctx)
      .from("tasks")
      .select(
        "id, title, status, priority, due_date, project_id, sprint_id, sprints(sprint_number, start_date, end_date, status)",
      )
      .eq("assignee_id", ctx.getUserId())
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    if (sprintId) q = q.eq("sprint_id", sprintId);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { tasks: data ?? [] },
    };
  },
});
