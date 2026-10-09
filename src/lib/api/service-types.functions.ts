import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listServiceTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("service_types")
      .select("id, name, descripcion, activo, orden, created_at, updated_at")
      .eq("workspace_id", data.workspaceId)
      .order("orden", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertServiceType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(120),
        descripcion: z.string().max(500).nullable().optional(),
        activo: z.boolean().default(true),
        orden: z.number().int().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      workspace_id: data.workspaceId,
      name: data.name.trim(),
      descripcion: data.descripcion ?? null,
      activo: data.activo,
      orden: data.orden,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("service_types")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("service_types")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteServiceType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("service_types").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
