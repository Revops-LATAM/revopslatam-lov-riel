import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMarketingPhases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("phases")
      .select("id, project_id, name, order_index, color, owner_id, start_date, end_date")
      .eq("project_id", data.projectId)
      .order("order_index", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createMarketingPhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(120),
        color: z.string().max(20).nullable().optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        ownerId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: maxRow } = await supabase
      .from("phases")
      .select("order_index")
      .eq("project_id", data.projectId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow?.order_index as number | undefined) ?? -1) + 1;
    const { data: row, error } = await supabase
      .from("phases")
      .insert({
        project_id: data.projectId,
        name: data.name,
        order_index: nextOrder,
        color: data.color ?? null,
        owner_id: data.ownerId ?? null,
        start_date: data.startDate ?? null,
        end_date: data.endDate ?? null,
      } as never)
      .select("id, project_id, name, order_index, color, owner_id, start_date, end_date")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateMarketingPhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        color: z.string().max(20).nullable().optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        ownerId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.color !== undefined) patch.color = data.color;
    if (data.startDate !== undefined) patch.start_date = data.startDate;
    if (data.endDate !== undefined) patch.end_date = data.endDate;
    if (data.ownerId !== undefined) patch.owner_id = data.ownerId;
    const { error } = await supabase.from("phases").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMarketingPhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Unassign tasks first so the DELETE succeeds regardless of FK behavior.
    await supabase.from("tasks").update({ phase_id: null } as never).eq("phase_id", data.id);
    const { error } = await supabase.from("phases").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderMarketingPhases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        orderedIds: z.array(z.string().uuid()).min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await Promise.all(
      data.orderedIds.map((id, idx) =>
        supabase.from("phases").update({ order_index: idx } as never).eq("id", id),
      ),
    );
    return { ok: true };
  });
