import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sbForUser, notAuthed, ok, fail, chunk, workspaceTz } from "../supabase";
import { utcFromTzWall } from "@/lib/time-tz";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineTool({
  name: "time_report",
  title: "Time report",
  description:
    "Aggregated logged hours in a date range for a workspace, grouped by member, project, client or sprint. Read-only.",
  inputSchema: {
    workspaceId: z.string().uuid().describe("Workspace id (use list_workspaces first)."),
    from: DATE.describe("Start date, YYYY-MM-DD (inclusive)."),
    to: DATE.describe("End date, YYYY-MM-DD (inclusive)."),
    groupBy: z.enum(["member", "project", "client", "sprint"]).describe("Grouping dimension."),
    billableOnly: z.boolean().optional().describe("Only billable entries (default false)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspaceId, from, to, groupBy, billableOnly }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = sbForUser(ctx);
    const tz = await workspaceTz(sb, workspaceId);

    const { data: projects, error: pErr } = await sb
      .from("projects")
      .select("id, name, client_name")
      .eq("workspace_id", workspaceId);
    if (pErr) return fail(pErr.message);
    const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
    const projectIds = [...projectById.keys()];
    if (projectIds.length === 0) return ok({ rows: [], totalHours: 0 });

    const taskProject = new Map<string, string>();
    const taskSprint = new Map<string, string>();
    for (const ids of chunk(projectIds)) {
      for (let page = 0; ; page += 1) {
        const { data: rows, error } = await sb
          .from("tasks")
          .select("id, project_id, sprint_id")
          .in("project_id", ids)
          .range(page * 1000, page * 1000 + 999);
        if (error) return fail(error.message);
        const list = rows ?? [];
        for (const t of list) {
          taskProject.set(t.id, t.project_id);
          if (t.sprint_id) taskSprint.set(t.id, t.sprint_id);
        }
        if (list.length < 1000) break;
      }
    }

    const startUtc = utcFromTzWall(from, "00:00:00", tz);
    const endUtc = utcFromTzWall(to, "23:59:59.999", tz);
    const totals = new Map<string, { key: string; label: string; minutes: number }>();
    let totalMinutes = 0;

    for (const ids of chunk([...taskProject.keys()], 100)) {
      for (let page = 0; ; page += 1) {
        let q = sb
          .from("time_entries")
          .select("user_id, task_id, duration_minutes, is_billable, started_at")
          .in("task_id", ids)
          .gte("started_at", startUtc)
          .lte("started_at", endUtc)
          .range(page * 1000, page * 1000 + 999);
        if (billableOnly) q = q.eq("is_billable", true);
        const { data: rows, error } = await q;
        if (error) return fail(error.message);
        const list = rows ?? [];
        for (const e of list) {
          const minutes = e.duration_minutes ?? 0;
          const project = e.task_id ? projectById.get(taskProject.get(e.task_id) ?? "") : undefined;
          let key = "desconocido";
          let label = "Desconocido";
          if (groupBy === "member") {
            key = e.user_id;
            label = e.user_id;
          } else if (groupBy === "project") {
            key = project?.id ?? "sin_proyecto";
            label = project?.name ?? "Sin proyecto";
          } else if (groupBy === "client") {
            key = project?.client_name ?? "sin_cliente";
            label = project?.client_name ?? "Sin cliente";
          } else {
            const sid = e.task_id ? taskSprint.get(e.task_id) : undefined;
            key = sid ?? "sin_sprint";
            label = sid ?? "Sin sprint";
          }
          const cur = totals.get(key) ?? { key, label, minutes: 0 };
          cur.minutes += minutes;
          totals.set(key, cur);
          totalMinutes += minutes;
        }
        if (list.length < 1000) break;
      }
    }

    if (groupBy === "member") {
      const memberIds = [...totals.keys()];
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
      for (const p of profiles ?? []) {
        const row = totals.get(p.id);
        if (row) row.label = p.full_name ?? p.email ?? p.id;
      }
    }

    if (groupBy === "sprint") {
      const ids = [...totals.keys()].filter((k) => k !== "sin_sprint");
      if (ids.length) {
        const { data: sprints } = await sb
          .from("sprints")
          .select("id, sprint_number, start_date, end_date, project_id")
          .in("id", ids);
        for (const s of sprints ?? []) {
          const row = totals.get(s.id);
          if (row) {
            const pname = projectById.get(s.project_id ?? "")?.name;
            row.label = `Sprint ${s.sprint_number} (${s.start_date} → ${s.end_date})${pname ? ` · ${pname}` : ""}`;
          }
        }
      }
    }

    const rows = [...totals.values()]
      .map((r) => ({ key: r.key, label: r.label, hours: Math.round((r.minutes / 60) * 100) / 100 }))
      .sort((a, b) => b.hours - a.hours);

    return ok({
      range: { from, to, timezone: tz },
      groupBy,
      rows,
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    });
  },
});
