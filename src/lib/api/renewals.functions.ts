import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ RENEWALS ============

export const listRenewals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await context.supabase
      .from("contracts")
      .select(
        "id, name, code, type, status, currency, start_date, end_date, account_id, puede_renovarse, fecha_aviso_renovacion, anticipacion_renovacion_dias, notas_comerciales, accounts(name)",
      )
      .eq("workspace_id", data.workspaceId)
      .eq("is_partner", false)
      .in("status", ["activo", "finalizado"])
      .eq("puede_renovarse", true)
      .not("fecha_aviso_renovacion", "is", null)
      .lte("fecha_aviso_renovacion", today)
      .order("end_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      type: c.type,
      status: c.status,
      currency: c.currency,
      start_date: c.start_date,
      end_date: c.end_date,
      account_id: c.account_id,
      account_name: (c.accounts as { name?: string } | null)?.name ?? null,
      fecha_aviso_renovacion: c.fecha_aviso_renovacion,
      anticipacion_renovacion_dias: c.anticipacion_renovacion_dias,
      notas_comerciales: c.notas_comerciales,
    }));
  });

export const renewContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        contractId: z.string().uuid(),
        newStartDate: z.string(),
        newEndDate: z.string().optional(),
        cloneLines: z.boolean().default(true),
        cloneFinancials: z.boolean().default(true),
        notasComerciales: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Load original contract
    const { data: orig, error: oerr } = await context.supabase
      .from("contracts")
      .select("*")
      .eq("id", data.contractId)
      .single();
    if (oerr) throw new Error(oerr.message);

    // Insert renewed contract (proyectado)
    // Whitelist columns we copy
    const insertRow = {
      workspace_id: orig.workspace_id,
      account_id: orig.account_id,
      name: `${orig.name} (renovación)`,
      code: orig.code ? `${orig.code}-R` : null,
      type: orig.type,
      billing_model: orig.billing_model,
      status: "proyectado" as const,
      currency: orig.currency,
      start_date: data.newStartDate,
      end_date: data.newEndDate ?? null,
      owner_consultant_id: orig.owner_consultant_id,
      sprint_duration_days: orig.sprint_duration_days,
      payment_schedule_type: orig.payment_schedule_type,
      payment_schedule_config: orig.payment_schedule_config,
      modo: orig.modo,
      vendedor_id: orig.vendedor_id,
      comision_pct: orig.comision_pct,
      puede_renovarse: true,
      anticipacion_renovacion_dias: orig.anticipacion_renovacion_dias,
      contrato_padre_id: orig.id,
      notas_comerciales: data.notasComerciales ?? orig.notas_comerciales ?? null,
      dia_facturacion: orig.dia_facturacion,
      duracion_tipo: orig.duracion_tipo,
      created_by: context.userId,
    };

    const { data: newC, error: ierr } = await context.supabase
      .from("contracts")
      .insert(insertRow)
      .select("id")
      .single();
    if (ierr) throw new Error(ierr.message);

    // Clone lines
    if (data.cloneLines) {
      const { data: lines } = await context.supabase
        .from("contract_service_lines")
        .select("*")
        .eq("contract_id", data.contractId);
      if (lines && lines.length > 0) {
        const cloned = lines.map((l) => {
          const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = l;
          return { ...rest, contract_id: newC.id };
        });
        await context.supabase.from("contract_service_lines").insert(cloned);
      }
    }

    // Clone financials
    if (data.cloneFinancials) {
      const { data: fin } = await context.supabase
        .from("contract_financials")
        .select("*")
        .eq("contract_id", data.contractId)
        .maybeSingle();
      if (fin) {
        const { created_at: _ca, updated_at: _ua, contract_id: _cid, ...rest } = fin;
        await context.supabase
          .from("contract_financials")
          .insert({ ...rest, contract_id: newC.id });
      }
    }

    return { newContractId: newC.id };
  });

export const cancelContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        contractId: z.string().uuid(),
        motivo: z.string().min(1).max(2000),
        fechaCancelacion: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const fecha = data.fechaCancelacion ?? new Date().toISOString().slice(0, 10);

    const { error: uerr } = await context.supabase
      .from("contracts")
      .update({
        status: "cancelado",
        fecha_cancelacion: fecha,
        motivo_cancelacion: data.motivo,
      })
      .eq("id", data.contractId);
    if (uerr) throw new Error(uerr.message);

    // Cancel future scheduled payments
    const { error: perr } = await context.supabase
      .from("contract_payments")
      .update({ status: "cancelled" })
      .eq("contract_id", data.contractId)
      .eq("status", "scheduled")
      .gte("due_date", fecha);
    if (perr) throw new Error(perr.message);

    return { ok: true };
  });

export const skipRenewal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contracts")
      .update({ puede_renovarse: false })
      .eq("id", data.contractId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateRenewalNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        contractId: z.string().uuid(),
        fechaAviso: z.string().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contracts")
      .update({ fecha_aviso_renovacion: data.fechaAviso })
      .eq("id", data.contractId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
