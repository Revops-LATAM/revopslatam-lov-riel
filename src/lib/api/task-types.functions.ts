import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATEGORY = z.enum(["abierta", "en_progreso", "bloqueada", "completada", "cancelada"]);

export const listTaskTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("task_types")
      .select("id, workspace_id, key, name, icon, color, is_system, sort_order")
      .eq("workspace_id", data.workspaceId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listTaskStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("task_statuses")
      .select(
        "id, workspace_id, task_type_id, key, name, color, category, is_system, is_default, sort_order",
      )
      .eq("workspace_id", data.workspaceId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) || `s_${Date.now()}`
  );
}

export const upsertTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        workspaceId: z.string().uuid(),
        taskTypeId: z.string().uuid(),
        name: z.string().min(1).max(60),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        category: CATEGORY,
        isDefault: z.boolean().optional(),
        sortOrder: z.number().int().min(0).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase
        .from("task_statuses")
        .update({
          name: data.name.trim(),
          color: data.color,
          category: data.category,
          ...(data.sortOrder !== undefined ? { sort_order: data.sortOrder } : {}),
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      if (data.isDefault) {
        await context.supabase
          .from("task_statuses")
          .update({ is_default: false })
          .eq("task_type_id", data.taskTypeId)
          .neq("id", data.id);
        await context.supabase.from("task_statuses").update({ is_default: true }).eq("id", data.id);
      }
      return { id: data.id };
    }
    const key = slugify(data.name);
    const { data: row, error } = await context.supabase
      .from("task_statuses")
      .insert({
        workspace_id: data.workspaceId,
        task_type_id: data.taskTypeId,
        key,
        name: data.name.trim(),
        color: data.color,
        category: data.category,
        sort_order: data.sortOrder ?? 999,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (data.isDefault) {
      await context.supabase
        .from("task_statuses")
        .update({ is_default: false })
        .eq("task_type_id", data.taskTypeId)
        .neq("id", row.id);
      await context.supabase.from("task_statuses").update({ is_default: true }).eq("id", row.id);
    }
    return { id: row.id };
  });

export const deleteTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { count, error: cErr } = await context.supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status_id", data.id);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) {
      throw new Error(
        `No se puede eliminar: ${count} tarea(s) usan este estado. Migra esas tareas primero.`,
      );
    }
    const { data: row, error: rErr } = await context.supabase
      .from("task_statuses")
      .select("is_system")
      .eq("id", data.id)
      .single();
    if (rErr) throw new Error(rErr.message);
    if (row?.is_system) throw new Error("Los estados del sistema no se pueden eliminar.");
    const { error } = await context.supabase.from("task_statuses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateTaskType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(60),
        icon: z.string().min(1).max(40),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("task_types")
      .update({ name: data.name.trim(), icon: data.icon, color: data.color })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
