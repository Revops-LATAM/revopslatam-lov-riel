import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sbForUser, notAuthed, ok, fail, chunk } from "../supabase";

export default defineTool({
  name: "get_project_overview",
  title: "Project overview",
  description:
    "Detail of one Riel project: tasks by status, estimated hours vs logged hours, and the most recent tasks.",
  inputSchema: {
    projectId: z.string().uuid().describe("Project id (use list_projects first)."),
    sprintId: z
      .string()
      .uuid()
      .optional()
      .describe("Optional: restrict to one sprint (use list_sprints first)."),
    taskLimit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Recent tasks to list (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId, sprintId, taskLimit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = sbForUser(ctx);

    const { data: project, error: pErr } = await sb
      .from("projects")
      .select(
        "id, name, client_name, area, state, delivery_type, horas_presupuestadas_total, fecha_inicio_delivery, fecha_entrega_objetivo",
      )
      .eq("id", projectId)
      .maybeSingle();
    if (pErr) return fail(pErr.message);
    if (!project) return fail("Project not found or not accessible.");

    const tasks: Array<{
      id: string;
      title: string;
      status: string | null;
      sprint_id: string | null;
      total_effort_hours: number | null;
      start_date: string | null;
      due_date: string | null;
      updated_at: string;
    }> = [];
    for (let page = 0; ; page += 1) {
      let tq = sb
        .from("tasks")
        .select(
          "id, title, status, sprint_id, total_effort_hours, start_date, due_date, updated_at",
        )
        .eq("project_id", projectId)
        .range(page * 1000, page * 1000 + 999);
      if (sprintId) tq = tq.eq("sprint_id", sprintId);
      const { data: rows, error } = await tq;
      if (error) return fail(error.message);
      const list = rows ?? [];
      tasks.push(...list);
      if (list.length < 1000) break;
    }

    let loggedMinutes = 0;
    for (const ids of chunk(tasks.map((t) => t.id))) {
      if (ids.length === 0) continue;
      for (let page = 0; ; page += 1) {
        const { data: entries, error } = await sb
          .from("time_entries")
          .select("duration_minutes")
          .in("task_id", ids)
          .range(page * 1000, page * 1000 + 999);
        if (error) return fail(error.message);
        const list = entries ?? [];
        for (const e of list) loggedMinutes += e.duration_minutes ?? 0;
        if (list.length < 1000) break;
      }
    }

    const byStatus: Record<string, number> = {};
    let estimatedHours = 0;
    for (const t of tasks) {
      const k = t.status ?? "sin_estado";
      byStatus[k] = (byStatus[k] ?? 0) + 1;
      estimatedHours += Number(t.total_effort_hours ?? 0);
    }

    const sprintIds = [...new Set(tasks.map((t) => t.sprint_id).filter(Boolean))] as string[];
    const sprintById = new Map<
      string,
      { id: string; sprint_number: number; start_date: string; end_date: string; status: string }
    >();
    for (const ids of chunk(sprintIds, 100)) {
      if (ids.length === 0) continue;
      const { data: srows, error: sErr } = await sb
        .from("sprints")
        .select("id, sprint_number, start_date, end_date, status")
        .in("id", ids);
      if (sErr) return fail(sErr.message);
      for (const s of srows ?? []) sprintById.set(s.id, s);
    }

    const bySprint: Record<
      string,
      {
        sprintNumber: number | null;
        startDate: string | null;
        endDate: string | null;
        status: string | null;
        tasks: number;
        estimatedHours: number;
      }
    > = {};
    for (const t of tasks) {
      const key = t.sprint_id ?? "sin_sprint";
      const meta = t.sprint_id ? sprintById.get(t.sprint_id) : undefined;
      const cur = bySprint[key] ?? {
        sprintNumber: meta?.sprint_number ?? null,
        startDate: meta?.start_date ?? null,
        endDate: meta?.end_date ?? null,
        status: meta?.status ?? null,
        tasks: 0,
        estimatedHours: 0,
      };
      cur.tasks += 1;
      cur.estimatedHours =
        Math.round((cur.estimatedHours + Number(t.total_effort_hours ?? 0)) * 100) / 100;
      bySprint[key] = cur;
    }

    const recent = [...tasks]
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
      .slice(0, taskLimit ?? 50);

    return ok({
      project,
      totals: {
        tasks: tasks.length,
        estimatedHours: Math.round(estimatedHours * 100) / 100,
        loggedHours: Math.round((loggedMinutes / 60) * 100) / 100,
        budgetHours: project.horas_presupuestadas_total,
      },
      tasksByStatus: byStatus,
      tasksBySprint: bySprint,
      recentTasks: recent,
    });
  },
});
