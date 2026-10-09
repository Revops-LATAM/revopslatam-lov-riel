import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sbForUser, notAuthed, ok, fail, chunk, workspaceTz } from "../supabase";
import { dayInTz, utcFromTzWall } from "@/lib/time-tz";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineTool({
  name: "my_time_summary",
  title: "My time summary",
  description:
    "Logged hours of the signed-in user in a date range, with a per-day breakdown and totals by project. Dates use the workspace timezone.",
  inputSchema: {
    from: DATE.describe("Start date, YYYY-MM-DD (inclusive)."),
    to: DATE.describe("End date, YYYY-MM-DD (inclusive)."),
    workspaceId: z
      .string()
      .uuid()
      .optional()
      .describe("Workspace whose timezone is used for day boundaries (optional)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, workspaceId }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = sbForUser(ctx);
    const tz = await workspaceTz(sb, workspaceId);
    const startUtc = utcFromTzWall(from, "00:00:00", tz);
    const endUtc = utcFromTzWall(to, "23:59:59.999", tz);

    const entries: Array<{ task_id: string | null; duration_minutes: number | null; started_at: string; is_billable: boolean }> = [];
    for (let page = 0; ; page += 1) {
      const { data: rows, error } = await sb
        .from("time_entries")
        .select("task_id, duration_minutes, started_at, is_billable")
        .eq("user_id", ctx.getUserId()!)
        .gte("started_at", startUtc)
        .lte("started_at", endUtc)
        .range(page * 1000, page * 1000 + 999);
      if (error) return fail(error.message);
      const list = rows ?? [];
      entries.push(...list);
      if (list.length < 1000) break;
    }


    const taskIds = [...new Set(entries.map((e) => e.task_id).filter(Boolean) as string[])];
    const taskProject = new Map<string, string | null>();
    for (const ids of chunk(taskIds)) {
      const { data: rows, error } = await sb.from("tasks").select("id, project_id").in("id", ids);
      if (error) return fail(error.message);
      for (const t of rows ?? []) taskProject.set(t.id, t.project_id);
    }
    const projectIds = [...new Set([...taskProject.values()].filter(Boolean) as string[])];
    const projectName = new Map<string, string>();
    for (const ids of chunk(projectIds)) {
      const { data: rows } = await sb.from("projects").select("id, name").in("id", ids);
      for (const p of rows ?? []) projectName.set(p.id, p.name);
    }

    const byDay: Record<string, number> = {};
    const byProject: Record<string, number> = {};
    let totalMinutes = 0;
    let billableMinutes = 0;
    for (const e of entries) {
      const min = e.duration_minutes ?? 0;
      totalMinutes += min;
      if (e.is_billable) billableMinutes += min;
      const day = dayInTz(e.started_at, tz);
      byDay[day] = (byDay[day] ?? 0) + min;
      const pid = e.task_id ? taskProject.get(e.task_id) : null;
      const label = pid ? (projectName.get(pid) ?? pid) : "Sin proyecto";
      byProject[label] = (byProject[label] ?? 0) + min;
    }
    const toH = (m: number) => Math.round((m / 60) * 100) / 100;

    return ok({
      range: { from, to, timezone: tz },
      totalHours: toH(totalMinutes),
      billableHours: toH(billableMinutes),
      byDay: Object.fromEntries(Object.entries(byDay).map(([k, v]) => [k, toH(v)])),
      byProject: Object.fromEntries(Object.entries(byProject).map(([k, v]) => [k, toH(v)])),
    });
  },
});
