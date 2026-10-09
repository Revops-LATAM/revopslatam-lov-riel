import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listPartners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("partners")
      .select(
        "id, name, country, billing_entity, external_billing_system, notes, created_at, updated_at",
      )
      .eq("workspace_id", data.workspaceId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  country: z.string().max(100).nullable().optional(),
  billingEntity: z.string().max(200).nullable().optional(),
  externalBillingSystem: z.string().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const upsertPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload = {
      workspace_id: data.workspaceId,
      name: data.name.trim(),
      country: data.country ?? null,
      billing_entity: data.billingEntity ?? null,
      external_billing_system: data.externalBillingSystem ?? null,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { data: row, error } = await supabase
        .from("partners")
        .update(payload)
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabase
      .from("partners")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("partners").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
