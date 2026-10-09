import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sbForUser, notAuthed, ok, fail } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Create task",
  description:
    "Create a task in a Riel project (optionally inside a sprint or phase). Writes as the signed-in user and respects their permissions.",
  inputSchema: {
    projectId: z.string().uuid().describe("Project id (use list_projects first)."),
    title: z.string().min(1).max(200).describe("Task title."),
    description: z.string().max(5000).optional().describe("Optional description."),
    sprintId: z.string().uuid().optional().describe("Optional sprint (use list_sprints first)."),
    phaseId: z.string().uuid().optional().describe("Optional phase id."),
    priority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Start date YYYY-MM-DD."),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Due date YYYY-MM-DD."),
    estimatedHours: z.number().min(0).max(999).optional().describe("Estimated effort in hours."),
    assigneeIds: z
      .array(z.string().uuid())
      .max(20)
      .optional()
      .describe("User ids to assign (omit to leave unassigned; defaults to nobody)."),
    assignToMe: z.boolean().optional().describe("Assign the task to the signed-in user."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = sbForUser(ctx);
    const userId = ctx.getUserId();

    const { data: project, error: pErr } = await sb
      .from("projects")
      .select("id, workspace_id, contract_id")
      .eq("id", input.projectId)
      .maybeSingle();
    if (pErr) return fail(pErr.message);
    if (!project) return fail("Project not found or not accessible.");

    // Resolve a default status for the workspace (status_id is required).
    const { data: defStatus } = await sb
      .from("task_statuses")
      .select("id, task_type_id")
      .eq("workspace_id", project.workspace_id)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    if (!defStatus?.id) return fail("No default task status configured in this workspace.");

    const assignees = Array.from(
      new Set([...(input.assigneeIds ?? []), ...(input.assignToMe && userId ? [userId] : [])]),
    );

    const { data: task, error } = await sb
      .from("tasks")
      .insert({
        project_id: input.projectId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "none",
        sprint_id: input.sprintId ?? null,
        phase_id: input.phaseId ?? null,
        start_date: input.startDate ?? null,
        due_date: input.dueDate ?? null,
        total_effort_hours: input.estimatedHours ?? null,
        contract_id: project.contract_id ?? null,
        status_id: defStatus.id,
        task_type_id: defStatus.task_type_id ?? null,

        assignee_id: assignees[0] ?? null,
        created_by: userId,
      })
      .select(
        "id, title, status, priority, start_date, due_date, total_effort_hours, sprint_id, project_id",
      )
      .single();
    if (error) return fail(error.message);

    if (assignees.length > 0) {
      await sb.from("task_assignees").upsert(
        assignees.map((u) => ({ task_id: task.id, user_id: u, is_primary: false })),
        { onConflict: "task_id,user_id", ignoreDuplicates: true },
      );
    }

    return ok({ task, assignees }, { task, assignees });
  },
});
