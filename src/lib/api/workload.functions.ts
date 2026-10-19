import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dayInTz, weekDays, weekdayMondayBased, utcFromTzWall } from "@/lib/time-tz";

// Weekly workload: per-member capacity, allocated (from estimates distributed),
// logged minutes, plus "unplanned" bucket (estimates with no date range).
// Uses workspace timezone and allocation_strategy.
function expandDays(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  const endD = new Date(end + "T00:00:00Z");
  while (d.getTime() <= endD.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// Same as expandDays but skipping weekends, so a task's estimate is spread
// over the days people actually work. Falls back to the raw span when it only
// covers weekend days.
function expandWorkDays(start: string, end: string): string[] {
  const all = expandDays(start, end);
  const work = all.filter((d) => {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    return dow !== 0 && dow !== 6;
  });
  return work.length > 0 ? work : all;
}

type WorkloadStatusCategory = "abierta" | "en_progreso" | "bloqueada" | "completada" | "cancelada";
type WorkloadStatusJoin = {
  category?: string | null;
  color?: string | null;
  name?: string | null;
  key?: string | null;
};

function pickTaskStatusJoin(task: {
  task_statuses?: WorkloadStatusJoin | WorkloadStatusJoin[] | null;
}): WorkloadStatusJoin | null {
  const joined = task.task_statuses;
  if (!joined) return null;
  return Array.isArray(joined) ? (joined[0] ?? null) : joined;
}

function taskStatusCategory(task: {
  status?: string | null;
  task_statuses?: WorkloadStatusJoin | WorkloadStatusJoin[] | null;
}): WorkloadStatusCategory {
  const joinedCategory = pickTaskStatusJoin(task)?.category;
  if (
    joinedCategory === "abierta" ||
    joinedCategory === "en_progreso" ||
    joinedCategory === "bloqueada" ||
    joinedCategory === "completada" ||
    joinedCategory === "cancelada"
  ) {
    return joinedCategory;
  }
  if (task.status === "completada") return "completada";
  if (task.status === "cancelada") return "cancelada";
  if (task.status === "en_curso") return "en_progreso";
  if (task.status === "en_pausa") return "bloqueada";
  return "abierta";
}

function isClosedForPlannedLoad(task: {
  status?: string | null;
  task_statuses?: WorkloadStatusJoin | WorkloadStatusJoin[] | null;
}): boolean {
  const category = taskStatusCategory(task);
  return category === "completada" || category === "cancelada";
}

// Chunk an array into fixed-size slices. Used to keep PostgREST `id.in.(...)`
// URLs under Cloudflare Workers / PostgREST length limits when a user has
// hundreds/thousands of task_assignees rows.
function chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const getWeeklyWorkload = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // monday, used when no range
        rangeStart: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        rangeEnd: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        projectIds: z.array(z.string().uuid()).optional(),
        billableOnly: z.boolean().optional(),
        excludeInternal: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const days =
      data.rangeStart && data.rangeEnd
        ? expandDays(data.rangeStart, data.rangeEnd)
        : weekDays(data.weekStart);

    // D1: parallelize independent queries (first wave)
    const wsP = supabase
      .from("workspaces")
      .select("id, timezone, allocation_strategy")
      .eq("id", data.workspaceId)
      .single();
    const membersP = supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", data.workspaceId);
    const capsP = supabase
      .from("user_capacity")
      .select("user_id, daily_hours, weekly_pattern, hourly_rate, currency, max_timer_hours")
      .eq("workspace_id", data.workspaceId);
    const projsQuery = supabase
      .from("projects")
      .select("id, name, color")
      .eq("workspace_id", data.workspaceId);
    const projsP =
      data.projectIds && data.projectIds.length > 0
        ? projsQuery.in("id", data.projectIds)
        : projsQuery;

    const [wsRes, membersRes, capsRes, projsRes] = await Promise.all([
      wsP,
      membersP,
      capsP,
      projsP,
    ]);
    if (wsRes.error) throw new Error(wsRes.error.message);

    const tz = wsRes.data?.timezone ?? "UTC";
    const strategy = wsRes.data?.allocation_strategy ?? "fit_capacity";

    const memberIds = (membersRes.data ?? []).map((m) => m.user_id);
    const roleByUser = new Map((membersRes.data ?? []).map((m) => [m.user_id, m.role]));
    const capById = new Map((capsRes.data ?? []).map((c) => [c.user_id, c]));
    const projectIds = (projsRes.data ?? []).map((p) => p.id);
    const projectById = new Map(
      (projsRes.data ?? []).map((p) => [
        p.id,
        p as { id: string; name: string; color: string | null },
      ]),
    );
    const lastDay = days[days.length - 1];

    // Holidays in the visible window
    const holidaysP = supabase
      .from("workspace_holidays")
      .select("date, affects, user_id")
      .eq("workspace_id", data.workspaceId)
      .gte("date", days[0])
      .lte("date", lastDay);
    const profilesP = supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);

    // Tasks of workspace (open) with estimates, limited to the visible window
    // and paginated (PostgREST caps every response at 1000 rows, which used to
    // silently drop most of the team's load).
    async function fetchWindowTasks(): Promise<{ data: unknown[]; error: null }> {
      if (projectIds.length === 0) return { data: [], error: null };
      const acc: unknown[] = [];
      const PAGE = 1000;
      for (const pids of chunk(projectIds, 100)) {
        for (let from = 0; ; from += PAGE) {
          const { data: rows } = await supabase
            .from("tasks")
            .select(
              "id, title, project_id, start_date, due_date, assignee_id, status, area, effort_mode, total_effort_hours, task_statuses(category)",
            )
            .in("project_id", pids)
            .neq("status", "completada")
            .or(`due_date.gte.${days[0]},due_date.is.null`)
            .or(`start_date.lte.${lastDay},start_date.is.null`)
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
          const list = rows ?? [];
          acc.push(...list);
          if (list.length < PAGE) break;
        }
      }
      return { data: acc, error: null };
    }
    const tasksP = fetchWindowTasks();

    // Time entries logged within the window
    const startUtc = utcFromTzWall(days[0], "00:00:00", tz);
    const endUtc = utcFromTzWall(lastDay, "23:59:59.999", tz);
    async function fetchEntries() {
      const acc: Array<{
        user_id: string;
        task_id: string | null;
        started_at: string;
        duration_minutes: number | null;
        is_billable: boolean;
      }> = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        let q = supabase
          .from("time_entries")
          .select("user_id, task_id, started_at, duration_minutes, is_billable")
          .gte("started_at", startUtc)
          .lte("started_at", endUtc);
        if (data.billableOnly) q = q.eq("is_billable", true);
        const { data: rows } = await q
          .order("started_at", { ascending: true })
          .range(from, from + PAGE - 1);
        const list = rows ?? [];
        acc.push(...(list as typeof acc));
        if (list.length < PAGE) break;
      }
      return { data: acc, error: null };
    }
    const entriesP = fetchEntries();

    const [holidaysRes, profilesRes, tasksRes, entriesRes] = await Promise.all([
      holidaysP,
      profilesP,
      tasksP,
      entriesP,
    ]);

    const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
    const holidayByDay = new Map<string, { all: boolean; users: Set<string> }>();
    for (const h of holidaysRes.data ?? []) {
      const entry = holidayByDay.get(h.date) ?? { all: false, users: new Set<string>() };
      if (h.affects === "all") entry.all = true;
      else if (h.user_id) entry.users.add(h.user_id);
      holidayByDay.set(h.date, entry);
    }

    type EffortMode = "basic" | "flexible" | "fixed_daily" | "due_date";
    type RawTask = {
      id: string;
      title: string;
      project_id: string;
      start_date: string | null;
      due_date: string | null;
      assignee_id: string | null;
      status: string;
      area: "operations" | "marketing" | "finance" | "internal" | null;
      effort_mode: EffortMode | null;
      total_effort_hours: number | string | null;
      task_statuses?: WorkloadStatusJoin | WorkloadStatusJoin[] | null;
    };
    const allTasks: RawTask[] = (tasksRes.data as RawTask[] | null) ?? [];
    const EXCLUDED_AREAS = new Set(["internal", "marketing"]);
    const tasks: RawTask[] = data.excludeInternal
      ? allTasks.filter(
          (t) => !EXCLUDED_AREAS.has(t.area ?? "operations") && !isClosedForPlannedLoad(t),
        )
      : allTasks.filter((t) => !isClosedForPlannedLoad(t));
    const excludedTaskIds = data.excludeInternal
      ? new Set(allTasks.filter((t) => EXCLUDED_AREAS.has(t.area ?? "operations")).map((t) => t.id))
      : new Set<string>();

    // Estimates: single source of truth is task.total_effort_hours split across
    // the task's assignees (union of task.assignee_id + task_assignees rows).
    type Est = {
      task_id: string;
      user_id: string | null;
      role: "owner" | "admin" | "member" | "guest" | null;
      hours: number | string;
      daily_hours: number | string | null;
    };
    const assigneesByTask = new Map<string, Set<string>>();
    for (const t of tasks) {
      const s = new Set<string>();
      if (t.assignee_id) s.add(t.assignee_id);
      assigneesByTask.set(t.id, s);
    }
    if (tasks.length > 0) {
      // Chunked: a single `in(...)` with hundreds of UUIDs blows the URL limit
      // (request fails silently and every co-assignee disappears from the load).
      for (const ids of chunk(tasks.map((t) => t.id))) {
        const { data: taRows } = await supabase
          .from("task_assignees")
          .select("task_id, user_id")
          .in("task_id", ids);
        for (const r of taRows ?? []) {
          const s = assigneesByTask.get(r.task_id);
          if (s) s.add(r.user_id);
        }
      }
    }

    const estimates: Est[] = [];
    for (const t of tasks) {
      const total = Number(t.total_effort_hours);
      if (!total || total <= 0) continue;
      const uids = assigneesByTask.get(t.id);
      if (!uids || uids.size === 0) continue;
      const perUser = total / uids.size;
      for (const uid of uids) {
        estimates.push({
          task_id: t.id,
          user_id: uid,
          role: null,
          hours: perUser,
          daily_hours: null,
        });
      }
    }

    // Group workspace members by role for role-placeholder distribution
    const usersByRole = new Map<string, string[]>();
    for (const m of membersRes.data ?? []) {
      const arr = usersByRole.get(m.role) ?? [];
      arr.push(m.user_id);
      usersByRole.set(m.role, arr);
    }

    // Build per-user per-day buckets
    type Bucket = {
      capacityMin: number;
      isHoliday: boolean;
      allocatedMin: number;
      loggedMin: number;
      overflowMin: number;
    };
    const result: Record<string, Record<string, Bucket>> = {};
    const unplannedByUser: Record<string, { count: number; estimateMin: number }> = {};
    // Track per-user per-task minutes contributed inside visible window
    const contribByUser = new Map<string, Map<string, number>>();
    const addContrib = (uid: string, taskId: string, mins: number) => {
      if (mins <= 0) return;
      let m = contribByUser.get(uid);
      if (!m) {
        m = new Map();
        contribByUser.set(uid, m);
      }
      m.set(taskId, (m.get(taskId) ?? 0) + mins);
    };

    function dayCapacityMinutes(userId: string, date: string): { mins: number; holiday: boolean } {
      const dow = weekdayMondayBased(date, tz);
      const cap = capById.get(userId);
      const wp = (cap?.weekly_pattern as unknown as number[] | undefined) ?? [8, 8, 8, 8, 8, 0, 0];
      const baseHours = Number(wp[dow] ?? 0);
      const holEntry = holidayByDay.get(date);
      const isHol = !!holEntry && (holEntry.all || holEntry.users.has(userId));
      return { mins: isHol ? 0 : Math.round(baseHours * 60), holiday: isHol };
    }

    for (const uid of memberIds) {
      result[uid] = {};
      unplannedByUser[uid] = { count: 0, estimateMin: 0 };
      for (const day of days) {
        const c = dayCapacityMinutes(uid, day);
        result[uid][day] = {
          capacityMin: c.mins,
          isHoliday: c.holiday,
          allocatedMin: 0,
          loggedMin: 0,
          overflowMin: 0,
        };
      }
    }

    // Pre-aggregate logged minutes by user/day so fit_capacity can subtract them
    const allowedTaskIds = new Set(tasks.map((t) => t.id));
    const isProjectFiltered = !!(data.projectIds && data.projectIds.length > 0);
    for (const e of entriesRes.data ?? []) {
      if (!e.task_id) continue;
      if (isProjectFiltered && !allowedTaskIds.has(e.task_id)) continue;
      if (excludedTaskIds.has(e.task_id)) continue;
      const day = dayInTz(e.started_at, tz);
      const bucket = result[e.user_id]?.[day];
      if (bucket) bucket.loggedMin += e.duration_minutes ?? 0;
    }

    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const estimatesByTask = new Map<string, Est[]>();
    for (const e of estimates) {
      const arr = estimatesByTask.get(e.task_id) ?? [];
      arr.push(e);
      estimatesByTask.set(e.task_id, arr);
    }

    // Distribute a per-user effort over a task's date range, applying a mode override.
    function distribute(
      userId: string,
      totalMin: number,
      dailyMin: number | null, // when set (fixed_daily), use this per workable day
      task: RawTask,
      modeOverride?: EffortMode,
    ) {
      const userBuckets = result[userId];
      if (!userBuckets) return;
      if (totalMin <= 0 && !dailyMin) return;

      const hasRange = !!task.start_date || !!task.due_date;
      if (!hasRange) {
        unplannedByUser[userId].count += 1;
        unplannedByUser[userId].estimateMin += totalMin;
        return;
      }
      const start = task.start_date ?? task.due_date!;
      const end = task.due_date ?? task.start_date!;
      const range: string[] = [];
      const d = new Date(start + "T00:00:00Z");
      const endD = new Date(end + "T00:00:00Z");
      while (d.getTime() <= endD.getTime()) {
        range.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
      }
      const workable = range.filter((day) => dayCapacityMinutes(userId, day).mins > 0);
      const effectiveMode: EffortMode | "fit_capacity" | "spread" | "due_date" =
        modeOverride ?? (strategy as "fit_capacity" | "spread" | "due_date");

      if (effectiveMode === "fixed_daily" && dailyMin && dailyMin > 0) {
        for (const day of workable) {
          if (day < days[0] || day > lastDay) continue;
          const b = userBuckets[day];
          if (!b) continue;
          const free = Math.max(0, b.capacityMin - b.allocatedMin - b.loggedMin);
          const fit = Math.min(dailyMin, free);
          b.allocatedMin += fit;
          b.overflowMin += Math.max(0, dailyMin - fit);
          addContrib(userId, task.id, fit);
        }
        return;
      }

      if (effectiveMode === "due_date") {
        const target = end;
        if (target >= days[0] && target <= lastDay) {
          const b = userBuckets[target];
          if (b) {
            const free = Math.max(0, b.capacityMin - b.allocatedMin - b.loggedMin);
            const fit = Math.min(totalMin, free);
            b.allocatedMin += fit;
            b.overflowMin += Math.max(0, totalMin - fit);
            addContrib(userId, task.id, fit);
          }
        }
        return;
      }

      if (effectiveMode === "spread" || effectiveMode === "flexible") {
        if (workable.length === 0) return;
        const perDay = totalMin / workable.length;
        for (const day of workable) {
          if (day < days[0] || day > lastDay) continue;
          userBuckets[day].allocatedMin += perDay;
          addContrib(userId, task.id, perDay);
        }
        return;
      }

      // fit_capacity (default workspace) or "basic"
      let remaining = totalMin;
      for (const day of workable) {
        if (remaining <= 0) break;
        const b = userBuckets[day];
        if (b) {
          const free = Math.max(0, b.capacityMin - b.allocatedMin - b.loggedMin);
          const fit = Math.min(remaining, free);
          b.allocatedMin += fit;
          remaining -= fit;
          addContrib(userId, task.id, fit);
        } else {
          const cap = dayCapacityMinutes(userId, day).mins;
          remaining -= cap;
        }
      }
      if (remaining > 0) {
        const lastVisible = workable
          .slice()
          .reverse()
          .find((dd) => dd >= days[0] && dd <= lastDay);
        if (lastVisible && userBuckets[lastVisible]) {
          userBuckets[lastVisible].overflowMin += remaining;
        }
      }
    }

    // Helper: expand a single estimate into one or more (userId, hours, dailyHours) targets.
    // - user_id set    → straight to that user
    // - role set       → split evenly across workspace members with that role
    function expandEst(est: Est): Array<{ uid: string; hours: number; daily: number | null }> {
      if (est.user_id) {
        return [
          {
            uid: est.user_id,
            hours: Number(est.hours),
            daily: est.daily_hours != null ? Number(est.daily_hours) : null,
          },
        ];
      }
      if (est.role) {
        const uids = usersByRole.get(est.role) ?? [];
        if (uids.length === 0) return [];
        const share = Number(est.hours) / uids.length;
        const dailyShare = est.daily_hours != null ? Number(est.daily_hours) / uids.length : null;
        return uids.map((uid) => ({ uid, hours: share, daily: dailyShare }));
      }
      return [];
    }

    // Iterate tasks and apply per-task effort_mode (Wrike-style override)
    for (const task of tasks) {
      const mode: EffortMode = (task.effort_mode ?? "flexible") as EffortMode;
      const taskEsts = estimatesByTask.get(task.id) ?? [];
      const expanded = taskEsts.flatMap(expandEst);

      if (mode === "basic") {
        // Total split evenly across assignees: union(expanded users, task.assignee_id)
        const assignees = new Set<string>(expanded.map((e) => e.uid));
        if (task.assignee_id) assignees.add(task.assignee_id);
        if (assignees.size === 0) continue;
        const totalH =
          task.total_effort_hours != null
            ? Number(task.total_effort_hours)
            : expanded.reduce((acc, e) => acc + e.hours, 0);
        const perUserMin = Math.round((totalH * 60) / assignees.size);
        for (const uid of assignees) distribute(uid, perUserMin, null, task, "basic");
        continue;
      }

      if (mode === "fixed_daily") {
        for (const e of expanded) {
          const dailyMin = e.daily != null ? Math.round(e.daily * 60) : null;
          const totalMin = Math.round(e.hours * 60);
          distribute(e.uid, totalMin, dailyMin, task, "fixed_daily");
        }
        continue;
      }

      // flexible | due_date → distribute each (user-or-expanded-role) estimate with that mode
      for (const e of expanded) {
        const totalMin = Math.round(e.hours * 60);
        distribute(e.uid, totalMin, null, task, mode);
      }
    }

    return {
      tz,
      strategy,
      days,
      rangeStart: days[0],
      rangeEnd: lastDay,
      projects: Array.from(projectById.values()),
      members: memberIds.map((id) => {
        const contrib = contribByUser.get(id);
        const userTasks = contrib
          ? Array.from(contrib.entries()).map(([taskId, mins]) => {
              const t = taskById.get(taskId);
              const proj = t ? projectById.get(t.project_id) : null;
              return {
                id: taskId,
                title: t?.title ?? "",
                project_id: t?.project_id ?? "",
                project_name: proj?.name ?? "",
                color: proj?.color ?? null,
                area: (t?.area ?? "operations") as
                  "operations" | "marketing" | "finance" | "internal",
                start_date: t?.start_date ?? null,
                due_date: t?.due_date ?? null,
                status: t?.status ?? "",
                totalMin: mins,
              };
            })
          : [];
        return {
          user_id: id,
          role: roleByUser.get(id) ?? "member",
          profile: profileById.get(id) ?? null,
          capacity: capById.get(id) ?? null,
          days: result[id],
          unplanned: unplannedByUser[id] ?? { count: 0, estimateMin: 0 },
          tasks: userTasks,
        };
      }),
    };
  });

// My weekly timesheet: time entries grouped by day with task+project info, TZ-aware.
export const getMyWeeklyTime = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid().optional(),
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const days = weekDays(data.weekStart);

    // Resolve timezone
    let tz = "UTC";
    if (data.workspaceId) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("timezone")
        .eq("id", data.workspaceId)
        .maybeSingle();
      tz = ws?.timezone ?? "UTC";
    }
    const startUtc = utcFromTzWall(days[0], "00:00:00", tz);
    const endUtc = utcFromTzWall(days[6], "23:59:59.999", tz);

    const { data: entries, error } = await supabase
      .from("time_entries")
      .select("id, task_id, started_at, ended_at, duration_minutes, note, is_billable, source")
      .eq("user_id", userId)
      .gte("started_at", startUtc)
      .lte("started_at", endUtc)
      .order("started_at", { ascending: true });
    if (error) throw new Error(error.message);

    const taskIds = Array.from(
      new Set((entries ?? []).map((e) => e.task_id).filter((id): id is string => id !== null)),
    );
    let tasks: Array<{ id: string; title: string; project_id: string; area: string | null }> = [];
    let projects: Array<{
      id: string;
      name: string;
      color: string | null;
      workspace_id: string;
      hourly_rate: number | null;
    }> = [];
    let workspaces: Array<{ id: string; name: string; slug: string }> = [];
    if (taskIds.length > 0) {
      const { data: t } = await supabase
        .from("tasks")
        .select("id, title, project_id, area")
        .in("id", taskIds);
      tasks = t ?? [];
      const pids = Array.from(new Set(tasks.map((x) => x.project_id)));
      const { data: p } = await supabase
        .from("projects")
        .select("id, name, color, workspace_id, hourly_rate")
        .in("id", pids);
      projects = p ?? [];
      const wsIds = Array.from(new Set(projects.map((x) => x.workspace_id)));
      const { data: w } = await supabase
        .from("workspaces")
        .select("id, name, slug")
        .in("id", wsIds);
      workspaces = w ?? [];
    }
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const wsById = new Map(workspaces.map((w) => [w.id, w]));

    const filtered = (entries ?? []).filter((e) => {
      if (!data.workspaceId) return true;
      if (!e.task_id) return false;
      const task = taskById.get(e.task_id);
      const proj = task ? projectById.get(task.project_id) : null;
      return proj?.workspace_id === data.workspaceId;
    });

    // ---- Estimated load: my open tasks with date range overlapping the week.
    // Include tasks where I'm co-assignee via task_assignees, not just primary.
    const weekStartDay = days[0];
    const weekEndDay = days[6];
    const estCols =
      "id, title, project_id, assignee_id, area, start_date, due_date, total_effort_hours, status, task_statuses(category)";
    type EstRow = {
      id: string;
      title: string | null;
      project_id: string;
      assignee_id: string | null;
      area: string | null;
      start_date: string | null;
      due_date: string | null;
      total_effort_hours: number | null;
      status: string | null;
      task_statuses?: WorkloadStatusJoin | WorkloadStatusJoin[] | null;
    };
    const estRowsAcc = new Map<string, EstRow>();
    // Both queries are restricted to the visible week and paginated. Fetching
    // every assignment ever (thousands of rows after the Wrike/eClass imports)
    // made this call time out, which is why "Mi tiempo" stopped loading.
    async function loadEst(kind: "primary" | "co") {
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        let q = supabase
          .from("tasks")
          .select(kind === "co" ? `${estCols}, task_assignees!inner(user_id)` : estCols);
        q = kind === "co" ? q.eq("task_assignees.user_id", userId) : q.eq("assignee_id", userId);
        const { data: rows } = await q
          .not("status", "in", "(completada,cancelada)")
          .not("total_effort_hours", "is", null)
          .or(`start_date.lte.${weekEndDay},start_date.is.null`)
          .or(`due_date.gte.${weekStartDay},due_date.is.null`)

          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        const list = (rows ?? []) as unknown as EstRow[];
        for (const r of list) estRowsAcc.set(r.id, r);
        if (list.length < PAGE) break;
      }
    }
    await Promise.all([loadEst("primary"), loadEst("co")]);

    const estTasksRaw = Array.from(estRowsAcc.values());

    // Need project→workspace map for area + workspace filtering
    const estProjectIds = Array.from(
      new Set((estTasksRaw ?? []).map((t) => t.project_id).filter(Boolean) as string[]),
    );
    const missingPids = estProjectIds.filter((pid) => !projectById.has(pid));
    if (missingPids.length > 0) {
      const { data: extraP } = await supabase
        .from("projects")
        .select("id, name, color, workspace_id, hourly_rate")
        .in("id", missingPids);
      for (const p of extraP ?? []) projectById.set(p.id, p);
    }
    // Make sure workspaces for those projects are loaded too
    const allWsIds = Array.from(
      new Set(
        Array.from(projectById.values())
          .map((p) => p.workspace_id)
          .filter(Boolean) as string[],
      ),
    );
    const missingWsIds = allWsIds.filter((id) => !wsById.has(id));
    if (missingWsIds.length > 0) {
      const { data: extraW } = await supabase
        .from("workspaces")
        .select("id, name, slug")
        .in("id", missingWsIds);
      for (const w of extraW ?? []) wsById.set(w.id, w);
    }

    const isBillableArea = (area: string | null | undefined) =>
      (area ?? "operations") === "operations";

    const estByArea = { billable: 0, nonBillable: 0 };
    type EstItem = {
      taskId: string;
      title: string;
      area: string;
      projectId: string | null;
      projectName: string;
      projectColor: string | null;
      workspaceId: string | null;
      workspaceName: string | null;
      workspaceSlug: string | null;
      day: string;
      minutes: number;
      isBillable: boolean;
    };
    // Count assignees per task to split totals equally among all assignees.
    // Chunked (URL length + 1000-row cap) and seeded with the task's primary
    // assignee, which is not always mirrored in task_assignees.
    const estTaskIds = (estTasksRaw ?? []).map((t) => t.id);
    const assigneeCountByTask = new Map<string, number>();
    if (estTaskIds.length > 0) {
      const setByTask = new Map<string, Set<string>>();
      for (const t of estTasksRaw ?? []) {
        const s = new Set<string>();
        if (t.assignee_id) s.add(t.assignee_id);
        setByTask.set(t.id, s);
      }
      for (const ids of chunk(estTaskIds)) {
        const { data: taAll } = await supabase
          .from("task_assignees")
          .select("task_id, user_id")
          .in("task_id", ids);
        for (const r of taAll ?? []) setByTask.get(r.task_id)?.add(r.user_id);
      }
      for (const [tid, s] of setByTask) assigneeCountByTask.set(tid, Math.max(1, s.size));
    }

    const estimateItems: EstItem[] = [];
    for (const t of estTasksRaw ?? []) {
      if (isClosedForPlannedLoad(t)) continue;
      const proj = projectById.get(t.project_id);
      if (!proj) continue;
      if (data.workspaceId && proj.workspace_id !== data.workspaceId) continue;
      const totalH = Number(t.total_effort_hours ?? 0);
      if (!totalH || totalH <= 0) continue;
      const start = (t.start_date ?? t.due_date) as string | null;
      const end = (t.due_date ?? t.start_date) as string | null;
      if (!start || !end) continue;
      if (end < weekStartDay || start > weekEndDay) continue;
      const range = expandWorkDays(start, end);
      if (range.length === 0) continue;
      const share = 1 / (assigneeCountByTask.get(t.id) ?? 1);
      const perDayMin = (totalH * 60 * share) / range.length;

      const ws = wsById.get(proj.workspace_id) ?? null;
      const billable = isBillableArea(t.area);
      for (const d of range) {
        if (d < weekStartDay || d > weekEndDay) continue;
        const mins = perDayMin;
        if (billable) estByArea.billable += mins;
        else estByArea.nonBillable += mins;
        estimateItems.push({
          taskId: t.id,
          title: t.title ?? "(sin título)",
          area: (t.area ?? "operations") as string,
          projectId: proj.id,
          projectName: proj.name,
          projectColor: proj.color,
          workspaceId: proj.workspace_id,
          workspaceName: ws?.name ?? null,
          workspaceSlug: ws?.slug ?? null,
          day: d,
          minutes: Math.round(mins),
          isBillable: billable,
        });
      }
    }

    // ---- Logged hours by area (from the filtered entries)
    const loggedByArea = { billable: 0, nonBillable: 0 };
    for (const e of filtered) {
      const task = e.task_id ? taskById.get(e.task_id) : undefined;
      const dur = e.duration_minutes ?? 0;
      if (isBillableArea(task?.area)) loggedByArea.billable += dur;
      else loggedByArea.nonBillable += dur;
    }

    return {
      tz,
      days,
      estimateByArea: {
        billable: Math.round(estByArea.billable),
        nonBillable: Math.round(estByArea.nonBillable),
        total: Math.round(estByArea.billable + estByArea.nonBillable),
      },
      estimateItems,
      loggedByArea: {
        billable: loggedByArea.billable,
        nonBillable: loggedByArea.nonBillable,
        total: loggedByArea.billable + loggedByArea.nonBillable,
      },
      entries: filtered.map((e) => {
        const task = e.task_id ? (taskById.get(e.task_id) ?? null) : null;
        const project = task ? (projectById.get(task.project_id) ?? null) : null;
        const ws = project ? (wsById.get(project.workspace_id) ?? null) : null;
        return {
          ...e,
          day: dayInTz(e.started_at, tz),
          area: (task?.area ?? "operations") as string,
          task: task ? { id: task.id, title: task.title } : null,
          project: project
            ? {
                id: project.id,
                name: project.name,
                color: project.color,
                hourly_rate: project.hourly_rate,
                workspace_id: project.workspace_id,
                workspace_slug: ws?.slug ?? null,
                workspace_name: ws?.name ?? null,
              }
            : null,
        };
      }),
    };
  });

/**
 * Tasks that contribute to a single user × day cell in the workload grid.
 * Returns both the planned estimates assigned to that day and the logged
 * entries for that user on that TZ-day.
 */
export const getWorkloadCellTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        userId: z.string().uuid(),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ws } = await supabase
      .from("workspaces")
      .select("timezone")
      .eq("id", data.workspaceId)
      .maybeSingle();
    const tz = ws?.timezone ?? "UTC";

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, color")
      .eq("workspace_id", data.workspaceId);
    const projectIds = (projects ?? []).map((p) => p.id);
    const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
    if (projectIds.length === 0) return { tz, planned: [], logged: [] };

    // Planned: open tasks where this user is primary or co-assignee, whose date range includes `day`.
    const { data: coRows } = await supabase
      .from("task_assignees")
      .select("task_id")
      .eq("user_id", data.userId);
    const coIds = Array.from(new Set((coRows ?? []).map((r) => r.task_id)));
    // Split into primary + chunked co-id queries to keep URLs short.
    const tCols =
      "id, title, project_id, start_date, due_date, status, assignee_id, total_effort_hours, task_statuses(category)";
    type PlannedRow = {
      id: string;
      title: string;
      project_id: string;
      start_date: string | null;
      due_date: string | null;
      status: string | null;
      assignee_id: string | null;
      total_effort_hours: number | null;
      task_statuses?: WorkloadStatusJoin | WorkloadStatusJoin[] | null;
    };
    const tasksAcc = new Map<string, PlannedRow>();
    const { data: primaryPlanned } = await supabase
      .from("tasks")
      .select(tCols)
      .in("project_id", projectIds)
      .neq("status", "completada")
      .eq("assignee_id", data.userId)
      .or(`start_date.lte.${data.day},start_date.is.null`)
      .or(`due_date.gte.${data.day},due_date.is.null`);
    for (const r of (primaryPlanned ?? []) as PlannedRow[]) tasksAcc.set(r.id, r);
    for (const ids of chunk(coIds)) {
      const { data: coPlanned } = await supabase
        .from("tasks")
        .select(tCols)
        .in("project_id", projectIds)
        .neq("status", "completada")
        .in("id", ids)
        .or(`start_date.lte.${data.day},start_date.is.null`)
        .or(`due_date.gte.${data.day},due_date.is.null`);
      for (const r of (coPlanned ?? []) as PlannedRow[]) tasksAcc.set(r.id, r);
    }
    const tasks = Array.from(tasksAcc.values());

    // Split estimate by number of assignees for each planned task
    const plannedIds = (tasks ?? []).map((t) => t.id);
    const assigneeCount = new Map<string, number>();
    if (plannedIds.length > 0) {
      const { data: taRows } = await supabase
        .from("task_assignees")
        .select("task_id, user_id")
        .in("task_id", plannedIds);
      const setByTask = new Map<string, Set<string>>();
      for (const t of tasks ?? []) {
        const s = new Set<string>();
        if (t.assignee_id) s.add(t.assignee_id);
        setByTask.set(t.id, s);
      }
      for (const r of taRows ?? []) setByTask.get(r.task_id)?.add(r.user_id);
      for (const [tid, s] of setByTask) assigneeCount.set(tid, Math.max(1, s.size));
    }

    const planned = (tasks ?? [])
      .filter(
        (t) =>
          t.total_effort_hours != null &&
          Number(t.total_effort_hours) > 0 &&
          !isClosedForPlannedLoad(t),
      )
      .filter((t) => {
        const start = t.start_date ?? t.due_date;
        const end = t.due_date ?? t.start_date;
        if (!start || !end) return false;
        return expandWorkDays(start, end).includes(data.day);
      })
      .map((t) => {
        const n = assigneeCount.get(t.id) ?? 1;
        const start = t.start_date ?? t.due_date;
        const end = t.due_date ?? t.start_date;
        const spreadDays = start && end ? expandWorkDays(start, end).length : 1;
        return {
          task_id: t.id,
          title: t.title,
          project: projectById.get(t.project_id) ?? null,
          start_date: t.start_date,
          due_date: t.due_date,
          estimateMin: Math.round(
            (Number(t.total_effort_hours) * 60) / n / Math.max(1, spreadDays),
          ),
        };
      });

    // Logged: time entries on this TZ-day
    const startUtc = utcFromTzWall(data.day, "00:00:00", tz);
    const endUtc = utcFromTzWall(data.day, "23:59:59.999", tz);
    const { data: entries } = await supabase
      .from("time_entries")
      .select("id, task_id, started_at, duration_minutes, note")
      .eq("user_id", data.userId)
      .gte("started_at", startUtc)
      .lte("started_at", endUtc)
      .not("duration_minutes", "is", null);
    const loggedTaskIds = Array.from(
      new Set((entries ?? []).map((e) => e.task_id).filter((id): id is string => id !== null)),
    );
    let logTasks: Array<{ id: string; title: string; project_id: string }> = [];
    if (loggedTaskIds.length) {
      const { data: lt } = await supabase
        .from("tasks")
        .select("id, title, project_id")
        .in("id", loggedTaskIds);
      logTasks = lt ?? [];
    }
    const logTaskById = new Map(logTasks.map((t) => [t.id, t]));

    const logged = (entries ?? [])
      .filter((e) => e.task_id !== null)
      .map((e) => {
        const t = logTaskById.get(e.task_id as string);
        return {
          entry_id: e.id,
          task_id: e.task_id as string,
          title: t?.title ?? "—",
          project: t ? (projectById.get(t.project_id) ?? null) : null,
          minutes: e.duration_minutes ?? 0,
          note: e.note,
        };
      });

    return { tz, planned, logged };
  });

// ===================== Mis tareas en un rango (para timeline Mi tiempo) =====================
export const getMyTasksInRange = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid().optional(),
        rangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        rangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Projects visible + workspace scoping
    let projectsQ = supabase
      .from("projects")
      .select("id, name, color, workspace_id, workspaces:workspace_id(name, slug, kind)");
    if (data.workspaceId) projectsQ = projectsQ.eq("workspace_id", data.workspaceId);
    const { data: projects } = await projectsQ;
    const projectIds = (projects ?? []).map((p) => p.id);
    if (projectIds.length === 0) return { tasks: [] as MyTaskInRange[] };
    const projectById = new Map(
      (projects ?? []).map((p) => [
        p.id,
        {
          id: p.id,
          name: p.name,
          color: p.color,
          workspace_id: p.workspace_id,
          workspace_name:
            (p as unknown as { workspaces?: { name?: string } }).workspaces?.name ?? "",
          workspace_slug:
            (p as unknown as { workspaces?: { slug?: string } }).workspaces?.slug ?? "",
          workspace_kind:
            (p as unknown as { workspaces?: { kind?: string } }).workspaces?.kind ?? "",
        },
      ]),
    );

    // Tasks assigned to me (primary or co-assignee) whose date range intersects the window.
    // Both branches are filtered by the window and paginated: pulling every
    // historical assignment first hit PostgREST's 1000-row cap and silently
    // dropped recent tasks, so the user saw an empty/partial list.
    const tCols =
      "id, title, project_id, start_date, due_date, status, area, assignee_id, total_effort_hours, task_statuses(category, color, name, key)";
    type RangeRow = {
      id: string;
      title: string;
      project_id: string;
      start_date: string | null;
      due_date: string | null;
      status: string | null;
      area: string | null;
      assignee_id: string | null;
      total_effort_hours: number | null;
      task_statuses?: WorkloadStatusJoin | WorkloadStatusJoin[] | null;
    };
    const tasksAcc = new Map<string, RangeRow>();
    async function loadMine(kind: "primary" | "co") {
      const PAGE = 1000;
      for (const pids of chunk(projectIds)) {
        for (let from = 0; ; from += PAGE) {
          let q = supabase
            .from("tasks")
            .select(kind === "co" ? `${tCols}, task_assignees!inner(user_id)` : tCols);
          q = kind === "co" ? q.eq("task_assignees.user_id", userId) : q.eq("assignee_id", userId);
          const { data: rows, error } = await q
            .in("project_id", pids)
            .or(`start_date.lte.${data.rangeEnd},start_date.is.null`)
            .or(`due_date.gte.${data.rangeStart},due_date.is.null`)
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) throw new Error(error.message);
          const list = (rows ?? []) as unknown as RangeRow[];
          for (const r of list) tasksAcc.set(r.id, r);
          if (list.length < PAGE) break;
        }
      }
    }
    await Promise.all([loadMine("primary"), loadMine("co")]);
    const tasks = Array.from(tasksAcc.values());

    // Count assignees per task to split totalMin equally
    const tIds = (tasks ?? []).map((t) => t.id);
    const nByTask = new Map<string, number>();
    if (tIds.length > 0) {
      const setByTask = new Map<string, Set<string>>();
      for (const t of tasks ?? []) {
        const s = new Set<string>();
        if (t.assignee_id) s.add(t.assignee_id);
        s.add(userId);
        setByTask.set(t.id, s);
      }
      for (const ids of chunk(tIds)) {
        const { data: taAll } = await supabase
          .from("task_assignees")
          .select("task_id, user_id")
          .in("task_id", ids);
        for (const r of taAll ?? []) setByTask.get(r.task_id)?.add(r.user_id);
      }
      for (const [tid, s] of setByTask) nByTask.set(tid, Math.max(1, s.size));
    }

    const rows = (tasks ?? [])
      .filter((t) => t.start_date || t.due_date)
      .map((t) => {
        const p = projectById.get(t.project_id);
        const n = nByTask.get(t.id) ?? 1;
        const totalMin = t.total_effort_hours
          ? Math.round((Number(t.total_effort_hours) * 60) / n)
          : 0;
        return {
          id: t.id,
          title: t.title,
          color: p?.color ?? null,
          area: (t.area as "operations" | "marketing" | "finance" | "internal" | null) ?? null,
          start_date: t.start_date,
          due_date: t.due_date,
          status: t.status as string,
          task_statuses: t.task_statuses ?? null,
          totalMin,
          project: p ?? null,
        };
      });
    return { tasks: rows };
  });

export type MyTaskInRange = {
  id: string;
  title: string;
  color: string | null;
  area: "operations" | "marketing" | "finance" | "internal" | null;
  start_date: string | null;
  due_date: string | null;
  status: string;
  totalMin: number;
  project: {
    id: string;
    name: string;
    color: string | null;
    workspace_id: string;
    workspace_name: string;
    workspace_slug: string;
    workspace_kind: string;
  } | null;
};

// ===================== Equipo: tareas + tiempo por miembro en un rango =====================
export const getTeamTimeInRange = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        rangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        rangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: ws } = await supabase
      .from("workspaces")
      .select("timezone")
      .eq("id", data.workspaceId)
      .maybeSingle();
    const tz = ws?.timezone ?? "UTC";

    // Members
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", data.workspaceId);
    const memberIds = (members ?? []).map((m) => m.user_id);
    if (memberIds.length === 0) {
      return { tz, members: [] as TeamMemberInRange[] };
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", memberIds);
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    // Projects in this workspace
    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, color, workspace_id")
      .eq("workspace_id", data.workspaceId);
    const projectIds = (projects ?? []).map((p) => p.id);
    const projectById = new Map((projects ?? []).map((p) => [p.id, p]));

    // Tasks assigned to any member whose date range intersects window
    type TaskRow = {
      id: string;
      title: string;
      project_id: string;
      assignee_id: string | null;
      start_date: string | null;
      due_date: string | null;
      status: string;
      area: "operations" | "marketing" | "finance" | "internal" | null;
      total_effort_hours: number | string | null;
      task_statuses?: WorkloadStatusJoin | WorkloadStatusJoin[] | null;
    };
    let tasks: TaskRow[] = [];
    // Map task_id -> Set<user_id> of all assignees (primary + task_assignees)
    const assigneesByTask = new Map<string, Set<string>>();
    if (projectIds.length > 0) {
      // 1) All tasks of the workspace that intersect the window (no assignee
      //    filter): assignment can come from tasks.assignee_id OR task_assignees.
      //    Paginate to avoid PostgREST's 1000-row cap silently truncating data.
      const PAGE = 1000;
      for (const ids of chunk(projectIds)) {
        for (let from = 0; ; from += PAGE) {
          const { data: page } = await supabase
            .from("tasks")
            .select(
              "id, title, project_id, assignee_id, start_date, due_date, status, area, total_effort_hours, task_statuses(category, color, name, key)",
            )
            .in("project_id", ids)
            .or(`start_date.lte.${data.rangeEnd},start_date.is.null`)
            .or(`due_date.gte.${data.rangeStart},due_date.is.null`)
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
          const rows = (page as TaskRow[] | null) ?? [];
          tasks.push(...rows);
          if (rows.length < PAGE) break;
        }
      }

      for (const t of tasks) {
        const s = new Set<string>();
        if (t.assignee_id) s.add(t.assignee_id);
        assigneesByTask.set(t.id, s);
      }

      // 2) Extra assignees, chunked by task id so the URL stays short and no
      //    row cap applies per chunk.
      const allTaskIds = tasks.map((t) => t.id);
      for (const ids of chunk(allTaskIds)) {
        const { data: ta } = await supabase
          .from("task_assignees")
          .select("task_id, user_id")
          .in("task_id", ids);
        for (const r of ta ?? []) assigneesByTask.get(r.task_id)?.add(r.user_id);
      }

      // 3) Keep only tasks that involve at least one workspace member AND
      //    whose effective span actually intersects the visible window.
      const memberSet = new Set(memberIds);
      tasks = tasks.filter((t) => {
        const s = assigneesByTask.get(t.id);
        if (!s) return false;
        let hasMember = false;
        for (const u of s)
          if (memberSet.has(u)) {
            hasMember = true;
            break;
          }
        if (!hasMember) return false;
        const st = t.start_date ?? t.due_date;
        const en = t.due_date ?? t.start_date;
        if (!st || !en) return false;
        return en >= data.rangeStart && st <= data.rangeEnd;
      });
    }

    const taskById = new Map(tasks.map((t) => [t.id, t]));

    // Time entries for members in window
    const startUtc = utcFromTzWall(data.rangeStart, "00:00:00", tz);
    const endUtc = utcFromTzWall(data.rangeEnd, "23:59:59.999", tz);
    type EntryRow = {
      user_id: string;
      task_id: string | null;
      started_at: string;
      duration_minutes: number | null;
      is_billable: boolean | null;
    };
    const entries: EntryRow[] = [];
    {
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: page } = await supabase
          .from("time_entries")
          .select("user_id, task_id, started_at, duration_minutes, is_billable")
          .in("user_id", memberIds)
          .gte("started_at", startUtc)
          .lte("started_at", endUtc)
          .order("started_at", { ascending: true })
          .range(from, from + PAGE - 1);
        const rows = (page as EntryRow[] | null) ?? [];
        entries.push(...rows);
        if (rows.length < PAGE) break;
      }
    }

    // Some time entries point to tasks outside the visible window (or outside
    // this workspace). Resolve their area so the cliente/interno split is real
    // instead of defaulting everything to "operations".
    const areaByTask = new Map<string, string | null>();
    for (const t of tasks) areaByTask.set(t.id, t.area);
    {
      const unknown = [
        ...new Set(
          entries.map((e) => e.task_id).filter((id): id is string => !!id && !areaByTask.has(id)),
        ),
      ];
      for (const ids of chunk(unknown)) {
        const { data: extra } = await supabase.from("tasks").select("id, area").in("id", ids);
        for (const r of extra ?? []) areaByTask.set(r.id, r.area);
      }
    }

    // Aggregate logged minutes by user + day, split by area (internos = area != operations)
    const loggedByUserDay = new Map<
      string,
      Map<string, { total: number; client: number; internal: number }>
    >();
    const loggedByUserTotal = new Map<
      string,
      { total: number; client: number; internal: number }
    >();
    for (const e of entries ?? []) {
      const day = dayInTz(e.started_at, tz);
      const isClient =
        (e.task_id ? (areaByTask.get(e.task_id) ?? "operations") : "operations") === "operations";

      const mins = e.duration_minutes ?? 0;

      let byDay = loggedByUserDay.get(e.user_id);
      if (!byDay) {
        byDay = new Map();
        loggedByUserDay.set(e.user_id, byDay);
      }
      const cur = byDay.get(day) ?? { total: 0, client: 0, internal: 0 };
      cur.total += mins;
      if (isClient) cur.client += mins;
      else cur.internal += mins;
      byDay.set(day, cur);

      const tot = loggedByUserTotal.get(e.user_id) ?? { total: 0, client: 0, internal: 0 };
      tot.total += mins;
      if (isClient) tot.client += mins;
      else tot.internal += mins;
      loggedByUserTotal.set(e.user_id, tot);
    }

    const membersOut: TeamMemberInRange[] = memberIds.map((uid) => {
      const memberTasks = tasks
        .filter((t) => {
          if (!(t.start_date || t.due_date)) return false;
          const s = assigneesByTask.get(t.id);
          return !!s && s.has(uid);
        })
        .map((t) => {
          const p = projectById.get(t.project_id);
          const n = Math.max(1, assigneesByTask.get(t.id)?.size ?? 1);
          const totalMin = t.total_effort_hours
            ? Math.round((Number(t.total_effort_hours) * 60) / n)
            : 0;
          return {
            id: t.id,
            title: t.title,
            color: p?.color ?? null,
            area: t.area,
            start_date: t.start_date,
            due_date: t.due_date,
            status: t.status,
            task_statuses: t.task_statuses ?? null,
            totalMin,
            project: p
              ? { id: p.id, name: p.name, color: p.color, workspace_id: p.workspace_id }
              : null,
          };
        });

      // Planned load per day: spread each task's estimate over the business
      // days of its span, then keep only the days inside the window.
      // Cancelled tasks are not load.
      const estimateByDay: Record<string, number> = {};
      for (const t of memberTasks) {
        if (!t.totalMin) continue;
        if (isClosedForPlannedLoad(t)) continue;
        const st = t.start_date ?? t.due_date;
        const en = t.due_date ?? t.start_date;
        if (!st || !en) continue;
        const spread = expandWorkDays(st, en);
        if (spread.length === 0) continue;
        const per = t.totalMin / spread.length;
        for (const d of spread) {
          if (d < data.rangeStart || d > data.rangeEnd) continue;
          estimateByDay[d] = (estimateByDay[d] ?? 0) + per;
        }
      }

      // Estimate shown for the window = only the share of each task that
      // falls inside the visible range (prorrateado por días hábiles).
      const estMin = Math.round(Object.values(estimateByDay).reduce((s, v) => s + v, 0));

      const loggedTotals = loggedByUserTotal.get(uid) ?? { total: 0, client: 0, internal: 0 };
      const loggedByDay: Record<string, { total: number; client: number; internal: number }> = {};
      const byDay = loggedByUserDay.get(uid);
      if (byDay) for (const [k, v] of byDay) loggedByDay[k] = v;
      const p = profileById.get(uid);
      return {
        user_id: uid,
        name: p?.full_name ?? p?.email ?? "—",
        avatar_url: p?.avatar_url ?? null,
        tasks: memberTasks,
        loggedByDay,
        estimateByDay,
        estimateMin: estMin,
        loggedMin: loggedTotals.total,
        loggedClientMin: loggedTotals.client,
        loggedInternalMin: loggedTotals.internal,
      };
    });

    return { tz, members: membersOut };
  });

export type TeamMemberInRange = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  tasks: Array<{
    id: string;
    title: string;
    color: string | null;
    area: "operations" | "marketing" | "finance" | "internal" | null;
    start_date: string | null;
    due_date: string | null;
    status: string;
    task_statuses?: WorkloadStatusJoin | WorkloadStatusJoin[] | null;
    totalMin: number;
    project: { id: string; name: string; color: string | null; workspace_id: string } | null;
  }>;
  loggedByDay: Record<string, { total: number; client: number; internal: number }>;
  estimateByDay: Record<string, number>;

  estimateMin: number;
  loggedMin: number;
  loggedClientMin: number;
  loggedInternalMin: number;
};
