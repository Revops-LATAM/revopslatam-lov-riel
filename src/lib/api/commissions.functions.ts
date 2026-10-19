import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Status = z.enum(["pendiente", "aprobada", "pagada", "cancelada"]);

export const listCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        estado: Status.optional(),
        vendedorId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("commissions")
      .select(
        "id, contract_id, vendedor_id, comision_padre_id, porcentaje, base_amount, amount, currency, estado, fecha_generacion, fecha_pago, notas, contracts(name, code), profiles!commissions_vendedor_id_fkey(full_name, email)",
      )
      .eq("workspace_id", data.workspaceId)
      .order("fecha_generacion", { ascending: false });

    if (data.estado) q = q.eq("estado", data.estado);
    if (data.vendedorId) q = q.eq("vendedor_id", data.vendedorId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((r) => ({
      id: r.id,
      contract_id: r.contract_id,
      contract_name: (r.contracts as { name?: string } | null)?.name ?? "—",
      contract_code: (r.contracts as { code?: string } | null)?.code ?? null,
      vendedor_id: r.vendedor_id,
      vendedor_name:
        (r.profiles as { full_name?: string } | null)?.full_name ??
        (r.profiles as { email?: string } | null)?.email ??
        "—",
      comision_padre_id: r.comision_padre_id,
      porcentaje: Number(r.porcentaje),
      base_amount: Number(r.base_amount),
      amount: Number(r.amount),
      currency: r.currency,
      estado: r.estado as z.infer<typeof Status>,
      fecha_generacion: r.fecha_generacion,
      fecha_pago: r.fecha_pago,
      notas: r.notas,
    }));
  });

export const markCommissionPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        commissionId: z.string().uuid(),
        fechaPago: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const fecha = data.fechaPago ?? new Date().toISOString().slice(0, 10);
    const { error } = await context.supabase
      .from("commissions")
      .update({ estado: "pagada", fecha_pago: fecha })
      .eq("id", data.commissionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCommissionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ commissionId: z.string().uuid(), estado: Status }).parse(input))
  .handler(async ({ data, context }) => {
    const patch: { estado: typeof data.estado; fecha_pago?: string | null } = {
      estado: data.estado,
    };
    if (data.estado === "pagada") patch.fecha_pago = new Date().toISOString().slice(0, 10);
    else patch.fecha_pago = null;
    const { error } = await context.supabase
      .from("commissions")
      .update(patch)
      .eq("id", data.commissionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const splitCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        commissionId: z.string().uuid(),
        splits: z
          .array(
            z.object({
              vendedorId: z.string().uuid(),
              porcentaje: z.number().min(0).max(100),
            }),
          )
          .min(1)
          .max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const total = data.splits.reduce((s, x) => s + x.porcentaje, 0);
    if (Math.abs(total - 100) > 0.01) throw new Error("Los porcentajes deben sumar 100");

    const { data: parent, error: perr } = await context.supabase
      .from("commissions")
      .select("*")
      .eq("id", data.commissionId)
      .single();
    if (perr) throw new Error(perr.message);
    if (parent.comision_padre_id) throw new Error("Ya es una división");

    // Cancel parent, create children
    const { error: uerr } = await context.supabase
      .from("commissions")
      .update({ estado: "cancelada", notas: (parent.notas ?? "") + "\n[Dividida]" })
      .eq("id", data.commissionId);
    if (uerr) throw new Error(uerr.message);

    const baseAmount = Number(parent.base_amount);
    const basePct = Number(parent.porcentaje);
    const rows = data.splits.map((s) => ({
      workspace_id: parent.workspace_id,
      contract_id: parent.contract_id,
      vendedor_id: s.vendedorId,
      comision_padre_id: parent.id,
      porcentaje: basePct,
      base_amount: baseAmount,
      amount: Math.round(((baseAmount * basePct) / 100) * (s.porcentaje / 100) * 100) / 100,
      currency: parent.currency,
      estado: "pendiente" as const,
      notas: `División ${s.porcentaje}% de comisión ${parent.id}`,
    }));
    const { error: ierr } = await context.supabase.from("commissions").insert(rows);
    if (ierr) throw new Error(ierr.message);

    return { ok: true, count: rows.length };
  });
