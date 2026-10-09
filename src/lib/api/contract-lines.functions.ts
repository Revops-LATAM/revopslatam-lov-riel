import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const frequencyEnum = z.enum(["mensual", "trimestral", "semestral", "anual", "unica", "hitos"]);
const currencyEnum = z.enum(["USD", "CLP", "UF"]);

const lineInput = z.object({
  tipoServicio: z.string().min(1).max(120),
  descripcion: z.string().max(2000).optional().nullable(),
  frecuencia: frequencyEnum,
  numeroCuotas: z.number().int().min(1).max(120).optional().nullable(),
  monto: z.number().min(0).optional().nullable(),
  moneda: currencyEnum.default("CLP"),
  esBono: z.boolean().default(false),
  fechaPrimerPago: z.string().optional().nullable(),
  orden: z.number().int().min(0).default(0),
});

export const listContractServiceLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contract_service_lines")
      .select(
        "id, contract_id, tipo_servicio, descripcion, frecuencia, numero_cuotas, monto, moneda, es_bono, fecha_primer_pago, orden, created_at, updated_at",
      )
      .eq("contract_id", data.contractId)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createContractServiceLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ contractId: z.string().uuid(), line: lineInput }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const l = data.line;
    const { data: row, error } = await context.supabase
      .from("contract_service_lines")
      .insert({
        contract_id: data.contractId,
        tipo_servicio: l.tipoServicio,
        descripcion: l.descripcion ?? null,
        frecuencia: l.frecuencia,
        numero_cuotas: l.numeroCuotas ?? null,
        monto: l.monto ?? null,
        moneda: l.moneda,
        es_bono: l.esBono,
        fecha_primer_pago: l.fechaPrimerPago ?? null,
        orden: l.orden,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateContractServiceLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ lineId: z.string().uuid(), patch: lineInput.partial() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const p = data.patch;
    const patch: {
      tipo_servicio?: string;
      descripcion?: string | null;
      frecuencia?: "mensual" | "trimestral" | "semestral" | "anual" | "unica" | "hitos";
      numero_cuotas?: number | null;
      monto?: number | null;
      moneda?: string;
      es_bono?: boolean;
      fecha_primer_pago?: string | null;
      orden?: number;
    } = {};
    if (p.tipoServicio !== undefined) patch.tipo_servicio = p.tipoServicio;
    if (p.descripcion !== undefined) patch.descripcion = p.descripcion;
    if (p.frecuencia !== undefined) patch.frecuencia = p.frecuencia;
    if (p.numeroCuotas !== undefined) patch.numero_cuotas = p.numeroCuotas;
    if (p.monto !== undefined) patch.monto = p.monto;
    if (p.moneda !== undefined) patch.moneda = p.moneda;
    if (p.esBono !== undefined) patch.es_bono = p.esBono;
    if (p.fechaPrimerPago !== undefined) patch.fecha_primer_pago = p.fechaPrimerPago;
    if (p.orden !== undefined) patch.orden = p.orden;
    const { error } = await context.supabase
      .from("contract_service_lines")
      .update(patch)
      .eq("id", data.lineId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContractServiceLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ lineId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contract_service_lines")
      .delete()
      .eq("id", data.lineId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderContractServiceLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        contractId: z.string().uuid(),
        order: z.array(z.object({ id: z.string().uuid(), orden: z.number().int().min(0) })),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    for (const o of data.order) {
      const { error } = await context.supabase
        .from("contract_service_lines")
        .update({ orden: o.orden })
        .eq("id", o.id)
        .eq("contract_id", data.contractId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
