import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dayInTz, utcFromTzWall } from "@/lib/time-tz";

/**
 * Aggregated time report. Supports grouping by project / member / client over
 * an arbitrary date range. Computes hours, billable hours and monetary amount
 * using the effective rate (project rate overrides user rate).
 */
export const getTimeReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        groupBy: z.enum(["project", "member", "client", "phase"]),
        billableOnly: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // First wave in parallel
    const [wsRes, projectsRes, capsRes, membersRes] = await Promise.all([
      supabase.from("workspaces").select("timezone").eq("id", data.workspaceId).maybeSingle(),
      supabase
        .from("projects")
        .select("id, name, color, client_name, hourly_rate, default_billable")
        .eq("workspace_id", data.workspaceId),
      supabase
        .from("user_capacity")
        .select("user_id, hourly_rate, currency")
        .eq("workspace_id", data.workspaceId),
      supabase.from("workspace_members").select("user_id").eq("workspace_id", data.workspaceId),
    ]);
    const tz = wsRes.data?.timezone ?? "UTC";
    const startUtc = utcFromTzWall(data.from, "00:00:00", tz);
    const endUtc = utcFromTzWall(data.to, "23:59:59.999", tz);

    const projects = projectsRes.data ?? [];
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length === 0)
      return { tz, rows: [], totals: { minutes: 0, billableMinutes: 0 } };

    const members = membersRes.data ?? [];
    const memberIds = members.map((m) => m.user_id);

    // Second wave: tasks (paginated) + profiles
    const { chunk } = await import("@/lib/api/report-utils");
    const tasks: Array<{ id: string; project_id: string; phase_id: string | null }> = [];
    for (const ids of chunk(projectIds, 100)) {
      let page = 0;
      for (;;) {
        const { data: rows } = await supabase
          .from("tasks")
          .select("id, project_id, phase_id")
          .in("project_id", ids)
          .range(page * 1000, page * 1000 + 999);
        const list = rows ?? [];
        tasks.push(...list);
        if (list.length < 1000) break;
        page += 1;
      }
    }
    const profilesRes = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const phaseById = new Map<string, { name: string; color: string | null }>();
    for (const ids of chunk(projectIds, 100)) {
      const { data: ph } = await supabase
        .from("phases")
        .select("id, name, color")
        .in("project_id", ids);
      for (const row of ph ?? []) phaseById.set(row.id, { name: row.name, color: row.color });
    }
    const capById = new Map((capsRes.data ?? []).map((c) => [c.user_id, c]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));

    const taskIds = tasks.map((t) => t.id);
    let entries: Array<{
      user_id: string;
      task_id: string;
      duration_minutes: number | null;
      is_billable: boolean;
      started_at: string;
    }> = [];
    for (const ids of chunk(taskIds, 150)) {
      let page = 0;
      for (;;) {
        const { data: e } = await supabase
          .from("time_entries")
          .select("user_id, task_id, duration_minutes, is_billable, started_at")
          .in("task_id", ids)
          .not("duration_minutes", "is", null)
          .gte("started_at", startUtc)
          .lte("started_at", endUtc)
          .range(page * 1000, page * 1000 + 999);
        const list = e ?? [];
        entries.push(
          ...list
            .filter((row) => row.task_id !== null)
            .map((row) => ({ ...row, task_id: row.task_id as string })),
        );
        if (list.length < 1000) break;
        page += 1;
      }
    }

    if (data.billableOnly) entries = entries.filter((e) => e.is_billable);

    type Row = {
      key: string;
      label: string;
      color?: string | null;
      minutes: number;
      billableMinutes: number;
      amount: number;
      currency: string | null;
      mixedCurrency: boolean;
    };
    const rows = new Map<string, Row>();
    let totalMinutes = 0;
    let totalBillable = 0;

    for (const e of entries) {
      const task = taskById.get(e.task_id);
      if (!task) continue;
      const project = projectById.get(task.project_id);
      if (!project) continue;
      const cap = capById.get(e.user_id);

      let key: string;
      let label: string;
      let color: string | null | undefined;
      if (data.groupBy === "project") {
        key = project.id;
        label = project.name;
        color = project.color;
      } else if (data.groupBy === "member") {
        const p = profileById.get(e.user_id);
        key = e.user_id;
        label = p?.full_name ?? p?.email ?? "—";
      } else if (data.groupBy === "phase") {
        const ph = task.phase_id ? phaseById.get(task.phase_id) : null;
        key = task.phase_id ?? "__no_phase__";
        label = ph?.name ?? "Sin fase";
        color = ph?.color ?? project.color;
      } else {
        key = project.client_name?.trim() || "__no_client__";
        label = project.client_name?.trim() || "Sin cliente";
      }

      const effectiveRate =
        project.hourly_rate !== null && project.hourly_rate !== undefined
          ? Number(project.hourly_rate)
          : cap?.hourly_rate
            ? Number(cap.hourly_rate)
            : 0;
      const currency = cap?.currency ?? "USD";
      const minutes = e.duration_minutes ?? 0;
      const billable = e.is_billable ? minutes : 0;
      const amount = e.is_billable ? (minutes / 60) * effectiveRate : 0;

      const existing = rows.get(key);
      if (existing) {
        existing.minutes += minutes;
        existing.billableMinutes += billable;
        existing.amount += amount;
        if (existing.currency && existing.currency !== currency) existing.mixedCurrency = true;
      } else {
        rows.set(key, {
          key,
          label,
          color,
          minutes,
          billableMinutes: billable,
          amount,
          currency,
          mixedCurrency: false,
        });
      }
      totalMinutes += minutes;
      totalBillable += billable;
    }
    void dayInTz; // imported for future per-day breakdowns
    return {
      tz,
      rows: Array.from(rows.values()).sort((a, b) => b.minutes - a.minutes),
      totals: { minutes: totalMinutes, billableMinutes: totalBillable },
    };
  });

/** Project-level health: estimate vs actual rollup, aggregated in Postgres. */
export const getProjectTimeHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase.rpc("get_project_time_health", {
      p_project_id: data.projectId,
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    const estimate = Number(row?.estimate_hours ?? 0);
    const logged = Number(row?.logged_hours ?? 0);
    const taskCount = Number(row?.task_count ?? 0);
    return {
      estimateHours: estimate,
      loggedHours: logged,
      variancePct: estimate > 0 ? Math.round(((logged - estimate) / estimate) * 100) : null,
      taskCount,
    };
  });

/** Rollup map for a list of tasks (used to render chips inline in kanban/lists). */
export const getEstimateRollups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("task_estimate_rollup")
      .select("task_id, total_estimate_hours, total_logged_hours")
      .eq("project_id", data.projectId);
    const map: Record<string, { estimate: number; logged: number }> = {};
    for (const r of rows ?? []) {
      if (!r.task_id) continue;
      map[r.task_id] = {
        estimate: Number(r.total_estimate_hours),
        logged: Number(r.total_logged_hours),
      };
    }
    return map;
  });

/** Per-project estimate vs logged rollup across an entire workspace (aggregated in Postgres). */
export const getWorkspaceProjectHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase.rpc("get_workspace_project_health", {
      p_workspace_id: data.workspaceId,
    });
    const map: Record<string, { estimate: number; logged: number }> = {};
    for (const r of (rows ?? []) as Array<{
      project_id: string;
      estimate_hours: number | string;
      logged_hours: number | string;
    }>) {
      if (!r.project_id) continue;
      map[r.project_id] = {
        estimate: Number(r.estimate_hours ?? 0),
        logged: Number(r.logged_hours ?? 0),
      };
    }
    return map;
  });

/**
 * Plan vs. real: estimated hours (prorated over business days inside the
 * range, split equally between assignees) against logged hours, grouped by
 * person, activity type, contract, client or project.
 */
export const getPlanVsActualReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        groupBy: z.enum(["member", "task_type", "contract", "client", "project", "phase"]),
        excludeInternal: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { chunk, proratedHoursInRange, statusCategory } = await import("@/lib/api/report-utils");

    const [wsRes, projectsRes, typesRes, membersRes] = await Promise.all([
      supabase.from("workspaces").select("timezone").eq("id", data.workspaceId).maybeSingle(),
      supabase
        .from("projects")
        .select("id, name, color, client_name, area, contract_id")
        .eq("workspace_id", data.workspaceId),
      supabase.from("task_types").select("id, name, color").eq("workspace_id", data.workspaceId),
      supabase.from("workspace_members").select("user_id").eq("workspace_id", data.workspaceId),
    ]);

    const tz = wsRes.data?.timezone ?? "UTC";
    const startUtc = utcFromTzWall(data.from, "00:00:00", tz);
    const endUtc = utcFromTzWall(data.to, "23:59:59.999", tz);

    let projects = projectsRes.data ?? [];
    if (data.excludeInternal) projects = projects.filter((p) => p.area !== "internal");
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const projectIds = projects.map((p) => p.id);
    const empty = { tz, rows: [], totals: { estimateHours: 0, loggedHours: 0 } };
    if (projectIds.length === 0) return empty;

    const memberIds = (membersRes.data ?? []).map((m) => m.user_id);
    const contractIds = Array.from(
      new Set(projects.map((p) => p.contract_id).filter((v): v is string => !!v)),
    );

    const [profilesRes, contractsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]),
      contractIds.length
        ? supabase.from("contracts").select("id, name, accounts(name)").in("id", contractIds)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              name: string;
              accounts: { name: string } | { name: string }[] | null;
            }>,
          }),
    ]);
    const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
    const typeById = new Map((typesRes.data ?? []).map((t) => [t.id, t]));
    const contractById = new Map(
      (contractsRes.data ?? []).map((c) => {
        const acc = Array.isArray(c.accounts) ? c.accounts[0] : c.accounts;
        return [c.id, { name: c.name, account: acc?.name ?? null }];
      }),
    );

    // Tasks (paginated: PostgREST caps at 1000 rows per request)
    type TaskRow = {
      id: string;
      project_id: string;
      phase_id: string | null;
      task_type_id: string | null;
      assignee_id: string | null;
      start_date: string | null;
      due_date: string | null;
      total_effort_hours: number | string | null;
      status: string | null;
      task_statuses: { category: string | null } | { category: string | null }[] | null;
    };
    const tasks: TaskRow[] = [];
    for (const ids of chunk(projectIds, 100)) {
      let page = 0;
      for (;;) {
        const { data: rows } = await supabase
          .from("tasks")
          .select(
            "id, project_id, phase_id, task_type_id, assignee_id, start_date, due_date, total_effort_hours, status, task_statuses(category)",
          )
          .in("project_id", ids)
          .range(page * 1000, page * 1000 + 999);
        const list = (rows ?? []) as unknown as TaskRow[];
        tasks.push(...list);
        if (list.length < 1000) break;
        page += 1;
      }
    }
    if (tasks.length === 0) return empty;
    const phaseById = new Map<string, { name: string; color: string | null }>();
    for (const ids of chunk(projectIds, 100)) {
      const { data: ph } = await supabase
        .from("phases")
        .select("id, name, color")
        .in("project_id", ids);
      for (const row of ph ?? []) phaseById.set(row.id, { name: row.name, color: row.color });
    }
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const taskIds = tasks.map((t) => t.id);

    // Assignees
    const assigneesByTask = new Map<string, string[]>();
    for (const ids of chunk(taskIds, 150)) {
      const { data: rows } = await supabase
        .from("task_assignees")
        .select("task_id, user_id")
        .in("task_id", ids);
      for (const r of rows ?? []) {
        const arr = assigneesByTask.get(r.task_id) ?? [];
        if (!arr.includes(r.user_id)) arr.push(r.user_id);
        assigneesByTask.set(r.task_id, arr);
      }
    }
    for (const t of tasks) {
      if (!t.assignee_id) continue;
      const arr = assigneesByTask.get(t.id) ?? [];
      if (!arr.includes(t.assignee_id)) arr.push(t.assignee_id);
      assigneesByTask.set(t.id, arr);
    }

    // Time entries in range
    const entries: Array<{ user_id: string; task_id: string; duration_minutes: number | null }> =
      [];
    for (const ids of chunk(taskIds, 150)) {
      let page = 0;
      for (;;) {
        const { data: rows } = await supabase
          .from("time_entries")
          .select("user_id, task_id, duration_minutes")
          .in("task_id", ids)
          .not("duration_minutes", "is", null)
          .gte("started_at", startUtc)
          .lte("started_at", endUtc)
          .range(page * 1000, page * 1000 + 999);
        const list = (rows ?? []).filter((r) => r.task_id) as Array<{
          user_id: string;
          task_id: string;
          duration_minutes: number | null;
        }>;
        entries.push(...list);
        if ((rows ?? []).length < 1000) break;
        page += 1;
      }
    }

    type Row = {
      key: string;
      label: string;
      sublabel?: string | null;
      color?: string | null;
      estimateHours: number;
      loggedHours: number;
    };
    const rows = new Map<string, Row>();
    const bump = (
      key: string,
      label: string,
      patch: { estimateHours?: number; loggedHours?: number },
      extra?: { sublabel?: string | null; color?: string | null },
    ) => {
      const cur =
        rows.get(key) ?? ({ key, label, estimateHours: 0, loggedHours: 0, ...extra } as Row);
      cur.estimateHours += patch.estimateHours ?? 0;
      cur.loggedHours += patch.loggedHours ?? 0;
      rows.set(key, cur);
    };

    const groupOfTask = (task: TaskRow, userId: string | null) => {
      if (data.groupBy === "member") {
        if (!userId) return null;
        const p = profileById.get(userId);
        return { key: userId, label: p?.full_name ?? p?.email ?? "—", extra: {} };
      }
      if (data.groupBy === "task_type") {
        const t = task.task_type_id ? typeById.get(task.task_type_id) : null;
        return {
          key: task.task_type_id ?? "__none__",
          label: t?.name ?? "Sin tipo",
          extra: { color: t?.color ?? null },
        };
      }
      const project = projectById.get(task.project_id);
      if (!project) return null;
      if (data.groupBy === "phase") {
        const ph = task.phase_id ? phaseById.get(task.phase_id) : null;
        return {
          key: task.phase_id ?? "__no_phase__",
          label: ph?.name ?? "Sin fase",
          extra: { color: ph?.color ?? project.color, sublabel: project.name },
        };
      }
      if (data.groupBy === "project") {
        return {
          key: project.id,
          label: project.name,
          extra: { color: project.color, sublabel: project.client_name },
        };
      }
      if (data.groupBy === "contract") {
        if (!project.contract_id) return { key: "__none__", label: "Sin contrato", extra: {} };
        const c = contractById.get(project.contract_id);
        return {
          key: project.contract_id,
          label: c?.name ?? "Contrato",
          extra: { sublabel: c?.account ?? null },
        };
      }
      const client =
        (project.contract_id ? contractById.get(project.contract_id)?.account : null) ||
        project.client_name?.trim() ||
        null;
      return { key: client ?? "__none__", label: client ?? "Sin cliente", extra: {} };
    };

    // Estimates (skip cancelled tasks; completed ones still count historically)
    for (const t of tasks) {
      if (statusCategory(t) === "cancelada") continue;
      const total = Number(t.total_effort_hours ?? 0);
      if (!total) continue;
      const hours = proratedHoursInRange(total, t.start_date, t.due_date, data.from, data.to);
      if (hours <= 0) continue;
      const people = assigneesByTask.get(t.id) ?? [];
      if (data.groupBy === "member") {
        if (people.length === 0) continue;
        const per = hours / people.length;
        for (const uid of people) {
          const g = groupOfTask(t, uid);
          if (g) bump(g.key, g.label, { estimateHours: per }, g.extra);
        }
      } else {
        const g = groupOfTask(t, null);
        if (g) bump(g.key, g.label, { estimateHours: hours }, g.extra);
      }
    }

    // Logged
    for (const e of entries) {
      const t = taskById.get(e.task_id);
      if (!t) continue;
      const g = groupOfTask(t, e.user_id);
      if (!g) continue;
      bump(g.key, g.label, { loggedHours: (e.duration_minutes ?? 0) / 60 }, g.extra);
    }

    const list = Array.from(rows.values()).sort(
      (a, b) => b.estimateHours + b.loggedHours - (a.estimateHours + a.loggedHours),
    );
    return {
      tz,
      rows: list,
      totals: {
        estimateHours: list.reduce((s, r) => s + r.estimateHours, 0),
        loggedHours: list.reduce((s, r) => s + r.loggedHours, 0),
      },
    };
  });
