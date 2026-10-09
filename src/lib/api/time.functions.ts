import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ===================== Estimates =====================

const WORKSPACE_ROLE = ["owner", "admin", "member", "guest"] as const;

export const listTaskEstimates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("task_estimates")
      .select("id, task_id, user_id, role, hours, daily_hours, created_at, updated_at")
      .eq("task_id", data.taskId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertTaskEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        userId: z.string().uuid().nullable().optional(),
        role: z.enum(WORKSPACE_ROLE).nullable().optional(),
        hours: z.number().min(0).max(9999),
        dailyHours: z.number().min(0).max(24).nullable().optional(),
      })
      .refine((v) => (v.userId ? !v.role : !!v.role), {
        message: "Provide exactly one of userId or role",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload: {
      task_id: string;
      user_id: string | null;
      role: (typeof WORKSPACE_ROLE)[number] | null;
      hours: number;
      daily_hours?: number | null;
    } = {
      task_id: data.taskId,
      user_id: data.userId ?? null,
      role: data.role ?? null,
      hours: data.hours,
    };
    if (data.dailyHours !== undefined) payload.daily_hours = data.dailyHours;
    const onConflict = data.userId ? "task_id,user_id" : "task_id,role";
    const { error } = await supabase.from("task_estimates").upsert(payload, { onConflict });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTaskEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("task_estimates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===================== Time entries =====================

export const listTimeEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid().optional(),
        contentPieceId: z.string().uuid().optional(),
        userId: z.string().uuid().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("time_entries")
      .select(
        "id, task_id, content_piece_id, user_id, started_at, ended_at, duration_minutes, note, is_billable, source, created_at",
      )
      .order("started_at", { ascending: false });
    if (data.taskId) q = q.eq("task_id", data.taskId);
    if (data.contentPieceId) q = q.eq("content_piece_id", data.contentPieceId);
    if (data.userId) q = q.eq("user_id", data.userId);
    if (data.from) q = q.gte("started_at", data.from);
    if (data.to) q = q.lte("started_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid().nullable().optional(),
        contentPieceId: z.string().uuid().nullable().optional(),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
        note: z.string().max(500).optional(),
        isBillable: z.boolean().default(true),
      })
      .refine((v) => !!v.taskId || !!v.contentPieceId, {
        message: "Provide taskId or contentPieceId",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (new Date(data.endedAt).getTime() < new Date(data.startedAt).getTime()) {
      throw new Error("La fecha de fin debe ser posterior al inicio");
    }
    const { error } = await supabase.from("time_entries").insert({
      task_id: data.taskId ?? null,
      content_piece_id: data.contentPieceId ?? null,
      user_id: userId,
      started_at: data.startedAt,
      ended_at: data.endedAt,
      note: data.note ?? null,
      is_billable: data.contentPieceId ? false : data.isBillable,
      source: "manual",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        startedAt: z.string().datetime().optional(),
        endedAt: z.string().datetime().optional(),
        note: z.string().max(500).nullable().optional(),
        isBillable: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: {
      started_at?: string;
      ended_at?: string;
      note?: string | null;
      is_billable?: boolean;
    } = {};
    if (data.startedAt !== undefined) patch.started_at = data.startedAt;
    if (data.endedAt !== undefined) patch.ended_at = data.endedAt;
    if (data.note !== undefined) patch.note = data.note;
    if (data.isBillable !== undefined) patch.is_billable = data.isBillable;
    const { error } = await supabase.from("time_entries").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const deleteTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("time_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===================== Timer =====================

/**
 * Fetches the current user's active timer, applying auto-stop if it has run
 * past the user's `max_timer_hours` limit in the current workspace.
 *
 * `workspaceId` is optional: when present we use that workspace's
 * `max_timer_hours`; otherwise we fall back to the lowest configured limit
 * across all workspaces the user belongs to (or 12h).
 */
export const getActiveTimer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid().optional() }).optional().parse(input ?? undefined),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("time_entries")
      .select("id, task_id, user_id, started_at, note")
      .eq("user_id", userId)
      .is("ended_at", null)
      .maybeSingle();
    if (!row) return null;

    // Parallel: resolve capacity (for max hours) + task in a single round-trip
    const capQ = data?.workspaceId
      ? supabase
          .from("user_capacity")
          .select("max_timer_hours")
          .eq("workspace_id", data.workspaceId)
          .eq("user_id", userId)
          .maybeSingle()
      : supabase.from("user_capacity").select("max_timer_hours").eq("user_id", userId);
    const taskQ = row.task_id
      ? supabase
          .from("tasks")
          .select("id, title, project_id")
          .eq("id", row.task_id)
          .maybeSingle()
      : Promise.resolve({ data: null as { id: string; title: string; project_id: string } | null });
    const [capRes, taskRes] = await Promise.all([capQ, taskQ]);

    // Resolve max_timer_hours
    let maxHours = 12;
    if (data?.workspaceId) {
      const cap = (capRes.data ?? null) as { max_timer_hours?: number | null } | null;
      if (cap?.max_timer_hours) maxHours = Number(cap.max_timer_hours);
    } else {
      const caps = (capRes.data ?? []) as Array<{ max_timer_hours: number | null }>;
      const arr = caps.map((c) => Number(c.max_timer_hours)).filter((n) => n > 0);
      if (arr.length) maxHours = Math.min(...arr);
    }

    const elapsedMs = Date.now() - new Date(row.started_at).getTime();
    if (elapsedMs > maxHours * 3600 * 1000) {
      const endedAt = new Date(new Date(row.started_at).getTime() + maxHours * 3600 * 1000).toISOString();
      await supabase
        .from("time_entries")
        .update({ ended_at: endedAt, source: "auto_stopped" })
        .eq("id", row.id);
      return null;
    }

    const task = taskRes.data ?? null;
    let project: { id: string; name: string; color: string | null } | null = null;
    if (task?.project_id) {
      const { data: p } = await supabase
        .from("projects")
        .select("id, name, color")
        .eq("id", task.project_id)
        .maybeSingle();
      project = p ?? null;
    }
    return { ...row, task, project };
  });

export const startTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Cerrar timer activo previo si existe
    const now = new Date().toISOString();
    await supabase
      .from("time_entries")
      .update({ ended_at: now })
      .eq("user_id", userId)
      .is("ended_at", null);
    const { error } = await supabase.from("time_entries").insert({
      task_id: data.taskId,
      user_id: userId,
      started_at: now,
      source: "timer",
      is_billable: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const stopTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("time_entries")
      .update({ ended_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("ended_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===================== Capacity & Holidays =====================

export const listCapacities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("user_capacity")
      .select(
        "id, workspace_id, user_id, daily_hours, weekly_pattern, hourly_rate, currency, max_timer_hours, pattern_custom",
      )
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        userId: z.string().uuid(),
        dailyHours: z.number().min(0).max(24),
        weeklyPattern: z.array(z.number().min(0).max(24)).length(7).optional(),
        patternCustom: z.boolean().optional(),
        hourlyRate: z.number().min(0).max(99999).nullable().optional(),
        currency: z.string().min(3).max(3).optional(),
        maxTimerHours: z.number().min(1).max(24).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload: {
      workspace_id: string;
      user_id: string;
      daily_hours: number;
      weekly_pattern?: number[];
      pattern_custom?: boolean;
      hourly_rate?: number | null;
      currency?: string;
      max_timer_hours?: number;
    } = {
      workspace_id: data.workspaceId,
      user_id: data.userId,
      daily_hours: data.dailyHours,
    };
    if (data.weeklyPattern) {
      payload.weekly_pattern = data.weeklyPattern;
      payload.pattern_custom = data.patternCustom ?? true;
    } else if (data.patternCustom !== undefined) {
      payload.pattern_custom = data.patternCustom;
    }
    if (data.hourlyRate !== undefined) payload.hourly_rate = data.hourlyRate;
    if (data.currency) payload.currency = data.currency;
    if (data.maxTimerHours !== undefined) payload.max_timer_hours = data.maxTimerHours;
    const { error } = await supabase
      .from("user_capacity")
      .upsert(payload, { onConflict: "workspace_id,user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listHolidays = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("workspace_holidays")
      .select("id, workspace_id, date, name, affects, user_id")
      .eq("workspace_id", data.workspaceId)
      .order("date", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        workspaceId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        name: z.string().min(1).max(120),
        affects: z.enum(["all", "user"]),
        userId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload = {
      workspace_id: data.workspaceId,
      date: data.date,
      name: data.name,
      affects: data.affects,
      user_id: data.affects === "user" ? (data.userId ?? null) : null,
    };
    if (data.id) {
      const { error } = await supabase.from("workspace_holidays").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("workspace_holidays").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("workspace_holidays").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===================== Días libres / vacaciones del usuario =====================

/** Lista todos los días libres (vacaciones) del usuario autenticado en cada workspace. */
export const listMyTimeOff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("workspace_holidays")
      .select("id, workspace_id, date, name, affects, user_id, portion")
      .eq("affects", "user")
      .eq("user_id", userId)
      .order("date", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Marca un rango de fechas (o un día suelto si start=end) como día libre del usuario en un workspace. */
export const addMyTimeOffRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        name: z.string().min(1).max(120).default("Vacaciones"),
        portion: z.enum(["full", "am", "pm"]).default("full"),
      })
      .refine((v) => v.endDate >= v.startDate, {
        message: "endDate must be >= startDate",
      })
      .refine((v) => v.portion === "full" || v.startDate === v.endDate, {
        message: "Half-day entries must be a single day",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows: {
      workspace_id: string;
      date: string;
      name: string;
      affects: "user";
      user_id: string;
      portion: "full" | "am" | "pm";
    }[] = [];
    const start = new Date(`${data.startDate}T00:00:00Z`);
    const end = new Date(`${data.endDate}T00:00:00Z`);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      rows.push({
        workspace_id: data.workspaceId,
        date: d.toISOString().slice(0, 10),
        name: data.name,
        affects: "user",
        user_id: userId,
        portion: data.portion,
      });
    }
    // Detect overlaps with existing entries on the same day:
    // - full blocks any new entry (full/am/pm)
    // - am+pm coexist; same portion duplicates are skipped silently
    const dates = rows.map((r) => r.date);
    const { data: existing } = await supabase
      .from("workspace_holidays")
      .select("date, portion")
      .eq("workspace_id", data.workspaceId)
      .eq("affects", "user")
      .eq("user_id", userId)
      .in("date", dates);
    const byDate = new Map<string, Set<string>>();
    for (const e of existing ?? []) {
      const p = (e.portion ?? "full") as string;
      if (!byDate.has(e.date)) byDate.set(e.date, new Set());
      byDate.get(e.date)!.add(p);
    }
    const conflicts: string[] = [];
    const toInsert: typeof rows = [];
    for (const r of rows) {
      const existingPortions = byDate.get(r.date) ?? new Set<string>();
      if (existingPortions.has("full")) {
        conflicts.push(`${r.date}: ya tienes el día completo marcado`);
        continue;
      }
      if (r.portion === "full" && existingPortions.size > 0) {
        conflicts.push(`${r.date}: ya tienes medio día marcado, elimínalo primero`);
        continue;
      }
      if (existingPortions.has(r.portion)) continue; // duplicado exacto
      toInsert.push(r);
      existingPortions.add(r.portion);
      byDate.set(r.date, existingPortions);
    }
    if (toInsert.length > 0) {
      const { error } = await supabase.from("workspace_holidays").insert(toInsert);
      if (error) throw new Error(error.message);
    }
    return { ok: true, inserted: toInsert.length, conflicts };
  });


/** Elimina un día libre del usuario (solo el propio). */
export const deleteMyTimeOff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("workspace_holidays")
      .delete()
      .eq("id", data.id)
      .eq("affects", "user")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
