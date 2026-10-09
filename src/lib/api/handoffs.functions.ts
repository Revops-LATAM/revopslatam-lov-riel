import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const stateEnum = z.enum(["pendiente", "en_planificacion", "completado"]);

export const listWorkspaceHandoffs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        state: stateEnum.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("contract_handoffs")
      .select(
        "id, contract_id, workspace_id, state, margen_estimado_pct, alerta_margen, asignado_a, notas, created_at, updated_at, completado_at, contracts(id, name, currency, account_id, accounts(name))",
      )
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (data.state) q = q.eq("state", data.state);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const countPendingHandoffs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { count, error } = await context.supabase
      .from("contract_handoffs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId)
      .in("state", ["pendiente", "en_planificacion"]);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const getHandoff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ handoffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("contract_handoffs")
      .select(
        "id, contract_id, workspace_id, state, margen_estimado_pct, alerta_margen, asignado_a, notas, created_at, updated_at, completado_at, contracts(id, name, currency, type, start_date, end_date, account_id, accounts(name))",
      )
      .eq("id", data.handoffId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Handoff no encontrado");
    return row;
  });

export const updateHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        handoffId: z.string().uuid(),
        patch: z
          .object({
            state: stateEnum.optional(),
            asignadoA: z.string().uuid().nullable().optional(),
            notas: z.string().max(4000).nullable().optional(),
          })
          .strict(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const p = data.patch;
    const patch: {
      state?: "pendiente" | "en_planificacion" | "completado";
      completado_at?: string;
      asignado_a?: string | null;
      notas?: string | null;
    } = {};
    if (p.state !== undefined) {
      patch.state = p.state;
      if (p.state === "completado") patch.completado_at = new Date().toISOString();
    }
    if (p.asignadoA !== undefined) patch.asignado_a = p.asignadoA;
    if (p.notas !== undefined) patch.notas = p.notas;
    const { error } = await context.supabase
      .from("contract_handoffs")
      .update(patch)
      .eq("id", data.handoffId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
