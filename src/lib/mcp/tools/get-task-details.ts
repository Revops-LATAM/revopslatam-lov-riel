import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sbForUser, notAuthed, ok, fail } from "../supabase";

export default defineTool({
  name: "get_task_details",
  title: "Task details",
  description:
    "Full detail of one Riel task for analysis: description, status, dates, estimated vs logged hours, assignees, comments (conversation, including client portal replies) and attachments.",
  inputSchema: {
    taskId: z.string().uuid().describe("Task id (UUID). Use list_my_tasks or get_project_overview first."),
    includeComments: z.boolean().optional().describe("Include the conversation thread (default true)."),
    commentLimit: z.number().int().min(1).max(500).optional().describe("Max comments to return (default 100)."),
    includeTimeEntries: z.boolean().optional().describe("Include individual time entries (default false)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ taskId, includeComments, commentLimit, includeTimeEntries }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = sbForUser(ctx);

    const { data: taskRow, error } = await sb
      .from("tasks")
      .select(
        "id, title, description, status, priority, request_type, severity, submitter_email, start_date, due_date, total_effort_hours, effort_mode, created_at, updated_at, project_id, sprint_id, phase_id, status_id, task_type_id, assignee_id, " +
          "projects(id, name, client_name, area, state), sprints(id, sprint_number, start_date, end_date, status), phases(id, name), task_statuses(name, category, color), task_types(name, key)",
      )
      .eq("id", taskId)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!taskRow) return fail("Task not found or not accessible.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const task = taskRow as any;

    // Assignees (multi) + profiles
    const { data: assigneeRows } = await sb
      .from("task_assignees")
      .select("user_id")
      .eq("task_id", taskId);
    const userIds = new Set<string>(
      [...(assigneeRows ?? []).map((r: { user_id: string }) => r.user_id), task.assignee_id].filter(
        (v): v is string => !!v,
      ),
    );

    // Comments
    let comments: Array<Record<string, unknown>> = [];
    if (includeComments !== false) {
      const { data: rows, error: cErr } = await sb
        .from("task_comments")
        .select("id, body, author_id, client_author_email, is_client_visible, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true })
        .limit(commentLimit ?? 100);
      if (cErr) return fail(cErr.message);
      comments = rows ?? [];
      for (const c of comments) {
        const a = c.author_id as string | null;
        if (a) userIds.add(a);
      }
    }

    // Profiles for assignees + comment authors
    const profileById = new Map<string, { id: string; full_name: string | null; email: string | null }>();
    if (userIds.size > 0) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, full_name, email")
        .in("id", [...userIds]);
      for (const p of profiles ?? []) profileById.set(p.id, p);
    }

    // Time entries / logged hours
    const { data: entries, error: tErr } = await sb
      .from("time_entries")
      .select("id, user_id, duration_minutes, started_at, ended_at, note, is_billable")
      .eq("task_id", taskId)
      .order("started_at", { ascending: true })
      .limit(500);
    if (tErr) return fail(tErr.message);
    const loggedMinutes = (entries ?? []).reduce(
      (s: number, e: { duration_minutes: number | null }) => s + (e.duration_minutes ?? 0),
      0,
    );
    const loggedByUser: Record<string, number> = {};
    for (const e of entries ?? []) {
      const key = profileById.get(e.user_id)?.full_name ?? e.user_id;
      loggedByUser[key] = Math.round(((loggedByUser[key] ?? 0) + (e.duration_minutes ?? 0) / 60) * 100) / 100;
    }

    const { data: attachments } = await sb
      .from("task_attachments")
      .select("id, file_name, file_size, mime_type, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    return ok({
      task: {
        ...task,
        shortId: String(task.id).slice(0, 8),
      },
      assignees: [...userIds]
        .filter((id) => (assigneeRows ?? []).some((r: { user_id: string }) => r.user_id === id) || id === task.assignee_id)
        .map((id) => profileById.get(id) ?? { id, full_name: null, email: null }),
      hours: {
        estimated: task.total_effort_hours,
        logged: Math.round((loggedMinutes / 60) * 100) / 100,
        loggedByUser,
      },
      conversation: comments.map((c) => ({
        id: c.id,
        createdAt: c.created_at,
        author:
          (c.author_id ? profileById.get(c.author_id as string)?.full_name : null) ??
          (c.client_author_email as string | null) ??
          "desconocido",
        isClient: !c.author_id && !!c.client_author_email,
        visibleToClient: c.is_client_visible,
        body: c.body,
      })),
      timeEntries: includeTimeEntries ? entries ?? [] : undefined,
      attachments: attachments ?? [],
    });
  },
});
