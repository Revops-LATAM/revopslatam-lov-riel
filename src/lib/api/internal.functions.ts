import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listInternalCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cats, error } = await supabase
      .from("internal_project_categories")
      .select("id, key, name, icon, color, sort_order, is_system")
      .eq("workspace_id", data.workspaceId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return cats ?? [];
  });

export const createInternalCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        key: z
          .string()
          .min(1)
          .max(40)
          .regex(/^[a-z0-9_-]+$/),
        name: z.string().min(1).max(60),
        icon: z.string().max(40).optional(),
        color: z.string().max(20).optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("internal_project_categories")
      .insert({
        workspace_id: data.workspaceId,
        key: data.key,
        name: data.name,
        icon: data.icon ?? null,
        color: data.color ?? "#0ea5e9",
        sort_order: data.sortOrder ?? 100,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateInternalCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        categoryId: z.string().uuid(),
        name: z.string().min(1).max(60).optional(),
        icon: z.string().max(40).nullable().optional(),
        color: z.string().max(20).nullable().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { categoryId, sortOrder, name, icon, color } = data;
    const patch: {
      name?: string;
      icon?: string | null;
      color?: string | null;
      sort_order?: number;
    } = {};
    if (name !== undefined) patch.name = name;
    if (icon !== undefined) patch.icon = icon;
    if (color !== undefined) patch.color = color;
    if (sortOrder !== undefined) patch.sort_order = sortOrder;
    const { error } = await supabase
      .from("internal_project_categories")
      .update(patch)
      .eq("id", categoryId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteInternalCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ categoryId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("internal_project_categories")
      .delete()
      .eq("id", data.categoryId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lista proyectos internos del workspace con su categoría. */
export const listInternalProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        categoryId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("projects")
      .select("id, name, description, color, icon, archived, created_at, internal_category_id")
      .eq("workspace_id", data.workspaceId)
      .eq("area", "internal")
      .eq("archived", false)
      .order("created_at", { ascending: false });
    if (data.categoryId) q = q.eq("internal_category_id", data.categoryId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
