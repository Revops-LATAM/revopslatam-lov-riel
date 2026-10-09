import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sbForUser, notAuthed, ok, fail } from "../supabase";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineTool({
  name: "update_task",
  title: "Update task",
  description:
    "Update fields of an existing Riel task: title, description, status, priority, dates, estimated hours, sprint or assignees. Only the provided fields change.",
  inputSchema: {
    taskId: z.string().uuid().describe("Task id (use list_my_tasks or get_project_overview first)."),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
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
      .describe("New task status (Spanish enum values)."),
    priority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),
    startDate: dateStr.nullable().optional().describe("Start date YYYY-MM-DD, or null to clear."),
    dueDate: dateStr.nullable().optional().describe("Due date YYYY-MM-DD, or null to clear."),
    estimatedHours: z.number().min(0).max(999).nullable().optional(),
    sprintId: z.string().uuid().nullable().optional().describe("Move to sprint, or null to move to backlog."),
    assigneeIds: z
      .array(z.string().uuid())
      .max(20)
      .optional()
      .describe("Replace the full assignee list with these user ids."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = sbForUser(ctx);

    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status !== undefined) patch.status = input.status;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.startDate !== undefined) patch.start_date = input.startDate;
    if (input.dueDate !== undefined) patch.due_date = input.dueDate;
    if (input.estimatedHours !== undefined) patch.total_effort_hours = input.estimatedHours;
    if (input.sprintId !== undefined) patch.sprint_id = input.sprintId;
    if (input.status === "completada") patch.completed_at = new Date().toISOString();
    if (input.assigneeIds !== undefined) patch.assignee_id = input.assigneeIds[0] ?? null;

    if (Object.keys(patch).length === 0 && input.assigneeIds === undefined) {
      return fail("Nothing to update: provide at least one field.");
    }

    const { data: task, error } = await sb
      .from("tasks")
      .update(patch)
      .eq("id", input.taskId)
      .select("id, title, status, priority, start_date, due_date, total_effort_hours, sprint_id, project_id")
      .maybeSingle();
    if (error) return fail(error.message);
    if (!task) return fail("Task not found or you don't have permission to edit it.");

    if (input.assigneeIds !== undefined) {
      const ids = Array.from(new Set(input.assigneeIds));
      const del = sb.from("task_assignees").delete().eq("task_id", input.taskId);
      const { error: dErr } = ids.length > 0 ? await del.not("user_id", "in", `(${ids.join(",")})`) : await del;
      if (dErr) return fail(dErr.message);
      if (ids.length > 0) {
        const { error: aErr } = await sb
          .from("task_assignees")
          .upsert(
            ids.map((u) => ({ task_id: input.taskId, user_id: u, is_primary: false })),
            { onConflict: "task_id,user_id", ignoreDuplicates: true },
          );
        if (aErr) return fail(aErr.message);
      }
    }

    return ok({ task }, { task });
  },
});
