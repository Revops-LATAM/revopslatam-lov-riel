import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TICKET_TYPES = ["incidencia", "requerimiento"] as const;
const LEVELS = ["normal", "urgente_critico"] as const;

export const listSlas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: slas, error } = await supabase
      .from("slas")
      .select(
        "id, name, is_system, active, created_at, sla_targets(id, ticket_type, level, target_minutes, response_target_minutes, business_hours)",
      )
      .eq("workspace_id", data.workspaceId)
      .order("is_system", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return slas ?? [];
  });

export const createSla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), name: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sla, error } = await supabase
      .from("slas")
      .insert({ workspace_id: data.workspaceId, name: data.name, is_system: false })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Seed default targets (8h for everything as placeholder)
    const targets = [];
    for (const tt of TICKET_TYPES) {
      for (const lv of LEVELS) {
        targets.push({
          sla_id: sla.id,
          ticket_type: tt,
          level: lv,
          target_minutes: 8 * 60,
          business_hours: false,
        });
      }
    }
    const { error: tErr } = await supabase.from("sla_targets").insert(targets);
    if (tErr) throw new Error(tErr.message);
    return sla;
  });

export const updateSla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        slaId: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: { name?: string; active?: boolean } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.active !== undefined) patch.active = data.active;
    const { error } = await supabase.from("slas").update(patch).eq("id", data.slaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ slaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Refuse if any contract references it
    const { count, error: cErr } = await supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("sla_id", data.slaId);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) {
      throw new Error("Este SLA está asignado a contratos. Desactívalo en lugar de eliminarlo.");
    }
    const { error } = await supabase.from("slas").delete().eq("id", data.slaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertSlaTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        slaId: z.string().uuid(),
        ticketType: z.enum(TICKET_TYPES),
        level: z.enum(LEVELS),
        targetMinutes: z.number().int().positive(),
        responseTargetMinutes: z.number().int().positive().nullable().optional(),
        businessHours: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload: Record<string, unknown> = {
      sla_id: data.slaId,
      ticket_type: data.ticketType,
      level: data.level,
      target_minutes: data.targetMinutes,
      business_hours: data.businessHours,
    };
    if (data.responseTargetMinutes !== undefined) {
      payload.response_target_minutes = data.responseTargetMinutes;
    }
    const { error } = await supabase
      .from("sla_targets")
      .upsert(payload as never, { onConflict: "sla_id,ticket_type,level" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
