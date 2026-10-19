import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Lista todas las dependencias de tareas de un proyecto. */
export const listTaskDependencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("task_dependencies")
      .select("id, project_id, predecessor_task_id, successor_task_id, lag_days, created_at")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addTaskDependency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z
      .object({
        predecessorTaskId: z.string().uuid(),
        successorTaskId: z.string().uuid(),
        lagDays: z.number().int().min(0).max(365).default(0),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("task_dependencies")
      .insert({
        predecessor_task_id: data.predecessorTaskId,
        successor_task_id: data.successorTaskId,
        lag_days: data.lagDays,
        created_by: context.userId,
        // project_id lo setea el trigger de validación
        project_id: "00000000-0000-0000-0000-000000000000",
      })
      .select("id, project_id, predecessor_task_id, successor_task_id, lag_days")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeTaskDependency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("task_dependencies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Fases */
export const listPhaseDependencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("phase_dependencies")
      .select("id, project_id, predecessor_phase_id, successor_phase_id, lag_days, created_at")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addPhaseDependency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z
      .object({
        predecessorPhaseId: z.string().uuid(),
        successorPhaseId: z.string().uuid(),
        lagDays: z.number().int().min(0).max(365).default(0),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("phase_dependencies")
      .insert({
        predecessor_phase_id: data.predecessorPhaseId,
        successor_phase_id: data.successorPhaseId,
        lag_days: data.lagDays,
        created_by: context.userId,
        project_id: "00000000-0000-0000-0000-000000000000",
      })
      .select("id, project_id, predecessor_phase_id, successor_phase_id, lag_days")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removePhaseDependency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("phase_dependencies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
