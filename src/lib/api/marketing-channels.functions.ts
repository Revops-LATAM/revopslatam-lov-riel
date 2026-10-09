import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMarketingChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        onlyActive: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("marketing_channels")
      .select("id, key, label, color, sort_order, is_active")
      .eq("workspace_id", data.workspaceId)
      .order("sort_order", { ascending: true });
    if (data.onlyActive) q = q.eq("is_active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertMarketingChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        workspaceId: z.string().uuid(),
        key: z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/),
        label: z.string().min(1).max(60),
        color: z.string().max(20).optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.id) {
      const { error } = await supabase
        .from("marketing_channels")
        .update({
          label: data.label,
          color: data.color ?? "#ec4899",
          sort_order: data.sortOrder ?? 100,
          is_active: data.isActive ?? true,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await supabase.from("marketing_channels").insert({
      workspace_id: data.workspaceId,
      key: data.key,
      label: data.label,
      color: data.color ?? "#ec4899",
      sort_order: data.sortOrder ?? 100,
      is_active: data.isActive ?? true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleMarketingChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("marketing_channels")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
