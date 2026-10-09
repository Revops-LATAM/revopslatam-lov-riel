import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { taskStatusSchema, taskPrioritySchema } from "./_shared.server";

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select(
        "id, title, description, status, priority, assignee_id, due_date, start_date, position, created_at, completed_at, parent_task_id, sprint_id, contract_id, phase_id, total_effort_hours, task_type_id, status_id, sla_target_response_at, sla_target_resolution_at, request_type, severity, task_statuses(id, key, name, category, color), assignees:task_assignees(user_id)",
      )
      .eq("project_id", data.projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return tasks ?? [];
  });


export const getTask = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: task, error } = await supabase
      .from("tasks")
      .select(
        "id, title, description, status, priority, assignee_id, due_date, start_date, position, created_at, completed_at, parent_task_id, project_id, created_by, effort_mode, total_effort_hours, sprint_id, contract_id, phase_id, task_type_id, status_id, submitter_email, request_type, severity, sla_target_response_at, sla_target_resolution_at, meeting_start_time, meeting_duration_minutes, meeting_timezone, google_event_id, google_event_html_link, contract:contracts(type), task_statuses(id, key, name, category, color), assignees:task_assignees(user_id), project:projects!tasks_project_id_fkey(name, color), sprint:sprints!tasks_sprint_id_fkey(sprint_number), phase:phases!tasks_phase_id_fkey(name)",
      )
      .eq("id", data.taskId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // La tarea puede haber sido borrada o no ser accesible: devolvemos null
    // en vez de lanzar, para no romper la vista con pantalla en blanco.
    return task ?? null;
  });

export const resolveTaskLocation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: task, error } = await supabase
      .from("tasks")
      .select("id, project_id, projects(id, area, workspace_id, workspaces(slug))")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task || !task.projects) return null;
    const project = task.projects as unknown as {
      id: string;
      area: string | null;
      workspaces: { slug: string } | null;
    };
    const slug = project.workspaces?.slug ?? null;
    if (!slug) return null;
    return {
      workspaceSlug: slug,
      projectId: project.id,
      area: project.area ?? "operations",
    };
  });





export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        status: taskStatusSchema.optional(),
        priority: taskPrioritySchema.optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        assigneeIds: z.array(z.string().uuid()).optional(),
        dueDate: z.string().nullable().optional(),
        parentTaskId: z.string().uuid().nullable().optional(),
        sprintId: z.string().uuid().nullable().optional(),
        phaseId: z.string().uuid().nullable().optional(),
        taskTypeId: z.string().uuid().nullable().optional(),
        statusId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: project } = await supabase
      .from("projects")
      .select("contract_id, workspace_id")
      .eq("id", data.projectId)
      .maybeSingle();

    // If the phase is the Tickets inbox, force task type = "ticket"
    let taskTypeId: string | null = data.taskTypeId ?? null;
    if (data.phaseId && project?.workspace_id) {
      const { data: phase } = await supabase
        .from("phases")
        .select("is_ticket_inbox")
        .eq("id", data.phaseId)
        .maybeSingle();
      if ((phase as { is_ticket_inbox?: boolean } | null)?.is_ticket_inbox) {
        const { data: ticketType } = await supabase
          .from("task_types")
          .select("id")
          .eq("workspace_id", project.workspace_id)
          .eq("key", "ticket")
          .maybeSingle();
        if (ticketType?.id) taskTypeId = ticketType.id;
      }
    }

    let statusId: string | null = data.statusId ?? null;
    if (!statusId && taskTypeId && project?.workspace_id) {
      const { data: defStatus } = await supabase
        .from("task_statuses")
        .select("id")
        .eq("workspace_id", project.workspace_id)
        .eq("task_type_id", taskTypeId)
        .eq("is_default", true)
        .maybeSingle();
      statusId = defStatus?.id ?? null;
    }
    if (!statusId && project?.workspace_id) {
      const { data: anyDef } = await supabase
        .from("task_statuses")
        .select("id")
        .eq("workspace_id", project.workspace_id)
        .eq("is_default", true)
        .limit(1)
        .maybeSingle();
      statusId = anyDef?.id ?? null;
    }
    if (!statusId) throw new Error("No hay estados configurados en este workspace");

    // Determine assignees: prefer assigneeIds; fall back to assigneeId
    const initialAssignees =
      data.assigneeIds && data.assigneeIds.length > 0
        ? Array.from(new Set(data.assigneeIds))
        : data.assigneeId
          ? [data.assigneeId]
          : [];

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        project_id: data.projectId,
        title: data.title,
        description: data.description ?? null,
        status: data.status ?? "nueva",
        priority: data.priority ?? "none",
        assignee_id: initialAssignees[0] ?? null,
        due_date: data.dueDate ?? null,
        parent_task_id: data.parentTaskId ?? null,
        contract_id: project?.contract_id ?? null,
        sprint_id: data.sprintId ?? null,
        phase_id: data.phaseId ?? null,
        task_type_id: taskTypeId,
        status_id: statusId,
        created_by: userId,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (initialAssignees.length > 0 && task) {
      const rows = initialAssignees.map((u) => ({
        task_id: (task as { id: string }).id,
        user_id: u,
        is_primary: false,
      }));
      await supabase.from("task_assignees").upsert(rows as never, {
        onConflict: "task_id,user_id",
        ignoreDuplicates: true,
      });
    }
    return task;
  });


export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).nullable().optional(),
        status: taskStatusSchema.optional(),
        statusId: z.string().uuid().nullable().optional(),
        priority: taskPrioritySchema.optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        assigneeIds: z.array(z.string().uuid()).optional(),
        dueDate: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        position: z.number().int().optional(),
        sprintId: z.string().uuid().nullable().optional(),
        phaseId: z.string().uuid().nullable().optional(),
        taskTypeId: z.string().uuid().nullable().optional(),
        effortMode: z.enum(["basic", "flexible", "fixed_daily", "due_date"]).optional(),
        totalEffortHours: z.number().min(0).max(99999).nullable().optional(),
        submitterEmail: z.string().trim().email().max(255).nullable().optional(),
        requestType: z.enum(["incidencia", "requerimiento"]).nullable().optional(),
        severity: z.enum(["normal", "urgente_critico"]).nullable().optional(),
        meetingStartTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
        meetingDurationMinutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
        meetingTimezone: z.string().min(1).max(64).nullable().optional(),
      })
      .parse(input),

  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { taskId, assigneeId, assigneeIds, dueDate, startDate, sprintId, phaseId, taskTypeId, statusId, status, effortMode, totalEffortHours, submitterEmail, requestType, severity, meetingStartTime, meetingDurationMinutes, meetingTimezone, ...rest } = data;
    const uniqueAssigneeIds = assigneeIds !== undefined ? Array.from(new Set(assigneeIds)) : undefined;
    const syncedAssigneeIds = uniqueAssigneeIds ?? (assigneeId !== undefined ? (assigneeId ? [assigneeId] : []) : undefined);

    let resolvedStatusId: string | undefined = statusId ?? undefined;
    if (!resolvedStatusId && status) {
      const { data: row } = await supabase
        .from("tasks")
        .select("project_id, projects:projects(workspace_id), task_type_id")
        .eq("id", taskId)
        .maybeSingle();
      const wsId = (row as { projects?: { workspace_id?: string } | null } | null)?.projects?.workspace_id;
      const ttId = (row as { task_type_id?: string | null } | null)?.task_type_id;
      if (wsId) {
        let q = supabase
          .from("task_statuses")
          .select("id")
          .eq("workspace_id", wsId)
          .eq("key", status);
        if (ttId) q = q.eq("task_type_id", ttId);
        const { data: ts } = await q.limit(1).maybeSingle();
        resolvedStatusId = (ts as { id?: string } | null)?.id;
      }
    }

    const patch = {
      ...rest,
      ...(assigneeId !== undefined
        ? { assignee_id: assigneeId }
        : syncedAssigneeIds !== undefined
          ? { assignee_id: syncedAssigneeIds[0] ?? null }
          : {}),
      ...(dueDate !== undefined ? { due_date: dueDate } : {}),
      ...(startDate !== undefined ? { start_date: startDate } : {}),
      ...(sprintId !== undefined ? { sprint_id: sprintId } : {}),
      ...(phaseId !== undefined ? { phase_id: phaseId } : {}),
      ...(taskTypeId !== undefined ? { task_type_id: taskTypeId } : {}),
      ...(resolvedStatusId ? { status_id: resolvedStatusId } : {}),
      ...(effortMode !== undefined ? { effort_mode: effortMode } : {}),
      ...(totalEffortHours !== undefined ? { total_effort_hours: totalEffortHours } : {}),
      ...(submitterEmail !== undefined ? { submitter_email: submitterEmail } : {}),
      ...(requestType !== undefined ? { request_type: requestType } : {}),
      ...(severity !== undefined ? { severity } : {}),
      ...(meetingStartTime !== undefined ? { meeting_start_time: meetingStartTime } : {}),
      ...(meetingDurationMinutes !== undefined ? { meeting_duration_minutes: meetingDurationMinutes } : {}),
      ...(meetingTimezone !== undefined ? { meeting_timezone: meetingTimezone } : {}),
    } as never;
    if (Object.keys(patch as Record<string, unknown>).length > 0) {
      const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
      if (error) throw new Error(error.message);
    }

    // Sincronizar asignados (fuente de verdad = task_assignees)
    if (syncedAssigneeIds !== undefined) {
      const unique = syncedAssigneeIds;
      // Borrar los que ya no están
      if (unique.length === 0) {
        const { error } = await supabase.from("task_assignees").delete().eq("task_id", taskId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("task_assignees")
          .delete()
          .eq("task_id", taskId)
          .not("user_id", "in", `(${unique.join(",")})`);
        if (error) throw new Error(error.message);
      }
      if (unique.length > 0) {
        const rows = unique.map((u) => ({ task_id: taskId, user_id: u, is_primary: false }));
        const { error } = await supabase
          .from("task_assignees")
          .upsert(rows as never, { onConflict: "task_id,user_id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });



export const reorderTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        updates: z
          .array(
            z.object({
              taskId: z.string().uuid(),
              status: taskStatusSchema.optional(),
              statusId: z.string().uuid().nullable().optional(),
              position: z.number().int(),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.updates.length === 0) return { ok: true };

    await Promise.all(
      data.updates.map(async (u) => {
        const patch: { position: number; status_id?: string } = { position: u.position };
        if (u.statusId) patch.status_id = u.statusId;
        const { error } = await supabase.from("tasks").update(patch as never).eq("id", u.taskId);
        if (error) throw new Error(error.message);
      }),
    );
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("tasks").delete().eq("id", data.taskId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let projectsQuery = supabase
      .from("projects")
      .select("id, name, color, workspace_id");
    if (data.workspaceId) {
      projectsQuery = projectsQuery.eq("workspace_id", data.workspaceId);
    }
    const { data: projects } = await projectsQuery;
    const ids = (projects ?? []).map((p) => p.id);
    if (ids.length === 0) return [];

    const wsIds = Array.from(new Set((projects ?? []).map((p) => p.workspace_id)));
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, name, slug, color")
      .in("id", wsIds);
    const wsById = new Map((workspaces ?? []).map((w) => [w.id, w]));

    // Todas las tareas donde el usuario aparece como asignado (multi)
    const { data: myAssignments } = await supabase
      .from("task_assignees")
      .select("task_id")
      .eq("user_id", userId);
    const myTaskIds = Array.from(new Set((myAssignments ?? []).map((r) => (r as { task_id: string }).task_id)));
    if (myTaskIds.length === 0) return [];

    // Chunk `in("id", myTaskIds)` to keep URLs short — users can have 1000+
    // task_assignees rows which would otherwise blow past PostgREST URL limits.
    const chunkSize = 150;
    const firstBatch = await supabase
      .from("tasks")
      .select(
        "id, title, status, status_id, priority, due_date, project_id, assignee_id, position, created_at, task_statuses!inner(id, key, name, category, color)",
      )
      .in("project_id", ids)
      .in("id", myTaskIds.slice(0, chunkSize))
      .not("task_statuses.category", "in", "(completada,cancelada)")
      .order("due_date", { ascending: true, nullsFirst: false });
    if (firstBatch.error) throw new Error(firstBatch.error.message);
    type TaskRow = NonNullable<typeof firstBatch.data>[number];
    const tasksAcc: TaskRow[] = [...(firstBatch.data ?? [])];
    for (let i = chunkSize; i < myTaskIds.length; i += chunkSize) {
      const slice = myTaskIds.slice(i, i + chunkSize);
      const { data: batch, error } = await supabase
        .from("tasks")
        .select(
          "id, title, status, status_id, priority, due_date, project_id, assignee_id, position, created_at, task_statuses!inner(id, key, name, category, color)",
        )
        .in("project_id", ids)
        .in("id", slice)
        .not("task_statuses.category", "in", "(completada,cancelada)")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      tasksAcc.push(...(batch ?? []));
    }
    const tasks = tasksAcc;



    const byId = new Map((projects ?? []).map((p) => [p.id, p]));
    return (tasks ?? []).map((t) => {
      const project = byId.get(t.project_id) ?? null;
      const ws = project ? wsById.get(project.workspace_id) ?? null : null;
      return {
        ...t,
        project: project
          ? { id: project.id, name: project.name, color: project.color }
          : null,
        workspace: ws
          ? { id: ws.id, name: ws.name, slug: ws.slug, color: ws.color }
          : null,
      };
    });
  });

// ===================== Multi-asignados y estimados por usuario =====================

export const setTaskAssignees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        userIds: z.array(z.string().uuid()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const unique = Array.from(new Set(data.userIds));
    const { error: taskErr } = await supabase
      .from("tasks")
      .update({ assignee_id: unique[0] ?? null } as never)
      .eq("id", data.taskId);
    if (taskErr) throw new Error(taskErr.message);
    if (unique.length === 0) {
      const { error } = await supabase.from("task_assignees").delete().eq("task_id", data.taskId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error: delErr } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", data.taskId)
      .not("user_id", "in", `(${unique.join(",")})`);
    if (delErr) throw new Error(delErr.message);
    const rows = unique.map((u) => ({ task_id: data.taskId, user_id: u, is_primary: false }));
    const { error: upErr } = await supabase
      .from("task_assignees")
      .upsert(rows as never, { onConflict: "task_id,user_id", ignoreDuplicates: true });
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

// listTaskEstimates ya existe en time.functions.ts; usar ese.

// ============================================================================
// Recurring tasks
// ============================================================================

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function addMonthsISO(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const targetMonth = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(targetMonth);
  // Clamp day to last of month
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}
function isoWeekday(iso: string): number {
  // 0=Sun..6=Sat -> normalize to 1=Mon..7=Sun for convenience
  const d = new Date(`${iso}T00:00:00Z`);
  return d.getUTCDay(); // keep 0..6, 0=Sun
}

function generateOccurrences(params: {
  anchor: string;
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  weekdays?: number[]; // 0=Sun..6=Sat
  endMode: "count" | "until";
  count?: number;
  until?: string;
  maxCap: number;
}): string[] {
  const { anchor, frequency, interval, weekdays, endMode, count, until, maxCap } = params;
  const results: string[] = [];
  const cap = Math.min(maxCap, endMode === "count" ? Math.max(1, count ?? 1) : maxCap);

  if (frequency === "daily") {
    let cursor = anchor;
    for (let i = 0; i < cap; i++) {
      if (i > 0) cursor = addDaysISO(cursor, interval);
      if (endMode === "until" && until && cursor > until) break;
      results.push(cursor);
    }
  } else if (frequency === "weekly") {
    const dows = (weekdays && weekdays.length > 0 ? weekdays : [isoWeekday(anchor)]).slice().sort();
    // Move anchor back to start of its week (Sunday)
    const anchorDow = isoWeekday(anchor);
    const weekStart = addDaysISO(anchor, -anchorDow);
    let weekCursor = weekStart;
    outer: while (results.length < cap) {
      for (const dow of dows) {
        const candidate = addDaysISO(weekCursor, dow);
        if (candidate < anchor) continue;
        if (endMode === "until" && until && candidate > until) break outer;
        results.push(candidate);
        if (results.length >= cap) break outer;
      }
      weekCursor = addDaysISO(weekCursor, 7 * interval);
    }
  } else {
    let cursor = anchor;
    for (let i = 0; i < cap; i++) {
      if (i > 0) cursor = addMonthsISO(anchor, interval * i);
      if (endMode === "until" && until && cursor > until) break;
      results.push(cursor);
    }
  }
  return results;
}

export const createTaskRecurrence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        sourceTaskId: z.string().uuid(),
        frequency: z.enum(["daily", "weekly", "monthly"]),
        interval: z.number().int().min(1).max(52),
        weekdays: z.array(z.number().int().min(0).max(6)).optional(),
        endMode: z.enum(["count", "until"]),
        count: z.number().int().min(2).max(100).optional(),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: src, error: srcErr } = await supabase
      .from("tasks")
      .select(
        "id, project_id, title, description, priority, assignee_id, due_date, start_date, contract_id, sprint_id, phase_id, task_type_id, status_id, effort_mode, total_effort_hours, meeting_start_time, meeting_duration_minutes, meeting_timezone",
      )
      .eq("id", data.sourceTaskId)
      .maybeSingle();
    if (srcErr) throw new Error(srcErr.message);
    if (!src) throw new Error("Tarea origen no encontrada");
    const source = src as {
      id: string;
      project_id: string;
      title: string;
      description: string | null;
      priority: string;
      assignee_id: string | null;
      due_date: string | null;
      start_date: string | null;
      contract_id: string | null;
      sprint_id: string | null;
      phase_id: string | null;
      task_type_id: string | null;
      status_id: string;
      effort_mode: string;
      total_effort_hours: number | null;
      meeting_start_time: string | null;
      meeting_duration_minutes: number | null;
      meeting_timezone: string | null;
    };

    const anchor = source.due_date ?? source.start_date ?? new Date().toISOString().slice(0, 10);
    const startAnchorGap =
      source.start_date && source.due_date
        ? Math.round(
            (new Date(`${source.due_date}T00:00:00Z`).getTime() -
              new Date(`${source.start_date}T00:00:00Z`).getTime()) /
              86400000,
          )
        : 0;

    const dates = generateOccurrences({
      anchor,
      frequency: data.frequency,
      interval: data.interval,
      weekdays: data.weekdays,
      endMode: data.endMode,
      count: data.count,
      until: data.until,
      maxCap: 100,
    });

    // Exclude the first occurrence (the source itself)
    const targets = dates.filter((d) => d !== anchor);
    if (targets.length === 0) return { created: 0 };

    // Fetch source assignees
    const { data: srcAssignees } = await supabase
      .from("task_assignees")
      .select("user_id, is_primary")
      .eq("task_id", source.id);
    const assigneeRows = (srcAssignees ?? []) as Array<{ user_id: string; is_primary: boolean }>;

    // Base position: append after existing tasks in project
    const { data: maxRow } = await supabase
      .from("tasks")
      .select("position")
      .eq("project_id", source.project_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    let position = ((maxRow as { position?: number } | null)?.position ?? 0) + 1;

    const insertPayload = targets.map((due) => ({
      project_id: source.project_id,
      title: source.title,
      description: source.description,
      priority: source.priority,
      assignee_id: source.assignee_id,
      due_date: due,
      start_date: source.start_date ? addDaysISO(due, -startAnchorGap) : null,
      contract_id: source.contract_id,
      sprint_id: source.sprint_id,
      phase_id: source.phase_id,
      task_type_id: source.task_type_id,
      status_id: source.status_id,
      effort_mode: source.effort_mode,
      total_effort_hours: source.total_effort_hours,
      meeting_start_time: source.meeting_start_time,
      meeting_duration_minutes: source.meeting_duration_minutes,
      meeting_timezone: source.meeting_timezone,
      created_by: userId,
      position: position++,
    }));

    const { data: inserted, error: insErr } = await supabase.rpc(
      "insert_task_recurrence_batch",
      { _rows: insertPayload as never },
    );
    if (insErr) throw new Error(insErr.message);
    const newIds = ((inserted ?? []) as Array<{ id: string }>).map((r) => r.id);

    if (assigneeRows.length > 0 && newIds.length > 0) {
      const rows = newIds.flatMap((tid) =>
        assigneeRows.map((a) => ({ task_id: tid, user_id: a.user_id, is_primary: a.is_primary })),
      );
      // Se usa un RPC para evitar que la validación de días hábiles (feriados/fines de
      // semana) bloquee la sincronización del asignado principal.
      for (let i = 0; i < rows.length; i += 200) {
        const { error: aErr } = await supabase.rpc("insert_task_assignees_bulk", {
          _rows: rows.slice(i, i + 200) as never,
        });
        if (aErr) throw new Error(`No se pudieron copiar los asignados: ${aErr.message}`);
      }
    }


    return { created: newIds.length };
  });


export const setTaskEstimateForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        userId: z.string().uuid(),
        hours: z.number().min(0).max(99999),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error: upErr } = await supabase
      .from("task_estimates")
      .upsert(
        { task_id: data.taskId, user_id: data.userId, hours: data.hours, manual: true } as never,
        { onConflict: "task_id,user_id" },
      );
    if (upErr) throw new Error(upErr.message);
    // Recalcular total (suma de estimates) y disparar recomputo automático
    const { data: rows } = await supabase
      .from("task_estimates")
      .select("hours")
      .eq("task_id", data.taskId);
    const total = (rows ?? []).reduce((acc, r) => acc + Number((r as { hours: number }).hours ?? 0), 0);
    await supabase
      .from("tasks")
      .update({ total_effort_hours: Math.round(total * 100) / 100 } as never)
      .eq("id", data.taskId);
    return { ok: true };
  });

export const resetTaskEstimateSplit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Limpiar overrides manuales y recomputar
    const { error } = await supabase
      .from("task_estimates")
      .update({ manual: false } as never)
      .eq("task_id", data.taskId);
    if (error) throw new Error(error.message);
    await supabase.rpc("recompute_task_estimate_split", { _task_id: data.taskId } as never);
    return { ok: true };
  });

export const setEventAssignees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        eventId: z.string().uuid(),
        userIds: z.array(z.string().uuid()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const unique = Array.from(new Set(data.userIds));
    if (unique.length === 0) {
      const { error } = await supabase
        .from("calendar_event_assignees")
        .delete()
        .eq("event_id", data.eventId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error: delErr } = await supabase
      .from("calendar_event_assignees")
      .delete()
      .eq("event_id", data.eventId)
      .not("user_id", "in", `(${unique.join(",")})`);
    if (delErr) throw new Error(delErr.message);
    const rows = unique.map((u) => ({ event_id: data.eventId, user_id: u }));
    const { error: upErr } = await supabase
      .from("calendar_event_assignees")
      .upsert(rows as never, { onConflict: "event_id,user_id", ignoreDuplicates: true });
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const listEventAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("calendar_event_assignees")
      .select("user_id")
      .eq("event_id", data.eventId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => (r as { user_id: string }).user_id);
  });
