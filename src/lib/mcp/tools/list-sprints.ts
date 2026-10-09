import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sbForUser, notAuthed, ok, fail, chunk } from "../supabase";

type SprintRow = {
  id: string;
  sprint_number: number;
  start_date: string;
  end_date: string;
  status: string;
  contracted_hours: number | null;
  contract_id: string;
  project_id: string | null;
};

export default defineTool({
  name: "list_sprints",
  title: "List sprints",
  description:
    "List Riel sprints for a project or a contract, with dates, status, contracted hours and (optionally) task counts, estimated hours and logged hours per sprint.",
  inputSchema: {
    projectId: z.string().uuid().optional().describe("Project id (use list_projects first)."),
    contractId: z
      .string()
      .uuid()
      .optional()
      .describe("Contract id. Use instead of projectId to see all sprints of a contract."),
    includeTotals: z
      .boolean()
      .optional()
      .describe("Compute tasks, estimated hours and logged hours per sprint (default true)."),
    limit: z.number().int().min(1).max(200).optional().describe("Max sprints (default 60)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId, contractId, includeTotals, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    if (!projectId && !contractId) return fail("Provide projectId or contractId.");
    const sb = sbForUser(ctx);

    let q = sb
      .from("sprints")
      .select(
        "id, sprint_number, start_date, end_date, status, contracted_hours, contract_id, project_id",
      )
      .order("sprint_number", { ascending: true })
      .limit(limit ?? 60);
    if (projectId) q = q.eq("project_id", projectId);
    if (contractId) q = q.eq("contract_id", contractId);
    const { data, error } = await q;
    if (error) return fail(error.message);
    const sprints = (data ?? []) as SprintRow[];
    if (sprints.length === 0) return ok({ sprints: [] });

    if (includeTotals === false) return ok({ sprints });

    const sprintIds = sprints.map((s) => s.id);
    const tasks: Array<{
      id: string;
      sprint_id: string | null;
      status: string | null;
      total_effort_hours: number | null;
    }> = [];
    for (const ids of chunk(sprintIds, 50)) {
      for (let page = 0; ; page += 1) {
        const { data: rows, error: tErr } = await sb
          .from("tasks")
          .select("id, sprint_id, status, total_effort_hours")
          .in("sprint_id", ids)
          .range(page * 1000, page * 1000 + 999);
        if (tErr) return fail(tErr.message);
        const list = rows ?? [];
        tasks.push(...list);
        if (list.length < 1000) break;
      }
    }

    const taskSprint = new Map(tasks.map((t) => [t.id, t.sprint_id]));
    const loggedMinutes = new Map<string, number>();
    for (const ids of chunk([...taskSprint.keys()], 100)) {
      if (ids.length === 0) continue;
      for (let page = 0; ; page += 1) {
        const { data: entries, error: eErr } = await sb
          .from("time_entries")
          .select("task_id, duration_minutes")
          .in("task_id", ids)
          .range(page * 1000, page * 1000 + 999);
        if (eErr) return fail(eErr.message);
        const list = entries ?? [];
        for (const e of list) {
          const sid = e.task_id ? taskSprint.get(e.task_id) : null;
          if (!sid) continue;
          loggedMinutes.set(sid, (loggedMinutes.get(sid) ?? 0) + (e.duration_minutes ?? 0));
        }
        if (list.length < 1000) break;
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const rows = sprints.map((s) => {
      const own = tasks.filter((t) => t.sprint_id === s.id);
      const estimated = own.reduce((a, t) => a + Number(t.total_effort_hours ?? 0), 0);
      const completed = own.filter((t) => t.status === "completada").length;
      return {
        ...s,
        totals: {
          tasks: own.length,
          completedTasks: completed,
          estimatedHours: round(estimated),
          loggedHours: round((loggedMinutes.get(s.id) ?? 0) / 60),
          contractedHours: s.contracted_hours,
        },
      };
    });

    return ok({ sprints: rows });
  },
});
